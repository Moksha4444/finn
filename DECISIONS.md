# Decisions & trade-offs

Format: **Decision** · Why · What we gave up.

## Architecture
- **No Supabase; SQLite + JSON committed to the repo.** One fewer service to deploy and keep secret. Gave up: a live shared DB (not needed for a single-user prototype).
- **Static-first frontend.** The push feed and demo research pages are precomputed JSON, so they load instantly even when Render is cold. Gave up: real-time freshness (data is EOD anyway).
- **Live pull = background job + polling, with staged progress text.** A single long HTTP request would time out on a cold free-tier host. Gave up: simplicity of one request.
- **Models: cheap = `gemini-3.5-flash-lite`, strong = `gemini-3.8-flash`, fallback = `gemini-3.5-flash`.** The original plan was Flash + Pro, but a new free key has no Pro model. Lite passed extraction 25/25, so the bulk work stays on the cheapest tier. Gave up: Pro-level reasoning on PvD/bull-bear for now.
- **`llm.py` is provider-agnostic** (`provider:model` per task via env). Only the Gemini adapter is built. If PvD quality is shallow on Day 3, PvD/bull-bear can move to Claude with one env line plus a small adapter. Gave up: nothing yet; we avoided building an adapter we may not need.
- **Retry then fall back.** Exponential backoff on 503/429, max 3 tries, then the fallback model, with the visible label "Verdicts by fast model (quota)". The spike hit a real 503, so this is needed, not hypothetical.
- **Results PDFs: send only the consolidated results page(s).** Use the text layer when clean, and send just those PDF pages when the text is garbled (scanned). The path used is logged per call. A full PDF was ~12k input tokens. Gave up: nothing; if page detection fails, the full PDF is the fallback.
- **One-off flag is pure Python.** If "Exceptional items" ≠ 0, the card says e.g. "Includes ₹668 cr one-off". No LLM judgment about what counts as one-off.

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
