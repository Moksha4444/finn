# FINN — build plan (11–15 Nov 2026)

Single source of truth for the build. Scope and hard rules live in `CLAUDE.md`; trade-offs are logged in `DECISIONS.md`.
Current status: see §3i (feed UI round 3), §3h (PvD review), §3g (PvD rework), §3f (PvD backend), §3e (redesign), §3d (feed UI) and §3c. Day plan: §4 (re-planned 12 Nov). PvD session: start at §4a.

---

## 1. Product (what ships)

**Push**
- Windowed digest (24h default / 7d / 30d), ranked by materiality; P3 collapsed.
- **Market-reaction ranking:** a filing is boosted when its reaction day crosses the user's alert thresholds. Reason shown on the card: `Ranked high: results · −4.1% (−3.6% vs Nifty)` / `Ranked high: results · 2.3× volume`.
- **Confident quiet-day state:** `Nothing material today.` / `14 routine filings hidden` (tap to expand) · `Last checked 16:42 IST` · small "See last 7 days" link.
- Triggered alerts (in-app inbox + badge, no web push): material category toggles; EOD volume ≥ N× 20-day avg; move vs Nifty beyond ±X%. Thresholds in localStorage.
- Results card: Revenue, EBITDA, PBT, PAT: this Q vs QoQ vs YoY, consolidated preferred and labelled. Banks/NBFCs show NII / Total Income, PBT, PAT. **One-off flag** when exceptional items ≠ 0 (`Includes ₹668 cr one-off`).
- **Credibility chip** on results cards: `Mgmt delivered 3/5 promises · last 4Q`, computed by Python from cached PvD and linking to the PvD page. No chip if there is no PvD yet.
- Mgmt-change card: bio extracted from the filing only.
- Everything else: one-line "why it matters" or just the filing at the right tier.

**Pull** (any NSE ticker)
- Promised vs Delivered (hero), financial snapshot, bull/bear (3 each), business snapshot (first to cut).
- **Live pull = background job + polling** with staged progress text: "Resolving ticker… / Fetching 4 transcripts… / Extracting guidance… / Scoring promises…".

**Interaction model:** a morning brief, not a chatbot. One ranked feed and one search box; tapping any ticker opens its research page.

**Never cut:** live pull, PvD, credibility chip, results card, quiet-day state.
**Cut order if behind:** business snapshot → GH Actions cron (run ingest manually). Nothing else.

---

## 2. Architecture

Static-first: ingest exports JSON into `web/public/data/` (committed); no SQLite (12 Nov: the disk caches already hold everything). The feed and demo research pages load instantly with no backend. Render serves only live pull for unseen tickers. No Supabase.

```
finn/
  backend/finn/
    config.py        # portfolio, tier map, default thresholds
    llm.py           # provider-agnostic router, retry/fallback, cache, cost log
    sources/
      prices.py      # yfinance EOD (period="2mo" for 20d avg) + ^NSEI
      bse.py         # announcements + attachments (full browser headers)
      nse.py         # fallback: NSE-only listings (CDSL) and BSE errors
      screener.py    # symbol -> BSE code, doc links, quarterly table
      pdf.py         # page text with [p.N]; consolidated-page finder; page subset
    push/
      classify.py    # BSE category/subcategory + keyword rules; LLM only if ambiguous
      cards.py       # results card (+ one-off flag), mgmt-change card
      rank.py        # tier + reaction boost (vs Nifty) -> score + reason; price alerts
    pull/
      pvd.py         # cheap: guidance extract per transcript -> strong: verdicts
      research.py    # financial snapshot (no LLM), business snapshot, bull/bear
      jobs.py        # background job + stage text for live pull
    prompts/         # versioned .md; version is part of the cache key
    api.py           # POST /research/{symbol} -> job id; GET /jobs/{id}; /health
    ingest.py        # cron entrypoint -> JSON export
  backend/tests/fixtures/
  web/               # Next.js + Tailwind, static export, PWA manifest
  spikes/            # de-risk evidence
  .github/workflows/ingest.yml
  PLAN.md  DECISIONS.md  README.md
```

