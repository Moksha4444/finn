"""Promised vs Delivered.
1. Pick the 4 latest *results* calls from screener's concall list (it also lists analyst meets and mislabels some).
2. Cheap model reads each transcript once -> promises (with the target as numbers: low/high, type, fiscal period)
   and numbers management reports as achieved, each with a verbatim quote + page. Extraction only, no maths.
3. Python decides every promise it can compute, against one series per metric per company: growth from screener's
   quarterly table, the margin management itself reports on each call (else computed from the table, labelled), bank
   CD ratio from the bank's own results filings, segment growth / margin from the results filings' segment table.
   Deadline passed -> hit / miss; running -> on track / ahead / behind
   pace; no deadline -> direction of travel since the promise, with the quarterly path. The LLM never does arithmetic.
4. Strong model judges only the rest (store counts, CASA, capacity...) from management's later-reported numbers.
5. Keep 4-6: financial and measured first; soft / operational promises only if something measured them.
Run from backend/:  ../.venv/Scripts/python -m finn.pull.pvd TCS
"""
import re, sys, json, hashlib, datetime as dt
from finn import llm
from finn.config import ROOT, CACHE
from finn.sources import fetch, bse, screener, pdf
from finn.pull import bank, segments
from finn.push.headline import _nums

OUT = ROOT / "web" / "public" / "data" / "research"
FEED = ROOT / "web" / "public" / "data" / "feed.json"
STORE = CACHE / "pvd_verdicts.json"  # model verdicts per promise, reused so a re-run can't flip them
QEND = (3, 6, 9, 12)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# screener rows; banks/NBFCs use Revenue / Financing Profit
ROWS = {"revenue": ["Sales", "Revenue"], "net_profit": ["Net Profit"]}
SOURCE = "screener.in quarterly results table (from the company's exchange results filings)"
SAID = "management's statements on later calls (transcripts)"
SAID_MARGIN = "management's reported margin for each quarter, on that quarter's results call (transcripts)"
BANK_SOURCE = "the bank's results filings on BSE: statement of assets and liabilities; ratio computed in Python"
SEG_SOURCE = "the company's results filings on BSE: segment information; growth and margins computed in Python"
RULE = "python (computed)"
DIRECTIONAL = ("long_term",)  # no deadline: judged by direction of travel. Undated bands get the year they were said in.
UNDATED = ("next_few_quarters", "unspecified")
FINANCIAL = ("revenue", "operating_margin", "net_profit", "capex", "cd_ratio")
MAX_PROMISES = 6
# rules before the LLM: measures that are never the company's total revenue / margin / profit, whatever the extractor says
NOT_TOTAL = re.compile(r"value growth|order|inflow|\baum\b|assets under|volume|loan|advances|deposit|\bnov\b|\bgov\b|\bgmv\b|customer|export|payout|disburse|segment", re.I)
# business metrics no results filing reports in rupees (volumes, NOV/GMV, orders, AUM): never matched to a segment
NOT_MONEY = re.compile(r"order|inflow|\baum\b|assets under|volume|\bunits?\b|tonn|loan|advances|deposit|\bnov\b|\bgov\b|\bgmv\b|customer|export|payout|disburse|contribution|share of", re.I)
# "value growth" (paints, consumer goods) is one business's sales in value terms, usually the domestic decorative
# business, not group revenue: measured on that segment if the filing reports it, otherwise not measurable
SEGMENT_ONLY = re.compile(r"\bvalue growth\b", re.I)
# a margin the results table can't compute: never judged on the company's EBITDA series (ASIANPAINT gross margin 41-43%)
OTHER_MARGIN = re.compile(r"gross|contribution|material|\bnim\b|net interest|\bpat\b|net margin", re.I)
USD = re.compile(r"\$|\busd\b|dollar|constant currency|\bcc\b", re.I)
COST = re.compile(r"cost|opex|expense|\bnpa\b|working capital|\bnwc\b|net debt|leverage", re.I)  # lower is better

KEY = {"type": "string", "enum": ["revenue", "operating_margin", "net_profit", "capex", "cd_ratio", "other"]}
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
    "margin_basis": {"type": "string", "enum": ["ebitda", "ebit", "net", "unclear", "not_applicable"]}, "company_total": {"type": "boolean"}},
    "required": ["metric", "metric_key", "target", "period", "quote", "page", "target_type", "target_low", "target_high",
                 "horizon", "fy", "quarter_no", "half_no", "basis", "direction", "margin_basis", "company_total"]}
REPORTED = {"type": "object", "properties": {
    "metric": {"type": "string"}, "metric_key": KEY, "value": {"type": "string"}, "period": {"type": "string"},
    "quote": {"type": "string"}, "page": {"type": "integer"}}, "required": ["metric", "metric_key", "value", "period", "quote", "page"]}
QMARGIN = {"type": "object", "nullable": True, "properties": {
    "name": {"type": "string"}, "basis": {"type": "string", "enum": ["ebit", "ebitda", "nim", "other"]}, "value": {"type": "number"},
    "quote": {"type": "string"}, "page": {"type": "integer"}}, "required": ["name", "basis", "value", "quote", "page"]}
GUIDANCE = {"type": "object", "properties": {"promises": {"type": "array", "items": PROMISE},
                                              "reported": {"type": "array", "items": REPORTED}, "quarter_margin": QMARGIN},
            "required": ["promises", "reported", "quarter_margin"]}
VERDICT = {"type": "object", "properties": {"verdicts": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "integer"}, "verdict": {"type": "string", "enum": ["hit", "miss", "partial", "not-yet-measurable"]},
    "used_reported": {"type": "array", "items": {"type": "string"}}, "why": {"type": "string"}},
    "required": ["id", "verdict", "used_reported", "why"]}}}, "required": ["verdicts"]}
VERDICTS = ("hit", "ahead", "on track", "moved closer", "partial", "no change", "behind pace", "moved away", "miss", "not-yet-measurable")
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


