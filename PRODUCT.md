# PRODUCT.md — FINN

## Who it's for
A portfolio manager at a lean, high-conviction public-markets fund. Holds 15–20 NSE/BSE names. Checks the phone first thing in the morning, between meetings and after market close. Financially fluent, time-poor, allergic to noise.

## The job
1. **"What changed in my portfolio, and does any of it matter?"** Answered in under 30 seconds.
2. **"Can I trust this management team?"** Do they deliver what they promise on concalls? (Promised vs Delivered, credibility chip.)

## Product principles
- **Filtering over aggregation.** The scarce skill is hiding things. Most filings are routine and stay collapsed.
- **Every ranking explains itself.** Each item says *why* it's ranked where it is ("results + 2.3× volume", "−4.1% (−3.6% vs Nifty)").
- **A quiet day is a feature.** "Nothing material today. 14 routine filings hidden." is a confident, designed state, not an empty state.
- **Numbers are traceable.** Every figure links to its source filing and page. Missing data says "not disclosed", never a guess.
- **Honest about uncertainty.** "Reaction pending" when price data hasn't arrived. "Verdicts by fast model (quota)" when the strong model was unavailable.
- **Terse analyst voice.** Numbers-first, like a colleague's note: "Rev +4.1% QoQ · PAT −2% YoY · prev Q had ₹668 cr one-off." Plain-English explanation on tap, never by default.

## Surfaces (mobile-first, 390px)
1. **Brief (home):** date, one-line summary ("3 things matter today · 14 routine hidden"), window picker (24h / 7d / 30d), one ranked feed, routine filings collapsed at the bottom, alert badge.
2. **Item detail (tap to expand):**
   - Results: Revenue, EBITDA, PBT, PAT (to owners) × this Q / QoQ % / YoY %, one-off note, source link with page, credibility chip ("Mgmt delivered 3/5 · last 4Q") once available.
   - Management change: incoming person, role, short bio (clamped), source page, or "Profile not in this filing".
   - Other: one-line summary + filing link.
3. **Alerts inbox:** price/volume threshold crossings + material filings in chosen categories.
4. **Settings:** volume N×, price ±X%, alert categories (toggles). Stored locally.
5. **Research (Day 3–4):** per-ticker page: Promised vs Delivered, snapshot, bull/bear.

## Non-goals
Charts for their own sake, chat, voice, login, news, social features, a landing page.
