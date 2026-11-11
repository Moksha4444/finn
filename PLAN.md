# FINN — build plan (11–15 Nov 2026)

Single source of truth for the build. Scope and hard rules live in `CLAUDE.md`; trade-offs are logged in `DECISIONS.md`.
Status at time of writing (11 Nov): repo initialised, 3 de-risk spikes passed (`spikes/`). No module code yet.

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

Static-first: ingest writes SQLite and exports JSON into `web/public/data/` (committed). The feed and demo research pages load instantly with no backend. Render serves only live pull for unseen tickers. No Supabase.

```
finn/
  backend/finn/
    config.py        # portfolio, tier map, default thresholds
    llm.py           # provider-agnostic router, retry/fallback, cache, cost log
    db.py
    sources/
      prices.py      # yfinance EOD (period="2mo" for 20d avg) + ^NSEI
      bse.py         # announcements + attachments (full browser headers)
      screener.py    # symbol -> BSE code, doc links, quarterly table
      pdf.py         # page text with [p.N]; consolidated-page finder; page subset
    push/
      classify.py    # BSE category/subcategory + keyword rules; LLM only if ambiguous
      cards.py       # results card (+ one-off flag), mgmt-change card
      rank.py        # tier + category + reaction boost (vs Nifty) -> score + reason
      alerts.py
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
- Reaction day = the filing date if filed before 15:30 IST, otherwise the next trading day. If no bar exists yet, there's no boost (and no fake one).
- Excess move = stock % − Nifty %. The boost triggers on |excess| ≥ X% or volume ≥ N× 20-day avg, using the same thresholds as alerts.
- Ingest ships the raw move %, Nifty % and volume ratio per filing. The rank function is ported to TS (~15 lines) so changing thresholds re-ranks client-side. One shared test-case table for both.

### PvD (unchanged from baseline)
Cheap model reads each transcript once → `{metric, target, period, quote, page}`. Python attaches actuals from screener's quarterly table. Strong model sees only that JSON → verdict hit / miss / partial / not-yet-measurable + citations. Transcript selection = the 4 latest **results** calls, not the last 4 rows.

---

## 3. Spike findings (11 Nov) — see `spikes/`
1. **BSE:** needs full browser headers (`Origin` + `sec-fetch-*`); no cookies. Works locally; **cloud IP untested**.
2. **Classification:** HDFCBANK filed results under "Board Meeting / Outcome of Board Meeting", so a keyword rule on the subject ("financial results") is needed.
3. **Screener:** resolves any symbol (incl. renamed ETERNAL), transcripts are clean text, the quarterly table has 5 quarters. Banks lack an NII line (Python computes it). Concall lists include non-results calls.
4. **Gemini:** `gemini-3.5-flash-lite` extracted 25/25 checked numbers exactly (TCS clean text, HDFCBANK scanned with "O" for zero). No Pro model on a new free key. Occasional 503 overload (retry worked). The full PDF cost ~12k tokens in / 500 out.

---

## 4. Day-by-day

**Wed 11 (done):** repo init, spikes, decisions. Session export.

**Thu 12**
- `llm.py` (router, retry/fallback, cache, cost log); `sources/` (prices + Nifty, bse, screener, pdf).
- Classifier (rules first + keyword rule for results-under-board-meeting); results card (text/PDF-page paths, bank branch, one-off flag); mgmt-change card; `rank.py`; fixture tests on 3 real filings (TCS, HDFCBANK, + 1).
- **Deploy step 1 (GitHub) + step 2 (Render hello-world)**: stop and give step-by-step instructions first. Then re-run spike 1 from Render to test the cloud IP.
- `ingest.py` → push JSON for all 20 tickers.
- Re-plan the rest of the day from actual progress.

**Fri 13**
- Morning: **impeccable** skill → feed UI at 390px (digest, reaction reasons, quiet-day state, alert inbox, settings). Deploy step 3 (Vercel), with instructions.
- PvD end to end → **credibility chip** → financial snapshot → bull/bear. Judge PvD quality; switch PvD/bull-bear to Claude only if shallow.

**Sat 14**
- Live pull (job + polling + stages); research page UI (impeccable); precompute 4 research tickers (TCS, HDFCBANK + 2 outside portfolio).
- Graceful-failure pass; business snapshot if time; GH Actions cron + secret (deploy step 4, with instructions).
- Real-phone test, unseen-ticker test, cost total into DECISIONS.md.

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
