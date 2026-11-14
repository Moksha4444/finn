"""HTTP API: health, a BSE reachability probe, and live research for any NSE symbol.
Live research = one background job at a time (POST /research/{symbol} -> job id; GET /jobs/{id} -> stage text),
results cached on disk so a second visit is instant, and a daily cap so one visitor can't spend the free AI quotas.
Run locally from backend/: ../.venv/Scripts/python -m uvicorn finn.api:app --reload"""
import os, re, json, time, uuid, threading, datetime as dt
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from finn import llm
from finn.config import CACHE, ROOT
from finn.sources import bse
# The research stack (pandas, yfinance, numpy, PyMuPDF) is imported inside the job, not here: on Render's free
# instance (0.1 CPU) importing it took minutes and the port scan timed out before uvicorn bound (14 Nov).

app = FastAPI(title="FINN")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

SYMBOL = re.compile(r"[A-Z0-9&-]{1,20}")
DAILY_JOBS = int(os.getenv("FINN_DAILY_JOBS", "8"))  # ~20k strong-model tokens a company; Groq's free day is 200k
TIMEOUT = int(os.getenv("FINN_JOB_TIMEOUT", "480"))   # seconds the page waits; the job itself finishes and is cached
LEDGER = CACHE / "live_jobs.jsonl"
OUT = ROOT / "web" / "public" / "data" / "research"  # = pvd.OUT
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


@app.get("/health")
def health():
    """keys: whether each provider's key is set (never the key), so a deploy can be checked before a research run."""
    return {"ok": True, "keys": {k: bool(os.getenv(f"{k.upper()}_API_KEY")) for k in ("gemini", "groq")}, "busy": any(j["status"] == "running" for j in JOBS.values()),
            "runs_left_today": max(0, DAILY_JOBS - _used_today())}


@app.get("/health/bse")
def health_bse():
    """RELIANCE's last 7 days of filings, uncached. ok=false + error text if BSE blocks us."""
    t = dt.date.today()
    try:
        rows = bse.announcements("500325", t - dt.timedelta(days=7), t, max_age=0)
        return {"ok": True, "rows": len(rows), "latest": rows[0]["NEWS_DT"] if rows else None}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}


def _sym(symbol: str) -> str:
    s = symbol.strip().upper()
    if not SYMBOL.fullmatch(s):
        raise HTTPException(400, {"error": "bad_symbol", "message": "That isn't an NSE symbol (letters, digits, & or -)."})
    return s


def _today() -> str:
    return dt.datetime.now(IST).date().isoformat()


def _used_today() -> int:
    """Live research runs started today (IST) that reached the AI models; an unknown symbol costs nothing."""
    rows = [json.loads(l) for l in LEDGER.read_text(encoding="utf-8").splitlines()] if LEDGER.exists() else []
    return sum(r["date"] == _today() and r["error"] != "unknown_symbol" for r in rows)


def _cost_since(symbol: str, since: str) -> dict:
    """This run's calls from the router's cost log (llm_calls.jsonl)."""
    rows = [json.loads(l) for l in llm.LOG.read_text(encoding="utf-8").splitlines()] if llm.LOG.exists() else []
    rows = [r for r in rows if r.get("symbol") == symbol and r["ts"] >= since]
    return {"calls": len(rows), "tokens_in": sum(r["tokens_in"] for r in rows), "tokens_out": sum(r["tokens_out"] for r in rows),
            "usd": round(sum(r["usd"] for r in rows), 4), "models": sorted({r["model"] for r in rows})}


def _work(job: dict) -> None:
    since = dt.datetime.now().isoformat(timespec="seconds")  # same clock as the cost log's ts
    from finn.pull import pvd, research
    pvd.stage = lambda text: job.update(stage=text)
    llm.LIVE = True  # a reader is waiting: short retries, and the fast model may answer when both strong ones are down
    try:
        research.build(job["symbol"], live=True)
        job.update(status="done", stage="Done")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            job.update(status="failed", error="unknown_symbol", message=f"No listed company found for {job['symbol']}. Check the NSE symbol (e.g. TATAMOTORS, not Tata Motors).")
        else:
            job.update(status="failed", error="source", message=f"A data source didn't answer ({e.response.status_code}). Try again in a few minutes.")
    except Exception as e:
        quota = isinstance(e, (llm.Exhausted, llm.Retryable))
        job.update(status="failed", error="quota" if quota else "error",
                   message="Today's free AI quota is used up. Try again tomorrow." if quota else f"Research failed ({type(e).__name__}). Try again in a few minutes.")
        print(f"live research {job['symbol']} failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        pvd.stage, llm.LIVE = (lambda text: None), False
        job.update(seconds=round(time.time() - job["started"]), cost=_cost_since(job["symbol"], since))
        LEDGER.parent.mkdir(parents=True, exist_ok=True)
        with LEDGER.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"date": _today(), **{k: job.get(k) for k in ("symbol", "status", "error", "seconds", "cost")}}) + "\n")


def _view(job: dict) -> dict:
    out = {k: v for k, v in job.items() if k != "started"}
    if job["status"] == "running":
        out["seconds"] = round(time.time() - job["started"])
        if out["seconds"] > TIMEOUT:  # the page stops waiting; the job keeps going and caches its page
            out |= {"status": "timeout", "message": "This is taking longer than usual. The page will be saved when it finishes: try again in a few minutes."}
    return out


def _cached(sym: str) -> dict | None:
    """The finished page, if any. pvd.run writes a partial file mid-job, so a running job's file doesn't count."""
    f = OUT / f"{sym}.json"
    if not f.exists() or any(j["status"] == "running" and j["symbol"] == sym for j in JOBS.values()):
        return None
    return json.loads(f.read_text(encoding="utf-8"))


@app.get("/research/{symbol}")
def get_research(symbol: str):
    if not (d := _cached(_sym(symbol))):
        raise HTTPException(404, {"error": "not_researched"})
    return d


@app.post("/research/{symbol}")
def start_research(symbol: str):
    sym = _sym(symbol)
    with LOCK:
        if (d := _cached(sym)) and not d.get("pvd_error"):  # a page whose promise check failed (quota) is tried again
            return {"status": "done", "symbol": sym, "cached": True}
        running = [j for j in JOBS.values() if j["status"] == "running"]
        if mine := next((j for j in running if j["symbol"] == sym), None):
            return _view(mine)
        if running:
            raise HTTPException(409, {"error": "busy", "message": f"Researching {running[0]['symbol']} for someone else right now. Try again in a minute or two."})
        if _used_today() >= DAILY_JOBS:
            raise HTTPException(429, {"error": "daily_cap", "message": f"Today's {DAILY_JOBS} on-request research runs are used up (it keeps the demo on free AI quotas). "
                                                                      "Try again tomorrow, or open one of the researched companies."})
        job = {"id": uuid.uuid4().hex[:12], "symbol": sym, "status": "running", "stage": "Starting…", "started": time.time()}
        JOBS[job["id"]] = job
    threading.Thread(target=_work, args=(job,), daemon=True).start()
    return _view(job)


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in JOBS:  # the server restarted (Render free tier sleeps): the page starts a new run
        raise HTTPException(404, {"error": "unknown_job", "message": "The research server restarted. Start the research again."})
    return _view(JOBS[job_id])