def fy_span(fy: int) -> str:
    """'FY26 (Apr 2025 – Mar 2026)'."""
    return f"FY{fy} (Apr {2000 + fy - 1} – Mar {2000 + fy})"


def period_label(p: dict) -> str | None:
    """The deadline in words, with its months: 'FY26 (Apr 2025 – Mar 2026)', 'H1 FY27 (Apr – Sep 2026)'."""
    fy, h = p.get("fy"), p["horizon"]
    if not fy:
        return None
    if h == "fiscal_year":
        return fy_span(fy)
    if h == "half_year" and p.get("half_no") in (1, 2):
        return f"H{p['half_no']} FY{fy} " + ("(Apr – Sep " + str(2000 + fy - 1) + ")" if p["half_no"] == 1 else f"(Oct {2000 + fy - 1} – Mar {2000 + fy})")
    if h == "quarter" and p.get("quarter_no") in (1, 2, 3, 4):
        return q_span(qlabel(fy, p["quarter_no"]))
    return None


def q_span(q: str) -> str:
    """'Sep 2026' -> 'Q2 FY27 (Jul – Sep 2026)'."""
    return f"{fy_name(q)} ({MON[(_q(q).month - 3) % 12]} – {q})"


def dated(p: dict) -> dict:
    """User's rule (13 Nov): band or level guidance with no year ("maintain the 18-20% band", "8-9% going forward") is
    judged on the financial year it was given in: the year of the quarter after the call (a Q4 call guides the next
    year). Only long-term promises stay undated and are judged by direction of travel."""
    if p["horizon"] in UNDATED or (p["horizon"] in ("quarter", "half_year", "fiscal_year") and not p.get("fy")):
        fy = fq(shift(p["said_in"], 1))[0]
        if p["horizon"] in UNDATED or p["horizon"] == "fiscal_year":
            return p | {"horizon": "fiscal_year", "fy": fy, "inferred_fy": True}
        return p | {"fy": fy, "inferred_fy": True}
    return p


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


def bse_transcript(scrip: str, quarter: str) -> tuple[str, bytes] | None:
    """The quarter's transcript as filed on BSE ('Earnings Call Transcript'), for when screener's link is a company-site
    viewer page instead of a PDF (MARUTI). Earliest filing 15-100 days after the quarter end; None if there is none."""
    qe = bank.quarter_end(quarter)
    end = min(qe + dt.timedelta(100), dt.date.today())
    rows = bse.announcements(scrip, qe + dt.timedelta(15), end, max_age=None if end < dt.date.today() else 3600)
    for r in sorted(rows, key=lambda r: r["NEWS_DT"]):
        if r.get("ATTACHMENTNAME") and (r["SUBCATNAME"] == "Earnings Call Transcript" or "transcript" in (r["NEWSSUB"] or "").lower()):
            return bank.VIEWER + r["ATTACHMENTNAME"], bse.attachment(r["ATTACHMENTNAME"])
    return None


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
    """(quarters the deadline covers, of those the ones reported, period name). None for a target with no deadline
    (those are judged by direction of travel) or a period nothing has been reported for yet."""
    h, fy = p["horizon"], p.get("fy")
    if h == "next_quarter":
        want = [shift(call_q, 1)]
    elif h == "quarter" and fy and p.get("quarter_no") in (1, 2, 3, 4):
        want = [qlabel(fy, p["quarter_no"])]
    elif h == "half_year" and fy and p.get("half_no") in (1, 2):
        want = [qlabel(fy, k) for k in ((1, 2) if p["half_no"] == 1 else (3, 4))]
    elif h == "fiscal_year" and fy:
        want = [qlabel(fy, k) for k in (1, 2, 3, 4)]
    else:
        return None
    have = [q for q in want if q in periods]
    if not have:
        return None
    return want, have, period_label(p) or q_span(want[0])


def _bounds(p: dict) -> tuple[str, float | None, float | None]:
    lo, hi = p.get("target_low"), p.get("target_high")
    if lo is not None and hi == lo:
        hi = None  # "15%" extracted as 15-15
    d = p.get("direction") or ("within" if lo is not None and hi is not None else "at_least" if lo is not None else "at_most")
    text = f"{p.get('metric', '')} {p.get('target', '')}"
    # growth of anything is a floor too (L&T order inflows 14% vs 10-12% is ahead); not cd_ratio / "other" levels: LDR bands are ceilings
    up = p.get("metric_key") in ("revenue", "operating_margin", "net_profit") or p.get("target_type") == "growth_pct"
    if d in ("at_most", "within") and lo is not None and up and not COST.search(text):
        # nobody promises a ceiling on their own growth or margin: above a band is ahead, not a miss
        # (L&T "8.5% margin target" extracted as at_most; POLYCAB W&C 14.2% vs an 11-13% band was "moved away")
        d = "at_least"
    elif COST.search(text) and "saving" not in text.lower():
        d = "at_most"  # a cost band is a ceiling: BAJFINANCE cost of funds 7.41% beats "7.55-7.60%"
    return ("at_most" if lo is None else d), lo, hi


def judge(v: float, p: dict, complete: bool) -> tuple[str, str]:
    """(verdict, goal text) for a measured value against the target's bounds and direction. Finished period -> hit/miss;
    running period -> ahead / on track / behind pace."""
    d, lo, hi = _bounds(p)
    if d == "at_most":
        lim = hi if hi is not None else lo
        good, ahead, goal = v <= lim, False, f"≤{lim:g}%"
    elif d == "within" and hi is not None:
        good, ahead, goal = lo <= v <= hi, False, f"{lo:g}–{hi:g}%"
    else:
        good, ahead, goal = v >= lo, hi is not None and v > hi, f"{lo:g}–{hi:g}%" if hi is not None else f"≥{lo:g}%"
    if complete:
        return ("hit" if good else "miss"), goal
    return ("ahead" if ahead else "on track" if good else "behind pace"), goal


