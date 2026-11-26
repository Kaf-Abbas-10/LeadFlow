# LeadFlow

LeadFlow is a local-first lead research app with a human approval queue. The browser dashboard is backed by FastAPI, SQLite, and a LangGraph research flow. It does not send email.

## Run locally

From the project root in PowerShell:

```powershell
$env:UV_CACHE_DIR = Join-Path (Get-Location) '.setup-cache\uv'
uv sync
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/>. Python dependencies are pinned in `uv.lock`.

## Web app (Next.js)

A redesigned dashboard lives in `web/` (Next.js 16, React 19, Tailwind 4) and uses the same FastAPI backend.

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300   # API
cd web && npm install && npm run dev -- --port 3300
```

Open **http://localhost:3300**. `/api/*` is proxied to `LEADFLOW_API_URL` (default `http://127.0.0.1:8300`).
Optional demo data: `python scripts/seed_demo.py` adds invented leads (ids start with `demo-`); `--reset` removes them.

## Providers

The backend loads `.env` from the project root. Copy `.env.example` to `.env`; never commit `.env` or put keys in the browser code.

- `LEAD_SOURCE=firecrawl` (default): discover candidate business websites from a target such as "dental clinics in Austin Texas". Choose the maximum results in the dashboard, then click **Find leads**. Firecrawl search, subsequent website research, and Gemini generation consume provider credits. Results are deduplicated by domain within a search and go to the review queue. Search titles are candidate company names; locations are marked **Not verified** until you verify the research. Directories and irrelevant results can still appear and should be skipped during review.
- `LEAD_SOURCE=csv`: optional CSV import with `company`/`name`, `location`/`city`, and `website`/`domain` columns.
- `LEAD_SOURCE=apollo`: select **Apollo company search** in the dashboard. Apollo company search may consume credits.

Apollo requires company-search endpoint access on your account. A configured key does not guarantee endpoint access. If Apollo rejects the search, the run displays its HTTP status and an actionable error; select Firecrawl web search as an alternative. Providers are never silently switched mid-run. Restart the backend after changing `.env`.

If Apollo authentication succeeds but Company Search returns `AUTH.AUTHORIZATION.ENDPOINT_ACCESS_DENIED`, check that the key permits `api/v1/mixed_companies/search`. If that permission is already selected, contact Apollo support about your team's endpoint access. Repeating searches or changing the target will not resolve an endpoint authorization denial.
- `LLM_PROVIDER=gemini`: Gemini creates the summary, fit score, reason, and personalized draft.
- `FIRECRAWL_API_KEY`: optional. If configured, Firecrawl extracts page content; otherwise the backend tries a basic page fetch.

Enter your actual offer in the dashboard to make drafts relevant to your service. `OUTREACH_OFFER` in `.env` is the fallback for scheduled runs. When no offer is supplied, the prompt asks for an introduction without inventing services or results.

Keys are loaded only by the Python backend. `/api/health` reports whether integrations are configured without returning secret values.

## Review and schedule

The review queue is the main workspace. The research form collapses when saved leads are available; expand **Find companies** to start another run. Filter by review status or target fit and sort by score, name, or date. **Read evidence** and **Review draft** open a keyboard-accessible side drawer with the full research summary, website link, editable draft, and explicit approval action. Only selected, visible rows are included in bulk actions. An edited approved draft must return to review before it can be approved again.

Runs and leads are stored in `data/leadflow.sqlite3`. Draft edits and approvals persist across browser sessions. Status transitions enforce review before approval and approval before the demo sent state. The sent state is simulated; no email is sent.

Editing an approved draft returns it to review. Demo sent records are read only. CSV files support quoted commas and up to 25 unique companies per run; duplicate rows within an upload are removed. Larger batches return a validation error rather than being truncated. Run history shows partial failures while successful results remain saved. Interrupted runs are marked failed on server restart; unfinished jobs do not automatically resume. Run a single backend worker when using the built-in scheduler.

The dashboard requires the backend; connection failures display an offline state. Research URLs reject private/local addresses and direct-fetch redirects are checked again. This is a local development app without user authentication; shared hosting requires authentication and a managed job worker. Existing runs are visible in the history panel after refresh.

Daily scheduling is disabled by default. Set `SCHEDULER_ENABLED=true`, `DAILY_TARGET`, `LEAD_SOURCE`, `SCHEDULE_HOUR`, and `SCHEDULE_TIMEZONE` in `.env`, then restart the server. A scheduled Apollo run may consume credits, and each run may call Gemini and Firecrawl.

## Files

- `index.html` — dashboard.
- `styles.css` — accessible type, colors, responsive layout, and review drawer styling.
- `backend/` — FastAPI routes, SQLite persistence, Apollo/Firecrawl clients, LangGraph research flow.
- `sample-leads.csv` — CSV upload example.
- `n8n/leadflow-demo.json` — legacy credential-free n8n workflow sample.

## Checks

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
.venv\Scripts\python.exe -m tests.browser_smoke
```

Backend tests and browser tests use temporary databases and mocked provider responses; they do not spend provider credits. The browser test uses Chrome at its standard Windows installation path. Install development dependencies with `uv sync --dev`. It covers CSV import, polling, filtering, visible-row selection, draft edits, approval, demo send, reload persistence, CSV export, and mobile width.
