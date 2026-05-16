"""GPT orchestrator — uses `codex exec` CLI exclusively."""
import json
import os
import re
import subprocess
import tempfile
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


class GPTAgent:
    def __init__(self, model: str):
        self.model = model

    def _call(self, prompt: str, timeout: int = 120) -> str:
        """Run codex exec in read-only sandbox, capture last message via -o."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, prefix="duo_gpt_"
        ) as f:
            out_file = f.name
        try:
            subprocess.run(
                [
                    "codex", "exec",
                    "-m", self.model,
                    "-s", "read-only",       # sandbox: no file writes
                    "--ephemeral",            # no session persistence
                    "--skip-git-repo-check",  # work anywhere
                    "-o", out_file,           # last assistant message → file
                    prompt,
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return Path(out_file).read_text().strip()
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f"codex exec failed (exit {e.returncode}):\n{e.stderr[:400]}"
            )
        finally:
            if os.path.exists(out_file):
                os.unlink(out_file)

    def plan(self, idea: str, project_context: str = "") -> dict:
        prompt = (
            f"SYSTEM ROLE: {prompts.PLANNER}\n\n"
            f"OUTPUT SCHEMA (return EXACTLY this structure):\n{prompts.PLANNER_SCHEMA}\n\n"
            f"PROJECT CONTEXT: {project_context or 'not specified'}\n\n"
            f"TASK IDEA: {idea}\n\n"
            "Return ONLY the JSON plan. No explanation, no markdown."
        )
        raw = self._call(prompt)
        return _extract_json(raw)

    def review(self, task: dict, result: dict) -> dict:
        prompt = (
            f"SYSTEM ROLE: {prompts.REVIEWER}\n\n"
            f"OUTPUT SCHEMA:\n{prompts.REVIEWER_SCHEMA}\n\n"
            f"TASK: {task['title']}\n"
            f"DESC: {task['desc']}\n\n"
            f"EXECUTION RESULT: {json.dumps(result)}\n\n"
            "Return ONLY the JSON verdict."
        )
        raw = self._call(prompt, timeout=60)
        return _extract_json(raw)
