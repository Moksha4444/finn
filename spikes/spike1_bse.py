"""Spike 1: does BSE's announcements API answer us, and can we download an attachment?
Also checks yfinance EOD in passing. Run: .venv/Scripts/python spikes/spike1_bse.py [scrip_code]"""
import sys, datetime as dt, pathlib, httpx

SCRIP = sys.argv[1] if len(sys.argv) > 1 else "500325"  # RELIANCE
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/",
    "Accept": "application/json, text/plain, */*",
    # without Origin + sec-fetch-* BSE returns 403
    "Origin": "https://www.bseindia.com",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
}
OUT = pathlib.Path("cache/spikes"); OUT.mkdir(parents=True, exist_ok=True)

today = dt.date.today()
params = {
    "pageno": 1, "strCat": -1, "subcategory": -1, "strSearch": "P", "strType": "C",
    "strPrevDate": (today - dt.timedelta(days=7)).strftime("%Y%m%d"),
    "strToDate": today.strftime("%Y%m%d"), "strScrip": SCRIP,
}
r = httpx.get("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w",
              params=params, headers=HEADERS, timeout=30)
print("announcements HTTP", r.status_code, r.headers.get("content-type"))
rows = r.json().get("Table", []) if r.status_code == 200 else []
print("rows:", len(rows))
for row in rows[:8]:
    print(" ", row.get("NEWS_DT"), "|", row.get("CATEGORYNAME"), "|", row.get("SUBCATNAME"),
          "|", (row.get("NEWSSUB") or "")[:80], "|", row.get("ATTACHMENTNAME"))
if rows:
    print("keys:", sorted(rows[0].keys()))

att = next((x["ATTACHMENTNAME"] for x in rows if x.get("ATTACHMENTNAME")), None)
if att:
    url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{att}"
    p = httpx.get(url, headers=HEADERS, timeout=60, follow_redirects=True)
    print("attachment HTTP", p.status_code, p.headers.get("content-type"), len(p.content), "bytes")
    if p.content[:4] == b"%PDF":
        (OUT / att).write_bytes(p.content)
        import pymupdf
        doc = pymupdf.open(OUT / att)
        print("PDF pages:", doc.page_count, "| chars p1:", len(doc[0].get_text()))

import yfinance as yf
h = yf.Ticker("RELIANCE.NS").history(period="1mo")
print("yfinance RELIANCE.NS rows:", len(h), "| last:", h.index[-1].date() if len(h) else None,
      "| vol/20d avg:", round(h.Volume.iloc[-1] / h.Volume.iloc[-21:-1].mean(), 2) if len(h) > 21 else "n/a")
n = yf.Ticker("^NSEI").history(period="5d")
print("yfinance ^NSEI rows:", len(n))
