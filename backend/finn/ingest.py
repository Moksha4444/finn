"""Daily ingest: portfolio filings -> classify -> cards -> rank -> alerts -> web/public/data/feed.json.
Run from backend/:  ../.venv/Scripts/python -m finn.ingest [--days 7] [SYMBOL ...]
Every step is per-filing try/except: a failure leaves the item with its raw link and an error note, never a crash."""
import sys, json, argparse, datetime as dt
from finn.config import ROOT, PORTFOLIO, VOLUME_MULTIPLE, EXCESS_MOVE_PCT
from finn.sources import fetch, bse, nse, screener, prices, pdf
from finn.push import classify, cards, rank, headline

OUT = ROOT / "web" / "public" / "data" / "feed.json"


def _err(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"[:200]


def _pdf(row: dict) -> bytes:
    if row.get("ATTACHMENTNAME"):
        return bse.attachment(row["ATTACHMENTNAME"])
    if not row.get("url"):
        raise FileNotFoundError("filing has no attachment")
    return fetch(row["url"], expect=b"%PDF")


def _card(item: dict, get_pdf) -> None:
    """Adds item['card'] for P1 results / management changes. Results: only if a P&L page is found
    (decks and letters don't get a full-PDF LLM call)."""
    try:
        if item["category"] == "results":
            b = get_pdf()
            idx, _ = pdf.find_results_pages(pdf.pages(pdf.open_pdf(b)))
            if idx:
                item["card"] = {"type": "results", **cards.results_card(cards.extract_results(b))}
        elif item["category"] == "management_change":
            item["card"] = {"type": "management_change", **cards.mgmt_card(get_pdf())}
    except Exception as e:
        item["card_error"] = _err(e)


def ticker(sym: str, start: dt.date, end: dt.date, nifty) -> tuple[list[dict], list[dict], list[dict], dict]:
    """(items, alerts, reaction days in window, company: name/sector/closes) for one symbol."""
    errors = []
    try:
        co = screener.company(sym)
    except Exception as e:  # slug mismatch / screener down: NSE still works by symbol
        co, errors = {"name": sym, "bse_code": None}, [_err(e)]
    source = "bse" if co["bse_code"] else "nse"
    try:
        rows = bse.announcements(co["bse_code"], start, end) if co["bse_code"] else nse.announcements(sym, start, end)
    except Exception as e:  # BSE sometimes serves an HTML error page for one scrip/window: NSE by symbol instead
        if source == "nse":
            raise
        errors.append(f"BSE failed, used NSE: {_err(e)}")
        source, rows = "nse", nse.announcements(sym, start, end)
    lender = "Financing Profit" in co.get("quarters", {}).get("rows", {})  # screener's bank/NBFC table layout
    h = prices.history(sym)
    last_bar = h.index[-1].isoformat() if len(h) else None

    items, has_results_card = [], False
    for row in rows:
        get_pdf = lambda row=row: _pdf(row)
        c = classify.classify(row, get_pdf, lender)
        rday = rank.reaction_day(row["NEWS_DT"])
        item = {
            "id": row["NEWSID"], "symbol": sym, "name": co["name"], "filed": row["NEWS_DT"][:16],
            "subject": row.get("NEWSSUB"), "headline": c.get("headline") or row.get("HEADLINE"), "note": c.get("note"), "category": c["category"], "tier": c["tier"],
            "classified_by": c["by"], "classify_error": c.get("error"), "url": row.get("url"), "source": source,
            "reaction_day": rday.isoformat(), "last_bar": last_bar,
            "reaction": prices.day_stats(h, nifty, rday) if len(h) else None,
        }
        if item["tier"] in ("P1", "P2") and item["category"] != "results":
            item["title"] = headline.title(row, get_pdf, draft=c.get("headline"))  # reuses the classifier's headline if it passes
        if item["tier"] == "P1" and item["category"] in ("results", "management_change"):
            if item["category"] == "results" and has_results_card:
                item["tier"] = "P2"  # same results filed twice (Result + Board Meeting outcome): one card is enough
            else:
                _card(item, get_pdf)
                has_results_card |= item["category"] == "results" and "card" in item
        items.append(item | rank.rank(item))

    window = [s for d in h.index if d >= start and (s := prices.day_stats(h, nifty, d))]
    alerts = rank.price_alerts(sym, window)
    seen = set()  # one alert per (day, category): results are often filed twice
    for i in items:
        k = (i["filed"][:10], i["category"])
        if i["tier"] == "P1" and i["category"] in rank.ALERT_CATEGORIES and k not in seen:
            seen.add(k)
            alerts.append({"symbol": sym, "date": k[0], "kind": "filing", "id": i["id"],
                           "text": f"{rank.label(i['category'])}: {i['headline'] or i['subject']}"})
    for e in errors:
        alerts.append({"symbol": sym, "date": end.isoformat(), "kind": "error", "text": e})
    closes = [[d.isoformat(), round(float(c), 2)] for d, c in h["Close"].items() if d >= start - dt.timedelta(days=31)]
    return items, alerts, [{"symbol": sym, **s} for s in window], {"name": co["name"], "sector": co.get("sector"), "closes": closes}


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("symbols", nargs="*", default=PORTFOLIO)
    a = ap.parse_args(argv)
    end = dt.datetime.now(rank.IST).date()
    start = end - dt.timedelta(days=a.days)
    nifty = prices.history(prices.NIFTY)

    items, alerts, days, failed, companies = [], [], [], [], {}
    for sym in a.symbols:
        try:
            i, al, d, companies[sym] = ticker(sym, start, end, nifty)
            items += i; alerts += al; days += d
            print(f"  {sym:<11} {len(i):>3} filings", file=sys.stderr)
        except Exception as e:  # whole ticker failed (BSE + NSE down): say so in the feed
            failed.append({"symbol": sym, "error": _err(e)})
            print(f"  {sym:<11} FAILED {_err(e)}", file=sys.stderr)

    items.sort(key=lambda x: (x["score"], x["filed"]), reverse=True)  # rank, then newest first
    alerts.sort(key=lambda x: x["date"], reverse=True)
    feed = {"generated_at": dt.datetime.now(rank.IST).isoformat(timespec="minutes"), "window": [start.isoformat(), end.isoformat()],
            "thresholds": {"volume_multiple": VOLUME_MULTIPLE, "excess_move_pct": EXCESS_MOVE_PCT},
            "portfolio": a.symbols, "companies": companies,
            "items": items, "alerts": alerts, "days": days, "failed": failed}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, ensure_ascii=False, indent=1), encoding="utf-8")
    print_digest(feed)