def gap(v: float, p: dict) -> float:
    """How far v is outside the target, in points (0 = met). Same bounds as judge()."""
    d, lo, hi = _bounds(p)
    if d == "at_most":
        return max(0.0, v - (hi if hi is not None else lo))
    if d == "within" and hi is not None:
        return max(0.0, lo - v, v - hi)
    return max(0.0, lo - v)


# ---- one series per metric per company (user's rule: one definition, the company's own where it reports one) ----
def ebitda_margin(quarters: dict) -> dict[str, float]:
    """EBITDA margin per quarter, other income excluded: operating profit over sales. The one definition the results
    card, the snapshot and the promise checks share (ASIANPAINT Q2 FY27: 15.6%, as the company reports its PBDIT)."""
    sales, op = _row(quarters, ["Sales"]) or {}, _row(quarters, ["Operating Profit"]) or {}
    return {q: v / sales[q] * 100 for q, v in op.items() if sales.get(q)}


AGREE_PP = 0.15  # management rounds ("about 15.6%"); within this, its figure and ours are the same number


def company_margin(quarters: dict, reported: dict[str, dict], call_qs: list[str], ebit: bool) -> dict | None:
    """The margin every margin promise of this company is judged on. Computed from the results table when that
    matches what management reports on every call (then every quarter has the company's own number, not only the
    call quarters); management's reported figure when it uses another definition (TCS's EBIT 'operating margin').
    Lenders' margin is NIM, which the table can't compute: reported or nothing."""
    sales = _row(quarters, ["Sales"])
    m = ebitda_margin(quarters)
    if ebit and m:
        dep = _row(quarters, ["Depreciation"]) or {}
        m = {q: v - dep[q] / sales[q] * 100 for q, v in m.items() if q in dep}
    if call_qs and all(q in reported for q in call_qs) and len({reported[q]["basis"] for q in call_qs}) == 1:
        r0 = reported[call_qs[0]]
        cites = {q: {"label": f"{fy_name(q)} call, p.{reported[q]['page']}: “{reported[q]['quote']}”", "url": reported[q]["transcript"]} for q in call_qs}
        name = f"{r0['name'][:1].upper()}{r0['name'][1:]}"
        if m and all(q in m and abs(m[q] - reported[q]["value"]) <= AGREE_PP for q in call_qs):
            return {"q": m, "w": sales, "name": f"{name} (operating profit over revenue; matches what management reports)",
                    "source": SOURCE, "cites": cites}
        return {"q": {q: reported[q]["value"] for q in call_qs}, "w": sales or {}, "name": f"{name} (as reported)",
                "source": SAID_MARGIN, "cites": cites}
    if not m:
        return None
    return {"q": m, "w": sales, "source": SOURCE, "cites": {},
            "name": "EBIT margin (computed: operating profit less depreciation, over sales)" if ebit else "EBITDA margin (computed: operating profit over sales, other income excluded)"}


def segment_series(p: dict, data: dict[str, dict], metric_only: bool = False) -> dict | None:
    """Growth or margin of the one reported segment this promise names, per quarter, from the segment tables.
    metric_only: match on the metric alone (for promises the extractor flagged company-wide)."""
    tt, text = p["target_type"], f"{p['metric']} {p['target']}"
    if tt not in ("growth_pct", "margin_pct") or NOT_MONEY.search(text) or not data:
        return None
    name = segments.match(p["metric"] if metric_only else text, list(data[max(data, key=_q)]["segments"]), p.get("company_words", ()))
    rows = {q: d["segments"][name] | {"d": d} for q, d in data.items() if name and name in d["segments"]}
    if not rows:
        return None

    def cite(q, r):
        d = r["d"]
        return {"label": f"{fy_name(q)} results filing, p.{d['page']} ({d['basis']} segment table, {d['unit']}): {name} revenue {r['revenue']:,.2f} "
                         f"(year earlier {r['revenue_yago']:,.2f}), result {r['result']:,.2f}", "url": d["url"]}
    base = {"source": SEG_SOURCE, "cites": {q: cite(q, r) for q, r in rows.items()}, "segment": name}
    if tt == "growth_pct":
        g = {q: r for q, r in rows.items() if r["revenue"] is not None and r["revenue_yago"]}

        def agg(have):  # summed quarters vs the same quarters a year earlier, both read from the same filings
            return None if any(q not in g for q in have) else (sum(g[q]["revenue"] for q in have) / sum(g[q]["revenue_yago"] for q in have) - 1) * 100
        return base | {"q": {q: (r["revenue"] / r["revenue_yago"] - 1) * 100 for q, r in g.items()}, "kind": "growth", "agg": agg,
                       "name": f"{name} segment revenue growth YoY"}
    m = {q: r for q, r in rows.items() if r["revenue"] and r["result"] is not None}

    def agg(have):  # revenue-weighted
        return None if any(q not in m for q in have) else sum(m[q]["result"] for q in have) / sum(m[q]["revenue"] for q in have) * 100
    # Segment result is before interest and tax but after depreciation: below EBITDA. It can confirm an EBITDA
    # target it clears, never miss one (floor_only).
    return base | {"q": {q: r["result"] / r["revenue"] * 100 for q, r in m.items()}, "kind": "margin", "agg": agg,
                   "w": {q: r["revenue"] for q, r in m.items()}, "floor_only": p.get("margin_basis") == "ebitda" or "ebitda" in text.lower(),
                   "name": f"{name} segment result margin (before interest and tax, after depreciation)"}


