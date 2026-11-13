"""Research page data, one JSON per company: Promised vs Delivered (pvd.py) plus a track-record sentence, a financial
snapshot, 90 days of prices vs Nifty, the bull and bear case, and the source list.
Python only, except bull/bear: the strong model picks and words the points, and Python drops any point whose numbers
are not in the evidence it cites. Every snapshot number is computed here from screener's tables.
Run from backend/:  ../.venv/Scripts/python -m finn.pull.research TCS HDFCBANK   (no args: every researched + portfolio ticker)
"""
import re, sys, json, functools, datetime as dt
from finn import llm
from finn.config import PORTFOLIO
from finn.ingest import KEPT, MISSED, OPEN
from finn.pull import pvd
from finn.push.headline import _nums
from finn.sources import prices, screener, pdf

OUT = pvd.OUT
SNAP_SOURCE = "screener.in quarterly and annual tables (from the company's exchange results filings and annual reports)"
MEASURED_OTHER = {"partial", "moved closer", "no change"}  # measured, but neither kept nor missed


# ---- numbers (all arithmetic here) ----
def signed(v: float, unit: str = "%") -> str:
    return f"{v:+.1f}{unit}".replace("-", "−")


def _annual(t: dict, names: list[str]) -> dict[str, float]:
    """Financial-year columns only ('Mar 2026'), not TTM or a half-year balance sheet ('Sep 2026')."""
    return {p: v for p, v in (pvd._row(t, names) or {}).items() if re.fullmatch(r"Mar \d{4}", p)}


def fy(p: str) -> str:
    return f"FY{int(p[-2:])}"


def snapshot(co: dict) -> dict:
    """Revenue & PAT (8 quarters), margin (8 quarters), cash conversion and debt/equity (5 years), each with one
    claim sentence. Lenders: total income and net margin; CFO and debt/equity don't mean anything for a bank's book."""
    q, a = co["quarters"], co["annual"]
    lender = "Financing Profit" in q["rows"]
    rev = pvd._row(q, ["Sales", "Revenue"]) or {}
    if lender:  # banks/NBFCs: total income = interest earned + other income (no EBITDA; CLAUDE.md rule 7)
        oi = pvd._row(q, ["Other Income"]) or {}
        rev = {p: v + oi.get(p, 0) for p, v in rev.items()}
    pat = pvd._row(q, ["Net Profit"]) or {}
    periods = [p for p in q["periods"] if p in rev and p in pat][-8:]
    rev_name = "Total income" if lender else "Revenue"
    out = {"basis": co["basis"], "lender": lender, "unit": "₹ crore", "source": SNAP_SOURCE}

    if periods:
        last, ago = periods[-1], pvd.shift(periods[-1], -4)
        claim = f"{rev_name} ₹{rev[last]:,.0f} cr in the {last} quarter"
        if rev.get(ago) and pat.get(ago) and pat[ago] > 0:
            claim = f"{rev_name} {signed((rev[last] / rev[ago] - 1) * 100)} YoY in the {last} quarter; PAT {signed((pat[last] / pat[ago] - 1) * 100)}"
        out["quarters"] = {"periods": periods, "revenue": [rev[p] for p in periods], "pat": [pat[p] for p in periods],
                           "revenue_name": rev_name, "claim": claim + "."}

    if lender:
        m = {p: pat[p] / rev[p] * 100 for p in pat if rev.get(p)}
        m_name = "Net margin (PAT / total income)"
    else:  # EBITDA = PBT + finance costs + D&A, other income included: the same definition as the results card
        pbt, intr, dep = (pvd._row(q, [n]) or {} for n in ("Profit before tax", "Interest", "Depreciation"))
        m = {p: (pbt[p] + intr.get(p, 0) + dep.get(p, 0)) / rev[p] * 100 for p in pbt if rev.get(p)}
        m_name = "EBITDA margin (PBT + finance costs + D&A, other income included)"
    mp = [p for p in periods if p in m]
    if len(mp) >= 2:
        last, ago = mp[-1], pvd.shift(mp[-1], -4)
        claim = f"{m_name.split(' (')[0]} {m[last]:.1f}% in the {last} quarter" + (f", {signed(m[last] - m[ago], ' pp')} YoY" if ago in m else "")
        out["margin"] = {"name": m_name, "periods": mp, "values": [round(m[p], 2) for p in mp], "claim": claim + "."}

    if lender:
        note = "Not shown for lenders: deposits and loans run through operating cash flow, and borrowing is the business."
        out["cash"] = out["leverage"] = {"note": note}
        return out
    cfo, apat = _annual(a["cash-flow"], ["Cash from Operating Activity"]), _annual(a["profit-loss"], ["Net Profit"])
    years = [p for p in a["cash-flow"]["periods"] if p in cfo and p in apat][-5:]
    if len(years) >= 2:
        c, n = sum(cfo[y] for y in years), sum(apat[y] for y in years)
        span = f"{fy(years[0])}–{fy(years[-1])}"
        claim = (f"Operating cash flow was {c / n:.2f}× PAT over {span} (₹{c:,.0f} cr vs ₹{n:,.0f} cr)." if n > 0
                 else f"PAT summed to ₹{n:,.0f} cr over {span}, so cash conversion isn't meaningful.")
        out["cash"] = {"years": [fy(y) for y in years], "cfo": [cfo[y] for y in years], "pat": [apat[y] for y in years], "claim": claim}
    bs = a["balance-sheet"]
    debt, eq, res = (_annual(bs, n) for n in (["Borrowings", "Borrowing"], ["Equity Capital"], ["Reserves"]))
    years = [p for p in bs["periods"] if p in debt and p in eq and p in res and eq[p] + res[p] > 0][-5:]
    if len(years) >= 2:
        de = {y: debt[y] / (eq[y] + res[y]) for y in years}
        out["leverage"] = {"years": [fy(y) for y in years], "values": [round(de[y], 2) for y in years],
                           "claim": f"Debt/equity {de[years[-1]]:.2f} at {fy(years[-1])} end, from {de[years[0]]:.2f} at {fy(years[0])} end."}
    return out


