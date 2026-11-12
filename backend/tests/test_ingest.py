"""Ingest safety: a network drop mid-run must not overwrite a good feed (13 Nov: a DNS outage wiped 8 tickers)."""
import json, datetime as dt
import httpx, pandas as pd, pytest
from finn import ingest

TODAY = dt.datetime.now(ingest.rank.IST).date()
D = (TODAY - dt.timedelta(days=1)).isoformat()


def _item(sym, filed=D):
    return {"id": f"{sym}-1", "symbol": sym, "filed": f"{filed}T10:00", "score": 1, "collapsed": False, "tier": "P2",
            "reason": "", "headline": "h", "subject": "s", "note": None}


def _fresh(sym, *_):
    return [_item(sym)], [], [{"symbol": sym, "date": D, "move_pct": 1.0}], {"name": sym, "closes": []}


@pytest.fixture
def run(tmp_path, monkeypatch):
    out = tmp_path / "feed.json"
    monkeypatch.setattr(ingest, "OUT", out)
    monkeypatch.setattr(ingest.prices, "history", lambda s: pd.DataFrame({"Close": [1.0]}, index=[TODAY]))
    old_day = (TODAY - dt.timedelta(days=40)).isoformat()  # outside a 7-day window: must be trimmed
    old = {"generated_at": "2026-11-12T21:05+05:30", "portfolio": ["A", "B", "C", "D"],
           "companies": {s: {"name": s, "closes": []} for s in "ABCD"},
           "items": [_item(s) for s in "ABCD"] + [_item("B", old_day)], "alerts": [], "days": [], "failed": []}
    out.write_text(json.dumps(old))

    def go(down, *args):
        def ticker(sym, *a):
            if sym in down:
                raise httpx.ConnectError("[Errno 11001] getaddrinfo failed")
            return _fresh(sym)
        monkeypatch.setattr(ingest, "ticker", ticker)
        code = ingest.main(["--days", "7", *args])
        return code, json.loads(out.read_text())
    return go


def test_one_ticker_down_keeps_its_last_good_data_marked_stale(run):
    code, feed = run({"B"}, "A", "B", "C", "D")
    assert code == 0
    assert [i["id"] for i in feed["items"] if i["symbol"] == "B"] == ["B-1"]  # old filing kept, 40-day-old one trimmed
    assert feed["companies"]["B"]["stale_as_of"] == "2026-11-12T21:05+05:30"
    assert "stale_as_of" not in feed["companies"]["A"]
    assert feed["failed"] == [{"symbol": "B", "error": "ConnectError: [Errno 11001] getaddrinfo failed", "as_of": "2026-11-12T21:05+05:30"}]


def test_more_than_two_down_refuses_and_leaves_the_feed(run):
    code, feed = run({"A", "B", "C"}, "A", "B", "C", "D")
    assert code == 1 and feed["generated_at"] == "2026-11-12T21:05+05:30"  # untouched


def test_force_writes_anyway(run):
    code, feed = run({"A", "B", "C"}, "--force", "A", "B", "C", "D")
    assert code == 0 and feed["generated_at"] != "2026-11-12T21:05+05:30"
    assert {f["symbol"] for f in feed["failed"]} == {"A", "B", "C"} and all("as_of" in f for f in feed["failed"])


def test_single_ticker_run_keeps_the_rest_of_the_portfolio(run):
    code, feed = run(set(), "A")
    assert code == 0 and feed["portfolio"] == ["A", "B", "C", "D"]
    assert "stale_as_of" not in feed["companies"]["A"] and feed["companies"]["C"]["stale_as_of"]


def test_empty_price_history_counts_as_a_fetch_failure(monkeypatch):
    monkeypatch.setattr(ingest.screener, "company", lambda s: {"name": s, "bse_code": "1"})
    monkeypatch.setattr(ingest.bse, "announcements", lambda *a: [])
    monkeypatch.setattr(ingest.prices, "history", lambda s: pd.DataFrame(columns=["Close", "Volume"]))
    with pytest.raises(ConnectionError):
        ingest.ticker("X", TODAY, TODAY, None)