def series(p: dict, quarters: dict, margin: dict | None = None, bank=None, seg=None) -> dict | None:
    """{q: {quarter: value}, agg(quarters) -> value over a period, name, source, cites, kind} for this promise, or None.
    seg(since) -> {quarter: segment table}: segment promises are measured on their own segment, never company totals."""
    key, tt = p["metric_key"], p["target_type"]
    if key != "cd_ratio" and (not p.get("company_total") or NOT_TOTAL.search(f"{p['metric']} {p['target']}")):
        return segment_series(p, seg(p["said_in"])) if seg else None  # L&T orders, POLYCAB FMEG: not company totals
    if seg and key != "cd_ratio" and (s := segment_series(p, seg(p["said_in"]), metric_only=True)):
        return s  # flagged company-wide, but its metric names a reported segment (TITAN "watch business margins")
    if key == "cd_ratio" and bank:
        b = bank(p["said_in"])
        if not b:
            return None
        return {"q": {k: v["cd_ratio"] for k, v in b.items()}, "kind": "level", "agg": None, "name": "CD ratio (advances / deposits)",
                "source": BANK_SOURCE, "cites": {k: {
                    "label": f"{fy_name(k)} results filing, p.{v['page']} ({v['basis']} balance sheet): advances {v['advances']:,.2f} / deposits {v['deposits']:,.2f} ({v['unit']})",
                    "url": v["url"]} for k, v in b.items()}}
    if tt == "growth_pct" and key in ROWS:
        row = _row(quarters, ROWS[key])
        if not row:
            return None
        def agg(have):  # growth over a period = summed quarters vs the same quarters a year earlier
            prev = [row.get(shift(q, -4)) for q in have]
            return None if None in prev or not sum(prev) else (sum(row[q] for q in have) / sum(prev) - 1) * 100
        return {"q": {q: (v / row[shift(q, -4)] - 1) * 100 for q, v in row.items() if row.get(shift(q, -4))}, "kind": "growth", "agg": agg,
                "name": f"{'Revenue' if key == 'revenue' else 'Net profit'} growth YoY", "source": SOURCE, "cites": {}}
    if tt == "margin_pct" and key in ("operating_margin", "net_profit"):
        if key == "operating_margin" and p.get("margin_basis") != "net" and OTHER_MARGIN.search(p["metric"]):
            return None
        if key == "net_profit" or p.get("margin_basis") == "net":
            net, den = _row(quarters, ["Net Profit"]), _row(quarters, ["Sales"]) or _row(quarters, ["Revenue"])
            m = net and den and {"q": {q: v / den[q] * 100 for q, v in net.items() if den.get(q)}, "w": den,
                                 "name": "Net margin (computed: net profit over revenue)", "source": SOURCE, "cites": {}}
        else:
            m = margin
        if not m:
            return None
        def agg(have):  # revenue-weighted, not an average of percentages
            if len(have) == 1:
                return m["q"][have[0]]
            w = m["w"]
            return None if any(not w.get(q) for q in have) else sum(m["q"][q] * w[q] for q in have) / sum(w[q] for q in have)
        return m | {"kind": "margin", "agg": agg}
    return None


def chart(p: dict, kind: str, points: list[list]) -> dict | None:
    """The numbers behind a verdict, for the app's mini-chart: [quarter, value] points and the target band with the
    same bounds judge() uses (lo/hi None = open on that side)."""
    if not points:
        return None
    d, lo, hi = _bounds(p)
    if d == "at_most":
        lo, hi = None, hi if hi is not None else lo
    end = period_end(p)  # the band stops at the deadline; quarters after it are context, not the verdict
    return {"kind": kind, "points": points, "lo": lo, "hi": hi, "direction": d, "end": end and fy_name(end)}


def progress(p: dict, call_q: str, s: dict | None) -> dict | None:
    """Python verdict for a numeric target against the company's series; None if it can't be computed.
    Deadline passed -> hit / miss; deadline running -> ahead / on track / behind pace; no deadline -> direction of
    travel since the promise (hit / moved closer / no change / moved away). Always shows the quarterly path."""
    if not s or (p.get("target_low") is None and p.get("target_high") is None) or p.get("basis") == "constant_currency_or_usd" \
            or re.search(r"qoq|sequential|quarter-on-quarter|bps|basis point", p["target"], re.I):
        return None  # ₹ figures can't check a constant-currency or sequential target; "150-200 bps" is a change, not a level
    vals = s["q"]
    end = period_end(p)  # quarters after the deadline are not evidence for it: off the path and the chart
    pts = [q for q in sorted(vals, key=_q) if _q(q) >= _q(call_q) and (not end or _q(q) <= _q(end))]
    if not pts:
        return None
    fmt = (lambda v: f"{v:+.1f}%") if s["kind"] == "growth" else (lambda v: f"{v:.1f}%")
    path = f"{' → '.join(fmt(vals[q]) for q in pts)} ({fy_name(pts[0])} → {fy_name(pts[-1])})" if len(pts) > 1 else None
    out = {"path": path, "actual_source": s["source"], "model": RULE, "cites": [s["cites"][q] for q in pts if q in s["cites"]],
           "chart": chart(p, s["kind"], [[fy_name(q), round(vals[q], 2)] for q in pts])}
    if p["horizon"] in DIRECTIONAL or not p.get("fy") and p["horizon"] in ("quarter", "half_year", "fiscal_year"):  # no year stated = no deadline
        if len(pts) < 2:
            return None
        g0, g1 = gap(vals[pts[0]], p), gap(vals[pts[-1]], p)
        verdict = "hit" if g1 == 0 else "moved closer" if g1 < g0 - 0.05 else "moved away" if g1 > g0 + 0.05 else "no change"
        _, goal = judge(vals[pts[-1]], p, True)
        lead = {"hit": "At target", "moved closer": "Moved closer", "moved away": "Moved away", "no change": "No change"}[verdict]
        return out | {"verdict": verdict, "actual": f"{lead}: {path} vs target {goal} · {s['name']}",
                      "why": f"No deadline, so judged by direction since the {fy_name(call_q)} call; computed in Python."}
    sp = span(p, call_q, list(vals))
    if not sp:
        return None
    want, have, name = sp
    if s["kind"] == "level":  # a ratio target is about its level at the period end, not a sum of quarters
        complete = want[-1] in vals
        at = want[-1] if complete else have[-1]
        v, label = vals[at], f"{name}, at period end" if complete else f"{name} so far, latest {fy_name(at)}"
    else:
        complete = len(have) == len(want)
        v = s["agg"](have)
        if v is None:
            return None
        label = name if complete else f"{name} so far ({'–'.join(dict.fromkeys([fy_name(have[0]).split()[0], fy_name(have[-1]).split()[0]]))}, {len(have)} of {len(want)} quarters)"
    verdict, goal = judge(v, p, complete)
    said = " No period was stated, so it is judged on the financial year it was given in." if p.get("inferred_fy") else ""
    return out | {"verdict": verdict, "actual": f"{label}: {s['name']} {fmt(v)} vs target {goal}",
                  "why": f"{fmt(v)} against {goal}{'' if complete else ' with the period still running, so no hit or miss yet'}; computed in Python.{said}"}


