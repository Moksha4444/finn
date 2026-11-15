---
name: FINN
description: A morning portfolio brief for NSE holdings, typeset as a newspaper front page.
colors:
  paper: "#F7F4EC"
  paper-raised: "#FFFDF8"
  press: "#EFEBE0"
  ink: "#16161A"
  ink-2: "#46464C"
  ink-3: "#67676F"
  rule: "#D9D4C7"
  rule-strong: "#16161A"
  accent: "#1F3A8A"
  up: "#16653F"
  down: "#A01F2E"
typography:
  display: { fontFamily: "Newsreader", fontSize: "34px", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.01em" }
  h1: { fontFamily: "Newsreader", fontSize: "26px", fontWeight: 600, lineHeight: 1.1 }
  h2: { fontFamily: "Newsreader", fontSize: "20px", fontWeight: 600, lineHeight: 1.15 }
  h3: { fontFamily: "Newsreader", fontSize: "17px", fontWeight: 600 }
  body: { fontFamily: "Source Sans 3", fontSize: "15px", fontWeight: 400, lineHeight: 1.45 }
  meta: { fontFamily: "Source Sans 3", fontSize: "13px" }
  kicker: { fontFamily: "Source Sans 3", fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em", textTransform: uppercase }
  figures: { fontFamily: "IBM Plex Mono", fontVariant: "tabular-nums" }
rounded:
  raised: "4px"
spacing: { scale: "4/8/12/16/24/32/48", page-x: "16px", section: "32px", row: "12px", tap: "44px" }
motion:
  ease-enter: "cubic-bezier(0.23, 1, 0.32, 1)"
  ease-exit: "cubic-bezier(0.55, 0, 1, 0.45)"
  press: "90ms"
  expand: "220ms"
  tab-crossfade: "120ms"
  entrance: "240ms + 40ms stagger, once per session"
  chart-draw: "400ms, once, on first view"
  stamp: "180ms"
  splash: "700ms, launch only"
---

# Design System: FINN (as built, redesign of 15 Nov 2026)

## Overview
A portfolio front page, not a dashboard. Newsprint paper, near-black ink, one ink-blue accent. Sections are separated by
**rules, not boxes**. Typography does the work: a newspaper serif for what happened, a quiet sans for the explanation,
a mono with tabular figures for every number and ticker, so figures align on their decimals everywhere.

Source of truth: `web/app/tokens.css` (values) mapped into Tailwind in `web/app/globals.css`. Tailwind's default
palette is switched off (`--color-*: initial`), so a colour outside the tokens cannot be written.

## Colour rules
- Green/red (`up`/`down`) colour **numbers only**, never backgrounds or icons.
- `accent` is for links, active states and filing-day markers on sparklines.
- `ink-3` is darker than the brief's #7A7A82 (3.87:1 failed AA); #67676F is 5.1:1 on paper, 4.7:1 on the press tint.
- Sector tint is derived from the sector name (never per ticker) and appears only as the lead story's 3px left edge.
- Logo greens live only in the rays mark.

## Type rules
- Fixed scale 34/26/20/17/15/13/11 (`text-34` … `text-11` utilities). Nothing else.
- Kickers (`.kicker`): 11px uppercase sans, 0.12em tracking, `ink-3`: `RESULTS · TATA POWER`.
- Section heads (`.section-head`): 11px small caps over a 1.5px `rule-strong`.
- Mono: figures, tickers, dates in tables and signal lines. Headlines keep serif numerals ("Profit up 48.6% YoY").

## Structure
- Screen padding 16px; section gap 32px; row gap 12px; all spacing on the 4-point scale.
- Hairline `rule` between rows; `rule-strong` under section heads and the masthead.
- A raised surface (`paper-raised`, one hairline, radius 4px) is used only for the lead story.
- Identity: ticker in mono plus name; no monogram tiles, no underlined company names, no chips.
- Signals are typeset text: `12 NOV · ▲ 3.2% vs Nifty · 3.7× vol`, colour on the number only.

## Components
- **Masthead** (Brief only): rays + FINN 34px serif, edition line in mono 11px between strong rules
  (`SUN 15 NOV 2026 · PORTFOLIO EDITION · 20 COMPANIES · PRICES TO 13 NOV`), one slim "How it works" line.
  Other screens get a slim centred wordmark bar.
- **Market strip**: every holding's latest day vs Nifty, mono, horizontally scrolling, 44px, hairlines above and below;
  a ticker opens its research page.
- **Edition switch**: TODAY · THIS WEEK · THIS MONTH, uppercase tabs with a 2px accent underline on the active one.
- **Story** (`components/Company.tsx`): kicker (event · name · date), serif headline (26px lead / 20px secondary), numbers
  row in mono with the sparkline right-aligned on its baseline, reaction line, report-card stamp (results only),
  "Also" lines. The lead is raised with the sector edge, a deck (the filing's one-off, if any) and a "Full story" control.
- **In brief**: one dense line per company: ticker column, kicker, headline, reaction.
- **Notices**: routine filings behind one `22 ROUTINE NOTICES · SHOW` row.
- **Grade stamp**: a 1.5px ink square with a serif letter (A–D) or "–" when not graded. Mapping in DECISIONS.md.
- **Promise row**: verdict mark in the left margin (heavy tick kept, heavy cross missed, dash otherwise), verdict as a
  kicker (bold when missed), serif metric, quote, mono citation, promise chart, "Actual" line.
- **Bull/bear**: "The case for" / "The case against" heads centred between hairlines; bold claim + plain why; mono citation.
- **Alerts wire**: mono dateline over a strong rule; ticker column + serif name; signals in mono, event names as kickers.
- **Buttons**: one style, 44px, 1px ink border, radius 4px. Links: accent, semibold, no underline.

## Charts (`web/components/charts/Charts.tsx`)
- One family, one alignment rule: left edge flush with the text column; labels 11px mono `ink-3`.
- Sparkline: always 120×36, right-aligned on the numbers row's baseline, label hanging beneath, right-aligned.
- Promise chart: full width, 96px, shaded target band to the deadline, padded so the band never runs through a label.
- Bars: 88px; single series `ink-3`, latest two `ink`; values on the first and last only. Paired (CFO vs PAT): ink vs ink-3, labelled directly.
- Margin line: 88px, first and last labelled. 90-day price line: full width, 120px.

## Motion
All transform/opacity/clip-path, ≤250ms except the 400ms chart draw; everything off under `prefers-reduced-motion`.
Splash (launch only, skipped if opened in the last 5 min, CSS only, 700ms) · Brief entrance once per session (40ms
stagger) · expand/collapse 220ms with rotating chevron · press 0.985 scale + press tint for 90ms (`.press`) · market strip
drifts 24px in · charts draw once on first view · grade stamp settles from 1.06 + rotate · 120ms tab crossfade + icon spring ·
live research ticks and a pulsing current step · alert counts count up when thresholds change.
