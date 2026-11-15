# REDESIGN.md — FINN visual overhaul (single pass, self-verified)

**Problem:** the current UI reads as generic AI output: identical rounded cards, pastel monogram tiles, outlined pill chips, underlined links, airy grey body text, inconsistent chart placement, no motion, low density. The data and logic are strong; the presentation is not.

**This is a PRESENTATION change only.** Every number, rule, verdict, citation, honest state and failure message stays exactly as it is. The consistency gate must still report 0 problems and all tests must pass.

**Critical process rule — minimise round trips.** The user has very limited remaining budget. Do NOT come back after each small step. Work through Phases A→D, and before reporting back run the **self-review loop** (below) at least **three full cycles**, fixing everything you find. Only then report once, with the preview URL.

**Self-review loop (repeat ≥3×):**
1. Screenshot every screen at 390×844 (and 430×932): Brief Today/7d/30d, an expanded story, Alerts, Research list, a company page (ASIANPAINT and LT), live-research intro + progress + not-found, Settings, splash.
2. Look at the screenshots yourself. Run the impeccable critique. Check this list: alignment of every chart and number · consistent spacing scale · no clipped or overflowing text · no element touching a screen edge · tap targets ≥44px · contrast ≥4.5:1 · identical components look identical everywhere.
3. Fix everything found. Re-screenshot. Repeat.
Report the before/after impeccable scores.

---

## 0. Safety

Work in a git worktree on branch `redesign`; `main` stays deployable. Push the branch so Vercel builds a preview, and report that preview URL. A bull/bear regeneration may be running on main: do not touch `web/public/data` or `cache/`.

---

## 1. Global design system (fix this first, then apply everywhere)

Create `web/app/tokens.css` (or the Tailwind theme) as the single source of truth. **No hard-coded colours, sizes or spacings anywhere else.** Every screen uses these tokens; that alone removes most of the "AI-generated" feel.

**Kill list — remove entirely:**
- Rounded bordered boxes as the default container
- Pastel monogram tiles (TP, IR, BF squares)
- Outlined pill chips
- Underlined company names
- Large airy grey body text
- Chevrons on every row

**Palette (newsprint, not pastel):**
- `--paper: #F7F4EC` · `--paper-raised: #FFFDF8` · `--ink: #16161A` · `--ink-2: #46464C` · `--ink-3: #7A7A82`
- `--rule: #D9D4C7` (hairline) · `--rule-strong: #16161A` (section rules)
- `--accent: #1F3A8A` (ink blue — links, active states, filing-day markers)
- `--up: #16653F` · `--down: #A01F2E` — **numbers only**, never backgrounds
- Sector tint, used only as a 3px left edge on a lead story: muted, desaturated; never as a filled tile.

**Type (self-host via next/font):**
- Headlines + wordmark: a newspaper serif with real character — **Newsreader** (or Source Serif 4). Weight 600–700, leading 1.05–1.15, letter-spacing −0.01em.
- Kickers: sans, **uppercase, 11px, letter-spacing 0.12em**, `--ink-3` → `RESULTS · TATA POWER`.
- Body/UI: Inter or Source Sans 3, 14–15px, `--ink-2`, leading 1.45.
- **All numbers and tickers: a mono with tabular figures** (IBM Plex Mono / JetBrains Mono). Every figure in the app aligns on its decimal.
- Scale, fixed: 34/26/20/17/15/13/11.

**Spacing:** 4-point scale only (4/8/12/16/24/32/48). Screen padding 16px. Section gap 32px. Row gap 12px.

**Structure:** sections separated by **rules**, not boxes. `--rule-strong` 1.5px under section heads; `--rule` hairline between rows. A raised surface (`--paper-raised` + a single hairline, radius 4px max) is used **only** for the lead story and the expanded story.

**Identity:** a company is its **ticker in mono uppercase** plus its name in serif. No tiles.

**Signals as typeset text, not chips:** `▲ 3.2% vs Nifty · 3.7× vol` in mono, coloured on the number only.

---

## 2. Charts — one component family, one alignment rule

Chart placement is currently inconsistent (right of the box in some places, below-left in others). Fix with one rule and one set of components in `web/components/charts/`:

- **Sparkline** (stock vs Nifty): fixed box **120×36**, always **right-aligned on the same baseline as the numbers row**, with its label directly beneath, right-aligned. Never below-left, never full width.
- **Promise chart:** full content width, fixed height 96px, shaded target band, dots per quarter, points after the deadline at 30% opacity, y-axis padded so the band is never drawn through the dots.
- **Bars** (revenue/PAT): full width, height 88px, bars in `--ink-3`, the latest two in `--ink`. No multicolour palettes. Values labelled above the first and last bar only.
- **Line** (margin): same geometry as bars; label the first and last point only.
- **Paired bars** (CFO vs PAT): CFO `--ink`, PAT `--ink-3`, labelled directly, no legend.
- Every chart: left edge flush with the text column, no inner padding mismatch, consistent 8px gap to its caption. Axis labels 11px `--ink-3`.

---

## 3. Motion (emil-design-eng) — make it feel alive, never slow

All ≤250ms, ease-out for enter, ease-in for exit, `prefers-reduced-motion` respected, GPU-friendly properties only (transform/opacity).

