"""Segment revenue and results from the company's own quarterly results filings (Ind AS 108 segment page).
The cheap model only copies numbers; Python checks each one is printed on the page, then computes growth and margins."""
import re, hashlib
from finn import llm
from finn.sources import bse, pdf
from finn.pull.bank import VIEWER, _candidates, quarter_end, same_date

NUM = {"type": "number", "nullable": True}
SCHEMA = {"type": "object", "properties": {
    "found": {"type": "boolean"}, "basis": {"type": "string", "enum": ["standalone", "consolidated"]},
    "col_q": {"type": "string"}, "col_yago": {"type": "string"}, "unit": {"type": "string"}, "page": {"type": "integer"},
    "segments": {"type": "array", "items": {"type": "object", "properties": {
        "name": {"type": "string"}, "revenue_q": NUM, "revenue_yago": NUM, "result_q": NUM, "result_yago": NUM},
        "required": ["name", "revenue_q", "revenue_yago", "result_q", "result_yago"]}}},
    "required": ["found", "basis", "col_q", "col_yago", "unit", "page", "segments"]}
SKIP = re.compile(r"total|inter[- ]?segment|unallocat|corporate|elimination", re.I)
# the sentence often breaks across lines in the PDF text ("no separate\nreportable segment")
SINGLE = re.compile(r"no\s+(?:separate\s+)?reportable\s+segments?|(?:single|one|only\s+one)\s+(?:(?:reportable|operating|business)\s+)*segment")
GENERIC = {"business", "segment", "products", "product", "division", "and", "the", "others", "other", "services", "margin", "margins",
           "revenue", "revenues", "growth", "ebitda", "ebit", "income", "sales"}


def _on_page(x: float, text: str) -> bool:
    """The copied number is printed on the page (digits compared without separators; brackets = minus)."""
    digits = re.sub(r"[,\s]", "", text)
    s = f"{abs(x):f}".rstrip("0").rstrip(".")
    return s in digits


def quarter(scrip: str, q: str, symbol: str = "") -> dict | None:
    """{quarter, basis, unit, page, url, segments: {name: {revenue, revenue_yago, result, result_yago}}} or None."""
    qe = quarter_end(q)
    try:
        rows = _candidates(scrip, qe)
    except Exception:
        return None  # BSE down: the promise stays unmeasured rather than failing the page
    single = None
    for row in rows:
        try:
            b = bse.attachment(row["ATTACHMENTNAME"])
        except Exception:
            continue
        doc = pdf.open_pdf(b)
        texts = [t.lower() for t in pdf.pages(doc)]
        if not single and any(SINGLE.search(t) for t in texts):
            single = {"quarter": q, "single": True, "segments": {}, "url": VIEWER + row["ATTACHMENTNAME"]}
        idx = [i for i, t in enumerate(texts) if "segment" in t and "revenue" in t and "result" in t]
        idx.sort(key=lambda i: "consolidated" not in texts[i])  # the group first, as on the results card
        if not idx:
            continue
        r = llm.run("extract_segments", "extract_segments", [f"Quarter end: {qe:%d %B %Y}", pdf.subset(doc, idx[:1])], SCHEMA,
                    key=f"{hashlib.sha256(b).hexdigest()}:{idx[0]}:{qe}", symbol=symbol, quarter=q,
                    patient=True)  # batch job: wait out the per-minute limit, never burn the 20-a-day fallback
        d = r["data"]
        if not (d["found"] and d["segments"] and same_date(d["col_q"], qe)):
            continue
        page_text = texts[idx[0]]
        segs = {}
        for s in d["segments"]:
            vals = {k: s[k] for k in ("revenue_q", "revenue_yago", "result_q", "result_yago")}
            if SKIP.search(s["name"]) or any(v is not None and not _on_page(v, page_text) for v in vals.values()):
                continue  # a total line, or a number that isn't on the page (misread): leave the segment out
            segs[s["name"]] = {"revenue": vals["revenue_q"], "revenue_yago": vals["revenue_yago"],
                               "result": vals["result_q"], "result_yago": vals["result_yago"]}
        if segs:
            return {"quarter": q, "basis": d["basis"], "unit": d["unit"], "page": idx[0] + 1, "segments": segs,
                    "url": VIEWER + row["ATTACHMENTNAME"]}
    return single  # "no separate reportable segment": the filing says there is nothing to split (ASIANPAINT)


def _words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", s.lower()) if len(w) >= 3 and w not in GENERIC}


def match(text: str, names: list[str], exclude=()) -> str | None:
    """The one segment a promise is about, by name words ("watch" ~ "Watches") or acronym ("FMEG" = Fast Moving
    Electrical Goods). None when no segment or more than one segment matches: an unsure match is no match.
    exclude: the company's own name words ("Titan Jewellery" is about Jewellery; "Airtel" alone names no segment)."""
    t = _words(text) - set(exclude)
    hits = []
    for n in names:
        w = _words(n)
        initials = "".join(x[0] for x in re.findall(r"[a-z]+", n.lower()) if x not in ("and", "of", "the"))
        same = any(a.startswith(b) or b.startswith(a) for a in t for b in w if min(len(a), len(b)) >= 4)
        if same or (len(initials) >= 3 and initials in t) or (n.lower() in t):
            hits.append(n)
    return hits[0] if len(hits) == 1 else None
