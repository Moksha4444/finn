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
        (tmp_path / f"{sym}.json").write_text(json.dumps({"symbol": sym}), encoding="utf-8")
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
    assert client.get("/research/KEI").json() == {"symbol": "KEI"}


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
