from __future__ import annotations

from contextlib import asynccontextmanager
import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator

from . import storage
from .providers import apollo_search, firecrawl_search, parse_csv
from .research_graph import research_graph
from .settings import DAILY_TARGET, ROOT, SCHEDULE_HOUR, SCHEDULE_TIMEZONE, SCHEDULER_ENABLED, integrations, setting

scheduler = BackgroundScheduler(timezone=SCHEDULE_TIMEZONE)


def safe_error(exc: Exception) -> str:
    message = str(exc)
    for name in ('GEMINI_API_KEY', 'APOLLO_API_KEY', 'FIRECRAWL_API_KEY', 'OPENAI_API_KEY'):
        key = setting(name)
        if key:
            message = message.replace(key, '[redacted]')
    return message[:500]


def run_pipeline(run_id: str, target: str, source: str, rows: list[dict[str, str]], offer: str = '') -> None:
    storage.update_run(run_id, status="running", total=len(rows), processed=0)
    failures = []
    for index, row in enumerate(rows):
        try:
            result = research_graph.invoke({**row, "target": target, "offer": offer})
            name = row.get("name", "Unknown company")
            domain = row.get("site", "")
            lead_id = str(uuid4())
            storage.add_lead({
                "id": lead_id,
                "run_id": run_id,
                "target": target,
                "name": name,
                "location": row.get("location", ""),
                "site": domain,
                "fit": result.get("fit", "Maybe"),
                "score": result.get("score", 0),
                "insight": result.get("summary", "") + " " + result.get("reason", ""),
                "draft": result.get("draft", ""),
                "status": "review",
            })
        except Exception as exc:
            failures.append(f"{row.get('name', 'Company')}: {safe_error(exc)}")
        storage.update_run(run_id, processed=index + 1)
    status = 'completed' if not failures else ('failed' if len(failures) == len(rows) else 'partial')
    storage.update_run(run_id, status=status, error='; '.join(failures)[:500], finished_at=storage.now())


def run_scheduled_pipeline() -> None:
    source = setting("LEAD_SOURCE", "firecrawl").lower()
    run_id = storage.create_run(DAILY_TARGET, source)
    try:
        if source == "apollo":
            rows = apollo_search(DAILY_TARGET, 5)
        elif source == 'firecrawl':
            rows = firecrawl_search(DAILY_TARGET, 5)
        else:
            csv_path = Path(setting("CSV_PATH", str(ROOT / "sample-leads.csv")))
            rows = parse_csv(csv_path.read_text(encoding="utf-8-sig"))
        run_pipeline(run_id, DAILY_TARGET, source, rows)
    except Exception as exc:
        storage.update_run(run_id, status="failed", error=safe_error(exc), finished_at=storage.now())


@asynccontextmanager
async def lifespan(_: FastAPI):
    storage.initialize()
    storage.recover_interrupted_runs()
    if SCHEDULER_ENABLED:
        scheduler.add_job(run_scheduled_pipeline, "cron", hour=SCHEDULE_HOUR, minute=0, id="leadflow-daily", replace_existing=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title="LeadFlow API", version="0.2.0", lifespan=lifespan)


class RunRequest(BaseModel):
    target: str = Field(min_length=3, max_length=180)
    source: Literal["apollo", "firecrawl"] = "firecrawl"
    limit: int = Field(default=6, ge=1, le=25)
    offer: str = Field(default='', max_length=1000)

    @field_validator('target')
    @classmethod
    def valid_target(cls, value):
        if len(value.strip()) < 3:
            raise ValueError('Describe your target in at least three characters.')
        return value.strip()


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    draft: str | None = Field(default=None, max_length=4000)
    status: Literal["review", "approved", "sent"] | None = None

    @field_validator('draft', 'status', mode='before')
    @classmethod
    def nonnull(cls, value):
        if value is None:
            raise ValueError('Explicit null values are not allowed.')
        return value


@app.get("/")
def home():
    return FileResponse(ROOT / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "integrations": integrations()}


