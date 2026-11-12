"""Promised vs Delivered.
1. Pick the 4 latest *results* calls from screener's concall list (it also lists analyst meets and mislabels some).
2. Cheap model reads each transcript once -> promises (with the target as numbers: low/high, type, fiscal period)
   and numbers management reports as achieved, each with a verbatim quote + page. Extraction only, no maths.
3. Python decides every promise it can compute: growth or margin targets vs screener's quarterly table
   (which mirrors the exchange results filings). Finished period -> hit / miss; unfinished -> on track /
   ahead / behind pace, with the numbers shown. The LLM never does arithmetic.
4. Strong model judges only the rest (store counts, CASA, capacity...) from management's later-reported numbers.
Run from backend/:  ../.venv/Scripts/python -m finn.pull.pvd TCS
"""
import re, sys, json, hashlib, datetime as dt
from finn import llm
from finn.config import ROOT
from finn.sources import fetch, bse, screener, pdf

OUT = ROOT / "web" / "public" / "data" / "research"
QEND = (3, 6, 9, 12)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# screener rows; banks/NBFCs use Revenue / Financing Profit
ROWS = {"revenue": ["Sales", "Revenue"], "net_profit": ["Net Profit"]}
MARGIN = {"operating_margin": [("Operating Profit", "Sales"), ("Financing Profit", "Revenue")],
          "net_profit": [("Net Profit", "Sales"), ("Net Profit", "Revenue")]}
SOURCE = "screener.in quarterly results table (from the company's exchange results filings)"
SAID = "management's statements on later calls (transcripts)"
RULE = "python (computed)"

KEY = {"type": "string", "enum": ["revenue", "operating_margin", "net_profit", "capex", "other"]}
NUM = {"type": "number", "nullable": True}
INT = {"type": "integer", "nullable": True}
PROMISE = {"type": "object", "properties": {
    "metric": {"type": "string"}, "metric_key": KEY, "target": {"type": "string"}, "period": {"type": "string"},
    "quote": {"type": "string"}, "page": {"type": "integer"},
    "target_type": {"type": "string", "enum": ["growth_pct", "margin_pct", "amount", "count", "other"]},
    "target_low": NUM, "target_high": NUM,
    "horizon": {"type": "string", "enum": ["next_quarter", "quarter", "half_year", "fiscal_year", "next_few_quarters", "long_term", "unspecified"]},
    "fy": INT, "quarter_no": INT, "half_no": INT,
    "basis": {"type": "string", "enum": ["reported_inr", "constant_currency_or_usd", "not_applicable"]},
    "direction": {"type": "string", "enum": ["at_least", "at_most", "within"]},
    "margin_basis": {"type": "string", "enum": ["ebitda", "ebit", "net", "unclear", "not_applicable"]}},
    "required": ["metric", "metric_key", "target", "period", "quote", "page", "target_type", "target_low", "target_high",
                 "horizon", "fy", "quarter_no", "half_no", "basis", "direction", "margin_basis"]}
REPORTED = {"type": "object", "properties": {
    "metric": {"type": "string"}, "metric_key": KEY, "value": {"type": "string"}, "period": {"type": "string"},
    "quote": {"type": "string"}, "page": {"type": "integer"}}, "required": ["metric", "metric_key", "value", "period", "quote", "page"]}
GUIDANCE = {"type": "object", "properties": {"promises": {"type": "array", "items": PROMISE},
                                              "reported": {"type": "array", "items": REPORTED}}, "required": ["promises", "reported"]}
VERDICT = {"type": "object", "properties": {"verdicts": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "integer"}, "verdict": {"type": "string", "enum": ["hit", "miss", "partial", "not-yet-measurable"]},
    "used_reported": {"type": "array", "items": {"type": "string"}}, "why": {"type": "string"}},
    "required": ["id", "verdict", "used_reported", "why"]}}}, "required": ["verdicts"]}
