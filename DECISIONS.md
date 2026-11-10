# Decisions & trade-offs

Format: **Decision** · Why · What we gave up.

## Architecture
- **No Supabase; SQLite + JSON committed to the repo.** One fewer service to deploy and keep secret. Gave up: a live shared DB (not needed for a single-user prototype).
- **Static-first frontend.** The push feed and demo research pages are precomputed JSON, so they load instantly even when Render is cold. Gave up: real-time freshness (data is EOD anyway).
- **Live pull = background job + polling, with staged progress text.** A single long HTTP request would time out on a cold free-tier host. Gave up: simplicity of one request.
- **Gemini for both tiers (Flash = cheap, Pro = strong), set by env var.** Free tier, one key. If Pro hits its quota, `llm.py` falls back to Flash and labels the output "Verdicts by fast model (quota)". Gave up: possibly stronger reasoning from a paid model.

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
