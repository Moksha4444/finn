"""Promised vs Delivered.
1. Pick the 4 latest *results* calls from screener's concall list (it also lists analyst meets and mislabels some).
2. Cheap model reads each transcript once -> forward-looking commitments, each with a verbatim quote + page.
3. Python attaches actuals from screener's quarterly table (which mirrors the exchange results filings) and
   computes YoY / QoQ. The LLM never does arithmetic.
4. Strong model sees only that JSON -> hit / miss / partial / not-yet-measurable + a short why.
Run from backend/:  ../.venv/Scripts/python -m finn.pull.pvd TCS
"""
import re, sys, json, hashlib, datetime as dt
from finn import llm
from finn.config import ROOT
from finn.sources import fetch, bse, screener, pdf

OUT = ROOT / "web" / "public" / "data" / "research"
QEND = (3, 6, 9, 12)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# screener row names per metric; banks/NBFCs use Revenue / Financing Margin %
ROWS = {"revenue": ["Sales", "Revenue"], "operating_margin": ["OPM %", "Financing Margin %"], "net_profit": ["Net Profit"]}
SOURCE = "screener.in quarterly results table (from the company's exchange results filings)"

GUIDANCE = {"type": "object", "properties": {"promises": {"type": "array", "items": {"type": "object", "properties": {
    "metric": {"type": "string"}, "metric_key": {"type": "string", "enum": ["revenue", "operating_margin", "net_profit", "capex", "other"]},
    "target": {"type": "string"}, "period": {"type": "string"}, "quote": {"type": "string"}, "page": {"type": "integer"}},
    "required": ["metric", "metric_key", "target", "period", "quote", "page"]}}}, "required": ["promises"]}
VERDICT = {"type": "object", "properties": {"verdicts": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "integer"}, "verdict": {"type": "string", "enum": ["hit", "miss", "partial", "not-yet-measurable"]},
    "used_quarters": {"type": "array", "items": {"type": "string"}}, "why": {"type": "string"}},
    "required": ["id", "verdict", "used_quarters", "why"]}}}, "required": ["verdicts"]}


def reported_quarter(period: str) -> str | None:
    """'Oct 2026' call -> 'Sep 2026' results. A call 1-2 months after a quarter end reports that quarter;
    anything else (an analyst day in Dec, HDFCBANK's 'Mar 2026') is not a results call."""
    try:
        m = dt.datetime.strptime(period.strip(), "%b %Y")
    except (ValueError, AttributeError):
        return None
    for back in (1, 2):
        mo, yr = m.month - back, m.year
        if mo <= 0:
            mo, yr = mo + 12, yr - 1
        if mo in QEND:
            return f"{MON[mo - 1]} {yr}"
    return None


def results_calls(concalls: list[dict], n: int = 4) -> list[dict]:
    """Newest first, one per reported quarter; when screener lists two transcripts for a quarter, the BSE copy wins
    (screener's company-site links are sometimes last year's file)."""
    by_q: dict[str, dict] = {}
    for c in concalls:
        q = reported_quarter(c.get("period") or "")
        if not q or not c.get("transcript"):
            continue
        if q not in by_q or ("bseindia" in c["transcript"] and "bseindia" not in by_q[q]["transcript"]):
            by_q[q] = c | {"quarter": q}
    key = lambda q: dt.datetime.strptime(q, "%b %Y")
    return [by_q[q] for q in sorted(by_q, key=key, reverse=True)[:n]]


def transcript(url: str) -> bytes:
    if "Pname=" in url:  # screener links BSE's viewer; the PDF itself is an exchange attachment
        return bse.attachment(url.split("Pname=", 1)[1])
    return fetch(url, expect=b"%PDF")


def actuals(quarters: dict, key: str, after: str) -> list[dict]:
    """Reported values for the quarters after `after`, with YoY / QoQ computed here (never by the model)."""
    names = ROWS.get(key)
    rows = quarters.get("rows", {})
    row = next((rows[r] for r in names or [] if r in rows), None)
    if not row:
        return []
    ps = quarters["periods"]
    out = []
    for k, p in enumerate(ps):
        if dt.datetime.strptime(p, "%b %Y") <= dt.datetime.strptime(after, "%b %Y") or row[k] is None:
            continue
        a = {"quarter": p, "value": row[k], "unit": "%" if key == "operating_margin" else "₹ crore"}
        for lag, name in ((4, "yoy"), (1, "qoq")):
            prev = row[k - lag] if k - lag >= 0 else None
            if prev is None:
                continue
            if key == "operating_margin":
                a[f"{name}_pp"] = round(row[k] - prev, 1)  # margins move in percentage points
            elif prev:
                a[f"{name}_pct"] = round((row[k] - prev) / abs(prev) * 100, 1)
        out.append(a)
    return out


