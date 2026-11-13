"""screener.in company page: NSE symbol -> BSE code, name, concall + annual-report links, quarterly table."""
import re, json
from bs4 import BeautifulSoup
from finn.sources import fetch

DAY = 24 * 3600


def _page(symbol: str, consolidated: bool) -> BeautifulSoup:
    url = f"https://www.screener.in/company/{symbol.upper()}/" + ("consolidated/" if consolidated else "")
    return BeautifulSoup(fetch(url, max_age=DAY, gap=2.0), "html.parser")


def _num(s: str) -> float | None:
    s = s.replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def quarters(s: BeautifulSoup, section: str = "quarters") -> dict:
    """{'periods': ['Jun 2025', ...], 'rows': {'Sales': [..], 'Net Profit': [..]}} in ₹ crore, oldest first.
    section: also 'profit-loss', 'balance-sheet', 'cash-flow' (annual, Mar years; same table layout)."""
    t = s.select_one(f"#{section} table")
    if not t:
        return {"periods": [], "rows": {}}
    periods = [th.get_text(strip=True) for th in t.select("thead th")][1:]
    rows = {}
    for tr in t.select("tbody tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
        name = tds[0].rstrip(" +").strip()
        vals = [_num(x) for x in tds[1:]]
        if any(v is not None for v in vals):
            rows[name] = vals
    return {"periods": periods, "rows": rows}


def owners_pat(s: BeautifulSoup, table: dict, section: str) -> str:
    """Replaces table's 'Net Profit' (screener's total PAT, minority interest included) with 'Profit for EPS', the
    profit attributable to owners: the PAT definition the results card uses (DECISIONS.md, 12 Nov). Returns which
    one the table now holds. Read from screener's own 'Net Profit +' breakdown."""
    cid = s.select_one("[data-company-id]")
    if not cid or "Net Profit" not in table["rows"]:
        return "total"
    try:
        sched = json.loads(fetch(f"https://www.screener.in/api/company/{cid['data-company-id']}/schedules/",
                                 params={"parent": "Net Profit", "section": section, "consolidated": ""}, max_age=DAY, gap=2.0))
        eps = {p: _num(v) for p, v in sched["Profit for EPS"].items()}
    except Exception:  # breakdown missing or screener down: total PAT, and the page says so
        return "total"
    table["rows"]["Net Profit (total)"] = table["rows"]["Net Profit"]
    table["rows"]["Net Profit"] = [eps.get(p) for p in table["periods"]]
    return "to owners"


def company(symbol: str) -> dict:
    """Raises httpx.HTTPStatusError (404) for an unknown symbol. Prefers consolidated figures and says which.
    'Net Profit' is PAT to owners where screener has the breakdown (pat_basis says which)."""
    s, basis = _page(symbol, True), "consolidated"
    q = quarters(s)
    if not q["rows"]:  # standalone-only company: consolidated view is empty
        s, basis = _page(symbol, False), "standalone"
        q = quarters(s)
    annual = {k: quarters(s, k) for k in ("profit-loss", "balance-sheet", "cash-flow")}
    # standalone has no minority interest: its Net Profit already is the owners' profit
    pat_basis = "to owners" if basis == "standalone" else owners_pat(s, q, "quarters")
    if basis == "consolidated" and pat_basis == "to owners" and owners_pat(s, annual["profit-loss"], "profit-loss") != "to owners":
        pat_basis = "to owners (quarters); total (years)"
    html = str(s)
    bse = re.search(r"bseindia\.com/[^\"']*?/(\d{6})/", html)
    concalls = []
    for li in s.select(".documents.concalls li"):
        label = li.select_one("div")
        links = {a.get_text(strip=True): a.get("href") for a in li.select("a")}
        concalls.append({"period": label.get_text(" ", strip=True) if label else None,
                         "transcript": links.get("Transcript"), "ppt": links.get("PPT")})
    ars = [{"title": a.get_text(" ", strip=True), "url": a.get("href")} for a in s.select(".documents.annual-reports li a")]
    return {
        "symbol": symbol.upper(),
        "name": s.h1.get_text(strip=True) if s.h1 else symbol,
        "bse_code": bse.group(1) if bse else None,
        "basis": basis,
        # screener's breadcrumb, e.g. "Utilities"; the app tints the company avatar by it
        "sector": next((a.get_text(strip=True) for a in s.select('a[href^="/market/"]') if a.get("title") == "Broad Sector"), None),
        "quarters": q,
        "annual": annual,
        "pat_basis": pat_basis,
        "url": f"https://www.screener.in/company/{symbol.upper()}/" + ("consolidated/" if basis == "consolidated" else ""),
        "concalls": concalls,
        "annual_reports": ars,
    }