# ---- track record (template sentence, no LLM) ----
def summary(rows: list[dict], n_calls: int) -> dict:
    v = [r["verdict"] for r in rows]
    c = {"kept": sum(x in KEPT for x in v), "missed": sum(x in MISSED for x in v), "open": sum(x in OPEN for x in v),
         "partial": sum(x in MEASURED_OTHER for x in v), "unmeasured": v.count("not-yet-measurable"), "total": len(v)}
    c["measured"] = c["total"] - c["unmeasured"]
    calls = f"the last {n_calls} {'call' if n_calls == 1 else 'calls'}"
    if not n_calls:
        s = "No earnings-call transcripts were found to check promises against."
    elif not rows:
        s = f"No checkable promises found on {calls}."
    elif not c["measured"]:
        s = f"None of the {c['total']} promises from {calls} can be checked yet; the reasons are listed below."
    else:
        s = f"Kept {c['kept']} of {c['measured']} measured {'promise' if c['measured'] == 1 else 'promises'} from {calls}"
        tail = []
        missed = [r for r in rows if r["verdict"] in MISSED]
        if missed:  # name only the latest miss: two wordings of one target read as two failures
            m = max(missed, key=lambda r: pvd._q(r["said_in"]))
            words = m["metric"].split()
            # "Operating Margin" -> "operating margin"; keep acronyms ("EBITDA margin", "FY 26")
            name = m["metric"] if any(len(w) > 1 and w.isupper() for w in words) else m["metric"].lower()
            tail.append(f"missed {len(missed)}, the latest on {name} ({m['call']} call)" if len(missed) > 1 else f"missed on {name} ({m['call']} call)")
        if c["open"]:
            tail.append(f"{c['open']} on track")
        if c["partial"]:
            tail.append(f"{c['partial']} partly met")
        if not missed:
            tail.append("none missed")
        s += "; " + "; ".join(tail) + "."
    return c | {"sentence": s}


# ---- bull / bear ----
CONCERN = re.compile(r"declin|slow|pressure|weak|concern|risk|competi|attrition|delay|headwind|lower|drop|fall|stress|slippage|"
                     r"\bnpa|debt|leverage|dilut|loss|challeng|moderat|soft|downgrad|sustain|worr", re.I)