### llm.py (decided)
- **Provider-agnostic.** Each task maps to a `provider:model` string, set via env:
  - `FINN_CHEAP=gemini:gemini-3.5-flash-lite`: classify, extract_results, extract_guidance, extract_bio, business_snapshot
  - `FINN_STRONG=gemini:gemini-3.8-flash`: pvd_verdict, bull_bear
  - `FINN_FALLBACK=gemini:gemini-3.5-flash`
  - Per-task override: `FINN_TASK_<TASK>` (e.g. `FINN_TASK_PVD_VERDICT=anthropic:<model>`).
- Only the Gemini adapter is implemented. The interface is one function per provider: `(model, parts, schema) -> (json, tokens_in, tokens_out)`. The Anthropic adapter is **not** built unless PvD quality is shallow on Day 3.
- **Retry:** exponential backoff on 503 overloaded / 429, max 3 tries. Then fall back to `FINN_FALLBACK`, and the output carries `model_note: "Verdicts by fast model (quota)"`, which is shown in the UI.
- Cache keyed by (document hash, prompt version, task). Every call logs tokens, estimated cost, model and input path.

### Results extraction (decided; updated 12 Nov after measurement)
1. `pdf.py` finds the **consolidated results page(s)** from the text layer. Keywords like "consolidated" plus "profit before tax"/"interest earned" survive even garbled OCR. Falls back to standalone, labelled.
2. ~~Garble check → text path or PDF-page path.~~ **Always the PDF-page path:** send only those pages as a mini-PDF. Measured as both cheaper (~830 tokens vs 2.4–3.5k for text) and the only path accurate on scans. See the table in DECISIONS.md.
3. Log `path` per call (`pdf_pages`, or `full_pdf` if no page was found).
4. Schema adds `exceptional_items` per column. Python computes QoQ/YoY, EBITDA (= PBT + finance costs + D&A, other income not excluded, stated on card), NII (= interest earned − interest expended), and the one-off flag.

### Market-reaction ranking (decided)
- Reaction day = the filing date if filed before 15:30 IST, otherwise the next trading day. If no complete bar exists yet: "Reaction pending", no boost (yfinance posts NaN-close stub bars for 12+ hours).
- Boost applies to P1/P2 only; routine P3 never explains a move.
- Excess move = stock % − Nifty %. The boost triggers on |excess| ≥ X% or volume ≥ N× 20-day avg, using the same thresholds as alerts.
- Ingest ships the raw move %, Nifty % and volume ratio per filing. The rank function is ported to TS (~15 lines) so changing thresholds re-ranks client-side. One shared test-case table for both.

### PvD (unchanged from baseline)
Cheap model reads each transcript once → `{metric, target, period, quote, page}`. Python attaches actuals from screener's quarterly table. Strong model sees only that JSON → verdict hit / miss / partial / not-yet-measurable + citations. Transcript selection = the 4 latest **results** calls, not the last 4 rows.

---

## 3. Spike findings (11 Nov) — see `spikes/`
1. **BSE:** needs full browser headers (`Origin` + `sec-fetch-*`); no cookies. Works locally **and from Render (Singapore)**: tested 11 Nov.
2. **Classification:** HDFCBANK filed results under "Board Meeting / Outcome of Board Meeting", so a keyword rule on the subject ("financial results") is needed.
3. **Screener:** resolves any symbol (incl. renamed ETERNAL), transcripts are clean text, the quarterly table has 5 quarters. Banks lack an NII line (Python computes it). Concall lists include non-results calls.
4. **Gemini:** `gemini-3.5-flash-lite` extracted 25/25 checked numbers exactly (TCS clean text, HDFCBANK scanned with "O" for zero). No Pro model on a new free key. Occasional 503 overload (retry worked). The full PDF cost ~12k tokens in / 500 out.

---

## 3b. Status at end of Day 1 (11 Nov)

