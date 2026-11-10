# FINN — plan for 11–15 Nov 2026

## Context
The repo is empty apart from CLAUDE.md and the two brief PDFs. That leaves 4 working days (Wed 11 to Sat 14) plus Sun 15 for the writeup. The brief says "thin-but-working beats broad-but-broken" and calls the frontend "the heart". The scope in CLAUDE.md is right in spirit, but it has too many deploy pieces and two features whose data path hasn't been proven. This plan cuts the plumbing, proves the data sources first, and gets a hello-world deployed on day 1, so the demo can't fail to run on the 14th.

---

## 1. Critique: what's risky, what to cut

**Keep (this is the product):** ranked digest, two EOD threshold alerts, results card, mgmt-change card, Promised vs Delivered (PvD), financial snapshot, bull/bear.

**Risky items, and what to do about each**

| Item | Risk | Decision |
|---|---|---|
| Supabase + Render + Vercel + GH Actions + SQLite | Five moving parts to deploy and debug | **Cut Supabase.** Ingest writes SQLite and exports JSON, which gets committed to the repo. One less service and no secrets in the DB. |
| Render cold start (~50 s) | Reviewer opens the link and sees a spinner, which is the "demo doesn't run" outcome | **Static-first.** The push feed and the pull pages for the demo tickers are precomputed JSON shipped with the frontend, so they load instantly. Render is only used for live pull on a new ticker, with a staged progress UI. |
| PvD "actuals" | CLAUDE.md says pull uses ARs + transcripts only, but quarterly actuals aren't in an AR | Take actuals from screener's quarterly table, which mirrors the exchange results filings (still primary numbers). Cite them as "Q2 FY27 results (via screener)". Transcript commentary is supporting evidence. Logged in DECISIONS.md. |
| PvD guidance that can't be measured | e.g. "FY27 margin 20–22%" can't be checked mid-year | Use the verdict `not-yet-measurable`, show progress-to-date where Python can compute it, and never let the LLM guess. |
| Annual reports | 300+ pages each. Slow, costly, and the citations get noisy | Only for the business snapshot: keep the pages that match keywords (segment, revenue mix, MD&A) and send at most ~15 pages. **First thing to cut if behind**; the transcript's opening remarks are the fallback. |
| Results PDFs | Formats vary, and some are scanned images | SEBI's format already prints the current quarter, the preceding quarter and the same quarter last year side by side, so one filing gives QoQ and YoY. The cheap model extracts the raw numbers and Python does the maths. If the PDF has no text layer, send it to Gemini as a PDF; if that fails too, show the raw link. |
| "Tell me the moment" | Real push notifications need a service worker, VAPID keys, and iOS only allows them for installed PWAs | **Cut real web push.** Use an in-app alert inbox with a badge, and name web push as the next step. |
| Customisable tiers | A settings editor is a lot of UI to build | Settings are alert-category toggles plus volume N× and price ±X%, stored in localStorage. No tier editor. |
| Mgmt bio web fallback, "small" insider-trade sizing | Scope creep | Cut both. Bios come from the filing only; all insider trades are P3. |
| 24h window empty on demo day | Feed looks dead | The window picker (24h / 7d / 30d) defaults to 24h but suggests widening when the feed is empty. Mid-Nov is the Q2 results season, so filings should be plentiful. |

**One addition worth its cost (about 2 h, optional on Day 3):** a "management credibility" chip on every results card, e.g. "Mgmt hit 3/5 promises", pulled from cached PvD. It links push to pull and gives the product a point of view: you don't just get told what was reported, you get told whether these people deliver. Skip it if Day 3 slips.

**Interaction model (POV for the writeup):** this is a morning brief, not a chatbot. There's one ranked feed and one search box: tap a ticker anywhere and you get its research page. No chat, because chat invites long LLM paragraphs, which is the AI slop the brief warns against.

**Stack changes:** drop Supabase. Use Next.js with static export on Vercel, with the PWA manifest only and no offline service worker. Everything else stays the same.

---