def analyst_questions(texts_by_q: dict[str, list[str]], urls: dict[str, str], per_call: int = 3) -> list[dict]:
    """Analysts' pointed questions, by rule: a sentence ending in '?' that names a concern (slowdown, pressure,
    competition, NPAs...), most concern words first. Transcript questions are almost always the analysts'."""
    out = []
    for q, pages in texts_by_q.items():
        cands = []
        for i, t in enumerate(pages):
            for s in re.split(r"(?<=[?.!])\s+", re.sub(r"\s+", " ", t)):
                if s.endswith("?") and 50 <= len(s) <= 320 and (k := len(CONCERN.findall(s))):
                    cands.append((k, i + 1, s))
        for k, page, s in sorted(cands, key=lambda c: -c[0])[:per_call]:
            out.append({"call": pvd.fy_name(q), "page": page, "quote": s, "url": urls.get(q)})
    return out


def evidence(rows: list[dict], reported: list[dict], questions: list[dict], snap: dict, urls: dict[str, str]) -> list[dict]:
    """Everything the model may cite: {id, text, cite: {label, url}}. S = management's numbers, Q = analysts'
    questions, P = promises with their computed verdict, F = snapshot claims."""
    ev = []
    for x in sorted(reported, key=lambda r: pvd._q(r["said_in"]), reverse=True)[:24]:  # newest 24: Groq's 8k tokens/min
        ev.append({"id": f"S{len(ev) + 1}", "text": f"{x['metric']}: {x['value']} ({x['period']}). “{x['quote']}”",
                   "cite": {"label": f"{pvd.fy_name(x['said_in'])} call, p.{x['page']}", "url": urls.get(x["said_in"])}})
    for k, x in enumerate(questions):
        ev.append({"id": f"Q{k + 1}", "text": f"Analyst on the {x['call']} call: “{x['quote']}”",
                   "cite": {"label": f"{x['call']} call, p.{x['page']} (analyst)", "url": x["url"]}})
    for k, r in enumerate(rows):
        ev.append({"id": f"P{k + 1}", "text": f"Promised on the {r['call']} call: {r['metric']}: {r['target']} ({r['period']}). "
                                              f"Verdict: {r['verdict']}. Actual: {r['actual']}",
                   "cite": {"label": f"{r['call']} call, p.{r['page']} (promise)", "url": r["transcript"]}})
    for k, key in enumerate(("quarters", "margin", "cash", "leverage")):
        if snap.get(key, {}).get("claim"):
            ev.append({"id": f"F{k + 1}", "text": snap[key]["claim"], "cite": {"label": "Financial snapshot (results filings)", "url": f"#{key}"}})
    return ev


POINT = {"type": "object", "properties": {"point": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}},
         "required": ["point", "cites"]}
BB = {"type": "object", "properties": {"bull": {"type": "array", "items": POINT}, "bear": {"type": "array", "items": POINT}},
      "required": ["bull", "bear"]}
PERIOD = re.compile(r"\b(?:FY|Q|H)\s?'?\d+\b|\b[SQPF]\d+\b")  # period names and evidence ids are not claims


def checked(points: list[dict], by_id: dict[str, dict]) -> tuple[list[dict], int]:
    """(first 3 points whose every number is printed in the evidence they cite, number rejected)."""
    keep, dropped = [], 0
    for pt in points:
        if not isinstance(pt, dict) or not isinstance(pt.get("point"), str) or not isinstance(pt.get("cites"), list):
            dropped += 1
            continue
        ids = [i for i in dict.fromkeys(pt["cites"]) if i in by_id]
        body = re.sub(r"[,\s]", "", " ".join(by_id[i]["text"] for i in ids))
        if not ids or any(n not in body for n in _nums(PERIOD.sub("", pt["point"]))):
            dropped += 1
            continue
        keep.append({"point": pt["point"].strip(), "cites": [by_id[i]["cite"] for i in ids]})
    return keep[:3], dropped


def bull_bear(name: str, latest: str | None, ev: list[dict], symbol: str) -> dict | None:
    """None when the model is unavailable or a side has no point that survives the number check (page hides it)."""
    payload = {"company": name, "latest_quarter": latest, "evidence": [{"id": e["id"], "text": e["text"]} for e in ev]}
    try:
        r = llm.run("bull_bear", "bull_bear", [json.dumps(payload, ensure_ascii=False)], BB, symbol=symbol, patient=True)
    except Exception as e:  # quota / network: hide the section, keep the rest of the page
        print(f"  bull/bear unavailable for {symbol}: {type(e).__name__}: {str(e)[:120]}")
        return None
    by_id = {e["id"]: e for e in ev}
    data = r["data"] if isinstance(r["data"], dict) else {}
    bull, d1 = checked(data.get("bull") or [], by_id)
    bear, d2 = checked(data.get("bear") or [], by_id)
    if not bull or not bear:
        return None
    return {"bull": bull, "bear": bear, "dropped": d1 + d2, "model": r["model"], "model_note": r.get("model_note")}


