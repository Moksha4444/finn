"""Rich cards. Results: LLM copies numbers from the filing; Python does every calculation."""
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
                                 "finance_costs", "depreciation_amortisation", "exceptional_items",
                                 "profit_before_tax", "profit_after_tax"]},
        }, "required": ["period_label", "profit_before_tax", "profit_after_tax"]}},
    },
    "required": ["basis", "unit", "is_bank_or_nbfc", "columns"],
}
TO_CRORE = {"crore": 1, "lakh": 0.01, "lac": 0.01, "million": 0.1, "billion": 100, "thousand": 1e-4}
EBITDA_NOTE = "EBITDA = PBT + finance costs + D&A; other income not excluded"


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
    out = llm.run("extract_results", "extract_results", inputs, RESULTS_SCHEMA, path=path, pages=pages)
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
    if k is None:
        raise ValueError(f"unknown unit: {d['unit']}")
    cols = [{f: (v * k if isinstance(v, (int, float)) else v) for f, v in c.items()} for c in d["columns"][:3]]
    if len(cols) < 3:
        raise ValueError("need current, previous and year-ago columns")

    if d["is_bank_or_nbfc"]:
        lines = {"NII": [_sub(c.get("interest_earned"), c.get("interest_expended")) for c in cols],
                 "Total income": [c.get("total_income") for c in cols]}
        note = "NII = interest earned − interest expended"
    else:
        lines = {"Revenue": [c.get("revenue_from_operations") for c in cols],
                 "EBITDA": [_add(c["profit_before_tax"], c.get("finance_costs"), c.get("depreciation_amortisation")) for c in cols]}
        note = EBITDA_NOTE
    lines |= {"PBT": [c["profit_before_tax"] for c in cols], "PAT": [c["profit_after_tax"] for c in cols]}

    one_offs = []
    for c, label in zip(cols, ["This quarter", "Previous quarter", "Year-ago quarter"]):
        x = c.get("exceptional_items")
        if x:
            one_offs.append(f"{label} includes ₹{abs(x):,.0f} cr one-off")
    return {
        "basis": d["basis"], "unit": "₹ crore", "note": note, "periods": [c["period_label"] for c in cols],
        "lines": [{"name": n, "value": None if v[0] is None else round(v[0], 2), "qoq_pct": _pct(v[0], v[1]), "yoy_pct": _pct(v[0], v[2])}
                  for n, v in lines.items()],
        "one_offs": one_offs, "pages": ex["pages"], "model_note": ex.get("model_note"),
    }
