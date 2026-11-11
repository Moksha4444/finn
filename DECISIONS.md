# Decisions & trade-offs

Format: **Decision** · Why · What we gave up.

## Architecture
- **No Supabase; SQLite + JSON committed to the repo.** One fewer service to deploy and keep secret. Gave up: a live shared DB (not needed for a single-user prototype).
- **Static-first frontend.** The push feed and demo research pages are precomputed JSON, so they load instantly even when Render is cold. Gave up: real-time freshness (data is EOD anyway).
- **Live pull = background job + polling, with staged progress text.** A single long HTTP request would time out on a cold free-tier host. Gave up: simplicity of one request.
- **Gemini for both tiers (Flash = cheap, Pro = strong), set by env var.** Free tier, one key. If Pro hits its quota, `llm.py` falls back to Flash and labels the output "Verdicts by fast model (quota)". Gave up: possibly stronger reasoning from a paid model.

## Spike findings (11 Nov)
- **BSE API needs full browser headers** (`Origin` + `sec-fetch-*`), not just User-Agent + Referer. Without them it returns 403. No cookies needed. Not yet tested from a cloud IP.
- **BSE's category alone misses results.** HDFCBANK filed Q2 results under "Board Meeting / Outcome of Board Meeting". The classifier needs a keyword rule on the subject ("financial results").
- **Screener resolves symbols programmatically**, including renamed ETERNAL (BSE 543320). Concall lists can contain non-results calls (e.g. HDFCBANK "Mar 2026"), so PvD must select the results calls, not just the last 4 rows.
- **Banks: screener has no NII line.** NII = interest earned − interest expended, computed in Python.
- **Results extraction:** `gemini-3.5-flash-lite` with a JSON schema got 25/25 checked TCS + HDFCBANK numbers exact (the TCS PBT, PAT, revenue and cost lines plus all 18 HDFCBANK values, across 3 columns). That includes a scanned HDFCBANK PDF whose text layer reads zeros as "O". Sending the PDF itself (not extracted text) is what makes scanned filings work. About 12k tokens in and 500 out per filing.
- **Exceptional items** (e.g. TCS's ₹668 cr legal settlement in Q1) distort QoQ PBT. The results card should flag them.
- **No Gemini Pro on a new free key.** `gemini-2.5-pro` is retired for new users, and no newer Pro text model is offered. Available: `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, and others.

## Product cuts
- **No real web push.** An in-app alert inbox with a badge instead. Web push needs a service worker and VAPID keys, and iOS only allows it for installed PWAs. Next step after the prototype.
- **No tier editor.** Settings are alert-category toggles plus volume N× and price ±X%. Gave up: per-category tier customisation.
- **Mgmt bios from the filing only.** SEBI LODR requires a profile in the appointment disclosure. No web or LinkedIn fallback.
- **All insider trades are P3.** No trade-size sizing.
- **Business snapshot uses ~15 keyword-selected AR pages at most.** It's the first thing to cut if we're behind.
- **PvD actuals come from screener's quarterly table**, which mirrors the exchange results filings, cited as such. Annual reports don't contain quarterly actuals.

## Cut order if behind
Business snapshot → GH Actions cron (run ingest manually). **Live pull is never cut**: reviewers may test a ticker we didn't pick.

## Additions beyond the brief
- **Market-reaction ranking.** A filing's rank is boosted when that day's move vs Nifty or its volume ratio crosses the user's alert thresholds. The reason is shown on the card. The market's reaction is a free, objective materiality signal.
- **Confident quiet-day state.** "Nothing material today. N routine filings hidden." An empty feed is an answer, not a bug.
- **Management credibility chip** on results cards ("Mgmt delivered 3/5 promises"), computed from cached PvD with no extra LLM call.