# ---- prices ----
@functools.cache
def _closes(symbol: str) -> tuple:
    h = prices.history(symbol, "6mo")
    since = dt.date.today() - dt.timedelta(days=90)
    return tuple((d.isoformat(), round(float(c), 2)) for d, c in h.Close.items() if d >= since)


def price_lines(symbol: str) -> dict | None:
    try:
        s, n = _closes(symbol), _closes(prices.NIFTY)
    except Exception as e:
        print(f"  prices unavailable for {symbol}: {type(e).__name__}")
        return None
    return {"closes": [list(x) for x in s], "nifty": [list(x) for x in n]} if len(s) >= 5 else None


# ---- one company ----
def sources(out: dict, co: dict) -> list[dict]:
    seen, src = set(), []
    def add(label, url):
        if url and url not in seen:
            seen.add(url)
            src.append({"label": label, "url": url})
    for c in out["calls"]:
        add(f"{c['call']} earnings call transcript", c["transcript"])
    for r in out["promises"]:
        for c in r["cites"]:
            add(c["label"].split(":")[0].split(" (")[0], c["url"])
    add(f"Quarterly and annual tables ({co['basis']}), screener.in, from the exchange filings", co.get("url"))
    return src


def build(symbol: str) -> dict:
    sym = symbol.upper()
    f = OUT / f"{sym}.json"
    try:
        out = pvd.run(sym)
        co, reported, texts = out.pop("_company"), out.pop("_reported"), out.pop("_texts")
        out.pop("_calls")
    except Exception as e:  # e.g. an uncached cheap-model call on a quota day: keep last good PvD, rebuild the rest
        if not f.exists():
            raise
        print(f"  {sym}: PvD not re-run ({type(e).__name__}: {str(e)[:100]}); kept the previous promises")
        out = {k: v for k, v in json.loads(f.read_text(encoding="utf-8")).items() if k not in ("snapshot", "bull_bear", "prices", "summary", "sources")}
        co, reported, texts = screener.company(sym), [], {}
        for c in out["calls"]:
            try:
                texts[c["quarter"]] = pdf.pages(pdf.open_pdf(pvd.transcript(c["transcript"])))
            except Exception:
                pass
    urls = {c["quarter"]: c["transcript"] for c in out["calls"]}
    snap = snapshot(co)
    ev = evidence(out["promises"], reported, analyst_questions(texts, urls), snap, urls)
    out |= {"sector": co.get("sector"), "summary": summary(out["promises"], len(out["calls"])), "prices": price_lines(sym),
            "snapshot": snap, "bull_bear": bull_bear(out["name"], out.get("latest_quarter"), ev, sym), "sources": sources(out, co)}
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)
    return out


def index() -> list[dict]:
    """research/index.json: the Research tab's list (name, sector, track record), no page data."""
    rows = []
    for f in sorted(OUT.glob("*.json")):
        if f.stem == "index":
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        s = d.get("summary") or summary(d["promises"], len(d["calls"]))
        rows.append({"symbol": d["symbol"], "name": d["name"], "sector": d.get("sector"), "generated_at": d["generated_at"],
                     "summary": {k: s[k] for k in ("kept", "missed", "open", "partial", "measured", "total")}})
    (OUT / "index.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return rows


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    syms = argv or sys.argv[1:] or sorted({f.stem for f in OUT.glob("*.json") if f.stem != "index"} | set(PORTFOLIO))
    for sym in syms:
        try:
            out = build(sym)
        except Exception as e:
            print(f"{sym} FAILED: {type(e).__name__}: {str(e)[:160]}")
            continue
        bb = out["bull_bear"]
        print(f"{sym}: {out['summary']['sentence']} · snapshot {', '.join(k for k in ('quarters', 'margin', 'cash', 'leverage') if k in out['snapshot'])}"
              f" · bull/bear {'%d+%d (dropped %d)' % (len(bb['bull']), len(bb['bear']), bb['dropped']) if bb else 'hidden'}")
    index()


if __name__ == "__main__":
    main()
