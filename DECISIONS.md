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
- **Update (12 Nov, measured): results go to the LLM as PDF pages only; the text path is dropped.** `scripts/compare_paths.py` sent each of 3 real filings three ways (flash-lite, numbers checked against the PDFs by hand):

  | filing | text | PDF pages | full PDF |
  |---|---|---|---|
  | TCS (clean) | 2,434 tok · 18/18 | **827 tok · 18/18*** | 11,747 tok · 18/18 |
  | HDFCBANK (scan) | 2,750 tok · **1/15** | **839 tok · 15/15** | 13,063 tok · 15/15 |
  | BAJFINANCE (scan, NBFC) | 3,543 tok · 15/15 | **839 tok · 15/15** | 1,371 tok (2-pg file) · 9/15 |

  \*Exceptional items came back as −668 instead of 668; the card uses the absolute value. Gemini bills a PDF page at a roughly flat rate, while extracted text is padded with whitespace, so page images are ~3× cheaper than text and ~15× cheaper than the whole PDF, at ~$0.0015 per filing. They are also the only path that survives scans (text got 1/15 on HDFCBANK). The planned "garble check" was deleted: there's nothing left to route. Gave up: nothing measurable. If page-finding fails, the whole PDF is still sent.
- **Results pages are found by keyword score, not layout.** A page that has ≥3 P&L line names ("before tax", "tax expense", "interest earned"…) and is not a segment, balance-sheet or cash-flow page is a candidate; consolidated beats standalone. It worked on all 3 fixtures, including OCR text.
- **PAT = total profit before minority interest**, for every company. HDFCBANK prints both (₹21,537 cr vs ₹20,700 cr attributable to owners). We chose one consistent rule and wrote it in the prompt. Gave up: the "attributable to owners" figure some news headlines quote.
- **Prompt version = hash of the prompt file.** Editing a prompt invalidates its cache automatically. No version numbers to forget to bump.
- **Cost log uses paid-tier list prices** (flash-lite $0.30/$2.50 per 1M in/out; 3.8-flash $0.75/$3.75 introductory; 3.5-flash $1.50/$9.00), even though we run on the free tier. The writeup reports what this would cost a paying user.
- **Dependencies pinned** to the versions tested locally, so a Render rebuild can't pull an untested release.
- **One-off flag is pure Python.** If "Exceptional items" ≠ 0, the card says e.g. "Includes ₹668 cr one-off". No LLM judgment about what counts as one-off.

## Spike findings (11 Nov)
- **BSE API needs full browser headers** (`Origin` + `sec-fetch-*`), not just User-Agent + Referer. Without them it returns 403. No cookies needed. **Works from a cloud IP:** `/health/bse` on Render (Singapore, free tier) returned live rows on 11 Nov, so live pull and cloud ingest can call BSE directly. Gave up: nothing; the local-ingest fallback wasn't needed.
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
