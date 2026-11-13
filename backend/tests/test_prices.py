import datetime as dt
import pandas as pd
from finn.sources.prices import day_stats

days = [dt.date(2026, 10, 1) + dt.timedelta(days=i) for i in range(25)]
stock = pd.DataFrame({"Close": [100.0] * 24 + [110.0], "Volume": [1000] * 24 + [3000]}, index=days)
nifty = pd.DataFrame({"Close": [100.0] * 24 + [102.0], "Volume": [0] * 25}, index=days)


def test_reaction_day_stats():
    s = day_stats(stock, nifty, days[-1])
    assert s == {"date": "2026-10-25", "move_pct": 10.0, "nifty_pct": 2.0, "excess_pct": 8.0, "vol_ratio": 3.0}


def test_weekend_filing_maps_to_next_bar_and_future_has_no_bar():
    gap = stock.drop(index=days[-2])  # day 24 is a holiday: a filing that day reacts on day 25
    assert day_stats(gap, nifty, days[-2])["date"] == "2026-10-25"
    assert day_stats(stock, nifty, days[-1] + dt.timedelta(days=1)) is None


def test_stub_bar_with_nan_close_is_not_a_bar(monkeypatch, tmp_path):
    # yfinance on 12 Nov 03:30 IST: 11 Nov row had volume but Close=NaN for every symbol
    import numpy as np, finn.sources.prices as P
    monkeypatch.setattr(P, "STORE", tmp_path)
    idx = pd.DatetimeIndex(["2026-11-09", "2026-11-11"]).tz_localize("Asia/Kolkata")
    raw = pd.DataFrame({"Close": [100.0, np.nan], "Volume": [10, 20]}, index=idx)
    monkeypatch.setattr(P.yf, "Ticker", lambda s: type("T", (), {"history": lambda self, **k: raw})())
    assert list(map(str, P.history("X").index)) == ["2026-11-09"]


def test_prices_never_move_backwards(monkeypatch, tmp_path):
    # 13 Nov: 'up to 12 Nov' at 22:24 became 'up to 11 Nov' at 03:55 when yfinance dropped the 12 Nov bar
    import finn.sources.prices as P
    monkeypatch.setattr(P, "STORE", tmp_path)
    serve = {}
    monkeypatch.setattr(P.yf, "Ticker", lambda s: type("T", (), {"history": lambda self, **k: serve["df"]})())
    idx = lambda *d: pd.DatetimeIndex(list(d)).tz_localize("Asia/Kolkata")
    serve["df"] = pd.DataFrame({"Close": [100.0, 101.0], "Volume": [10, 20]}, index=idx("2026-11-11", "2026-11-12"))
    assert str(P.history("X").index[-1]) == "2026-11-12"
    serve["df"] = pd.DataFrame({"Close": [100.5], "Volume": [11]}, index=idx("2026-11-11"))  # 12 Nov gone
    h = P.history("X")
    assert str(h.index[-1]) == "2026-11-12" and h.Close.iloc[-1] == 101.0
    assert h.Close.iloc[0] == 100.5  # a fresh fetch still wins for the dates it has
