"""Live research API: job lifecycle, one job at a time, daily cap, failures. research.build is faked (no network)."""
import json, time, threading
import httpx
import pytest
from fastapi.testclient import TestClient
from finn import api
from finn.pull import pvd, research


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUT", tmp_path)
    monkeypatch.setattr(api, "LEDGER", tmp_path / "jobs.jsonl")
    monkeypatch.setattr(api.llm, "LOG", tmp_path / "llm.jsonl")
    monkeypatch.setattr(api, "JOBS", {})
    return TestClient(api.app)


def wait(c, job_id):
    for _ in range(100):
        j = c.get(f"/jobs/{job_id}").json()
        if j["status"] != "running":
            return j
        time.sleep(0.02)
    raise AssertionError("job never finished")


def test_job_runs_reports_stage_and_caches(client, monkeypatch, tmp_path):
    gate = threading.Event()
    def build(sym, live):
        pvd.stage("Reading Q2 FY27 transcript (1/4)…")
        gate.wait(2)
        (tmp_path / f"{sym}.json").write_text(json.dumps({"symbol": sym, "snapshot": {}}), encoding="utf-8")
    monkeypatch.setattr(research, "build", build)
    job = client.post("/research/kei").json()
    assert job["status"] == "running" and job["symbol"] == "KEI"
    time.sleep(0.05)
    assert client.get(f"/jobs/{job['id']}").json()["stage"].startswith("Reading Q2 FY27")
    assert client.post("/research/KEI").json()["id"] == job["id"]           # same symbol: same job
    assert client.post("/research/TCS").status_code == 409                   # one job at a time
    assert client.get("/research/KEI").status_code == 404                    # partial file mid-job doesn't count
    gate.set()
    assert wait(client, job["id"])["status"] == "done"
    assert client.post("/research/KEI").json() == {"status": "done", "symbol": "KEI", "cached": True}
    assert client.get("/research/KEI").json() == {"symbol": "KEI", "snapshot": {}}


def test_unknown_symbol_and_bad_input(client, monkeypatch):
    def build(sym, live):
        raise httpx.HTTPStatusError("404", request=httpx.Request("GET", "http://x"), response=httpx.Response(404))
    monkeypatch.setattr(research, "build", build)
    j = wait(client, client.post("/research/NOPE").json()["id"])
    assert j["status"] == "failed" and j["error"] == "unknown_symbol"
    assert client.post("/research/<script>").status_code in (400, 404)
    assert api._used_today() == 0                                           # an unknown symbol doesn't use the day's cap


def test_daily_cap(client, monkeypatch):
    monkeypatch.setattr(api, "DAILY_JOBS", 1)
    monkeypatch.setattr(research, "build", lambda sym, live: None)
    wait(client, client.post("/research/AAA").json()["id"])
    r = client.post("/research/BBB")
    assert r.status_code == 429 and "Try again tomorrow" in r.json()["detail"]["message"]


def test_api_import_stays_light():
    # Render's free instance must bind its port in seconds: the research stack loads inside the job only
    import subprocess, sys
    code = "import sys, finn.api; print(any(m in sys.modules for m in ('pandas', 'yfinance', 'pymupdf', 'numpy')))"
    assert subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True).stdout.strip() == "False"


def test_out_matches_pvd():
    assert api.OUT == pvd.OUT


def test_page_shown_before_bull_bear(client, monkeypatch, tmp_path):
    gate = threading.Event()
    def build(sym, live):
        (tmp_path / f"{sym}.json").write_text(json.dumps({"symbol": sym, "snapshot": {}, "bull_bear": None, "bull_bear_pending": True}), encoding="utf-8")
        gate.wait(2)  # bull/bear being written
        (tmp_path / f"{sym}.json").write_text(json.dumps({"symbol": sym, "snapshot": {}, "bull_bear": {"bull": []}}), encoding="utf-8")
    monkeypatch.setattr(research, "build", build)
    job = client.post("/research/FEDERALBNK").json()
    time.sleep(0.05)
    assert client.get(f"/jobs/{job['id']}").json()["page"] is True
    assert client.get("/research/FEDERALBNK").json()["bull_bear_pending"] is True
    gate.set()
    wait(client, job["id"])
    assert client.get("/research/FEDERALBNK").json()["bull_bear"] == {"bull": []}


def test_pending_page_without_a_job_shows_the_note(client, tmp_path):
    (tmp_path / "X.json").write_text(json.dumps({"symbol": "X", "snapshot": {}, "bull_bear": None, "bull_bear_pending": True}), encoding="utf-8")
    assert client.get("/research/X").json()["bull_bear_pending"] is False  # server restarted mid bull/bear


def test_slow_model_hands_over(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "x")
    def slow(*a, **k):
        raise httpx.ReadTimeout("slow")
    monkeypatch.setattr(httpx, "post", slow)
    with pytest.raises(api.llm.Exhausted):
        api.llm._groq("m", ["hi"], {"type": "object"})
