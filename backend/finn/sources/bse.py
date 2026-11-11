"""BSE corporate announcements + attachments. Needs full browser headers (Origin + sec-fetch-*) or BSE returns 403."""
import json, datetime as dt
from finn.sources import fetch

HEADERS = {
    "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com",
    "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
}
API = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"
ATTACH = "https://www.bseindia.com/xml-data/corpfiling/{}/{}"
KEEP = ["NEWSID", "SCRIP_CD", "SLONGNAME", "NEWS_DT", "CATEGORYNAME", "SUBCATNAME", "NEWSSUB", "HEADLINE", "ATTACHMENTNAME", "Fld_Attachsize"]


def announcements(scrip: str, start: dt.date, end: dt.date, max_age: float = 3600) -> list[dict]:
    """All announcements for one BSE scrip code in [start, end], newest first. BSE pages at 50 rows."""
    rows, page = [], 1
    while True:
        body = fetch(API, headers=HEADERS, max_age=max_age, params={
            "pageno": page, "strCat": -1, "subcategory": -1, "strSearch": "P", "strType": "C",
            "strPrevDate": start.strftime("%Y%m%d"), "strToDate": end.strftime("%Y%m%d"), "strScrip": scrip})
        j = json.loads(body)
        batch = j.get("Table") or []
        rows += [{k: x.get(k) for k in KEEP} | {"url": attachment_url(x.get("ATTACHMENTNAME"))} for x in batch]
        total = (j.get("Table1") or [{}])[0].get("ROWCNT", 0)
        if not batch or len(rows) >= total:
            return rows
        page += 1


def attachment_url(name: str | None) -> str | None:
    return ATTACH.format("AttachLive", name) if name else None


def attachment(name: str) -> bytes:
    """Attachment bytes (cached forever). Older filings sometimes only exist under AttachHis."""
    for folder in ("AttachLive", "AttachHis"):
        try:
            b = fetch(ATTACH.format(folder, name), headers=HEADERS)
        except Exception:
            continue
        if b[:4] == b"%PDF":
            return b
    raise FileNotFoundError(f"BSE attachment not found: {name}")