# ---- later statements as evidence for what the table can't measure ----
def pace_reported(p: dict, used: list[dict], latest: str | None) -> dict | None:
    """A % target (LDR 85-90% by FY27, CASA ~38%, order inflow growth 10-12%) checked against the newest % management
    reported for it: Python parses that number and decides; the model only chose which statement is the evidence.
    Before the deadline that is pace (ahead / on track / behind), never hit or miss."""
    if p["target_type"] not in ("margin_pct", "growth_pct", "other") or (p.get("target_low") is None and p.get("target_high") is None) or "%" not in p["target"]:
        return None
    newest = max(used, key=lambda x: _q(x["said_in"]))
    nums = re.findall(r"(\d+(?:\.\d+)?)\s*%", newest["value"])
    if len(nums) != 1:
        return None  # zero or several numbers: can't tell which one is the level
    v = float(nums[0])
    ends = period_end(p)
    # margins and growth add up over the period; a level (CD ratio, working capital) at the period end is the period's figure
    one_quarter = p["target_type"] in ("margin_pct", "growth_pct") and p["horizon"] in ("fiscal_year", "half_year") and QUARTER_FIG.search(newest.get("quote", "")) and not SPAN_FIG.search(newest.get("quote", ""))
    complete = bool(ends and latest and _q(ends) <= _q(latest) and _q(newest["said_in"]) >= _q(ends))
    verdict, goal = judge(v, p, complete)
    if complete and one_quarter:  # L&T "EBITDA margin for Q4 FY '26 is 10.4%" can't settle the FY26 8.5% target
        return {"verdict": NYM, "chart": None,
                "why": f"Not measurable: the latest statement ({fy_name(newest['said_in'])} call) gives one quarter's {newest['value']}, "
                       f"not the figure for the whole period, so it can't settle a {goal} target for {period_label(p) or 'the period'}."}
    return {"verdict": verdict, "chart": chart(p, "level", [[fy_name(newest["said_in"]), v]]),
            "why": f"Reported {newest['value']} ({fy_name(newest['said_in'])} call) against {goal}"
                   f"{'' if complete else ', with the period still running, so no hit or miss yet'}; compared in Python."}


PACE = {"hit": "on track", "miss": "behind pace", "partial": "behind pace"}
QUARTER_FIG = re.compile(r"\bQ[1-4]\b|\bquarter\b", re.I)  # a statement about one quarter ...
SPAN_FIG = re.compile(r"full[- ]year|for the (?:full )?year|annual|year[- ]to[- ]date|nine months|\b9M\b|\bH[12]\b|\bas (?:of|on|at) march", re.I)  # ... unless it covers the period


def before_deadline(verdict: str, p: dict, latest: str | None) -> str:
    """User's rule (13 Nov): a target can't be hit or missed before its period ends. The model's hit / miss / partial
    on a running period becomes pace: on track / behind pace (ahead needs a number Python can compare: pace_reported)."""
    end = period_end(p)
    return PACE.get(verdict, verdict) if end and latest and _q(end) > _q(latest) else verdict


def evidence(p: dict, reported: list[dict], used: list[str]) -> list[str]:
    """Management's own later statements the verdict relied on, as "Q2 FY27 call, p.6: “…”". Ids are checked against
    what this promise was allowed to use, so the model can't cite a statement from before the promise."""
    by_id = {r["id"]: r for r in reported}
    return [f"{fy_name(by_id[i]['said_in'])} call, p.{by_id[i]['page']}: “{by_id[i]['quote']}”" for i in used if i in p["eligible_reported"]]


def dedupe(promises: list[dict]) -> list[dict]:
    """Management repeats a target within a call (remarks, then Q&A) and across calls: keep the oldest mention,
    which has the longest track record. Matched on the extracted numbers, not the wording ("$5 billion by FY31" =
    "$5 billion by March 2031"). A target with no number is only deduped within its own call."""
    seen, out = set(), []
    for p in sorted(promises, key=lambda p: _q(p["said_in"])):  # stable: within a call the first mention wins
        lo, hi = p.get("target_low"), p.get("target_high")
        hi = None if hi == lo else hi  # "15%" comes back as 15-15 on one call and 15-None on the next (L&T counted it twice)
        k = (p["metric_key"], lo, hi, p.get("fy")) if lo is not None or hi is not None else (p["said_in"], p["metric_key"], p["target"].lower())
        if k not in seen:
            seen.add(k)
            out.append(p)
    return out


def select(promises: list[dict], judged: dict[int, dict], n: int = MAX_PROMISES) -> list[int]:
    """User's rule: financial, checkable promises first; a soft or operational one stays only if something measured it.
    Measured before unmeasured, financial before operational, oldest first; at most n."""
    fin = lambda p: p["metric_key"] in FINANCIAL or p["target_type"] in ("growth_pct", "margin_pct", "amount")
    nym = lambda k: judged.get(k, {}).get("verdict", "not-yet-measurable") == "not-yet-measurable"
    keep = [k for k, p in enumerate(promises) if fin(p) or not nym(k)]
    return sorted(keep, key=lambda k: (nym(k), not fin(promises[k]), _q(promises[k]["said_in"])))[:n]


