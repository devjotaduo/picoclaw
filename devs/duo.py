#!/usr/bin/env python3
"""
duo — GPT orchestrates, Claude executes.

  python3 duo.py "your idea"
  python3 duo.py --dir /path/to/project "refactor auth module"
  python3 duo.py --dry-run "add webhook endpoint"
"""
import argparse
import json
import os
import sys
import tomllib
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

# Make agents importable regardless of cwd
sys.path.insert(0, str(Path(__file__).parent))
from agents.gpt import GPTAgent
from agents.claude import ClaudeAgent

console = Console()


# ── helpers ──────────────────────────────────────────────────────────────────

def load_cfg(config_path: Path) -> dict:
    with open(config_path, "rb") as f:
        return tomllib.load(f)


def project_context(project_dir: str) -> str:
    """Quick fingerprint of the project type — fed to GPT planner."""
    p = Path(project_dir)
    found = [
        name
        for name in ("go.mod", "package.json", "pyproject.toml", "Cargo.toml",
                     "CLAUDE.md", "README.md")
        if (p / name).exists()
    ]
    return ", ".join(found) or "unknown project"


def _spin(description: str):
    return Progress(
        SpinnerColumn(),
        TextColumn(f"[progress.description]{description}"),
        transient=True,
    )


def show_plan(plan: dict) -> None:
    table = Table(
        title=f"[bold]Plan:[/bold] {plan['summary']}",
        border_style="blue",
        show_lines=False,
    )
    table.add_column("#", style="dim", width=3)
    table.add_column("Task", no_wrap=False)
    table.add_column("Agent", width=7)
    table.add_column("Test", width=4)
    for t in plan["tasks"]:
        agent = "[yellow]Opus[/yellow]" if t["size"] == "large" else "Sonnet"
        test  = "[green]✓[/green]" if t.get("test") else ""
        table.add_row(str(t["id"]), t["title"], agent, test)
    console.print(table)


def show_report(tasks: list) -> None:
    table = Table(
        title="[bold]Report[/bold]",
        border_style="green",
        show_lines=False,
    )
    table.add_column("#", width=3)
    table.add_column("Task")
    table.add_column("Status", width=8)
    table.add_column("Retries", width=7)
    for t in tasks:
        status = t.get("status", "?")
        color  = "green" if status == "done" else "red"
        table.add_row(
            str(t["id"]),
            t["title"],
            f"[{color}]{status}[/{color}]",
            str(t.get("retries", 0)),
        )
    console.print(table)


