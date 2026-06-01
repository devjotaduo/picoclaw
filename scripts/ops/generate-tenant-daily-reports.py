#!/usr/bin/env python3
"""Generate actionable daily reports for PicoClaw SaaS tenants.

The report is intentionally deterministic and file-based: it reads each
tenant workspace, writes a markdown report under workspace/reports/daily, and
publishes a dashboard item under workspace/dashboard/items. It does not call an
LLM, so it can safely run from systemd every hour.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone, tzinfo
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


TENANTS_DIR = Path(os.environ.get("SAAS_TENANTS_DIR", "/srv/saas/tenants"))
DEFAULT_TZ = os.environ.get("SAAS_REPORT_TZ", "America/Sao_Paulo")
SPLIT_MARKERS = ("<|[SPLIT]|>", "SPLIT_MARKER")
PHONE_RE = re.compile(r"\b(?:\+?55)?\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}\b")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
MONEY_RE = re.compile(r"\bR\$\s?\d+(?:[.,]\d{2})?\b")
_ZONE_CACHE: dict[str, tzinfo] = {}


@dataclass
class SessionStats:
    files: int = 0
    user_messages: int = 0
    assistant_messages: int = 0
    sessions_with_user: int = 0
    sessions_with_assistant: int = 0
    keywords: Counter = field(default_factory=Counter)
    samples: list[str] = field(default_factory=list)
    marker_leaks: int = 0


@dataclass
class TaskStats:
    total: int = 0
    success: int = 0
    failed: int = 0
    by_agent: Counter = field(default_factory=Counter)
    statuses: Counter = field(default_factory=Counter)
    discovery_done: int = 0
    marker_leaks: int = 0
    samples: list[str] = field(default_factory=list)


@dataclass
class MetricStats:
    total: int = 0
    counts: Counter = field(default_factory=Counter)
    highlights: list[str] = field(default_factory=list)


def report_zone(tz_name: str) -> tzinfo:
    cached = _ZONE_CACHE.get(tz_name)
    if cached is not None:
        return cached
    try:
        zone = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        print(f"timezone not found: {tz_name}; falling back to UTC", file=sys.stderr)
        zone = timezone.utc
    _ZONE_CACHE[tz_name] = zone
    return zone


def local_now(tz_name: str) -> datetime:
    return datetime.now(report_zone(tz_name))


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def is_same_local_date(dt: datetime | None, date: str, tz_name: str) -> bool:
    if dt is None:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(report_zone(tz_name)).date().isoformat() == date


def read_json(path: Path, default):
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def read_jsonl(path: Path) -> list[dict]:
    records: list[dict] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return records
    for line in lines:
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            records.append(obj)
    return records


def compact(text: str, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    for marker in SPLIT_MARKERS:
        text = text.replace(marker, "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def classify_text(text: str) -> set[str]:
    lower = text.lower()
    tags = set()
    patterns = {
        "lead": ("lead", "cliente", "orçamento", "orcamento", "preço", "preco", "proposta"),
        "agendamento": ("agenda", "agendamento", "consulta", "horário", "horario", "remarcar"),
        "pagamento": ("pagamento", "pix", "cartão", "cartao", "boleto", "r$"),
        "suporte": ("suporte", "problema", "erro", "não funciona", "nao funciona", "reclama"),
        "discovery": ("discovery", "onboarding", "configuração", "configuracao", "empresa"),
        "integracao": ("integração", "integracao", "crm", "api", "whatsapp business", "sistema"),
        "humano": ("humano", "atendente", "operador", "responsável", "responsavel"),
    }
    for tag, needles in patterns.items():
        if any(needle in lower for needle in needles):
            tags.add(tag)
    if PHONE_RE.search(text):
        tags.add("contato_whatsapp")
    if EMAIL_RE.search(text):
        tags.add("contato_email")
    if MONEY_RE.search(text):
        tags.add("valor")
    return tags


def workspace_name(workspace: Path) -> str:
    memory = workspace / "memory" / "empresa.md"
    if memory.exists():
        for line in memory.read_text(encoding="utf-8", errors="ignore").splitlines()[:40]:
            lowered = line.lower().strip()
            if lowered in {"# empresa", "empresa", "## empresa"}:
                continue
            if lowered.startswith(("nome:", "- nome:", "empresa:", "# ")):
                candidate = line.strip("#- ").split(":", 1)[-1].strip()
                if candidate and candidate.lower() != "empresa":
                    return candidate

    task_path = workspace / "state" / "evolution" / "task-records.jsonl"
    for item in reversed(read_jsonl(task_path)[-40:]):
        text = str(item.get("summary") or item.get("final_output") or "")
        match = re.search(r"\bempresa\s+(?:é|e)\s+([^,.;\n]+)", text, flags=re.I)
        if match:
            candidate = match.group(1).strip()
            if 2 < len(candidate) <= 80:
                return candidate
    return workspace.parent.name


def collect_sessions(workspace: Path, date: str, tz_name: str) -> SessionStats:
    stats = SessionStats()
    sessions_dir = workspace / "sessions"
    if not sessions_dir.exists():
        return stats

    for path in sorted(sessions_dir.glob("*.jsonl")):
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=report_zone(tz_name))
        except OSError:
            continue
        if mtime.date().isoformat() != date:
            continue
        stats.files += 1
        has_user = False
        has_assistant = False
        for item in read_jsonl(path):
            role = item.get("role")
            content = str(item.get("content") or "")
            if any(marker in content for marker in SPLIT_MARKERS):
                stats.marker_leaks += 1
            for tag in classify_text(content):
                stats.keywords[tag] += 1
            if role == "user":
                stats.user_messages += 1
                has_user = True
                if len(stats.samples) < 4:
                    stats.samples.append(compact(content))
            elif role == "assistant":
                stats.assistant_messages += 1
                has_assistant = True
        stats.sessions_with_user += int(has_user)
        stats.sessions_with_assistant += int(has_assistant)
    return stats


def collect_tasks(workspace: Path, date: str, tz_name: str) -> TaskStats:
    stats = TaskStats()
    path = workspace / "state" / "evolution" / "task-records.jsonl"
    for item in read_jsonl(path):
        if not is_same_local_date(parse_iso(str(item.get("created_at") or "")), date, tz_name):
            continue
        stats.total += 1
        success = item.get("success")
        stats.success += int(success is True)
        stats.failed += int(success is False)
        task_id = str(item.get("id") or "")
        agent = task_id.split("-turn-", 1)[0] if "-turn-" in task_id else task_id.split("-", 1)[0] or "unknown"
        stats.by_agent[agent] += 1
        stats.statuses[str(item.get("status") or "unknown")] += 1
        output = str(item.get("final_output") or "")
        summary = str(item.get("summary") or "")
        text = f"{summary}\n{output}"
        if any(marker in text for marker in SPLIT_MARKERS):
            stats.marker_leaks += 1
        if "discovery" in text.lower() and any(word in text.lower() for word in ("concluído", "concluido", "finalizado")):
            stats.discovery_done += 1
        if len(stats.samples) < 5:
            stats.samples.append(compact(summary or output))
    return stats


def collect_metrics(workspace: Path, date: str) -> MetricStats:
    stats = MetricStats()
    path = workspace / "memory" / "jotaduo" / "metrics" / f"{date}.jsonl"
    for item in read_jsonl(path):
        stats.total += 1
        typ = str(item.get("event_type") or "unknown")
        stats.counts[typ] += 1
        highlight = item.get("highlight")
        if highlight and len(stats.highlights) < 8:
            stats.highlights.append(compact(str(highlight), 220))
    return stats


def load_pending_dashboard(workspace: Path) -> tuple[int, list[str]]:
    items = []
    for path in sorted((workspace / "dashboard" / "items").glob("*.json")):
        item = read_json(path, {})
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or path.stem).startswith("daily-report-"):
            continue
        if item.get("status") in {"new", "pending", "in_progress", "scheduled"}:
            items.append(str(item.get("title") or path.stem))
    return len(items), items[:5]


def detect_opportunities(sessions: SessionStats, tasks: TaskStats, metrics: MetricStats, pending_count: int) -> list[str]:
    opportunities: list[str] = []
    if sessions.keywords["lead"] or metrics.counts["lead_received"] or metrics.counts["lead_qualified"]:
        opportunities.append("Revisar leads do dia e criar follow-up para os contatos com intenção comercial.")
    if sessions.keywords["agendamento"]:
        opportunities.append("Transformar perguntas de agendamento em confirmação ativa de horário e lembrete.")
    if sessions.keywords["pagamento"]:
        opportunities.append("Conferir pedidos com sinal de pagamento/preço e preparar resposta comercial padronizada.")
    if sessions.keywords["integracao"]:
        opportunities.append("Registrar integrações citadas como pendência técnica para evitar promessa manual.")
    if tasks.discovery_done:
        opportunities.append("Discovery concluído: acionar Catarina para aprofundamento e validar prontidão do tenant.")
    if pending_count:
        opportunities.append(f"Resolver {pending_count} item(ns) pendente(s) no dashboard para destravar a operação.")
    if not opportunities and sessions.user_messages:
        opportunities.append("Revisar conversas do dia e marcar pelo menos um próximo passo por contato.")
    return opportunities[:6]


def detect_risks(sessions: SessionStats, tasks: TaskStats) -> list[str]:
    risks: list[str] = []
    if sessions.user_messages and sessions.assistant_messages == 0:
        risks.append("Há mensagens de usuário sem resposta assistente registrada nas sessões do dia.")
    if tasks.failed:
        risks.append(f"{tasks.failed} tarefa(s) falharam no runtime/evolução.")
    if sessions.marker_leaks or tasks.marker_leaks:
        risks.append("Marcadores internos apareceram em registros do dia; revisar saída antes de enviar ao cliente.")
    if sessions.user_messages > sessions.assistant_messages * 3 and sessions.assistant_messages:
        risks.append("Volume de mensagens de usuário muito maior que respostas; pode haver interrupções ou fila.")
    return risks


def score(sessions: SessionStats, tasks: TaskStats, metrics: MetricStats, risks: list[str]) -> int:
    value = 50
    value += min(20, sessions.user_messages * 4)
    value += min(10, tasks.total * 2)
    value += min(10, metrics.total * 2)
    value += 10 if tasks.discovery_done else 0
    value -= min(25, len(risks) * 8)
    return max(0, min(100, value))


def markdown_report(tenant_id: str, workspace: Path, date: str, tz_name: str) -> tuple[str, dict]:
    sessions = collect_sessions(workspace, date, tz_name)
    tasks = collect_tasks(workspace, date, tz_name)
    metrics = collect_metrics(workspace, date)
    pending_count, pending_titles = load_pending_dashboard(workspace)
    opportunities = detect_opportunities(sessions, tasks, metrics, pending_count)
    risks = detect_risks(sessions, tasks)
    health = score(sessions, tasks, metrics, risks)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    name = workspace_name(workspace)

    keyword_line = ", ".join(f"{k}: {v}" for k, v in sessions.keywords.most_common(8)) or "sem tags detectadas"
    task_agents = ", ".join(f"{k}: {v}" for k, v in tasks.by_agent.most_common()) or "sem tarefas"
    metric_line = ", ".join(f"{k}: {v}" for k, v in metrics.counts.most_common()) or "sem métricas"

    def bullet(items: list[str], empty: str) -> str:
        if not items:
            return f"- {empty}\n"
        return "".join(f"- {item}\n" for item in items)

    report = f"""# Relatório Diário - {name}

