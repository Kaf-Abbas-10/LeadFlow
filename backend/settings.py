from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def setting(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def configured(name: str) -> bool:
    return bool(setting(name))


DB_PATH = Path(setting("DATABASE_PATH", str(ROOT / "data" / "leadflow.sqlite3")))
LEAD_SOURCE = setting("LEAD_SOURCE", "firecrawl").lower()
_llm_provider = setting("LLM_PROVIDER", "gemini").lower()
LLM_PROVIDER = "gemini" if _llm_provider in {"google", "google-gemini", "gemini"} else _llm_provider
GEMINI_MODEL = setting("GEMINI_MODEL", "gemini-3.5-flash-lite")
DAILY_TARGET = setting("DAILY_TARGET", "Dental clinics in Texas")
SCHEDULER_ENABLED = setting("SCHEDULER_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
SCHEDULE_HOUR = int(setting("SCHEDULE_HOUR", "9"))
SCHEDULE_TIMEZONE = setting("SCHEDULE_TIMEZONE", "Asia/Karachi")


def integrations() -> dict[str, bool | str]:
    return {
        "lead_source": LEAD_SOURCE,
        "apollo": configured("APOLLO_API_KEY"),
        "gemini": configured("GEMINI_API_KEY"),
        "openai": configured("OPENAI_API_KEY"),
        "firecrawl": configured("FIRECRAWL_API_KEY"),
        "scheduler_enabled": SCHEDULER_ENABLED,
    }