def save_session(sessions_dir: Path, session: dict) -> Path:
    sessions_dir.mkdir(parents=True, exist_ok=True)
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = sessions_dir / f"{ts}.jsonl"
    with open(out, "w") as f:
        for event in session["events"]:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return out


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="duo: GPT plans, Claude executes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("idea", nargs="?", help="Task idea / change to implement")
    parser.add_argument("--dir",     metavar="PATH", help="Target project dir")
    parser.add_argument("--dry-run", action="store_true", help="Show plan only, do not execute")
    parser.add_argument("--config",  default="config.toml", help="Config file (default: config.toml)")
    args = parser.parse_args()

    if not args.idea:
        parser.print_help()
        sys.exit(1)

    devs_dir = Path(__file__).parent
    cfg      = load_cfg(devs_dir / args.config)

    # propagate API key if set in config
    api_key = cfg["openai"].get("api_key", "").strip()
    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key

    # resolve project dir
    raw_dir     = args.dir or cfg["claude"]["project_dir"]
    project_dir = str(Path(raw_dir).resolve())
    max_retries = cfg["claude"]["max_retries"]

    gpt    = GPTAgent(model=cfg["openai"]["model"])
    claude = ClaudeAgent(
        opus_model=cfg["claude"]["opus_model"],
        sonnet_model=cfg["claude"]["sonnet_model"],
    )

    session: dict = {"idea": args.idea, "project": project_dir, "events": []}

    console.rule("[bold cyan]duo[/bold cyan]")
    console.print(f"[dim]idea:[/dim]    {args.idea}")
    console.print(f"[dim]project:[/dim] {project_dir}")
    console.print(f"[dim]gpt:[/dim]     {cfg['openai']['model']} via codex")
    console.print(f"[dim]claude:[/dim]  opus={cfg['claude']['opus_model']}  sonnet={cfg['claude']['sonnet_model']}\n")

    # ── 1. GPT creates plan ──────────────────────────────────────────────────
    with _spin("GPT planning…") as p:
        p.add_task("", total=None)
        try:
            ctx  = project_context(project_dir)
            plan = gpt.plan(args.idea, ctx)
        except Exception as exc:
            console.print(f"[red]Planning failed:[/red] {exc}")
            sys.exit(1)

    session["events"].append({"type": "plan", "data": plan})
    show_plan(plan)

    if args.dry_run:
        console.print("\n[yellow]--dry-run: stopping before execution[/yellow]")
        sys.exit(0)

    console.print()

    # ── 2. Execute each task ─────────────────────────────────────────────────
    tasks = plan["tasks"]
    for task in tasks:
        task.setdefault("status", "pending")
        task.setdefault("retries", 0)

        agent_label = "Opus" if task["size"] == "large" else "Sonnet"
        console.print(f"[bold]▶ Task {task['id']}[/bold] [{agent_label}]  {task['title']}")

        for attempt in range(1, max_retries + 2):
            # execute
            with _spin(f"  {agent_label} executing (attempt {attempt}/{max_retries})…") as p:
                p.add_task("", total=None)
                try:
                    result = claude.exec_task(task, task["size"], project_dir)
                except Exception as exc:
                    result = {"done": str(exc), "files": [], "ok": False}

            session["events"].append({
                "type": "exec", "task_id": task["id"],
                "attempt": attempt, "result": result,
            })

            if not result.get("ok", False):
                console.print(f"  [red]✗[/red] {result.get('done', 'error')}")
                task["status"] = "failed"
                break

            # optional: run tests with Sonnet
            if task.get("test"):
                with _spin("  Sonnet running tests…") as p:
                    p.add_task("", total=None)
                    try:
                        test_res = claude.run_tests(project_dir, result.get("files", []))
                    except Exception as exc:
                        test_res = {"passed": False, "summary": str(exc), "failures": []}

                session["events"].append({
                    "type": "test", "task_id": task["id"], "result": test_res,
                })

                if not test_res.get("passed", True):
                    summary = test_res.get("summary", "")
                    console.print(f"  [yellow]⚠ tests failed:[/yellow] {summary}")
                    result["done"] += f" | tests failed: {summary}"

            # GPT reviews
            with _spin("  GPT reviewing…") as p:
                p.add_task("", total=None)
                try:
                    review = gpt.review(task, result)
                except Exception as exc:
                    console.print(f"  [dim]review error (auto-ok):[/dim] {exc}")
                    review = {"verdict": "ok", "note": ""}

            session["events"].append({
                "type": "review", "task_id": task["id"],
                "attempt": attempt, "review": review,
            })

            if review["verdict"] == "ok":
                console.print(f"  [green]✓[/green] {result['done']}")
                task["status"] = "done"
                break

            # redo
            note = review.get("note", "redo")
            console.print(f"  [yellow]↺[/yellow] GPT: {note}")
            task["retries"] += 1
            # inject feedback into desc for next attempt
            task["desc"] = task["desc"] + f"\n\nPREVIOUS ATTEMPT FAILED — fix: {note}"

        else:
            if task["status"] == "pending":
                task["status"] = "failed"
                console.print(f"  [red]✗[/red] max retries ({max_retries}) reached")

    # ── 3. Report + session log ──────────────────────────────────────────────
    console.print()
    show_report(tasks)

    log = save_session(devs_dir / "sessions", session)
    console.print(f"\n[dim]log → {log}[/dim]")


if __name__ == "__main__":
    main()
