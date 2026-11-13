"""Rich cards. Results: LLM copies numbers from the filing; Python does every calculation."""
import hashlib, re
from finn import llm
from finn.sources import pdf

_num = {"type": "number", "nullable": True}
RESULTS_SCHEMA = {
    "type": "object",
    "properties": {
        "basis": {"type": "string", "enum": ["consolidated", "standalone"]},
        "unit": {"type": "string"},
        "is_bank_or_nbfc": {"type": "boolean"},
        "columns": {"type": "array", "items": {"type": "object", "properties": {
            "period_label": {"type": "string"},
            **{k: _num for k in ["revenue_from_operations", "excise_duty", "other_income", "total_income", "interest_earned", "interest_expended",
                                 "finance_costs", "depreciation_amortisation", "exceptional_items", "profit_before_exceptional_and_tax",
                                 "profit_before_tax", "profit_after_tax", "profit_attributable_to_owners"]},
        }, "required": ["period_label", "profit_before_tax", "profit_after_tax"]}},
    },
    "required": ["basis", "unit", "is_bank_or_nbfc", "columns"],
}
TO_CRORE = {"crore": 1, "lakh": 0.01, "lac": 0.01, "million": 0.1, "mn": 0.1, "billion": 100, "bn": 100, "thousand": 1e-4}
# Other income out: the companies' own PBDIT / EBITDA and screener's operating profit exclude it, so the card, the
# research page's margin and the promise checks all show one number (ASIANPAINT Q2 FY27: 15.6%, not 18.5%).
EBITDA_NOTE = "EBITDA = profit before exceptional items & tax + finance costs + D&A − other income"


def extract_results(pdf_bytes: bytes, path: str = "pdf_pages") -> dict:
    """Sends only the P&L page(s) as a mini-PDF: cheapest and the only path accurate on scans
    (scripts/compare_paths.py). 'text' / 'full_pdf' can be forced for that comparison."""
    doc = pdf.open_pdf(pdf_bytes)
    texts = pdf.pages(doc)
    idx, _ = pdf.find_results_pages(texts)
    if not idx:
        path = "full_pdf"
    inputs = {"full_pdf": lambda: [pdf_bytes], "pdf_pages": lambda: [pdf.subset(doc, idx)],
              "text": lambda: [pdf.marked_text(texts, idx)]}[path]()
    pages = [i + 1 for i in idx] or list(range(1, len(texts) + 1))
    key = f"{hashlib.sha256(pdf_bytes).hexdigest()}:{path}:{pages}"
    out = llm.run("extract_results", "extract_results", inputs, RESULTS_SCHEMA, key=key, path=path, pages=pages)
    return out | {"path": path, "pages": pages}


def _pct(a, b):
    return None if a is None or not b else round((a - b) / abs(b) * 100, 1)


def _add(*xs):
    return None if any(x is None for x in xs) else sum(xs)


def _sub(a, b):
    return None if a is None or b is None else a - b


def results_card(ex: dict) -> dict:
    """Card from extract_results() output: 4 lines x (this Q, QoQ %, YoY %), in ₹ crore."""
    d = ex["data"]
    unit = d["unit"].lower()
    k = next((v for u, v in TO_CRORE.items() if u in unit), None)
    # e.g. MARUTI filing its Japanese parent's results: "million yen" must not become ₹ crore
    if k is None or not any(r in unit for r in ("₹", "rs", "inr", "rupee", "crore", "lakh", "lac")):
        raise ValueError(f"unknown unit: {d['unit']}")
    cols = [{f: (v * k if isinstance(v, (int, float)) else v) for f, v in c.items()} for c in d["columns"][:3]]
    # a page without all 3 quarters makes the model pad columns, and a YoY number gets shown as QoQ
    if len(cols) < 3 or any(c.get("profit_before_tax") is None or c.get("profit_after_tax") is None for c in cols)             or len({c["period_label"] for c in cols}) < 3:
        raise ValueError("need current, previous and year-ago columns with PBT and PAT")

    # One-offs out of EBITDA: start from the printed pre-exceptional line (TATAPOWER Q2 had a ₹119 cr exceptional
    # gain inside PBT). One-off = PBT - that line, so Python gets the sign; the LLM's sign for exceptional_items varies.
    pbe = [c.get("profit_before_exceptional_and_tax") for c in cols]
    has_pbe = None not in pbe
    if d["is_bank_or_nbfc"]:
        lines = {"NII": [_sub(c.get("interest_earned"), c.get("interest_expended")) for c in cols],
                 "Total income": [c.get("total_income") for c in cols]}
        note = "NII = interest earned − interest expended"
    else:
        oi = [c.get("other_income") for c in cols]
        has_oi = None not in oi  # all three or none, so QoQ/YoY compare like with like
        excise = [c.get("excise_duty") for c in cols]
        # ITC since Feb 2026: excise on cigarettes sits inside revenue from operations (+44% "growth"); net it out
        net = None not in excise and any(excise)
        lines = {"Revenue": [_sub(c.get("revenue_from_operations"), e if net else 0) for e, c in zip(excise, cols)],
                 "EBITDA": [_sub(_add(p if has_pbe else c["profit_before_tax"], c.get("finance_costs"), c.get("depreciation_amortisation")), o if has_oi else 0)
                            for p, o, c in zip(pbe, oi, cols)]}
        note = EBITDA_NOTE if has_pbe else EBITDA_NOTE.replace("profit before exceptional items & tax", "PBT (no pre-exceptional line)")
        if net:
            note = "Revenue net of excise duty; " + note
        if not has_oi:
            note = note.replace(" − other income", "; other income not printed, so not excluded")
    # Owners' share matches the headline net profit and EPS; only if all 3 columns have it, so QoQ/YoY compare like with like.
    owners = [c.get("profit_attributable_to_owners") for c in cols]
    pat = ("PAT (to owners)", owners) if None not in owners else ("PAT", [c["profit_after_tax"] for c in cols])
    lines |= {"PBT": [c["profit_before_tax"] for c in cols], pat[0]: pat[1]}

    one_offs = []
    for p, c, label in zip(pbe, cols, ["This quarter", "Previous quarter", "Year-ago quarter"]):
        if has_pbe:
            x = round(c["profit_before_tax"] - p, 2)
            kind = " gain" if x > 0 else " charge"
        else:  # no pre-exceptional line: magnitude only
            x, kind = c.get("exceptional_items"), ""
        if x and abs(x) >= 0.5:
            one_offs.append(f"{label} includes ₹{abs(x):,.0f} cr one-off{kind}")
    return {
        "basis": d["basis"], "unit": "₹ crore", "note": note, "periods": [c["period_label"] for c in cols],
        # values: all 3 columns, so the research page uses the filing's own numbers for these quarters
        "lines": [{"name": n, "value": None if v[0] is None else round(v[0], 2), "qoq_pct": _pct(v[0], v[1]), "yoy_pct": _pct(v[0], v[2]),
                   "values": [None if x is None else round(x, 2) for x in v]}
                  for n, v in lines.items()],
        "one_offs": one_offs, "pages": ex["pages"], "model_note": ex.get("model_note"),
    }


