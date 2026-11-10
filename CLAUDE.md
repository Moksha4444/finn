# FINN — Financial Investment Agent (ENAM AI Engineer Build Challenge)

## Context
- Take-home build for ENAM Holdings (AI Engineer role). **Deadline: 15 Nov 2026.**
- Full brief: `docs/ENAM_AI_Engineer_Build_Challenge_Main.pdf`. Finance glossary + announcement categories: `docs/ENAM_Build_Challenge_Reference.pdf`. Re-read them whenever unsure about scope.
- Graded on product sense, judgment, architecture, creativity and cost efficiency, **not completeness**. Thin-but-working beats broad-but-broken. A demo that doesn't run is the worst outcome.
- I'm a biotech student, not a finance expert or senior engineer. Explain non-obvious choices in 2–3 lines so I can defend them in an interview.

## Product scope (do NOT expand without asking me)
**Push**
1. Windowed digest: all filings across my portfolio for a chosen window (default 24h), ranked by materiality; routine items collapsed.
2. Triggered alerts: (a) material announcement in categories I choose; (b) EOD volume > N× 20-day average, or price move beyond ±X% — both thresholds user-configurable.
3. Rich cards:
   - Results card: Revenue, EBITDA, PBT, PAT, this quarter vs. QoQ vs. YoY.
   - Management change card: who the incoming person is (short bio).
   - Everything else: one-line "why it matters", or just the filing at the right priority.

**Pull** (must work for ANY NSE ticker with data available)
1. **Promised vs. Delivered (hero feature):** last 4 quarters of concall guidance vs. actual reported numbers. Verdict per promise: hit / miss / partial / not-yet-measurable.
2. Business snapshot + financial snapshot (compact).
3. Bull vs. bear (tight, 3 points each).

**Out of scope:** voice, login/auth, multi-user, intraday data, native app store builds.

## Hard rules
1. **Primary sources only on the pull side.** Use only annual reports + concall transcripts. Every claim carries a citation (document + page). The LLM prompt must forbid outside knowledge; if a fact is missing, output "not disclosed".
2. **Nothing hard-coded to my demo tickers.** NSE symbol → BSE scrip code / screener slug is resolved programmatically.
3. **Rules before LLMs.** Use BSE category/subcategory + keyword rules to classify; send only ambiguous items to an LLM.
4. **Model routing:** cheap/fast model for bulk classification and extraction; strong model only for promised-vs-delivered and bull/bear. All calls go through one `llm.py` router mapping `task -> model`.
5. **Cache everything:** LLM outputs keyed by (document hash, prompt version). Log tokens + estimated cost per call; I will report total cost in my writeup.
6. **LLMs never do arithmetic.** The LLM extracts raw numbers into a strict JSON schema; Python computes QoQ/YoY %.
7. **Results math:** prefer consolidated figures, state which one is shown. Units: ₹ crore. EBITDA = PBT + finance costs + depreciation & amortisation (state whether other income is excluded). Banks/NBFCs have no EBITDA: show Net Interest Income / Total Income, PBT, PAT instead.
8. **Management change bios:** extract the profile from the filing itself first (SEBI LODR requires a brief profile in appointment disclosures). Web search is an optional fallback. No LinkedIn scraping.
9. **Fail gracefully:** if parsing or a source fails, show the item with the raw filing link. Never a blank screen or crash.
10. **Mobile-first:** design at 390px width first. Dense, calm, no AI slop: no long LLM paragraphs, no emoji soup.

## Default stack (challenge this in plan mode if you see something better)
- Backend: Python 3.13 (local), FastAPI, httpx, pydantic, yfinance, PyMuPDF/pdfplumber.
- DB: SQLite locally; Supabase Postgres (free tier) for the deployed version.
- Ingestion: GitHub Actions daily cron after market close (~16:30 IST) for prices + announcements.
- Frontend: Next.js + Tailwind, installable PWA, deployed on Vercel.
- Backend host: Render free tier (mitigate cold starts with precomputed demo data + clear loading states).
- LLMs: Gemini Flash-tier (free) as the cheap model; strong model configurable via env var.

## Data sources (verify each with a quick spike; do not assume)
- Prices: yfinance `<SYMBOL>.NS`. Volume spike = today's volume / 20-day average volume.
- Announcements: BSE API (`api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/...`) needs a browser-like User-Agent and `Referer: https://www.bseindia.com/`. Attachments live under `bseindia.com/xml-data/corpfiling/AttachLive/`. NSE's site needs session cookies; fallback only.
- Fundamentals: screener.in company page links annual reports + concall transcripts. Cache downloads, rate-limit politely.

## Classification & priority
Use the categories in the reference PDF. Default tiers (user can customise):
- **P1 (alert):** results, M&A, management_change, fund_raise, litigation, credit_rating (downgrade), pledging
- **P2 (show):** earnings_call, dividend, bonus_split, capex, press_release, credit_rating (other)
- **P3 (collapse):** investor_meetings, postal_ballot, agm_egm, insider_trading (small), unclassified

## Portfolio (candidate list — verify each ticker resolves; some companies were renamed recently)
RELIANCE, HDFCBANK, TCS, BHARTIARTL, ITC, LT, SUNPHARMA, MARUTI, BAJFINANCE, ASIANPAINT,
TRENT, ETERNAL, DIXON, PERSISTENT, POLYCAB, TATAPOWER, IRCTC, CDSL, KPITTECH, DEEPAKNTR
(Mix of sectors and sizes; includes a bank and an NBFC on purpose to exercise the non-EBITDA path.)

## How to work with me
- Plan before coding each module; wait for my approval on plans.
- Small, frequent git commits with clear messages.
- After each module: a 5-line summary of what was built and why.
- Parser tests against 2–3 real filings saved in `tests/fixtures/`.
- Maintain `DECISIONS.md`: every key trade-off and what was deliberately left out (this feeds my writeup).
- Never add Co-Authored-By, 'Generated with Claude Code', or any AI attribution lines to commit messages or PR descriptions.
