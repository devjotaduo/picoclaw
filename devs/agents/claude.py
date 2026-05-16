"""Claude executor — uses `claude -p` CLI exclusively."""
import json
import re
import subprocess
from pathlib import Path

from . import prompts


def _extract_json(text: str) -> dict:
    """Strip markdown fences and extract the outermost JSON object."""
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in output:\n{text[:400]}")
    return json.loads(text[start : end + 1])


def _clip(value: str, limit: int = 1200) -> str:
    value = value.strip()
    if not value:
        return "(empty)"
    if len(value) <= limit:
        return value
    return f"{value[:limit]}…"


def _run_claude(
    prompt: str,
    system: str,
    model: str,
    project_dir: str,
    timeout: int = 300,
) -> dict:
    """
    Invoke `claude -p` non-interactively.

    --bare               disables hooks, plugins, CLAUDE.md discovery, auto-memory
    --no-session-persistence  no disk session saved between calls
    --output-format json  outer JSON: {result, is_error, cost_usd, ...}
    --system-prompt      override system prompt with our terse executor prompt
    """
    project_path = Path(project_dir).resolve()
    # Prompt via stdin — evita ambiguidade de parsing quando o texto
    # tem múltiplas linhas ou começa com caracteres especiais.
    result = subprocess.run(
        [
            "claude", "--print",
            "--model", model,
            "--dangerously-skip-permissions",
            "--output-format", "json",
            "--system-prompt", system,
            "--add-dir", str(project_path),
        ],
        input=prompt,
        capture_output=True,
        text=True,
        cwd=project_path,
        timeout=timeout,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "`claude` exited "
            f"{result.returncode} (model={model}, cwd={project_path}):\n"
            f"stderr:\n{_clip(result.stderr)}\n\n"
            f"stdout:\n{_clip(result.stdout)}"
        )

    try:
        outer = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"claude returned non-JSON:\n{_clip(result.stdout)}")

    if outer.get("is_error"):
        raise RuntimeError(f"claude error: {outer.get('result', 'unknown')}")

    # `.result` is the assistant's final text; we parse JSON from it
    inner_text = outer.get("result", "")
    try:
        return _extract_json(inner_text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"claude returned unparsable task JSON: {exc}\n"
            f"raw result:\n{_clip(inner_text)}"
        ) from exc


class ClaudeAgent:
    def __init__(self, opus_model: str, sonnet_model: str):
        self.opus = opus_model
        self.sonnet = sonnet_model

    def exec_task(self, task: dict, size: str, project_dir: str) -> dict:
        model = self.opus if size == "large" else self.sonnet
        prompt = (
            f"TASK #{task['id']}: {task['title']}\n\n"
            f"{task['desc']}"
        )
        return _run_claude(
            prompt=prompt,
            system=prompts.EXECUTOR,
            model=model,
            project_dir=project_dir,
            timeout=600,
        )

    def run_tests(self, project_dir: str, changed_files: list[str]) -> dict:
        files_str = ", ".join(changed_files) if changed_files else "all changed files"
        prompt = f"Run tests relevant to: {files_str}"
        return _run_claude(
            prompt=prompt,
            system=prompts.TESTER,
            model=self.sonnet,
            project_dir=project_dir,
            timeout=300,
        )