1. **Splash, 700ms max:** paper background, the rays mark draws in (stroke-dashoffset), the wordmark fades up, then the whole thing fades out into the Brief. Shown on app launch only (not on tab changes); skipped if the app was opened in the last 5 minutes.
2. **Brief entrance:** masthead, then market strip, then stories fade-and-rise 8px, staggered 40ms, total under 400ms. Once per session.
3. **Story expand/collapse:** animated height + content fade, 220ms, with the chevron rotating.
4. **Press feedback:** every tappable row/button scales to 0.985 and darkens slightly for 90ms.
5. **Market strip:** drifts 24px into place on load; smooth momentum scrolling.
6. **Sparkline and promise charts:** draw in once when first visible (stroke-dashoffset, 400ms).
7. **Report-card stamp:** scales from 1.06 with a slight rotate-to-0 settle, 180ms, on first view.
8. **Tab change:** 120ms crossfade; the active tab icon does a small spring.
9. **Live research:** each completed stage ticks in; the current stage has a quiet pulsing dot; the finished page fades in.
10. **Number changes** (threshold edits): brief count-up on the affected figures.

---

## 4. Phase A — the Brief as a portfolio front page

1. **Masthead:** rays mark + FINN in the serif, centred, with `--rule-strong` beneath. Edition line in mono 11px: `SUN 15 NOV 2026 · PORTFOLIO EDITION · 20 COMPANIES · PRICES TO 13 NOV`. This replaces the separate price banner.
2. **Market strip:** horizontally scrolling, all 20 tickers, mono: ticker above, move vs Nifty below, coloured on the number. Height ~44px, hairline above and below. Tapping a ticker opens its company page.
3. **Edition switch:** `TODAY · THIS WEEK · THIS MONTH` as typeset small-caps tabs with an underline on the active one. Not a pill group.
4. **Verdict banner:** the existing headline in 34px serif ("3 companies need a look this week."), with the counts line beneath in 13px.
5. **Lead story** (top-ranked item): sector tint edge, kicker, 26px headline, one-line deck (*why it matters*), numbers row (mono) with the sparkline right-aligned beside it, report-card stamp, reaction line, "Also ·" lines, expand control.
6. **Secondary stories:** kicker, 20px headline, one numbers line + sparkline, separated by hairlines. No boxes.
7. **"IN BRIEF":** P2 items, one dense line each (kicker · headline · date).
8. **"NOTICES":** routine filings collapsed — `24 ROUTINE NOTICES · SHOW`.
9. **About this edition:** one slim line under the masthead with a "how it works" link; the full three lines live in Settings. Replaces the big onboarding card.
10. Expanded story keeps the full results table, one-off notes, EBITDA definition, "Why it's here", source link — restyled to the system.

---

## 5. Phase B — Research as report cards

1. **Index:** rows of `TICKER` (mono) · name (serif) · grade stamp · kept/missed/open in mono. Grouped: *Track record* / *Nothing measurable yet* / *No promises found*. Hairlines, no boxes, no tiles.
2. **Search box:** full width, 48px tall, 1px `--rule` border, 2px `--accent` on focus; the size must not change on focus (fix the current jump). Placeholder `Any NSE symbol or name`. When nothing matches, say "No researched company matches" — never "0 of 22 researched".
3. **Company page:**
   - Header: `TICKER` mono · name in 26px serif · sector · 90-day line vs Nifty (full width, 120px).
   - **Overall grade stamp** from measured promises only (define the mapping in DECISIONS.md; "Not graded — too few measured" below 2).
   - **Promise rows:** verdict mark in the left margin, quote, citation, promise chart, actual line. Kept vs missed differ in weight and mark, not colour alone.
   - **Statistics** section: the four charts, each directly under the one-line claim it supports.
   - **The case for / The case against:** two stacked blocks with a centre rule and small-caps heads; each point = bold claim clause + plain "why"; citation in 11px `--ink-3`.
   - Sources list, mono dates.
4. **Alerts as a wire:** `13 NOV` dateline rules; one row per company per day; `TICKER` mono + name + signal text; extreme values in heavier type; small spikes folded.
5. **Live research:** intro styled as a dateline note; stages as a checklist with ticks and a pulsing current stage; all existing failure states restyled.
6. **Settings:** typeset form, mono numeric inputs, full "How FINN works" at the bottom.

---

## 6. Phase C — self-review loop

Run the loop described at the top, at least 3 full cycles. Specifically verify:
- Every sparkline sits in the same position relative to its numbers, on every card type.
- No chart is left-aligned on one screen and right-aligned on another.
- Numbers align on their decimals in every table and row.
- Nothing clipped at 390px; nothing touching the edges; bottom bar never overlaps content.
- Splash shows once and never blocks longer than 700ms.
- Reduced motion disables all animation.

## 7. Phase D — finish

- PWA icons and splash regenerated with the mark; `theme-color` = paper.
- Update DESIGN.md ("as built") and PLAN.md status.
- Run the consistency gate (0 problems) and all tests.
- Commit and push the branch; report the Vercel preview URL, the impeccable before/after scores, and anything deliberately left undone.