VERDICTS = ("hit", "ahead", "on track", "partial", "behind pace", "miss", "not-yet-measurable")
_q = lambda q: dt.datetime.strptime(q, "%b %Y")


# ---- quarters and Indian fiscal years (FY27 = Apr 2026 - Mar 2027; Q1 ends Jun) ----
def fq(q: str) -> tuple[int, int]:
    """'Sep 2026' -> (27, 2): fiscal year (2 digits) and quarter number."""
    d = _q(q)
    return d.year % 100 + (1 if d.month >= 4 else 0), {6: 1, 9: 2, 12: 3, 3: 4}[d.month]


def qlabel(fy: int, qn: int) -> str:
    month = {1: 6, 2: 9, 3: 12, 4: 3}[qn]
    return f"{MON[month - 1]} {2000 + fy - (1 if qn <= 3 else 0)}"


def fy_name(q: str) -> str:
    fy, qn = fq(q)
    return f"Q{qn} FY{fy}"


def shift(q: str, n: int) -> str:
    fy, qn = fq(q)
    k = fy * 4 + qn - 1 + n
    return qlabel(k // 4, k % 4 + 1)


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
    return [by_q[q] for q in sorted(by_q, key=_q, reverse=True)[:n]]


def transcript(url: str) -> bytes:
    if "Pname=" in url:  # screener links BSE's viewer; the PDF itself is an exchange attachment
        return bse.attachment(url.split("Pname=", 1)[1])
    return fetch(url, expect=b"%PDF")


# ---- actuals (all maths here) ----
def _row(quarters: dict, names: list[str]) -> dict[str, float] | None:
    rows = quarters.get("rows", {})
    r = next((rows[n] for n in names if n in rows), None)
    return {p: v for p, v in zip(quarters["periods"], r) if v is not None} if r else None


def actuals(quarters: dict, key: str, after: str) -> list[dict]:
    """Reported values for the quarters after `after`, with YoY / QoQ, for the verdict model to read."""
    if key == "operating_margin":
        row, unit = _row(quarters, ["OPM %", "Financing Margin %"]), "%"
    else:
        row, unit = _row(quarters, ROWS.get(key, [])), "₹ crore"
    if not row:
        return []
    out = []
    for p, v in row.items():
        if _q(p) <= _q(after):
            continue
        a = {"quarter": p, "value": v, "unit": unit}
        for lag, name in ((4, "yoy"), (1, "qoq")):
            prev = row.get(shift(p, -lag))
            if prev is None:
                continue
            if unit == "%":
                a[f"{name}_pp"] = round(v - prev, 1)  # margins move in percentage points
            elif prev:
                a[f"{name}_pct"] = round((v - prev) / abs(prev) * 100, 1)
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


def span(p: dict, call_q: str, periods: list[str]) -> tuple[list[str], list[str], str] | None:
    """(quarters the target covers, of those the ones reported, label). None if the period can't be placed.
    'Rolling' targets (next few quarters, unspecified) cover the quarters since the call; long-term ones use the latest."""
    h, fy = p["horizon"], p.get("fy")
    if h == "next_quarter":
        want = [shift(call_q, 1)]
    elif h == "quarter" and fy and p.get("quarter_no") in (1, 2, 3, 4):
        want = [qlabel(fy, p["quarter_no"])]
    elif h == "half_year" and fy and p.get("half_no") in (1, 2):
        want = [qlabel(fy, k) for k in ((1, 2) if p["half_no"] == 1 else (3, 4))]
    elif h == "fiscal_year" and fy:
        want = [qlabel(fy, k) for k in (1, 2, 3, 4)]
    elif h in ("next_few_quarters", "unspecified"):
        have = [q for q in periods if _q(q) > _q(call_q)]
        return (have, have, f"Since the {fy_name(call_q)} call ({', '.join(have)})") if have else None
    elif h == "long_term" and periods:
        return [periods[-1]], [periods[-1]], f"Latest quarter ({periods[-1]}), against a long-term target"
    else:
        return None
    have = [q for q in want if q in periods]
    if not have:
        return None
    name = f"FY{fy}" if h == "fiscal_year" else f"H{p['half_no']} FY{fy}" if h == "half_year" else fy_name(want[0])
    if len(have) == len(want):
        return want, have, f"{name} ({have[0]}{' – ' + have[-1] if len(have) > 1 else ''})"
    return want, have, f"{name} so far ({len(have)} of {len(want)} quarters: {', '.join(have)})"


def judge(v: float, p: dict, complete: bool) -> tuple[str, str]:
    """(verdict, goal text) for a measured value against the target's bounds and direction. Finished period -> hit/miss;
    running period -> ahead / on track / behind pace."""
    lo, hi = p.get("target_low"), p.get("target_high")
    d = p.get("direction") or ("within" if lo is not None and hi is not None else "at_least" if lo is not None else "at_most")
    if d == "at_most" or lo is None:
        lim = hi if hi is not None else lo
        good, ahead, goal = v <= lim, False, f"≤{lim:g}%"
    elif d == "within" and hi is not None:
        good, ahead, goal = lo <= v <= hi, False, f"{lo:g}–{hi:g}%"
    else:
        good, ahead, goal = v >= lo, hi is not None and v > hi, f"{lo:g}–{hi:g}%" if hi is not None else f"≥{lo:g}%"
    if complete:
        return ("hit" if good else "miss"), goal
    return ("ahead" if ahead else "on track" if good else "behind pace"), goal


def progress(p: dict, call_q: str, quarters: dict) -> dict | None:
    """Python verdict for a growth or margin target the quarterly table can measure; None otherwise."""
    lo, hi = p.get("target_low"), p.get("target_high")
    if (lo is None and hi is None) or p.get("basis") == "constant_currency_or_usd" or re.search(r"qoq|sequential|quarter-on-quarter", p["target"], re.I):
        return None  # ₹ figures can't check a constant-currency or sequential target
    s = span(p, call_q, quarters.get("periods", []))
    if not s:
        return None
    want, have, label = s
    if p["target_type"] == "growth_pct" and p["metric_key"] in ROWS:
        row = _row(quarters, ROWS[p["metric_key"]])
        prev = [row.get(shift(q, -4)) for q in have] if row else []
        if not row or None in prev or not sum(prev):
            return None
        v = (sum(row[q] for q in have) / sum(prev) - 1) * 100
        what = f"{'Revenue' if p['metric_key'] == 'revenue' else 'Net profit'} {v:+.1f}% YoY"
    elif p["target_type"] == "margin_pct" and p["metric_key"] in MARGIN:
        # basis matters: IT services guide on EBIT margin, most others on EBITDA; screener's Operating Profit is pre-depreciation
        net = p["metric_key"] == "net_profit" or p.get("margin_basis") == "net"
        pair = next(((n, d) for n, d in MARGIN["net_profit" if net else "operating_margin"] if _row(quarters, [n]) and _row(quarters, [d])), None)
        if not pair:
            return None
        num, den = _row(quarters, [pair[0]]), _row(quarters, [pair[1]])
        name = "Net margin" if net else "Financing margin" if pair[0] == "Financing Profit" else "EBITDA margin"
        if p.get("margin_basis") == "ebit" and not net and pair[0] == "Operating Profit":
            dep = _row(quarters, ["Depreciation"]) or {}
            num = {q: v - dep[q] for q, v in num.items() if q in dep}
            name = "EBIT margin (operating profit less depreciation)"
        if any(q not in num or q not in den for q in have):
            return None
        v = sum(num[q] for q in have) / sum(den[q] for q in have) * 100  # revenue-weighted, not an average of %s
        what = f"{name} {v:.1f}%"
    else:
        return None
    complete = len(have) == len(want) and p["horizon"] not in ("next_few_quarters", "unspecified", "long_term")
    verdict, goal = judge(v, p, complete)
    return {"verdict": verdict, "actual": f"{label}: {what} vs target {goal}", "actual_source": SOURCE, "model": RULE,
            "why": f"{what} against {goal}{'' if len(have) == len(want) else ' with the period still running'}; computed in Python."}


# ---- later statements as evidence for what the table can't measure ----
def pace_reported(p: dict, used: list[dict], latest: str | None) -> dict | None:
    """A % level target (LDR 85-90% by FY27, CASA ~38%) checked against the newest % management reported for it:
    Python parses that number and decides; the model only chose which statement is the evidence."""
    if p["target_type"] not in ("margin_pct", "other") or (p.get("target_low") is None and p.get("target_high") is None) or "%" not in p["target"]:
        return None
    newest = max(used, key=lambda x: _q(x["said_in"]))
    nums = re.findall(r"(\d+(?:\.\d+)?)\s*%", newest["value"])
    if len(nums) != 1:
        return None  # zero or several numbers: can't tell which one is the level
    v = float(nums[0])
    ends = {"fiscal_year": p.get("fy") and qlabel(p["fy"], 4), "half_year": p.get("fy") and p.get("half_no") and qlabel(p["fy"], 2 * p["half_no"]),
            "quarter": p.get("fy") and p.get("quarter_no") and qlabel(p["fy"], p["quarter_no"]), "next_quarter": shift(p["said_in"], 1)}.get(p["horizon"])
    complete = bool(ends and latest and _q(ends) <= _q(latest) and _q(newest["said_in"]) >= _q(ends))
    verdict, goal = judge(v, p, complete)
    return {"verdict": verdict, "why": f"Reported {newest['value']} ({fy_name(newest['said_in'])} call) against {goal}; compared in Python."}


def evidence(p: dict, reported: list[dict], used: list[str]) -> list[str]:
    """Management's own later statements the verdict relied on, as "Q2 FY27 call, p.6: “…”". Ids are checked against
    what this promise was allowed to use, so the model can't cite a statement from before the promise."""
    by_id = {r["id"]: r for r in reported}
    return [f"{fy_name(by_id[i]['said_in'])} call, p.{by_id[i]['page']}: “{by_id[i]['quote']}”" for i in used if i in p["eligible_reported"]]


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
    promises, reported = [], []
    for c in calls:
        b = transcript(c["transcript"])
        texts = pdf.pages(pdf.open_pdf(b))
        context = f"This call discusses results for {fy_name(c['quarter'])}, the quarter ended {c['quarter']}."
        r = llm.run("extract_guidance", "extract_guidance", [context, pdf.marked_text(texts, list(range(len(texts))))], GUIDANCE,
                    key=hashlib.sha256(b).hexdigest(), symbol=symbol, call=c["quarter"])
        for p in r["data"]["promises"] + r["data"]["reported"]:
            if not 1 <= p["page"] <= len(texts):
                p["page"] = None  # a page the transcript doesn't have is not a citation
        for p in r["data"]["promises"]:
            if p["quote"].rstrip().endswith("?"):
                continue  # a question is an analyst talking, not a management commitment
            promises.append(p | {"said_in": c["quarter"], "transcript": c["transcript"]})
        for x in r["data"]["reported"]:
            if x["page"]:  # uncitable statements can't be evidence
                reported.append(x | {"id": f"R{len(reported) + 1}", "said_in": c["quarter"]})

    promises = dedupe(promises)
    quarters = co["quarters"]
    latest = quarters["periods"][-1] if quarters["periods"] else None
    judged: dict[int, dict] = {k: v for k, p in enumerate(promises) if (v := progress(p, p["said_in"], quarters))}

    # the rest go to the strong model, a few promises per call (Groq free tier: 8k tokens a minute)
    todo = [k for k in range(len(promises)) if k not in judged]
    notes = set()
    by_id = {x["id"]: x for x in reported}
    for start in range(0, len(todo), 4):
        batch = todo[start:start + 4]
        first = min(_q(promises[k]["said_in"]) for k in batch)
        # every later statement (newest 30), shared by the batch: small enough for Groq's 8k tokens/minute
        later = sorted((x for x in reported if _q(x["said_in"]) > first), key=lambda x: _q(x["said_in"]), reverse=True)[:30]
        payload = {"latest_quarter": latest, "reported": [{f: x[f] for f in ("id", "metric", "value", "period", "quote")} | {"said_in": fy_name(x["said_in"])} for x in later],
                   "promises": []}
        for k in batch:
            p = promises[k]
            p["eligible_reported"] = [x["id"] for x in later if _q(x["said_in"]) > _q(p["said_in"])]
            payload["promises"].append({"id": k, **{f: p[f] for f in ("metric", "target", "period", "quote", "eligible_reported")},
                                        "said_in": fy_name(p["said_in"]), "actuals": actuals(quarters, p["metric_key"], p["said_in"])})
        if not later and not any(q["actuals"] for q in payload["promises"]):
            continue  # nothing to judge with: not-yet-measurable without spending a call
        v = llm.run("pvd_verdict", "pvd_verdict", [json.dumps(payload, ensure_ascii=False)], VERDICT, symbol=symbol, patient=True)
        if v.get("model_note"):
            notes.add(v["model_note"])
        for x in v["data"]["verdicts"]:
            if x["id"] not in batch:
                continue
            p = promises[x["id"]]
            used = [i for i in x.get("used_reported", []) if i in p["eligible_reported"]]
            said = evidence(p, reported, used)
            j = {"verdict": x["verdict"] if said else "not-yet-measurable",  # no shown evidence, no verdict
                 "actual": "; ".join(said) or "not disclosed", "actual_source": SAID if said else None, "model": v["model"], "why": x["why"]}
            if said and (paced := pace_reported(p, [by_id[i] for i in used], latest)):
                j |= paced | {"model": f"{v['model']} picked the evidence; {RULE}"}
            judged[x["id"]] = j

    rows = []
    for k, p in enumerate(promises):
        j = judged.get(k, {"verdict": "not-yet-measurable", "actual": "not disclosed", "actual_source": None, "model": None,
                           "why": "No reported number yet measures this promise."})
        rows.append({"metric": p["metric"], "target": p["target"], "period": p["period"], "said_in": p["said_in"],
                     "call": fy_name(p["said_in"]), "quote": p["quote"], "page": p["page"], "transcript": p["transcript"], **j})
    rows.sort(key=lambda r: (VERDICTS.index(r["verdict"]) == len(VERDICTS) - 1, _q(r["said_in"])))  # measurable first, oldest first
    score = {s: sum(r["verdict"] == s for r in rows) for s in VERDICTS}
    out = {"symbol": symbol.upper(), "name": co["name"], "generated_at": dt.datetime.now().isoformat(timespec="minutes"),
           "latest_quarter": latest, "calls": [{"quarter": c["quarter"], "call": fy_name(c["quarter"]), "transcript": c["transcript"]} for c in calls],
           "model_note": "; ".join(sorted(notes)) or None, "score": score, "promises": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{symbol.upper()}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    for sym in argv or sys.argv[1:]:
        out = run(sym)
        s = {k: v for k, v in out["score"].items() if v}
        print(f"\n{out['name']} ({out['symbol']}) · calls: {', '.join(c['call'] for c in out['calls'])} · latest results: {out['latest_quarter']}")
        print(" · ".join(f"{k} {v}" for k, v in s.items()) + (f" · {out['model_note']}" if out["model_note"] else ""))
        for r in out["promises"]:
            print(f"\n  PROMISE  {r['metric']} → {r['target']} ({r['period']})")
            print(f"           “{r['quote']}” — {r['call']} call, p.{r['page']}")
            print(f"  ACTUAL   {r['actual']}")
            print(f"  VERDICT  {r['verdict'].upper()} · {r['why']}" + (f" [{r['model']}]" if r["model"] else ""))


if __name__ == "__main__":
    main()
