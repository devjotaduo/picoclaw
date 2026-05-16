"""Claude executor — uses `claude -p` CLI exclusively."""
import json
import re
import subprocess

from . import prompts


def _extract_json(text: str) -> dict:
    """Strip markdown fences and extract the outermost JSON object."""
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in output:\n{text[:400]}")
    return json.loads(text[start : end + 1])


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
    # Prompt via stdin — evita ambiguidade de parsing quando o texto
    # tem múltiplas linhas ou começa com caracteres especiais.
    result = subprocess.run(
        [
            "claude", "--print",
            "--model", model,
            "--no-session-persistence",
            "--dangerously-skip-permissions",
            "--output-format", "json",
            "--system-prompt", system,
            "--add-dir", project_dir,
        ],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if result.returncode != 0:
        stderr = result.stderr[:400] if result.stderr else "(no stderr)"
        raise RuntimeError(f"`claude` exited {result.returncode}:\n{stderr}")

    try:
        outer = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"claude returned non-JSON:\n{result.stdout[:400]}")

    if outer.get("is_error"):
        raise RuntimeError(f"claude error: {outer.get('result', 'unknown')}")

    # `.result` is the assistant's final text; we parse JSON from it
    inner_text = outer.get("result", "")
    return _extract_json(inner_text)


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
            timeout=300,
        )

    def run_tests(self, project_dir: str, changed_files: list[str]) -> dict:
        files_str = ", ".join(changed_files) if changed_files else "all changed files"
        prompt = f"Run tests relevant to: {files_str}"
        return _run_claude(
            prompt=prompt,
            system=prompts.TESTER,
            model=self.sonnet,
            project_dir=project_dir,
            timeout=180,
        )
