"""Spike 2: does screener resolve NSE symbols -> BSE code + concall/AR links, and are transcripts text-extractable?
Run: .venv/Scripts/python spikes/spike2_screener.py [SYMBOL ...]"""
import sys, re, time, pathlib, httpx, pymupdf
from bs4 import BeautifulSoup

SYMBOLS = sys.argv[1:] or ["ETERNAL", "DEEPAKNTR", "HDFCBANK"]
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"}
OUT = pathlib.Path("cache/spikes"); OUT.mkdir(parents=True, exist_ok=True)
c = httpx.Client(headers=UA, follow_redirects=True, timeout=60)
downloaded = 0

for sym in SYMBOLS:
    r = c.get(f"https://www.screener.in/company/{sym}/consolidated/")
    print(f"\n== {sym}: HTTP {r.status_code} final={r.url}")
    if r.status_code != 200:
        continue
    s = BeautifulSoup(r.text, "html.parser")
    bse = re.search(r"bseindia\.com/[^\"']*?/(\d{6})/", r.text)
    print("name:", s.h1.get_text(strip=True) if s.h1 else None, "| BSE code:", bse.group(1) if bse else None)

    concalls = s.select(".documents.concalls li")
    ars = s.select(".documents.annual-reports li a")
    print("concall rows:", len(concalls), "| annual reports:", len(ars))
    for li in concalls[:4]:
        links = {a.get_text(strip=True): a.get("href") for a in li.select("a")}
        print("  ", li.select_one("div").get_text(" ", strip=True) if li.select_one("div") else "?", "->", links)
    for a in ars[:2]:
        print("   AR:", a.get_text(" ", strip=True)[:40], a.get("href"))

    # quarterly table present? (needed for PvD actuals)
    q = s.select_one("#quarters table")
    if q:
        heads = [th.get_text(strip=True) for th in q.select("thead th")][-5:]
        rows = [tr.select_one("td").get_text(" ", strip=True) for tr in q.select("tbody tr")]
        print("quarters cols:", heads, "| rows:", rows[:10])

    if downloaded < 2:
        href = next((a.get("href") for li in concalls for a in li.select("a") if a.get_text(strip=True) == "Transcript"), None)
        if href:
            time.sleep(2)
            p = c.get(href, headers={**UA, "Referer": "https://www.bseindia.com/"} if "bseindia" in href else UA)
            print("transcript", href, "HTTP", p.status_code, p.headers.get("content-type"), len(p.content))
            if p.content[:4] == b"%PDF":
                f = OUT / f"{sym}_transcript.pdf"; f.write_bytes(p.content)
                doc = pymupdf.open(f)
                chars = [len(pg.get_text()) for pg in doc]
                print(f"  pages={doc.page_count} pages>500chars={sum(x > 500 for x in chars)} median={sorted(chars)[len(chars)//2]}")
                downloaded += 1
    time.sleep(2)
