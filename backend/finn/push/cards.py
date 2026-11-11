"""Rich cards. Results: LLM copies numbers from the filing; Python does every calculation."""
import hashlib
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
            **{k: _num for k in ["revenue_from_operations", "total_income", "interest_earned", "interest_expended",
                                 "finance_costs", "depreciation_amortisation", "exceptional_items", "profit_before_exceptional_and_tax",
                                 "profit_before_tax", "profit_after_tax", "profit_attributable_to_owners"]},
        }, "required": ["period_label", "profit_before_tax", "profit_after_tax"]}},
    },
    "required": ["basis", "unit", "is_bank_or_nbfc", "columns"],
}
TO_CRORE = {"crore": 1, "lakh": 0.01, "lac": 0.01, "million": 0.1, "mn": 0.1, "billion": 100, "bn": 100, "thousand": 1e-4}
EBITDA_NOTE = "EBITDA = profit before exceptional items & tax + finance costs + D&A; other income not excluded"


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
        lines = {"Revenue": [c.get("revenue_from_operations") for c in cols],
                 "EBITDA": [_add(p if has_pbe else c["profit_before_tax"], c.get("finance_costs"), c.get("depreciation_amortisation"))
                            for p, c in zip(pbe, cols)]}
        note = EBITDA_NOTE if has_pbe else EBITDA_NOTE.replace("profit before exceptional items & tax", "PBT (no pre-exceptional line)")
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
        "lines": [{"name": n, "value": None if v[0] is None else round(v[0], 2), "qoq_pct": _pct(v[0], v[1]), "yoy_pct": _pct(v[0], v[2])}
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
