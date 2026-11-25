from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .settings import DB_PATH


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                target TEXT NOT NULL,
                name TEXT NOT NULL,
                location TEXT NOT NULL DEFAULT '',
                site TEXT NOT NULL DEFAULT '',
                fit TEXT NOT NULL DEFAULT 'Maybe',
                score INTEGER NOT NULL DEFAULT 0,
                insight TEXT NOT NULL DEFAULT '',
                draft TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'review',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS leads_status_created ON leads(status, created_at DESC);
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                target TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                total INTEGER NOT NULL DEFAULT 0,
                processed INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                finished_at TEXT NOT NULL DEFAULT ''
            );
            """
        )


def create_run(target: str, source: str) -> str:
    run_id = str(uuid4())
    with connect() as db:
        db.execute(
            "INSERT INTO runs(id,target,source,status,created_at) VALUES(?,?,?,?,?)",
            (run_id, target, source, "queued", now()),
        )
    return run_id


def recover_interrupted_runs() -> None:
    with connect() as db:
        db.execute("UPDATE runs SET status='failed', error=?, finished_at=? WHERE status IN ('queued','running')",
                   ('Server restarted before this run finished. Saved leads are retained; start a new run for remaining companies.', now()))


def update_run(run_id: str, **values: Any) -> None:
    allowed = {"status", "total", "processed", "error", "finished_at"}
    update = {key: value for key, value in values.items() if key in allowed}
    if not update:
        return
    assignments = ", ".join(f"{key} = ?" for key in update)
    with connect() as db:
        db.execute(f"UPDATE runs SET {assignments} WHERE id = ?", (*update.values(), run_id))


def get_run(run_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return dict(row) if row else None


def list_runs(limit: int = 20) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def add_lead(lead: dict[str, Any]) -> None:
    with connect() as db:
        db.execute(
            """INSERT OR REPLACE INTO leads
            (id,run_id,target,name,location,site,fit,score,insight,draft,status,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                lead.get("id") or str(uuid4()), lead["run_id"], lead["target"], lead["name"],
                lead.get("location", ""), lead.get("site", ""), lead.get("fit", "Maybe"),
                int(lead.get("score", 0)), lead.get("insight", ""), lead.get("draft", ""),
                lead.get("status", "review"), lead.get("created_at", now()),
            ),
        )


def list_leads(status: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
    with connect() as db:
        if status:
            rows = db.execute(
                "SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM leads ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def get_lead(lead_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    return dict(row) if row else None


def update_lead(lead_id: str, **values: Any) -> dict[str, Any] | None:
    allowed = {"draft", "status"}
    update = {key: value for key, value in values.items() if key in allowed}
    if not update:
        return get_lead(lead_id)
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return None
        current = dict(row)
        if current['status'] == 'sent' and any(update[k] != current[k] for k in update):
            raise ValueError('Sent demo records cannot be edited.')
        edited = 'draft' in update and update['draft'] != current['draft']
        status = update.get('status', current['status'])
        if status == 'sent' and (current['status'] != 'approved' or edited):
            raise ValueError('Approve the current draft before marking it sent.')
        if status == 'approved' and not update.get('draft', current['draft']).strip():
            raise ValueError('A nonempty draft is required for approval.')
        if edited and current['status'] == 'approved' and 'status' not in update:
            update['status'] = 'review'
        assignments = ", ".join(f"{key} = ?" for key in update)
        db.execute(f"UPDATE leads SET {assignments} WHERE id = ?", (*update.values(), lead_id))
    return get_lead(lead_id)


def json_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