## 2. Repo structure
```
finn/
  backend/finn/
    config.py        # portfolio, tier map, default thresholds
    llm.py           # task->model router, (doc_hash, prompt_ver) cache, token/cost log
    db.py            # sqlite helpers
    sources/
      prices.py      # yfinance EOD, 20d avg volume
      bse.py         # announcements + attachment download (browser headers)
      screener.py    # NSE symbol -> slug/BSE code, doc links, quarterly table
      pdf.py         # PyMuPDF page text with [p.N] markers
    push/
      classify.py    # BSE category + keyword rules, LLM only if ambiguous
      cards.py       # results card + mgmt-change card
      alerts.py      # volume / price / category triggers
    pull/
      pvd.py         # guidance extract (cheap, per transcript) -> verdict (strong)
      research.py    # financial snapshot (no LLM), business snapshot, bull/bear
    prompts/         # versioned .md prompts (version is part of the cache key)
    api.py           # FastAPI: /research/{symbol} (live pull), /health
    ingest.py        # cron entrypoint: prices + announcements -> JSON export
  backend/tests/fixtures/   # 2–3 real filings + 1 transcript
  web/               # Next.js + Tailwind; public/data/*.json = precomputed
  .github/workflows/ingest.yml   # daily 16:30 IST, commits JSON
  DECISIONS.md  README.md
```
PvD design: the cheap model reads each transcript once and extracts guidance as `{metric, target, period, quote, page}`. The strong model only sees that small JSON plus the Python-computed actuals, never the raw transcripts. That's what keeps the cost down, and it's a point to make in the interview.

---

## 3. Day-by-day

**Day 1 — Wed 11 (today)**
- Run the 3 de-risk spikes below (~45 min). If any fails, I'll stop and tell you before going further.
- Git init, skeleton, `llm.py` (router + cache + cost log), `sources/` (prices, bse, screener resolve).
- Deploy an empty FastAPI to Render and an empty Next.js to Vercel, to prove the deploy path early.
- End of day: CLI prints a classified 7-day digest and the price/volume alerts for all 20 tickers.

**Day 2 — Thu 12**
- Rules classifier with the LLM fallback for ambiguous items; results card (including the bank/NBFC branch); mgmt-change card. Fixture tests against real filings.
- `ingest.py` exports the push JSON.
- Afternoon: frontend feed at 390 px wired to the real JSON (digest, collapsed P3, cards, alert inbox, settings).

**Day 3 — Fri 13**
- PvD end to end (transcript fetch, guidance extract, actuals, verdict with citations); financial snapshot; bull/bear; business snapshot if time allows.
- Precompute 4 research tickers: 2 from the portfolio and 2 outside it, including one bank.
- Research page UI. Optional: the credibility chip.

**Day 4 — Sat 14**
- Live-pull endpoint with a progress UI; graceful-failure pass (raw filing link everywhere).
- GH Actions cron; final deploy; test on a real phone; try an unseen ticker.
- DECISIONS.md and a cost total from the log. **Deployed by night.**

**Sun 15 — buffer + submit:** writeup, export the Claude Code history, email.

---

## 4. Three riskiest unknowns and a 15-minute test for each

1. **Does the BSE announcements API answer my machine, and a cloud IP?**
   - Test: call `AnnSubCategoryGetData` with browser headers for RELIANCE (500325) over the last 7 days, then download one attachment PDF. Repeat from Render once the skeleton is deployed on Day 1.
   - Pass: JSON rows plus a PDF that opens.
   - Fallback: run ingest locally and commit the JSON (the static-first design already supports this).

2. **Does screener resolve any NSE symbol, and are its transcript PDFs text-extractable?**
   - Test: fetch the screener pages for ETERNAL (renamed), DEEPAKNTR (mid-cap) and HDFCBANK. Get the BSE code and the concall + AR links. Download 2 transcripts and check PyMuPDF chars per page.
   - Pass: slug and code resolve, links are present, more than 500 chars on most pages, and the HTTP status shows whether the links need BSE headers.

3. **Can the cheap model reliably pull the 3-column results table into strict JSON (free-tier limits included)?**
   - Test: one Q2 FY27 results PDF from a non-financial (e.g. TCS) and one from HDFCBANK. Gemini Flash with a JSON schema. Check by eye against the PDF and note the free-tier RPM/RPD limits.
   - Pass: Revenue, PBT, PAT, finance cost and D&A are exact for all 3 columns; the bank's NII/Total Income is captured.
   - Fallback: screener's quarterly table.

(yfinance is low risk. I'll check it in passing with a 30-day `RELIANCE.NS` pull.)

---

## Open choices (defaults chosen; tell me if you disagree)
- Strong model: env var, defaulting to the strongest model you have a key for (Claude Sonnet or Gemini Pro free tier). Cheap model: Gemini Flash free tier. **Which API keys do you have?**
- Research demo tickers (default): TCS, HDFCBANK, plus 2 outside the portfolio (e.g. ASTRAL, TITAN).

## Verification
- Fixture tests: results-card extraction on 3 saved filings (one of them a bank); PvD verdicts on one saved transcript set.
- The end-to-end ingest run produces JSON for all 20 tickers, and failed items carry a raw link.
- On a phone: the deployed URL loads the feed in under 2 s (static), and the research page for an unseen ticker completes or fails gracefully.
- The cost log total gets reported in DECISIONS.md.
