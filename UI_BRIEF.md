# UI_BRIEF.md: FINN UI master brief (rounds for Sat evening → Sun noon)

Read with PRODUCT.md and DESIGN.md. Use the **impeccable** skill for layout/hierarchy and **emil-design-eng** for motion. Mobile-first at 390px. Backend is frozen: no new data features, only UI and bug fixes the UI exposes.

**Goal of these rounds:** a reviewer opening the link cold should, within 30 seconds, understand what FINN does, trust the numbers, and feel it's a real app, not a generated template.

---

## Round 1: the reviewer's first 5 minutes (P0)

### 1. First-visit "How FINN works" card
- Shown once at the top of the Brief (dismissable; remembered locally). Three short lines, no paragraphs:
  1. **Filter:** every filing across your portfolio; routine paperwork hidden.
  2. **Rank:** what matters first, and why (incl. the market's reaction vs Nifty).
  3. **Verify:** did management deliver what they promised? Tap any company.
- Also reachable later from Settings → "How FINN works".

### 2. Live research flow (any NSE symbol)
- Search → unresearched symbol → **"Research this company"** button with one line on what happens and roughly how long.
- Progress view: the backend's stages as a calm vertical checklist (done ✓ / current / pending), elapsed time, and "Waking up the research server…" for cold starts. No spinners-only.
- Result lands on the normal company page. Partial results (e.g. snapshot without PvD) show clearly *what* is missing and *why*.
- Failure states: unknown symbol, no transcripts, daily cap reached. Each with a plain sentence and what the user can still do.

### 3. Alerts screen redesign (currently the noisiest screen)
- Top line like the Brief: a verdict, e.g. "2 alerts need a look today."
- Default window 7 days. Within each day, **sort by severity** (largest move vs Nifty / largest volume multiple first).
- **One row per company per day:** merge price, volume and filing alerts into one row ("Tata Power · −3.3% vs Nifty · 2.3× vol · Results").
- **Collapse volume-only alerts under 3×** into "+N smaller volume spikes".
- Extreme values stand out (e.g. 24× volume): stronger type weight, not a new colour.
- Every row taps through: filing alerts to the feed item, company rows to the company page.

### 4. Desktop visit
- Reviewers may open the link on a laptop. Keep the centred mobile column, and on wide screens add a small side note: "FINN is built for your phone", with a **QR code** to the same URL.

---

## Round 2: the hero surface and the feed (P0/P1)

### 5. Research company page
- Verify every PvD mini-chart: target band at the right height, nothing plotted after the deadline (or clearly greyed), axis labels readable.
- **Verdict badges:** one consistent system across Hit / Ahead / On track / Behind pace / Missed / Moved away / Not measurable. Keep black-and-white if preferred, but differentiate by fill/outline/weight so good vs bad reads at a glance.
- Promise rows: tighter vertical rhythm; "How it was measured" stays collapsed; quote max 2 lines with expand.
- Bull vs bear: two clearly labelled blocks with a thin rule; each point = claim (bold first clause) + why it matters; citation small and quiet. Model name as a subtle footnote.
- Financial snapshot: each chart directly under its one-line claim (keep); make bar labels legible at 390px; consistent chart heights.

### 6. Research list
- Group: "Track record available" → "Nothing measurable yet" → "No promises found". Within the first group, a tiny inline bar for kept / missed / open.

### 7. Feed cards
- Final hierarchy check: headline > company > meta. "Also" lines: one line each, clean truncation, readable.
- Stale data label ("Couldn't refresh TCS. Showing filings as of…"): quiet but visible.
- Quiet-day and "Reaction pending" states: check copy and spacing.
- The credibility chip opens the company page at the PvD section.

---

## Round 3: polish (P1/P2)

### 8. Motion (emil-design-eng)
Expand/collapse height, press feedback, tab crossfade, chart draw-in once, alert badge pop, **live-research stage transitions**. ≤250ms, ease-out, respects reduced motion.

### 9. App install
Icons (all sizes), splash showing "FINN · Investment agent", `theme-color`, standalone display. Test **"Add to Home screen"** on a real Android phone via the Vercel HTTPS link.

### 10. Accessibility and consistency
Tap targets ≥44px, WCAG AA contrast, visible focus states, consistent empty/loading/error states across all tabs.

### 11. Microcopy pass
Terse analyst voice everywhere. Remove filler ("may affect valuation"), always show currency on amounts, use consistent number formats (₹ cr, %, pp, ×).

### 12. If time: logo colours
Revisit the graphite + signal-blue variant (signal ray `#2643A6`) vs. the current greens.

---

## Process for each round
1. Build, then run the impeccable critique at 390px and fix what it finds.
2. Commit + push (Vercel redeploys automatically).
3. Stop with a summary + list of changed screens, so Moksha can check on the phone via the Vercel link.

## Done means
- A cold visitor understands FINN from the Brief alone.
- Live research works on an unseen ticker from the deployed link, or fails gracefully.
- No screen looks like a flat list of raw exchange text.
- Installed on the phone, it opens full-screen with the FINN icon.