def describe(acts: list[dict], used: list[str]) -> str | None:
    picked = [a for a in acts if a["quarter"] in used]
    if not picked:
        return None
    def one(a):
        v = f"{a['value']:g}%" if a["unit"] == "%" else f"₹{a['value']:,.0f} cr"
        ch = f"{a['yoy_pp']:+.1f} pp YoY" if "yoy_pp" in a else f"{a['yoy_pct']:+.1f}% YoY" if "yoy_pct" in a else None
        return f"{a['quarter']}: {v}" + (f" ({ch})" if ch else "")
    return "; ".join(one(a) for a in picked)


def dedupe(promises: list[dict]) -> list[dict]:
    """Management repeats a target within one call (opening remarks, then Q&A): keep the first mention."""
    seen, out = set(), []
    for p in promises:
        k = (p["said_in"], p["metric_key"], re.sub(r"[^0-9%]", "", p["target"]) or p["target"].lower())
        if k not in seen:
            seen.add(k)
            out.append(p)
    return out


def run(symbol: str) -> dict:
    co = screener.company(symbol)
    calls = results_calls(co["concalls"])
    promises = []
    for c in calls:
        b = transcript(c["transcript"])
        texts = pdf.pages(pdf.open_pdf(b))
        r = llm.run("extract_guidance", "extract_guidance", [pdf.marked_text(texts, list(range(len(texts))))], GUIDANCE,
                    key=hashlib.sha256(b).hexdigest(), symbol=symbol, call=c["quarter"])
        for p in r["data"]["promises"]:
            if not 1 <= p["page"] <= len(texts):
                p["page"] = None  # a page the transcript doesn't have is not a citation
            promises.append(p | {"said_in": c["quarter"], "transcript": c["transcript"],
                                 "actuals": actuals(co["quarters"], p["metric_key"], c["quarter"])})

    promises = dedupe(promises)
    latest = co["quarters"]["periods"][-1] if co["quarters"]["periods"] else None
    payload = {"latest_quarter": latest, "promises": [
        {"id": k, **{f: p[f] for f in ("metric", "target", "period", "quote", "said_in", "actuals")}} for k, p in enumerate(promises)]}
    v = llm.run("pvd_verdict", "pvd_verdict", [json.dumps(payload, ensure_ascii=False)], VERDICT, symbol=symbol) if promises else {"data": {"verdicts": []}, "model_note": None}
    by_id = {x["id"]: x for x in v["data"]["verdicts"]}

    rows = []
    for k, p in enumerate(promises):
        x = by_id.get(k, {"verdict": "not-yet-measurable", "used_quarters": [], "why": "not disclosed"})
        rows.append({"metric": p["metric"], "target": p["target"], "period": p["period"], "said_in": p["said_in"],
                     "quote": p["quote"], "page": p["page"], "transcript": p["transcript"],
                     "actual": describe(p["actuals"], x["used_quarters"]) or "not disclosed",
                     "actual_source": SOURCE if x["used_quarters"] else None, "verdict": x["verdict"], "why": x["why"]})
    score = {s: sum(r["verdict"] == s for r in rows) for s in ("hit", "partial", "miss", "not-yet-measurable")}
    out = {"symbol": symbol.upper(), "name": co["name"], "generated_at": dt.datetime.now().isoformat(timespec="minutes"),
           "latest_quarter": latest, "calls": [{"quarter": c["quarter"], "transcript": c["transcript"]} for c in calls],
           "model_note": v.get("model_note"), "score": score, "promises": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{symbol.upper()}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    for sym in argv or sys.argv[1:]:
        out = run(sym)
        s = out["score"]
        print(f"\n{out['name']} ({out['symbol']}) · calls: {', '.join(c['quarter'] for c in out['calls'])} · latest results: {out['latest_quarter']}")
        print(f"hit {s['hit']} · partial {s['partial']} · miss {s['miss']} · not yet {s['not-yet-measurable']}" + (f" · {out['model_note']}" if out["model_note"] else ""))
        for r in out["promises"]:
            print(f"  [{r['verdict']:<18}] {r['said_in']} p.{r['page']}: {r['metric']} → {r['target']} ({r['period']})")
            print(f"  {'':20} actual: {r['actual']} · {r['why']}")


if __name__ == "__main__":
    main()
