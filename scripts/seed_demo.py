"""Add a few realistic demo leads and runs to the local SQLite database.

Useful for screenshots and UI demos without provider keys. Every demo row id starts with
"demo-", so `--reset` removes only demo rows and never touches real research.

    .venv/bin/python scripts/seed_demo.py          # add / refresh demo data
    .venv/bin/python scripts/seed_demo.py --reset  # remove demo data only
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import storage  # noqa: E402

TARGET = "Dental clinics in Texas"
NOW = datetime.now(timezone.utc)


def ago(**kw) -> str:
    return (NOW - timedelta(**kw)).isoformat(timespec="seconds")


RUNS = [
    dict(id="demo-run-1", target=TARGET, source="csv", status="completed", total=5, processed=5, error="",
         created_at=ago(hours=26), finished_at=ago(hours=26, seconds=-48)),
    dict(id="demo-run-2", target="Physiotherapy practices in Austin", source="firecrawl", status="partial", total=4, processed=4,
         error="Riverside Physio Group: Website hostname could not be resolved.",
         created_at=ago(hours=3), finished_at=ago(hours=3, seconds=-71)),
]

LEADS = [
    ("Bright Oak Dentistry", "Dallas, TX", "https://brightoak-dental.example", "Good fit", 91, "approved", "demo-run-1",
     "Family dental practice with two locations and online booking for cleanings and implants. Strong match: multi-chair practice that already books online, so automated follow-ups fit their workflow.",
     "Hi Bright Oak team,\n\nI noticed you offer online booking at both your Dallas locations. Many practices that do this still lose patients between the booking and the visit.\n\nWe help clinics send friendly appointment follow-ups automatically, so fewer chairs sit empty.\n\nWould a short look at how that works be useful?\n\nBest,\nAlex"),
    ("Lone Star Dental Care", "Austin, TX", "https://lonestar-dental.example", "Good fit", 86, "review", "demo-run-1",
     "General and cosmetic dentistry clinic advertising same-week appointments and Saturday hours. Good fit: high appointment volume and a clear focus on convenience.",
     "Hi Lone Star Dental team,\n\nYour Saturday hours and same-week appointments stood out. That kind of schedule moves fast, and reminders are easy to miss.\n\nWe help clinics automate appointment follow-ups so patients show up and rebook.\n\nWould you be open to a quick chat about how you handle reminders today?\n\nBest,\nAlex"),
    ("Hill Country Smiles", "San Antonio, TX", "https://hillcountry-smiles.example", "Maybe", 64, "review", "demo-run-1",
     "Pediatric dental office; the website lists a phone-only booking process. Partial fit: phone booking may mean they aren't ready for automated follow-ups yet.",
     "Hi Hill Country Smiles team,\n\nI saw that families book with you by phone. Some pediatric practices find that a short text reminder after the call cuts down on missed visits.\n\nIs appointment follow-up something you're thinking about this year?\n\nBest,\nAlex"),
    ("Gulf Coast Orthodontics", "Houston, TX", "https://gulfcoast-ortho.example", "Good fit", 79, "review", "demo-run-1",
     "Orthodontic practice offering clear aligners and braces with monthly adjustment visits. Good fit: recurring visits benefit from consistent reminders.",
     "Hi Gulf Coast Orthodontics team,\n\nMonthly adjustment visits are the backbone of an orthodontic plan, and a missed one can set treatment back.\n\nWe help practices send automatic, friendly follow-ups so patients stay on schedule.\n\nWould it help to see a two-minute example?\n\nBest,\nAlex"),
    ("Pecan Street Dental Studio", "Fort Worth, TX", "https://pecanstreet-dental.example", "Skip", 28, "review", "demo-run-1",
     "The site appears to be a dental supply showroom rather than a clinic. Likely skip: not a patient-facing practice; verify before contacting.",
     "Hi Pecan Street team,\n\nI came across your studio while looking at dental businesses in Fort Worth. Could you tell me whether you see patients directly?\n\nBest,\nAlex"),
    ("Austin Motion Physio", "Austin, TX", "https://austinmotion-physio.example", "Good fit", 83, "sent", "demo-run-2",
     "Sports physiotherapy clinic with online booking and package plans for runners. Good fit: multi-session plans depend on patients returning.",
     "Hi Austin Motion team,\n\nYour runner rehab packages caught my eye. Multi-session plans work best when nobody drops off halfway.\n\nWe help clinics follow up automatically between sessions. Worth a quick conversation?\n\nBest,\nAlex"),
    ("Barton Creek Physical Therapy", "Austin, TX", "", "Maybe", 57, "approved", "demo-run-2",
     "Small physical therapy practice; limited website information was available. Unclear fit: confirm the practice size and booking process.",
     "Hi Barton Creek team,\n\nI'm reaching out to physical therapy practices in Austin about appointment follow-ups. How do you currently remind patients about their next session?\n\nBest,\nAlex"),
    ("Capitol Spine & Sport", "", "https://capitolspine.example", "Maybe", 49, "review", "demo-run-2",
     "Chiropractic and sports therapy clinic. The location could not be verified from the search result. Mixed fit: confirm they serve Austin before contacting.",
     "Hi Capitol Spine & Sport team,\n\nI'm looking at sports therapy clinics around Austin. Do you handle appointment reminders in-house today?\n\nBest,\nAlex"),
]


def reset() -> None:
    with storage.connect() as db:
        db.execute("DELETE FROM leads WHERE id LIKE 'demo-%'")
        db.execute("DELETE FROM runs WHERE id LIKE 'demo-%'")


def seed() -> None:
    reset()
    with storage.connect() as db:
        for r in RUNS:
            db.execute("INSERT INTO runs(id,target,source,status,total,processed,error,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (r["id"], r["target"], r["source"], r["status"], r["total"], r["processed"], r["error"], r["created_at"], r["finished_at"]))
    for n, (name, location, site, fit, score, status, run_id, insight, draft) in enumerate(LEADS):
        run = next(r for r in RUNS if r["id"] == run_id)
        storage.add_lead(dict(id=f"demo-lead-{n + 1}", run_id=run_id, target=run["target"], name=name, location=location, site=site,
                              fit=fit, score=score, insight=insight, draft=draft, status=status,
                              created_at=(datetime.fromisoformat(run["created_at"]) + timedelta(seconds=8 * n)).isoformat(timespec="seconds")))


if __name__ == "__main__":
    storage.initialize()
    if "--reset" in sys.argv:
        reset()
        print("Removed demo leads and runs.")
    else:
        seed()
        print(f"Added {len(LEADS)} demo leads and {len(RUNS)} demo runs ({storage.DB_PATH}).")
