"""PDF helpers: per-page text, results-page finder, page subset."""
import re
import pymupdf

# Lines of a P&L statement; any 3 on one page means "this is the results table".
PNL = ["revenue from operations", "interest earned", "interest income", "total income", "before tax",
       "tax expense", "net profit", "profit for the period", "profit after tax", "exceptional"]
NOT_PNL = ["segment revenue", "assets and liabilities", "cash flows from operating", "review report", "cashflow statement",
           "cash flow statement"]
# a notes page opens as notes ("Notes to the Statement…", "General / 1. The above … results"): TRENT, MARUTI 15 Nov
NOTES = re.compile(r"\A\s*(?:general\s+)?(?:notes?\b|1\.\s+the above\b)")


def open_pdf(b: bytes) -> pymupdf.Document:
    return pymupdf.open(stream=b, filetype="pdf")


def pages(doc: pymupdf.Document) -> list[str]:
    return [p.get_text() for p in doc]


def find_results_pages(texts: list[str]) -> tuple[list[int], str | None]:
    """0-based page indices of the P&L table and its basis. Consolidated preferred, standalone fallback.
    Returns ([], None) if nothing looks like a results table (caller then sends the whole PDF)."""
    best = {}
    for i, t in enumerate(texts):
        low = t.lower()
        lines = sum(k in low for k in PNL)
        score = lines - 3 * sum(k in low for k in NOT_PNL) - 3 * bool(NOTES.match(low))
        # the SEBI statement's title; survives bad OCR better than line items, and investor-report
        # summary pages (2 columns, no preceding quarter; e.g. BHARTIARTL) don't carry it. Only on a page with
        # line items: notes and review reports repeat the title (MARUTI's consolidated notes page, 15 Nov)
        score += 3 * (lines >= 2 and bool(re.search(r"results for the (quarter|three months|period)", low)))
        if score < 3:
            continue
        basis = "consolidated" if low.count("consolidated") > low.count("standalone") else "standalone"
        if score > best.get(basis, (-1, 0))[0]:
            best[basis] = (score, i)
    for basis in ("consolidated", "standalone"):
        if basis in best:
            i = best[basis][1]
            idx = [i]
            # table may spill onto the next page when PAT isn't on this one
            low = texts[i].lower()
            # or when the owners / non-controlling split is on the next page (KPITTECH Q2 FY27)
            nxt = texts[i + 1].lower() if i + 1 < len(texts) else ""
            if nxt and (not any(k in low for k in ("net profit", "profit for the period", "profit after tax"))
                        or ("attributable to" not in low and "attributable to" in nxt)):
                idx.append(i + 1)
            return idx, basis
    return [], None


def subset(doc: pymupdf.Document, idx: list[int]) -> bytes:
    out = pymupdf.open()
    for i in idx:
        out.insert_pdf(doc, from_page=i, to_page=i)
    return out.tobytes()


def marked_text(texts: list[str], idx: list[int]) -> str:
    """Page text with [p.N] markers (1-based) so citations survive."""
    return "\n".join(f"[p.{i + 1}]\n{texts[i]}" for i in idx)