**Done**
- Skeleton (`backend/finn/`), pinned `requirements.txt`, `pytest.ini`.
- `llm.py`: task→model router, retry→fallback, disk cache keyed on prompt text, token/cost log (`cache/llm_calls.jsonl`).
- `sources/`: `bse.py`, `screener.py`, `prices.py`, `pdf.py`.
- Results extraction + card math (`push/cards.py`): PDF-page path only, after the token comparison (table in DECISIONS.md).
- Tests: 11 passing (page finder on 3 real filings, card math, price stats, 3 live extractions exact vs hand-read numbers).
- `api.py`: `/health`, `/health/bse`. GitHub repo pushed; Render live at https://finn-api-72tc.onrender.com.
- **Cloud-IP test passed:** `/health/bse` from Render returned live BSE rows. Live pull is viable as designed.
- LLM spend so far: ~$0.03 across 12 calls.

**Not done (carried to Day 2)**
- Classifier (rules + "financial results" keyword rule), mgmt-change card, `rank.py`, `db.py`, `ingest.py` + JSON export for 20 tickers.

**Open issues**
- Screener slug fallback: some NSE symbols may not match screener's URL slug. Add a search-API fallback if the 20-ticker ingest hits a 404.
- yfinance's last bar was 9 Nov when checked on 11 Nov (pre-market); confirm whether that is a holiday or a data lag before relying on reaction-day stats.
- Exceptional-items sign varies by model output; the card uses abs(). Revisit if a positive one-off (a gain) needs a different label.
- Render free tier cold starts (~30–60 s): mitigated by static JSON; live-pull UI must show staged loading text.

## 3c. Status at 12 Nov, early morning (Day 2 leftovers done)

**Done**
- PAT = owners' share when printed ("PAT (to owners)"), else total. LLM cache now keyed on source-PDF hash (it was missing on every run). NBFC prompt fix.
- `push/classify.py`: subcategory → subject/headline rules → cheap LLM on pages 1–2 only for generic subjects (1 of 52 filings in the 7-day run). 14 rule tests on real rows incl. results-under-Board-Meeting.
- `push/cards.py` mgmt card: profile from the filing, cited to its page, "Profile not in this filing; see …" otherwise. 3 real fixtures (HDFCBANK, TRENT, TATAPOWER).
- `push/rank.py`: +150 Nifty-relative boost for P1/P2, reason strings, "Reaction pending", price alerts. Shared case table `tests/rank_cases.json` (8 cases) for the TS port.
- `ingest.py`: all 20 tickers, 7-day window, ~3.5 min cold / seconds cached → `web/public/data/feed.json` + CLI digest. Last run: 22 shown, 30 routine hidden, 20 alerts, 0 failed tickers.
- Results-card gate + SEBI-title page scoring after a real BHARTIARTL miss (YoY shown as QoQ); fixture added. 42 tests pass.
- Sizing rules (rules only): litigation < ₹1 cr → P3; fund-raise P1 only for equity raises or non-lender debt ≥ ₹1,000 cr; lenders' NCD/CP and ESOP allotments → P3. 13 tests.
- Accuracy spot-check: TATAPOWER, ASIANPAINT, ETERNAL cards hand-read against the PDFs, 72/72 numbers exact. Found and fixed: EBITDA included TATAPOWER's ₹119 cr exceptional gain; it now starts from the pre-exceptional line, and one-offs are signed (gain/charge).
- 57 tests pass. Feed P1 count this week: 9.
- LLM spend to date: **$0.079 / 47 calls**.

**Findings that change the plan**
- yfinance lags: 11 Nov bars were NaN-close stubs at 03:30 on 12 Nov. → Cron runs **twice** (≈18:30 IST for filings, ≈08:30 IST next day to fill reactions); every run re-ranks the whole window.
- CDSL is NSE-only, so the NSE fallback is now part of the design, not an afterthought.

**Open issues**
- Sizing thresholds are flat (fine for this all-large-cap portfolio); market-cap-relative is the next step for small caps.
- Bios run past 35 words; UI clamps.

## 3d. Status at 12 Nov, ~06:00 (feed UI)
- `web/`: Next.js 16 static export. Brief (verdict line, 24h/7d/30d, ranked 2-line rows, routine collapse, badge), expandable results / bank / mgmt / other / failed rows, alerts inbox, settings (localStorage). Loading, load-failure, quiet-day and reaction-pending states built and checked at 390px.
- `rank()` in TS passes the shared case table (9 cases incl. a new half-even rounding case); period-label parser tested on 8 real formats. `npm test` in `web/`.
- Ingest re-run for 30 days: 297 filings, 16 results + 16 mgmt cards, 7 card failures (shown with raw link), 0 failed tickers. LLM spend to date: **$0.131 / 107 calls**.
- Dev on phone: `npx next dev -H <laptop Wi-Fi IP> -p 3000` from `web/`.
- Next: motion pass (separate skill), credibility chip after PvD, Vercel deploy (instructions first).