_str = {"type": "string", "nullable": True}
BIO_SCHEMA = {"type": "object", "properties": {"people": {"type": "array", "items": {"type": "object", "properties": {
    "name": {"type": "string"},
    "change": {"type": "string", "enum": ["appointed", "re-appointed", "redesignated", "resigned", "retired", "ceased"]},
    "role": {"type": "string"}, "effective": _str, "bio": _str,
    "bio_page": {"type": "integer", "nullable": True}, "profile_ref": _str,
}, "required": ["name", "change", "role"]}}}, "required": ["people"]}
INCOMING = ("appointed", "re-appointed", "redesignated")


def mgmt_card(pdf_bytes: bytes) -> dict:
    """Who changed, and the incoming person's profile as the filing states it (SEBI LODR requires one).
    Long filings: page 1 + pages that look like a profile, at most 6, to keep the call cheap."""
    doc = pdf.open_pdf(pdf_bytes)
    texts = pdf.pages(doc)
    idx = [0] + [i for i, t in enumerate(texts) if i and any(k in t.lower() for k in ("profile", "experience", "qualification"))]
    idx = idx[:6] if len(texts) > 6 else list(range(len(texts)))
    key = f"{hashlib.sha256(pdf_bytes).hexdigest()}:{idx}"
    ex = llm.run("extract_bio", "extract_bio", [pdf.subset(doc, idx)], BIO_SCHEMA, key=key, pages=[i + 1 for i in idx])
    people = sorted(ex["data"]["people"], key=lambda p: p["change"] not in INCOMING)  # incoming first
    for p in people:
        if p.get("bio_page"):
            p["bio_page"] = idx[p["bio_page"] - 1] + 1 if p["bio_page"] <= len(idx) else None  # subset page -> filing page
        if not p.get("bio") and p["change"] in INCOMING:
            p["bio"] = "Profile not in this filing" + (f"; see {p['profile_ref']}" if p.get("profile_ref") else "")
    return {"people": people, "model_note": ex.get("model_note")}


FUND_SCHEMA = {"type": "object", "properties": {
    "instrument": {"type": "string", "enum": ["equity", "warrants", "debt", "other"]},
    "size_text": _str, "size_page": {"type": "integer", "nullable": True},
    "units_issued": _str, "shares_before": _str, "shares_after": _str,
}, "required": ["instrument"]}


def _count(s: str | None) -> int | None:
    d = re.sub(r"[,\s]", "", s or "")
    return int(d) if d.isdigit() and int(d) > 0 else None


def fund_facts(ex: dict, source_text: str) -> dict:
    """Size in ₹ crore and dilution %, from figures the model copied. Python does the units and the division;
    a figure whose digits aren't in the filing is dropped (same check as headlines)."""
    from finn.push.classify import amounts_cr
    from finn.push.headline import problems
    ok = lambda s: s and not problems(s, source_text) or None  # problems() also flags >12 words; figures are short
    size = amounts_cr(ex.get("size_text") or "") if ok(ex.get("size_text")) else []
    issued = _count(ex.get("units_issued")) if ok(ex.get("units_issued")) else None
    before = _count(ex.get("shares_before")) if ok(ex.get("shares_before")) else None
    after = _count(ex.get("shares_after")) if ok(ex.get("shares_after")) else None
    if after is None and before and issued:
        after = before + issued
    dil = round(issued / after * 100, 2) if ex["instrument"] in ("equity", "warrants") and issued and after and issued < after else None
    return {"instrument": ex["instrument"], "size_cr": round(size[0], 2) if size else None,
            "size_page": ex.get("size_page") if size else None, "dilution_pct": dil}


def fund_card(pdf_bytes: bytes) -> dict:
    """Fund-raise size and dilution, when the filing states them. First 4 pages (allotment tables sit early)."""
    doc = pdf.open_pdf(pdf_bytes)
    idx = list(range(min(4, len(doc))))
    texts = pdf.pages(doc)
    key = f"{hashlib.sha256(pdf_bytes).hexdigest()}:{idx}"
    ex = llm.run("extract_fund_raise", "extract_fund_raise", [pdf.subset(doc, idx)], FUND_SCHEMA, key=key, pages=[i + 1 for i in idx])
    return {**fund_facts(ex["data"], " ".join(texts[i] for i in idx)), "model_note": ex.get("model_note")}