def print_digest(feed: dict) -> None:
    shown = [i for i in feed["items"] if not i["collapsed"]]
    hidden = len(feed["items"]) - len(shown)
    print(f"\nFINN digest {feed['window'][0]} → {feed['window'][1]} · {len(shown)} shown · {hidden} routine hidden")
    for i in shown:
        print(f"\n[{i['tier']}] {i['symbol']} · {i['filed']} · {i['reason']}")
        print(f"     {i['headline'] or i['subject']}" + (f"  [{i['note']}]" if i.get("note") else ""))
        card = i.get("card")
        if card and card["type"] == "results":
            print(f"     {card['basis']}, ₹ crore · {' / '.join(card['periods'])}")
            pct = lambda x: "–" if x is None else f"{x:+.1f}%"
            for l in card["lines"]:
                v = "–" if l["value"] is None else f"{l['value']:,.0f}"
                print(f"       {l['name']:<16} {v:>10}   QoQ {pct(l['qoq_pct']):>7}   YoY {pct(l['yoy_pct']):>7}")
            for o in card["one_offs"]:
                print(f"       ! {o}")
        elif card:
            for p in card["people"]:
                print(f"       {p['change']}: {p['name']} · {p['role']} · {p.get('effective') or ''}")
                if p.get("bio"):
                    print(f"         {p['bio'][:160]}" + (f" [p.{p['bio_page']}]" if p.get("bio_page") else ""))
        if i.get("card_error"):
            print(f"       (card failed: {i['card_error']}) {i['url']}")
    print(f"\nALERTS ({len(feed['alerts'])})")
    for a in feed["alerts"]:
        print(f"  {a['date']} {a['symbol']:<11} {a['kind']:<6} {a['text'][:110]}")
    for f in feed["failed"]:
        print(f"  FAILED {f['symbol']}: {f['error']}")


if __name__ == "__main__":
    main()