@app.get('/app.js')
def dashboard_script():
    return FileResponse(ROOT / 'app.js', media_type='text/javascript')


@app.get('/styles.css')
def dashboard_styles():
    return FileResponse(ROOT / 'styles.css', media_type='text/css')


@app.get("/api/leads")
def leads(status: str | None = Query(default=None), limit: int = Query(default=500, ge=1, le=1000)):
    allowed = {"review", "approved", "sent"}
    if status and status not in allowed:
        raise HTTPException(400, "Unknown lead status.")
    return storage.list_leads(status, limit)


@app.get("/api/runs")
def runs():
    return storage.list_runs()


@app.get("/api/runs/{run_id}")
def run_status(run_id: str):
    run = storage.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found.")
    return run


@app.post("/api/runs", status_code=202)
def start_apollo_run(payload: RunRequest, background: BackgroundTasks):
    credential = 'APOLLO_API_KEY' if payload.source == 'apollo' else 'FIRECRAWL_API_KEY'
    if not setting(credential):
        raise HTTPException(400, f'{payload.source.capitalize()} is not configured. Add {credential} to .env.')
    if not setting('GEMINI_API_KEY'):
        raise HTTPException(400, 'GEMINI_API_KEY is required to research online results and draft messages.')
    run_id = storage.create_run(payload.target, payload.source)
    background.add_task(start_and_execute_online, run_id, payload.target, payload.source, payload.limit, payload.offer)
    return {"id": run_id, "status": "queued"}


def start_and_execute_apollo(run_id: str, target: str, limit: int, offer: str = '') -> None:
    start_and_execute_online(run_id, target, 'apollo', limit, offer)


def start_and_execute_online(run_id: str, target: str, source: str, limit: int, offer: str = '') -> None:
    try:
        storage.update_run(run_id, status='running')
        rows = apollo_search(target, limit) if source == 'apollo' else firecrawl_search(target, limit)
        if not rows:
            storage.update_run(run_id, status="completed", total=0, finished_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
            return
        run_pipeline(run_id, target, source, rows, offer)
    except Exception as exc:
        storage.update_run(run_id, status="failed", error=safe_error(exc), finished_at=storage.now())


@app.post("/api/runs/csv", status_code=202)
async def start_csv_run(
    background: BackgroundTasks,
    target: str = Query(min_length=3, max_length=180),
    file: UploadFile = File(...),
    offer: str = Query(default='', max_length=1000),
):
    target = target.strip()
    if len(target) < 3:
        raise HTTPException(400, 'Describe your target in at least three characters.')
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(415, "Upload a .csv file.")
    contents = await file.read(2_000_001)
    if len(contents) > 2_000_000:
        raise HTTPException(413, "CSV files must be smaller than 2 MB.")
    try:
        rows = parse_csv(contents.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError, csv.Error) as exc:
        raise HTTPException(400, str(exc)) from exc
    run_id = storage.create_run(target, "csv")
    background.add_task(run_pipeline, run_id, target, "csv", rows, offer)
    return {"id": run_id, "status": "queued", "count": len(rows)}


@app.patch("/api/leads/{lead_id}")
def update_lead(lead_id: str, payload: LeadUpdate):
    current = storage.get_lead(lead_id)
    if not current:
        raise HTTPException(404, "Lead not found.")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("status") == "approved" and current["status"] != "review":
        raise HTTPException(409, "Only leads awaiting review can be approved.")
    if changes.get("status") == "sent" and current["status"] != "approved":
        raise HTTPException(409, "Only approved leads can be marked sent in the demo.")
    try:
        updated = storage.update_lead(lead_id, **changes)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return updated


@app.get("/api/schedule")
def schedule_info():
    return {
        "enabled": SCHEDULER_ENABLED,
        "target": DAILY_TARGET,
        "hour": SCHEDULE_HOUR,
        "timezone": SCHEDULE_TIMEZONE,
        "source": setting("LEAD_SOURCE", "firecrawl").lower(),
    }
