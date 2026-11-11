"""NSE announcements: fallback only, for NSE-only listings with no BSE scrip code (e.g. CDSL).
Rows come back in bse.announcements() shape so the rest of the pipeline doesn't care.
No cookies needed for this endpoint as of 12 Nov 2026 (tested locally)."""
import json, datetime as dt
from finn.sources import fetch

API = "https://www.nseindia.com/api/corporate-announcements"
HEADERS = {"Accept": "*/*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nseindia.com/"}


def announcements(symbol: str, start: dt.date, end: dt.date, max_age: float = 3600) -> list[dict]:
    body = fetch(API, headers=HEADERS, max_age=max_age, params={
        "index": "equities", "symbol": symbol, "from_date": start.strftime("%d-%m-%Y"), "to_date": end.strftime("%d-%m-%Y")})
    return [{
        "NEWSID": x.get("seq_id"), "SCRIP_CD": None, "SLONGNAME": x.get("sm_name"),
        "NEWS_DT": dt.datetime.strptime(x["an_dt"], "%d-%b-%Y %H:%M:%S").isoformat(),
        "CATEGORYNAME": None, "SUBCATNAME": x.get("desc"), "NEWSSUB": x.get("attchmntText"), "HEADLINE": None,
        "ATTACHMENTNAME": None, "Fld_Attachsize": x.get("fileSize"), "url": x.get("attchmntFile") or None,
    } for x in json.loads(body)]
