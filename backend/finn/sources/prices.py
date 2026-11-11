"""EOD prices from yfinance (<SYMBOL>.NS) and Nifty 50 (^NSEI); per-day reaction stats."""
import datetime as dt
import pandas as pd
import yfinance as yf

NIFTY = "^NSEI"


def history(symbol: str, period: str = "3mo") -> pd.DataFrame:
    """Daily OHLCV indexed by date. 3mo = 30-day digest window + 20 days of volume history.
    Pass NIFTY for the index. Empty frame if yfinance has nothing (delisted / bad symbol)."""
    h = yf.Ticker(symbol if symbol.startswith("^") else f"{symbol}.NS").history(period=period, auto_adjust=False)
    if h.empty:
        return pd.DataFrame(columns=["Close", "Volume"])
    h = h.dropna(subset=["Close"])  # yfinance posts a stub bar (volume, NaN close) for hours after the close: not a bar yet
    h.index = h.index.date
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30)))
    if now.time() < dt.time(16, 0):  # before the close yfinance serves today's partial bar: not an EOD reaction
        h = h[h.index < now.date()]
    return h[["Close", "Volume"]]


def day_stats(h: pd.DataFrame, nifty: pd.DataFrame, day: dt.date) -> dict | None:
    """Stats for the first trading day on/after `day`. None if that bar doesn't exist yet (no fake boost)."""
    after = [d for d in h.index if d >= day]
    if not after:
        return None
    d = after[0]
    i = h.index.get_loc(d)
    if i < 1:
        return None
    vol_hist = h.Volume.iloc[max(0, i - 20):i]
    move = (h.Close.iloc[i] / h.Close.iloc[i - 1] - 1) * 100
    n_move = None
    if d in nifty.index:
        j = nifty.index.get_loc(d)
        n_move = (nifty.Close.iloc[j] / nifty.Close.iloc[j - 1] - 1) * 100 if j >= 1 else None
    return {
        "date": d.isoformat(),
        "move_pct": round(float(move), 2),
        "nifty_pct": None if n_move is None else round(float(n_move), 2),
        "excess_pct": None if n_move is None else round(float(move - n_move), 2),
        "vol_ratio": round(float(h.Volume.iloc[i] / vol_hist.mean()), 2) if len(vol_hist) >= 10 and vol_hist.mean() else None,
    }
