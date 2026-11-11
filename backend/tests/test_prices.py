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


def test_stub_bar_with_nan_close_is_not_a_bar(monkeypatch):
    # yfinance on 12 Nov 03:30 IST: 11 Nov row had volume but Close=NaN for every symbol
    import numpy as np, finn.sources.prices as P
    idx = pd.DatetimeIndex(["2026-11-09", "2026-11-11"]).tz_localize("Asia/Kolkata")
    raw = pd.DataFrame({"Close": [100.0, np.nan], "Volume": [10, 20]}, index=idx)
    monkeypatch.setattr(P.yf, "Ticker", lambda s: type("T", (), {"history": lambda self, **k: raw})())
    assert list(map(str, P.history("X").index)) == ["2026-11-09"]