## 3e. Status at 12 Nov, ~07:30 (redesign after the phone review)
- **Why:** on the phone the feed read "as a notice board, not an app" (and Android force-darkened it). Impeccable critique of that build: 24/40.
- **Built (as built in DESIGN.md):** forced light scheme; company is the unit (lead item by priority, other filings fold behind "+N more", results docs fold into the results item, a folded P1 surfaces as "Also:"); "What matters" cards (sector-tinted monogram, human headline, Rev/PAT with YoY, reaction chip, 30-day sparkline with the filing day marked; capped at 6) and "Also worth a look" rows; one "prices are in up to…" banner instead of "Reaction pending" on every row; bottom tab bar (Brief / Alerts / Research placeholder / Settings); PWA manifest + icons; original FINN mark; verdicts ("Tata Power and Bajaj Finance need a look today." / "Results season: 18 of 20 reported."); alerts open the company's card in-app.
- **Ingest additions:** human ≤12-word titles for P1/P2 filings (cheap model on PDF pages 1–2, cached; results titles are built in the app from the card's numbers): 98 calls, $0.044. Screener sector + 30 days of closes per company.
- Re-critique after the redesign: 28/40; its P1s (folded CEO change, whole-card button) fixed, plus deep links, tie-breaks by move, 44px targets, wrap at 200% zoom.
- LLM spend to date: **$0.175 / 205 calls** (before PvD).
- **Not done:** motion pass; "6 moved" as a filter; Maruti's parent-company results still classified as P1 results (classifier).

## 3f. Status at 12 Nov, ~08:00 (PvD backend, §4a)
- `backend/finn/pull/pvd.py` + prompts `extract_guidance.md` (cheap) / `pvd_verdict.md` (strong); CLI `python -m finn.pull.pvd TCS HDFCBANK`; JSON in `web/public/data/research/{SYM}.json` (shape per §4a, plus `calls`, `score`, `transcript` per promise).
- Call selection: a call 1–2 months after a quarter end reports that quarter; others (TCS "Dec 2025" analyst day, HDFCBANK "Mar 2026") are dropped; duplicates per quarter keep the BSE copy (screener's TCS "Jul 2026" company-site link is the 2025 file). Actuals: screener's 13-quarter table, YoY/QoQ (pp for margins) computed in Python. Repeats of a target within one call are deduped.
- Results: **TCS** 5 promises, 1 hit (25%+ exit margin → 26% in Sep 2026), 4 not-yet-measurable (long-term 26–28% band, HyperVault capacity, operating-model staffing). **HDFCBANK** 3 promises (CASA, loan growth vs system, LDR 85–90% for FY27), all not-yet-measurable: FY27 hasn't ended and screener has no CASA/LDR rows.
- **Quality finding for Fri:** verdicts are honest but thin, because management guidance is mostly non-financial or annual, and screener's table can't measure bank KPIs. Options: actuals from our own extracted results cards + the next transcript's own "we delivered X" statements; or broaden to 6–8 calls. Strong model is often overloaded → fallback ran (labelled in the JSON).
- Tests: 6 PvD tests (selection, actuals math, dedupe, 2 transcript fixtures), 64 backend tests pass. PvD cost: $0.107 / 15 calls (~$0.05 per company). **LLM spend to date: $0.29 / ~222 calls.**

## 3g. Status at 12 Nov, ~10:15 (PvD rework, user decisions 1-4)
- Strong model is now Groq gpt-oss-120b (free; 1k req/day, 8k tokens/min) -> gemini-3.8-flash; each verdict labelled with its model.
- PvD verdicts computed in Python where a number exists (hit/miss for finished periods, on track/ahead/behind pace for running ones); the model judges only non-numeric promises. TCS: 2 of 3 measured (both behind pace). HDFCBANK: 3 of 3 not-yet-measurable because the CD ratio is never restated on calls; fix candidate = CD ratio from the results filing's balance sheet.
- Maruti parent-results misclassification fixed (rule + test). 82 backend tests pass.
- LLM spend to date: **$0.46 / 270 calls** (PvD all-time $0.27 / 40 calls, most of it re-extraction while prompts changed).

## 3h. Status at 12 Nov, evening (PvD review, user decisions 1-5)
- Bank CD ratio from the bank's own results filings (`pull/bank.py`, standalone balance sheet, Python ratio). HDFCBANK: FY26 90-96% **hit** (94.6%), FY27 85-90% **behind pace** (96.0%), each quarter cited to its filing page.
- No-deadline promises → direction of travel with the quarterly path (hit / moved closer / no change / moved away). One margin definition per company: management's reported margin if every call states it, else computed and labelled. Selection: financial first, dedupe across calls, max 6.
- Python guards after the first 22-ticker run showed wrong verdicts: segment / order / AUM targets never measured on company totals, cost targets are ceilings, model reasons may only cite numbers in the evidence, no model "miss" before the period ends, dead transcript links fall back to BSE (MARUTI 0 → 4 calls).
- 22 tickers (20 + ASTRAL, TITAN): 72 promises, 27 measured, 45 not-yet-measurable (mostly segment targets), 0 crashes; table in DECISIONS.md. 92 backend tests pass.
- **Open:** 62% not-yet-measurable. Next lever = segment actuals from the results filings' segment page. LLM spend to date **$2.40 / 496 calls** (list prices; free tiers).

## 3i. Status at 12 Nov, night (feed UI round 3: logo, hierarchy, density, motion)
- **Logo:** converging green rays + serif FINN lockup; 4-ray app icon/favicon, maskable and monochrome icons, all generated from `web/scripts/logo.mjs` (PNGs via `icons.mjs` + local Chrome). Green only in the logo; manifest name "FINN · Investment agent".
- **Cards ~half height:** headline > company > "TICKER · event · time"; Rev/PAT beside a 30-day sparkline with Nifty rebased (faint) and a hollow marker while the reaction is pending; one "Also" line per P1 (full rows inside the opened card); fold = P2/P3 only; compact and filing rows wrap headlines to 2 lines.
- **New data:** fund-raise size (₹ cr) + dilution % (model copies figures, Python converts/divides; Persistent QIP ₹4,265 cr, 4.63%); credibility chip "Promises: Kept · Missed · Open" from cached PvD (8 companies); Nifty closes in the feed. TATAPOWER headline now exact (CEO Designate now; CEO & MD from 1 May 2027), fixed in the prompts.
- **Motion** (emil-design-eng not installed; done to its rules): one ease-out curve, ≤250ms, expand/collapse, press, tab crossfade (`<ViewTransition>`), sparkline draw once, badge pop; reduced motion verified off.
- **Critique 26/40** (24 before); P0/P1s fixed, two kept by the user's rule (see DECISIONS.md). 96 backend + 11 web tests pass. LLM spend to date **$2.54 / 658 calls** (this round $0.14).
- **Open:** ingest overwrites a good feed when the network drops (seen tonight, 8 tickers lost; re-run fixed it); Also stacks on busy companies; chip at 1 measured promise; classifier still files some results/revenue updates as mgmt change or M&A (Dixon, KPIT).

## 4. Day-by-day

**Wed 11 (done):** repo init, spikes, decisions. Session export.

**Thu 12 (re-planned 12 Nov, early morning; confirmed by the user)**
- ~~Classifier, mgmt card, rank, ingest for 20 tickers, sizing rules, results spot-check~~ done (see §3c).
- **Morning, separate session, user asleep: PvD backend** (see §4a). Runs headless; ends with a commit + push and a summary in §3c.
- **Feed UI** (this track; impeccable skill, 390px first): Next.js static export reading `feed.json`. Ranked digest with reaction reasons + "Reaction pending", sizing notes, results card (+ signed one-off flag; chip slot empty until PvD), mgmt card, quiet-day state, P3 collapse, alert inbox + badge, settings (alert categories, N×, ±X% in localStorage). TS port of `rank()` passing `rank_cases.json`.
- **Deploy step 3 (Vercel):** stop and give click-by-click instructions first.
- Evening: re-run ingest; confirm the 11 Nov "Reaction pending" items resolve once yfinance fills the bar (evidence for the writeup).

**Fri 13: PvD quality + research content**
- Review the PvD session's output on TCS + HDFCBANK; judge verdict quality; switch PvD/bull-bear to Claude only if shallow.
- Credibility chip on results cards (Python, from cached PvD). Financial snapshot (no LLM). Bull/bear (3 each, cited). Research page UI (impeccable).

**Sat 14: live pull + hardening**
- `api.py`: POST /research/{symbol} → job id; GET /jobs/{id} with stage text. Precompute 4 research tickers (TCS, HDFCBANK + 2 outside the portfolio).
- Graceful-failure pass across feed + research. GH Actions cron (2 runs/day) + secret: deploy step 4, with instructions first.
- Business snapshot only if time (first cut). Real-phone test, unseen-ticker test, cost total into DECISIONS.md.

### 4a. Handoff for the PvD backend session (12 Nov morning)
Read CLAUDE.md, this file's §1/§2 "PvD" and DECISIONS.md first. Scope: **backend only**. No UI code under `web/`; writing data files to `web/public/data/research/` is expected.
- **Build:** `backend/finn/pull/pvd.py` + prompts `extract_guidance.md`, `pvd_verdict.md`; CLI `python -m finn.pull.pvd SYMBOL` printing the promise table; tests in `backend/tests/test_pvd.py` with 2 saved transcript fixtures.
- **Reuse, don't rebuild:** `llm.run(task, prompt, inputs, schema, key=...)` (tasks `extract_guidance` = cheap, `pvd_verdict` = strong are already routed; pass `key=` = source hash when inputs are derived bytes). `screener.company(sym)` → `concalls` (period, transcript URL) and `quarters` (₹ cr, oldest first). `fetch(url, expect=b"%PDF")` for transcripts. `pdf.pages()` for text with page numbers.
- **Rules:** select the 4 latest *results* calls (skip non-results calls such as HDFCBANK "Mar 2026"). Every promise carries transcript + page. Actuals come from screener's quarterly table, cited as such; Python computes growth, the LLM never does arithmetic. Verdicts: hit / miss / partial / not-yet-measurable. Missing facts → "not disclosed".
- **Don't touch** `push/`, `ingest.py`, `rank.py` (the UI track depends on their output shape). Output JSON shape for the UI: `{symbol, model_note, promises: [{metric, target, period, said_in, quote, page, actual, actual_source, verdict, why}]}`; also export `web/public/data/research/{SYMBOL}.json`.
- **Done when:** TCS and HDFCBANK print sensible tables, tests pass, cost logged; then commit + push and add a 5-line status to §3c. Stop there; no UI.

**Sun 15:** writeup, build-history export, submit.

---

## 5. Working rules (from the user)
- Stop before every GitHub / Render / Vercel step and give click-by-click instructions for the user's parts.
- Explain each new package install or network command in 1–2 lines the first time.
- The UI uses the **impeccable** skill, and only from the UI phase onwards.
- Log every cut/trade-off in DECISIONS.md. Small commits, **no AI attribution lines** in commits/PRs.
- At the end of each session, remind the user to `/export` into `build-history/`.
- At the end of each day, re-plan the next day from actual progress.
- The API key lives only in `.env` (gitignored). Never in chat or commits.

## 6. Verification
- `pytest`: results extraction on 3 fixtures (incl. scanned bank PDF), with checked numbers; rank cases (no reaction / volume boost / excess-move boost / bar not yet available / big raw move but flat vs Nifty); one-off flag.
- Log comparison: tokens per results filing for the text path vs the PDF-page path, against the 12k full-PDF baseline.
- Ingest covers all 20 tickers; every failed item has a raw link.
- On a phone: feed < 2s; quiet window shows the confident state; results card shows the reaction reason + one-off flag + credibility chip; an unseen ticker completes or fails gracefully.
