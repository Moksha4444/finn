"""Spike 3: can Gemini Flash pull the 3-column results table into strict JSON? Is Pro reachable on the free tier?
Run: .venv/Scripts/python spikes/spike3_gemini.py   (needs GEMINI_API_KEY in .env for the LLM part)"""
import os, json, pathlib, datetime as dt, httpx
from dotenv import load_dotenv

load_dotenv()
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com",
    "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
}
OUT = pathlib.Path("cache/spikes"); OUT.mkdir(parents=True, exist_ok=True)
TICKERS = {"TCS": "532540", "HDFCBANK": "500180"}


def latest_results_pdf(sym, scrip):
    f = OUT / f"{sym}_results.pdf"
    if f.exists():
        return f
    t = dt.date.today()
    r = httpx.get("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w", headers=HEADERS, timeout=30, params={
        # strCat=-1 (all): HDFCBANK files results under "Board Meeting", not "Result"
        "pageno": 1, "strCat": -1, "subcategory": -1, "strSearch": "P", "strType": "C",
        "strPrevDate": (t - dt.timedelta(days=60)).strftime("%Y%m%d"), "strToDate": t.strftime("%Y%m%d"), "strScrip": scrip})
    rows = r.json().get("Table", [])
    # biggest "financial result" attachment is usually the full results PDF (not the board-meeting intimation)
    cands = [x for x in rows if x.get("ATTACHMENTNAME") and "financial result" in ((x.get("SUBCATNAME") or "") + (x.get("NEWSSUB") or "")).lower()]
    for row in cands:
        print(f"  {sym} {row['NEWS_DT'][:10]} | {row['CATEGORYNAME']} / {row['SUBCATNAME']} | {row['NEWSSUB'][:80]} | {row.get('Fld_Attachsize')}")
    if not cands:
        return None
    best = max(cands, key=lambda x: x.get("Fld_Attachsize") or 0)
    p = httpx.get(f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{best['ATTACHMENTNAME']}", headers=HEADERS, timeout=120)
    f.write_bytes(p.content)
    return f


SCHEMA = {
    "type": "object",
    "properties": {
        "basis": {"type": "string", "enum": ["consolidated", "standalone"]},
        "unit": {"type": "string", "description": "unit as printed, e.g. '₹ crore', '₹ lakh', '₹ million'"},
        "is_bank_or_nbfc": {"type": "boolean"},
        "columns": {"type": "array", "items": {"type": "object", "properties": {
            "period_label": {"type": "string", "description": "column header as printed, e.g. 'Quarter ended 30.09.2026'"},
            "revenue_from_operations": {"type": "number", "nullable": True},
            "total_income": {"type": "number", "nullable": True},
            "interest_earned": {"type": "number", "nullable": True},
            "interest_expended": {"type": "number", "nullable": True},
            "finance_costs": {"type": "number", "nullable": True},
            "depreciation_amortisation": {"type": "number", "nullable": True},
            "other_income": {"type": "number", "nullable": True},
            "profit_before_tax": {"type": "number", "nullable": True},
            "profit_after_tax": {"type": "number", "nullable": True},
            "page": {"type": "integer"},
        }, "required": ["period_label", "profit_before_tax", "profit_after_tax", "page"]}},
    },
    "required": ["basis", "unit", "is_bank_or_nbfc", "columns"],
}
PROMPT = """Extract the quarterly results table from this filing. Prefer the CONSOLIDATED statement if present.
Return exactly three columns: current quarter, preceding quarter, same quarter last year (in that order).
Copy numbers exactly as printed (no arithmetic, no unit conversion). Use null if a line is absent.
For banks use interest_earned / interest_expended / total_income. Do not use outside knowledge."""

pdfs = {s: latest_results_pdf(s, c) for s, c in TICKERS.items()}
print({s: (str(p), p.stat().st_size) if p else None for s, p in pdfs.items()})

key = os.getenv("GEMINI_API_KEY")
if not key:
    raise SystemExit("No GEMINI_API_KEY in .env: stopping before LLM part.")

from google import genai
from google.genai import types

client = genai.Client(api_key=key)
names = [m.name for m in client.models.list()]
print("models (flash/pro):", [n for n in names if ("flash" in n or "pro" in n) and "gemini" in n])

import sys
models = sys.argv[1:] or [os.getenv("FINN_CHEAP_MODEL") or "gemini-3.8-flash"]
for flash, (sym, f) in [(m, kv) for m in models for kv in pdfs.items()]:
    if not f:
        continue
    resp = client.models.generate_content(
        model=flash,
        contents=[types.Part.from_bytes(data=f.read_bytes(), mime_type="application/pdf"), PROMPT],
        config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=SCHEMA, temperature=0),
    )
    print(f"\n== {sym} via {flash} | tokens in={resp.usage_metadata.prompt_token_count} out={resp.usage_metadata.candidates_token_count}")
    print(json.dumps(json.loads(resp.text), indent=1, ensure_ascii=False))