def period_end(p: dict) -> str | None:
    """Last quarter of a promise's deadline, if it has one."""
    fy, h = p.get("fy"), p["horizon"]
    if h == "next_quarter":
        return shift(p["said_in"], 1)
    if not fy:
        return None
    return {"fiscal_year": qlabel(fy, 4), "half_year": p.get("half_no") in (1, 2) and qlabel(fy, 2 * p["half_no"]),
            "quarter": p.get("quarter_no") in (1, 2, 3, 4) and qlabel(fy, p["quarter_no"])}.get(h) or None


def model_check(verdict: str, why: str, p: dict, said: list[str], latest: str | None) -> str | None:
    """Why a model verdict can't be shown (None = fine). Every number in its reason must be in the evidence or the
    promise (no invented or computed numbers: DIXON's "21,794 crore")."""
    body = re.sub(r"[,\s]", "", " ".join(said) + p["target"] + p["quote"] + p["period"])
    clean = re.sub(r"\b(?:R|FY|Q|H)\s?'?\d+\b", "", why)  # evidence ids and period names aren't claims
    if any(x not in body for x in _nums(clean)):
        return "The model's reason used a number that is not in the evidence."
    return None


def unmeasurable(p: dict, seg, latest: str | None = None) -> str | None:
    """Why no filing can measure this promise, in words a reader can check (None = no fixed reason; keep the default)."""
    text = f"{p['metric']} {p['target']}"
    if p.get("basis") == "constant_currency_or_usd" or USD.search(text):
        return "Not measurable: a US-dollar or constant-currency target, and results filings report rupees."
    if NOT_MONEY.search(text):
        return "Not measurable: results filings don't report this figure (volumes, NOV/GMV, orders, AUM, mix or payout)."
    if latest and _q(p["said_in"]) >= _q(latest):
        return f"Not measurable yet: promised on the latest call ({fy_name(p['said_in'])}), and no results have come out since."
    if p.get("company_total") and not NOT_TOTAL.search(text):
        return None
    data = seg(p["said_in"])
    single = data and all(d.get("single") for d in data.values())
    if single:
        return "Not measurable (segment not reported): the results filings report no separate segments (Ind AS 108), so one business line can't be told apart from the company total."
    if not data:
        return "Not measured: no segment figures could be read from the results filings since this call (the table didn't parse)."
    names = list(data[max(data, key=_q)]["segments"])
    name = segments.match(text, names, p.get("company_words", ()))
    if not name:
        return f"Not measurable (segment not reported): the results filings report {', '.join(names)}, not this business."
    if p["target_type"] not in ("growth_pct", "margin_pct"):
        return f"Not measured: the {name} segment is reported, but only growth and margin targets are checked, not a {p['target_type'].replace('_', ' ')} target."
    if "ebitda" in text.lower() or p.get("margin_basis") == "ebitda":
        return f"Not measurable yet: the filing gives the {name} segment's result after depreciation, not EBITDA; it is below the target, which doesn't settle an EBITDA target."
    return None


def _margin_ok(m: dict | None, n_pages: int) -> bool:
    """A reported margin counts only if its number is in its own quote and the page exists."""
    return bool(m and 1 <= m["page"] <= n_pages and any(abs(float(x) - m["value"]) < 1e-9 for x in re.findall(r"\d+(?:\.\d+)?", m["quote"])))


# ---- one set of numbers: the filing's results card wins for the quarters it covers ----
def card_quarter(filed: str, label: str) -> str | None:
    """The quarter a results card's first column is: the last quarter end before the filing date, if the column
    header names that month (30.09.2026 / Sep 30, 2026); None when it doesn't (then nothing is overridden)."""
    d = dt.date.fromisoformat(filed[:10])
    y, m = d.year, d.month
    while True:
        m, y = (m - 1, y) if m > 1 else (12, y - 1)
        if m in QEND:
            break
    lab = label.lower()
    named = MON[m - 1].lower() in lab or re.search(rf"\b\d{{1,2}}[./-]0?{m}[./-]\d{{2,4}}\b", lab)
    return f"{MON[m - 1]} {y}" if named else None


def filing_quarters(symbol: str, basis: str) -> dict[str, dict]:
    """The newest results card in the feed as {quarter: {line: value}} for its 3 columns (this quarter, previous,
    year-ago), read off the filing itself. Empty when the feed has no card for this company."""
    try:
        items = json.loads(FEED.read_text(encoding="utf-8"))["items"]
    except Exception:
        return {}
    cards = [i for i in items if i["symbol"] == symbol.upper() and (i.get("card") or {}).get("type") == "results"
             and all(len(l.get("values") or []) == 3 for l in i["card"]["lines"])]
    cards = [i for i in cards if i["card"]["basis"] == basis]  # a standalone card is another metric (DEEPAKNTR)
    if not cards:
        return {}
    i = max(cards, key=lambda i: i["filed"])
    cur = card_quarter(i["filed"], i["card"]["periods"][0])
    if not cur:
        return {}
    return {q: {l["name"]: l["values"][k] for l in i["card"]["lines"]} | {"_note": i["card"]["note"]}
            for k, q in enumerate((cur, shift(cur, -1), shift(cur, -4)))}


