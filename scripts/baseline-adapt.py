"""Adapt tenant config.json into baseline-workspace/config.json.

Replaces Windows tenant paths with the production /root/.picoclaw/workspace
mountpoint, swaps the model_list for LiteLLM placeholder, and writes the
result into internal/saas/api/baseline-workspace/config.json.
"""
import json
from pathlib import Path

WIN = "C:\\Users\\ruthe\\Pictures\\pico2\\picoclaw\\workspace"
PROD = "/root/.picoclaw/workspace"


def fix_path(s):
    if isinstance(s, str):
        # Normalize Windows-style paths to POSIX prod path
        return s.replace(WIN, PROD).replace("\\", "/")
    return s


def main():
    src = Path("C:/Users/ruthe/.picoclaw/config.json")
    dst = Path("internal/saas/api/baseline-workspace/config.json")

    with src.open(encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["agents"]["defaults"]["workspace"] = fix_path(
        cfg["agents"]["defaults"]["workspace"]
    )
    cfg["agents"]["defaults"]["model_name"] = "default"
    cfg["agents"]["defaults"]["provider"] = "litellm"

    for agent in cfg["agents"].get("list", []):
        if "workspace" in agent:
            agent["workspace"] = fix_path(agent["workspace"])

    cfg["model_list"] = [
        {
            "model_name": "default",
            "provider": "openai",
            "model": "gpt-5.4",
            "api_base": "${LITELLM_URL}",
            "api_keys": ["${LITELLM_KEY}"],
        }
    ]

    with dst.open("w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

    print(f"Wrote {dst}")


if __name__ == "__main__":
    main()
