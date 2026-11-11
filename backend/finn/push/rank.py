"""Materiality rank: tier + market-reaction boost, with a reason string the card shows.
Kept tiny and pure on purpose: the web app re-implements it in TS so thresholds re-rank client-side;
both run the same cases in tests/rank_cases.json."""
import datetime as dt
from finn.config import VOLUME_MULTIPLE, EXCESS_MOVE_PCT, TIERS

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
CLOSE = dt.time(15, 30)
BASE = {"P1": 300, "P2": 200, "P3": 100}
BOOST = 150  # a P2 the market reacted to outranks a quiet P1
LABEL = {"m_and_a": "M&A", "agm_egm": "AGM/EGM", "credit_rating_downgrade": "rating downgrade"}


def label(cat: str) -> str:
    return LABEL.get(cat, cat.replace("_", " "))


def reaction_day(news_dt: str) -> dt.date:
    """Filed before the 15:30 IST close -> that day's bar; after -> the next trading day's (day_stats skips holidays)."""
    t = dt.datetime.fromisoformat(news_dt)  # BSE/NSE timestamps are IST, naive
    return t.date() if t.time() < CLOSE else t.date() + dt.timedelta(days=1)


def _pct(x: float) -> str:
    return f"{x:+.1f}%".replace("-", "−")


def hits(r: dict | None, vol_n: float = VOLUME_MULTIPLE, move_x: float = EXCESS_MOVE_PCT) -> list[str]:
    """Which thresholds a reaction-day bar crossed, as display text. Move is vs Nifty when Nifty has a bar."""
    if not r:
        return []
    out = []
    ex = r.get("excess_pct")
    if abs(ex if ex is not None else r["move_pct"]) >= move_x:
        out.append(f"{_pct(r['move_pct'])} ({_pct(ex)} vs Nifty)" if ex is not None else _pct(r["move_pct"]))
    if (r.get("vol_ratio") or 0) >= vol_n:
        out.append(f"{r['vol_ratio']:.1f}× volume")
    return out


def rank(item: dict, vol_n: float = VOLUME_MULTIPLE, move_x: float = EXCESS_MOVE_PCT) -> dict:
    """item: tier, category, reaction (day_stats dict or None), reaction_day, last_bar (ISO dates; last_bar None = no prices).
    Returns score, reason, boosted, collapsed."""
    # routine paperwork (P3) never explains a move; the move still raises its own price alert
    h = hits(item.get("reaction"), vol_n, move_x) if item["tier"] != "P3" else []
    lab = label(item["category"])
    if h:
        reason = f"Ranked high: {lab} · " + " · ".join(h)
    elif item.get("reaction"):
        r = item["reaction"]
        reason = f"{lab} · " + (f"{_pct(r['excess_pct'])} vs Nifty" if r.get("excess_pct") is not None else _pct(r["move_pct"]))
    elif item.get("last_bar") and item["reaction_day"] > item["last_bar"]:
        reason = f"{lab} · Reaction pending"  # filed after the latest bar we have; never a fake boost
    else:
        reason = f"{lab} · No price data"
    return {"score": BASE[item["tier"]] + (BOOST if h else 0), "reason": reason,
            "boosted": bool(h), "collapsed": item["tier"] == "P3" and not h}


def price_alerts(symbol: str, days: list[dict], vol_n: float = VOLUME_MULTIPLE, move_x: float = EXCESS_MOVE_PCT) -> list[dict]:
    """EOD alerts independent of filings: one per trading day whose bar crosses a threshold."""
    return [{"symbol": symbol, "date": d["date"], "kind": "price", "text": " · ".join(hits(d, vol_n, move_x))}
            for d in days if hits(d, vol_n, move_x)]


ALERT_CATEGORIES = TIERS["P1"]  # default; the user toggles these in the app