def company(symbol: str) -> dict:
    """screener's tables, with the quarters the feed's results card covers replaced by the filing's own figures, so the
    feed, the promise checks and the snapshot show one number per metric per quarter (ASIANPAINT Q2 FY27 PAT +7.5%,
    not +7.4% from screener's whole-crore rounding). Lenders: total income and PAT; others: revenue, EBITDA, PAT."""
    co = screener.company(symbol)
    q = co["quarters"]
    rows, lender = q["rows"], "Financing Profit" in q["rows"]
    used, fq_ = [], filing_quarters(symbol, co["basis"])
    top = "Total income" if lender else "Revenue"
    top_row = _row(q, ["Revenue"] if lender else ["Sales"]) or {}
    if lender:
        oi_row = _row(q, ["Other Income"]) or {}
        top_row = {p: v + oi_row.get(p, 0) for p, v in top_row.items()}
    # same definition or nothing: the card's revenue must be within 2% of the table's for every column it covers
    if any(not isinstance(v.get(top), (int, float)) or not top_row.get(quarter) or abs(v[top] / top_row[quarter] - 1) > 0.02
           for quarter, v in fq_.items() if quarter in q["periods"]):
        fq_ = {}
    for quarter, v in fq_.items():
        if quarter not in q["periods"]:
            continue
        k = q["periods"].index(quarter)

        def put(name, val):
            if name in rows and isinstance(val, (int, float)):
                rows[name][k] = round(val, 2)
        put("Net Profit", v.get("PAT (to owners)") if co.get("pat_basis", "").startswith("to owners") else v.get("PAT"))
        if lender:  # the snapshot shows total income = Revenue + Other Income, so Revenue takes the rest
            oi = (rows.get("Other Income") or [None] * len(q["periods"]))[k] or 0
            put("Revenue", v["Total income"] - oi if isinstance(v.get("Total income"), (int, float)) else None)
        else:
            put("Sales", v.get("Revenue"))
            if v["_note"].startswith(("EBITDA = revenue from operations", "Revenue net of excise duty; EBITDA = revenue from operations")):  # = operating profit
                put("Operating Profit", v.get("EBITDA"))
        used.append(quarter)
    co["filing_quarters"] = used
    return co


NYM = "not-yet-measurable"


def _norm(t: str) -> str:
    return " ".join(t.split()).lower()


def _skey(symbol: str, p: dict) -> str:
    return f"{symbol.upper()}|{p['said_in']}|{_norm(p['quote'])}"


def load_store() -> dict:
    return json.loads(STORE.read_text(encoding="utf-8")) if STORE.exists() else {}


def save_store(store: dict) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")


