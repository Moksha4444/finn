"""Bank ratios from the bank's own results filings (a primary source: the company's exchange filing).
CD ratio = advances / deposits, from the Statement of Assets and Liabilities; the model only copies the two lines."""
import re, hashlib, calendar, datetime as dt
from finn import llm
from finn.sources import bse, pdf

NUM = {"type": "number", "nullable": True}
SCHEMA = {"type": "object", "properties": {
    "found": {"type": "boolean"}, "basis": {"type": "string", "enum": ["standalone", "consolidated"]},
    "as_at": {"type": "string"}, "unit": {"type": "string"}, "deposits": NUM, "advances": NUM, "page": {"type": "integer"}},
    "required": ["found", "basis", "as_at", "unit", "deposits", "advances", "page"]}
VIEWER = "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname="
MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def quarter_end(q: str) -> dt.date:
    d = dt.datetime.strptime(q, "%b %Y")
    return dt.date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def same_date(as_at: str, qe: dt.date) -> bool:
    """The column the model copied is the quarter-end one: year plus month (number or name) in the printed header."""
    s = as_at.lower()
    return str(qe.year) in s and (bool(re.search(rf"\b0?{qe.month}\b", re.sub(r"[./-]", " ", s))) or MON[qe.month - 1] in s)


def _candidates(scrip: str, qe: dt.date) -> list[dict]:
    """Results filings in the 50 days after the quarter end: 'Result' category first, then board-meeting outcomes
    (HDFCBANK files results under 'Outcome of Board Meeting'). Oldest first: the first one is the results day."""
    end = min(qe + dt.timedelta(50), dt.date.today())  # BSE answers 400 to a window ending in the future
    rows = bse.announcements(scrip, qe + dt.timedelta(1), end, max_age=None if end < dt.date.today() else 3600)
    rows = [r for r in rows if r.get("ATTACHMENTNAME") and (r["CATEGORYNAME"] == "Result" or r["SUBCATNAME"] == "Outcome of Board Meeting"
                                                            or "financial result" in (r["NEWSSUB"] or "").lower())]
    return sorted(rows, key=lambda r: (r["CATEGORYNAME"] != "Result", r["NEWS_DT"]))[:3]


def balance_sheet(scrip: str, quarter: str, symbol: str = "") -> dict | None:
    """{quarter, deposits, advances, cd_ratio, basis, page, url} or None if no filing yields the quarter-end column."""
    qe = quarter_end(quarter)
    try:
        rows = _candidates(scrip, qe)
    except Exception:
        return None  # BSE down: the promise stays unmeasured rather than failing the page
    for row in rows:
        try:
            b = bse.attachment(row["ATTACHMENTNAME"])
        except Exception:
            continue
        doc = pdf.open_pdf(b)
        texts = [t.lower() for t in pdf.pages(doc)]
        idx = [i for i, t in enumerate(texts) if "deposits" in t and "advances" in t and ("assets and liabilities" in t or "balance sheet" in t)]
        idx.sort(key=lambda i: "standalone" not in texts[i])  # the bank itself first
        if idx:
            inputs, pages = [pdf.subset(doc, idx[:1])], [idx[0] + 1]
        elif sum(len(t.strip()) < 50 for t in texts) > len(texts) / 2:
            inputs, pages = [b], list(range(1, len(texts) + 1))  # scanned, no text layer: the model reads the whole filing
        else:
            continue
        r = llm.run("extract_balance_sheet", "extract_balance_sheet", [f"Quarter end: {qe:%d %B %Y}", *inputs], SCHEMA,
                    key=f"{hashlib.sha256(b).hexdigest()}:{pages}:{qe}", symbol=symbol, quarter=quarter)
        d = r["data"]
        if not (d["found"] and d["deposits"] and d["advances"] and same_date(d["as_at"], qe)):
            continue
        cd = d["advances"] / d["deposits"] * 100
        if not 30 <= cd <= 200:
            continue  # a misread line, not a bank's CD ratio
        page = pages[0] if len(pages) == 1 else d["page"]
        return {"quarter": quarter, "deposits": d["deposits"], "advances": d["advances"], "unit": d["unit"], "cd_ratio": round(cd, 1),
                "basis": d["basis"], "page": page,
                "url": VIEWER + row["ATTACHMENTNAME"]}  # BSE's viewer finds the file in AttachLive or AttachHis; a direct link can 404
    return None
