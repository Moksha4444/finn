"""HTTP API. For now: health + a BSE reachability probe (tests whether BSE answers a cloud IP).
Run locally from backend/: ../.venv/Scripts/python -m uvicorn finn.api:app --reload"""
import datetime as dt
from fastapi import FastAPI
from finn.sources import bse

app = FastAPI(title="FINN")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/health/bse")
def health_bse():
    """RELIANCE's last 7 days of filings, uncached. ok=false + error text if BSE blocks us."""
    t = dt.date.today()
    try:
        rows = bse.announcements("500325", t - dt.timedelta(days=7), t, max_age=0)
        return {"ok": True, "rows": len(rows), "latest": rows[0]["NEWS_DT"] if rows else None}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