def run(symbol: str) -> dict:
    co = company(symbol)
    calls, skipped = [], []
    promises, reported, margins, texts_by_q = [], [], {}, {}
    for c in results_calls(co["concalls"], n=6):
        if len(calls) == 4:
            break
        try:  # a dead link (MARUTI's company-site viewer page): try the BSE filing, else skip that call, not the company
            b = transcript(c["transcript"])
        except Exception as e:
            try:
                alt = co.get("bse_code") and bse_transcript(co["bse_code"], c["quarter"])
            except Exception:
                alt = None
            if not alt:
                skipped.append({"call": fy_name(c["quarter"]), "transcript": c["transcript"], "error": f"{type(e).__name__}: {str(e)[:80]}"})
                continue
            c = c | {"transcript": alt[0]}
            b = alt[1]
        calls.append(c)
        texts = texts_by_q[c["quarter"]] = pdf.pages(pdf.open_pdf(b))
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
        if _margin_ok(m := r["data"].get("quarter_margin"), len(texts)):
            margins[c["quarter"]] = m | {"transcript": c["transcript"]}

    promises = dedupe(promises)
    for p in promises:
        p["company_words"] = segments._words(co["name"])  # never a segment name: "Titan Jewellery" is Jewellery
    quarters = co["quarters"]
    latest = quarters["periods"][-1] if quarters["periods"] else None
    ebit = any(m["basis"] == "ebit" for m in margins.values()) or any(p.get("margin_basis") == "ebit" for p in promises)
    margin = company_margin(quarters, margins, [c["quarter"] for c in calls], ebit)
    sheets: dict[str, dict | None] = {}

    def bank_q(since: str) -> dict:
        """CD ratio per quarter from the call that made the promise to the latest results (cached per company)."""
        if not co.get("bse_code"):
            return {}
        for q in quarters["periods"]:
            if _q(q) >= _q(since) and q not in sheets:
                sheets[q] = bank.balance_sheet(co["bse_code"], q, symbol)
        return {q: v for q, v in sheets.items() if v and _q(q) >= _q(since)}

    tables: dict[str, dict | None] = {}

    def seg_q(since: str) -> dict:
        """Segment table per quarter from the promise's call to the latest results (cached per company)."""
        if not co.get("bse_code"):
            return {}
        for q in quarters["periods"]:
            if _q(q) >= _q(since) and q not in tables:
                tables[q] = segments.quarter(co["bse_code"], q, symbol)
        return {q: v for q, v in tables.items() if v and _q(q) >= _q(since)}

    promises = [dated(p) for p in promises]
    judged: dict[int, dict] = {}
    for k, p in enumerate(promises):
        s = series(p, quarters, margin, bank_q, seg_q)
        v = progress(p, p["said_in"], s)
        if v and s.get("floor_only") and (v["verdict"] not in ("hit", "ahead", "on track") or _bounds(p)[0] == "at_most"):
            v = None  # an EBIT-level segment margin below an EBITDA target settles nothing
        if v:
            judged[k] = v
        elif SEGMENT_ONLY.search(f"{p['metric']} {p['target']}"):  # no segment measured it: never group revenue, never the model
            judged[k] = {"verdict": NYM, "actual": "not disclosed", "actual_source": None, "model": None, "why": ""}

    by_id = {x["id"]: x for x in reported}

    def apply(k: int, x: dict, model: str) -> list[str]:
        """A model verdict for promise k, checked and turned into a row; returns the evidence ids it kept."""
        p = promises[k]
        # evidence must be about the same metric: a net margin can't measure an operating-margin promise
        same = lambda i: p["metric_key"] == by_id[i]["metric_key"] or "other" in (p["metric_key"], by_id[i]["metric_key"])
        end = period_end(p)  # statements about quarters after the deadline are not evidence for it (L&T FY26 margin on a Q1 FY27 figure)
        used = [i for i in x.get("used_reported", []) if i in p["eligible_reported"] and same(i) and (not end or _q(by_id[i]["said_in"]) <= _q(end))]
        said = evidence(p, reported, used)
        j = {"verdict": before_deadline(x["verdict"], p, latest) if said else NYM,  # no shown evidence, no verdict
             "actual": "; ".join(said) or "not disclosed", "actual_source": SAID if said else None, "model": model, "why": x["why"]}
        if said and (paced := pace_reported(p, [by_id[i] for i in used], latest)):
            j |= paced | {"model": f"{model} picked the evidence; {RULE}"}
        elif said and (bad := model_check(j["verdict"], j["why"], p, said, latest)):
            j |= {"verdict": NYM, "why": bad}
        judged[k] = j
        return used

    # The model's verdicts are stored per promise and reused until a newer call brings new statements, so a re-run
    # (a rule change, a new prompt elsewhere) can't flip them (BAJFINANCE lost a correct AUM hit on 13 Nov).
    store = load_store()
    through = calls[0]["quarter"] if calls else None
    todo = []
    for k, p in enumerate(promises):
        if k in judged:
            continue
        p["eligible_reported"] = [x["id"] for x in reported if _q(x["said_in"]) > _q(p["said_in"])]
        st = store.get(_skey(symbol, p))
        if st and st["through"] == through:
            ids = {_norm(by_id[i]["quote"]): i for i in p["eligible_reported"]}
            if all(qt in ids for qt in st["quotes"]):
                apply(k, {"verdict": st["verdict"], "why": st["why"], "used_reported": [ids[qt] for qt in st["quotes"]]}, st["model"])
                continue
        todo.append(k)

    # the rest go to the strong model, a few promises per call (Groq free tier: 8k tokens a minute)
    notes = set()
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
            payload["promises"].append({"id": k, **{f: p[f] for f in ("metric", "target", "period", "quote", "eligible_reported", "target_low", "target_high")},
                                        "direction": _bounds(p)[0],
                                        "said_in": fy_name(p["said_in"]), "actuals": actuals(quarters, p["metric_key"], p["said_in"])})
        if not later and not any(q["actuals"] for q in payload["promises"]):
            continue  # nothing to judge with: not-yet-measurable without spending a call
        v = llm.run("pvd_verdict", "pvd_verdict", [json.dumps(payload, ensure_ascii=False)], VERDICT, symbol=symbol, patient=True)
        if v.get("model_note"):
            notes.add(v["model_note"])
        for x in v["data"]["verdicts"]:
            if x["id"] not in batch:
                continue
            used = apply(x["id"], x, v["model"])
            key = _skey(symbol, promises[x["id"]])
            old = store.get(key)
            if (x["verdict"] != NYM and used) or not old or old["through"] != through:  # an empty answer never replaces a measured one
                store[key] = {"verdict": x["verdict"], "why": x["why"], "model": v["model"], "through": through,
                              "quotes": [_norm(by_id[i]["quote"]) for i in used]}
    save_store(store)

    rows = []
    for k in select(promises, judged):
        p = promises[k]
        j = {"path": None, "cites": [], "chart": None} | judged.get(k, {"verdict": "not-yet-measurable", "actual": "not disclosed", "actual_source": None, "model": None,
                                                         "why": "No reported number yet measures this promise."})
        if j["verdict"] == "not-yet-measurable" and j["actual"] == "not disclosed":  # no evidence shown: no model reasoning either
            j["why"] = unmeasurable(p, seg_q, latest) or "Not measured yet: no later filing or call statement measures this promise."
        rows.append({"metric": p["metric"], "target": p["target"], "period": period_label(p) or p["period"], "said_in": p["said_in"],
                     "call": fy_name(p["said_in"]), "quote": p["quote"], "page": p["page"], "transcript": p["transcript"], **j})
    rows.sort(key=lambda r: (VERDICTS.index(r["verdict"]) == len(VERDICTS) - 1, _q(r["said_in"])))  # measurable first, oldest first
    score = {s: sum(r["verdict"] == s for r in rows) for s in VERDICTS}
    out = {"symbol": symbol.upper(), "name": co["name"], "generated_at": dt.datetime.now().isoformat(timespec="minutes"),
           "latest_quarter": latest, "calls": [{"quarter": c["quarter"], "call": fy_name(c["quarter"]), "transcript": c["transcript"]} for c in calls],
           "skipped_calls": skipped,
           "margin_definition": margin and {"name": margin["name"], "source": margin["source"]},
           "model_note": "; ".join(sorted(notes)) or None, "score": score, "promises": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{symbol.upper()}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    # not written: the research builder reuses them for bull/bear (statements, transcript pages) without re-reading
    return out | {"_reported": reported, "_texts": texts_by_q, "_calls": calls, "_company": co}


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    for sym in argv or sys.argv[1:]:
        try:
            out = run(sym)
        except Exception as e:  # model quota / source down: this ticker keeps its last good JSON (run() writes last)
            print(f"\n{sym} FAILED, kept the previous research file: {type(e).__name__}: {str(e)[:160]}")
            continue
        s = {k: v for k, v in out["score"].items() if v}
        print(f"\n{out['name']} ({out['symbol']}) · calls: {', '.join(c['call'] for c in out['calls'])} · latest results: {out['latest_quarter']}")
        print(" · ".join(f"{k} {v}" for k, v in s.items()) + (f" · {out['model_note']}" if out["model_note"] else ""))
        for r in out["promises"]:
            print(f"\n  PROMISE  {r['metric']} → {r['target']} ({r['period']})")
            print(f"           “{r['quote']}” — {r['call']} call, p.{r['page']}")
            print(f"  ACTUAL   {r['actual']}")
            for c in r["cites"]:
                print(f"           [{c['label']}]")
            print(f"  VERDICT  {r['verdict'].upper()} · {r['why']}" + (f" [{r['model']}]" if r["model"] else ""))


if __name__ == "__main__":
    main()