Data: {date}
Tenant: `{tenant_id}`
Gerado em: {generated_at}

## Placar

- Saúde operacional: {health}/100
- Sessões com atividade: {sessions.files}
- Mensagens do usuário: {sessions.user_messages}
- Respostas dos agentes: {sessions.assistant_messages}
- Tarefas/evoluções: {tasks.total}
- Discoveries concluídos detectados: {tasks.discovery_done}
- Eventos de métrica: {metrics.total}
- Itens pendentes no dashboard: {pending_count}

## Sinais Do Dia

- Tags detectadas: {keyword_line}
- Tarefas por agente: {task_agents}
- Métricas registradas: {metric_line}

## Oportunidades Recomendadas

{bullet(opportunities, "Nenhuma oportunidade automática forte detectada. Manter monitoramento.")}
## Riscos E Pendências

{bullet(risks, "Nenhum risco operacional relevante detectado.")}
## Amostras De Conversas/Tarefas

{bullet(sessions.samples + tasks.samples, "Sem amostras novas no período.")}
## Itens Pendentes No Painel

{bullet(pending_titles, "Sem itens pendentes no dashboard.")}
## Próximas Ações Sugeridas

- Rafael: revisar riscos e pendências antes do próximo expediente.
- Marcos: criar follow-up para leads ou pedidos de preço detectados.
- Catarina: assumir aprofundamento quando Sofia concluir discovery.
- Lia: transformar dúvidas recorrentes em conteúdo/FAQ quando houver repetição.
"""

    summary = {
        "tenant_id": tenant_id,
        "date": date,
        "generated_at": generated_at,
        "health_score": health,
        "sessions": sessions.files,
        "user_messages": sessions.user_messages,
        "assistant_messages": sessions.assistant_messages,
        "tasks": tasks.total,
        "discovery_done": tasks.discovery_done,
        "metrics": metrics.total,
        "pending_dashboard_items": pending_count,
        "opportunities": opportunities,
        "risks": risks,
    }
    return report, summary


def write_dashboard_item(workspace: Path, summary: dict, report_rel: str) -> None:
    now = summary["generated_at"]
    tenant_id = summary["tenant_id"]
    date = summary["date"]
    risks = len(summary["risks"])
    priority = "high" if risks else "normal"
    status = "pending" if risks or summary["opportunities"] else "new"
    title = f"Relatório diário {date}: saúde {summary['health_score']}/100"
    first = summary["opportunities"][0] if summary["opportunities"] else "Operação sem ação automática forte detectada."
    item = {
        "id": f"daily-report-{date}",
        "type": "report",
        "status": status,
        "title": title,
        "summary": first,
        "agent_id": "rafael",
        "agent_name": "Rafael",
        "priority": priority,
        "created_at": now,
        "updated_at": now,
        "tags": ["daily-report", "operacao", "proatividade"],
        "artifacts": [
            {
                "type": "file",
                "title": f"Relatório diário {date}",
                "url": report_rel,
            }
        ],
    }
    out = workspace / "dashboard" / "items" / f"daily-report-{date}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(item, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def generate_for_tenant(tenant_dir: Path, date: str, tz_name: str) -> dict | None:
    workspace = tenant_dir / "workspace"
    if not workspace.is_dir():
        return None

    report, summary = markdown_report(tenant_dir.name, workspace, date, tz_name)
    report_path = workspace / "reports" / "daily" / f"{date}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")

    summary_path = workspace / "reports" / "daily" / f"{date}.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    report_rel = f"/files/reports/daily/{date}.md"
    write_dashboard_item(workspace, summary, report_rel)
    print(f"{tenant_dir.name}: report={report_path} health={summary['health_score']} risks={len(summary['risks'])}")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate daily reports for SaaS tenants.")
    parser.add_argument("--tenant", action="append", help="Tenant id to process. Can be repeated.")
    parser.add_argument("--date", help="Local date YYYY-MM-DD. Defaults to today in report timezone.")
    parser.add_argument("--tz", default=DEFAULT_TZ, help="Report timezone.")
    args = parser.parse_args()

    date = args.date or local_now(args.tz).date().isoformat()
    if args.tenant:
        tenant_dirs = [TENANTS_DIR / tenant for tenant in args.tenant]
    else:
        tenant_dirs = sorted(path for path in TENANTS_DIR.iterdir() if path.is_dir()) if TENANTS_DIR.exists() else []

    generated = 0
    for tenant_dir in tenant_dirs:
        if not tenant_dir.exists():
            print(f"missing tenant: {tenant_dir.name}", file=sys.stderr)
            continue
        if generate_for_tenant(tenant_dir, date, args.tz):
            generated += 1
    print(f"daily report generation complete: generated={generated} date={date}")
    return 0 if generated or args.tenant is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
