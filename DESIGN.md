---
name: FINN
description: A morning portfolio brief for NSE holdings, ranked by what matters.
colors:
  paper: "oklch(97.6% 0.009 84)"
  paper-2: "oklch(94.6% 0.011 82)"
  card: "oklch(99.3% 0.004 85)"
  ink: "oklch(22% 0.012 60)"
  ink-2: "oklch(46% 0.014 62)"
  rule: "oklch(87.5% 0.012 78)"
  accent: "oklch(37% 0.1 258)"
  gain: "oklch(45% 0.1 152)"
  loss: "oklch(47% 0.135 27)"
typography:
  display:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1.1875rem"
    fontWeight: 600
  title:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
  meta:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "\"tnum\" 1"
rounded:
  hairline: "2px"
  md: "0.375rem"
  lg: "0.5rem"
  avatar: "0.5rem"
  card: "0.75rem"
  full: "9999px"
spacing:
  page-x: "20px"
  card-x: "16px"
  row-y: "12px"
  section: "24px"
  tap: "44px"
components:
  company-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "12px 16px 14px"
  company-row:
    backgroundColor: "{colors.paper}"
    padding: "12px 0"
  reaction-chip:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
  window-control:
    backgroundColor: "{colors.paper-2}"
    rounded: "{rounded.lg}"
    height: "44px"
  window-control-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
  button-secondary:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  pending-banner:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  tab-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    height: "56px"
  tab-bar-active:
    textColor: "{colors.accent}"
  alert-badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
  credibility-chip:
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
motion:
  ease-out: "cubic-bezier(0.23, 1, 0.32, 1)"
  expand: "200ms"
  press: "150ms"
  tab-crossfade: "180ms"
  badge-pop: "220ms"
  sparkline-draw: "250ms"
---

# Design System: FINN

## Overview

**Creative North Star: "Morning paper"**

A sharp printed brief, not a trading terminal: warm paper, near-black ink, one deep ink-blue accent, and a serif verdict at the top that says in one sentence what the day needs ("Tata Power and Bajaj Finance need a look today." / "Results season: 18 of 20 reported."). Everything under the verdict exists to justify it. The pre-build intent (calm, dense, editorial, read over morning chai) survived the build intact.

What changed after the user's phone review: the **company is the unit**, not the filing. Each company appears once per window, led by its most important filing (results > management change > fund raise > ...), with the rest folded behind "+N more filings", results documents folded into the results item, and every other material (P1) filing surfaced as its own one-line "Also" so it can never hide; the "+N more filings" fold inside the expanded card holds only P2/P3. Material companies get a rich card; the rest get a compact row. This deliberately replaced the original "2-line hairline rows, never boxed cards" rule for the top tier: a phone-sized card with numbers and a sparkline answered "does it matter?" faster than a row did. Hairline rows remain the grammar everywhere below the top tier.

Density is phone-first (390px) and calm: one column, max 36rem, nothing decorative. Colour is information, not mood.

**Key Characteristics:**
- Serif verdict, sans everything else, tabular figures throughout.
- Two tiers: "What matters" cards (max 6, then "Show N more companies"), "Also worth a look" rows; routine filings collapsed into one row.
- Green/red only on signed numbers; ink-blue only on interactive or "material" marks.
- Forced light scheme: the paper is the identity, so the browser may not dark-repaint it.
- Flat paper; the only shadow is a 1px lift on the selected window segment.

## Colors

Warm, low-chroma neutrals carry the page; one serious ink-blue and a muted gain/loss pair are the only saturated values.

### Primary
- **Ink-blue** (accent): links, the active tab and window segment, "+N more" and "Show" toggles, the alert badge, the credibility chip (it links to Research), focus rings, checkboxes, and the material marker (the P1 square on filing rows, the filing-day square on sparklines). Chosen over oxblood because a red marker would read as "down" next to the loss colour.

### Neutral
- **Paper** (paper): page ground, top bar, tab bar, inputs. Also the PWA theme colour (#f8f5ef).
- **Shaded paper** (paper-2): the window control track, the reaction-pending banner, pressed states, skeleton bars, avatar fallback.
- **Card stock** (card): the face of "What matters" cards and the selected window segment; a half-step lighter than paper so cards read without shadows.
- **Ink** (ink): primary text and numbers.
- **Warm grey** (ink-2): metadata, labels, secondary lines, inactive tabs. Passes AA on paper.
- **Hairline** (rule): every divider, card border and chip border.

### Signal
- **Gain** (gain) / **Loss** (loss): muted green and red applied by the `Signed` component to the signed percentage only, never to a background, row or icon. Loss also marks an invalid input border and its error line.

### Derived: sector tints
Company monograms get a tint derived from the company's sector name (hashed to one of 8 hues: 28, 62, 96, 150, 188, 226, 262, 318), background `oklch(91.5% 0.035 h)`, letters `oklch(36% 0.07 h)`. Never assigned per ticker. No sector falls back to paper-2 / ink-2.

### Logo greens
The FINN mark's rays run five tonal greens, light to dark (#b9c9a4, #93ac7e, #6d8d5b, #4a6c40, #2d4a2c). They live only inside the logo, app icon and favicon. Green means "up" in this UI, so it never becomes an accent.

### Named Rules
**The Number-Only Rule.** Green and red touch the signed figure and nothing else. If a row is coloured, it is wrong.

**The One Ink Rule.** Ink-blue means "you can act on this" or "this is material". It never decorates.

**The Paper Stays Paper Rule.** `color-scheme: only light` on the root and in the viewport. There is no dark theme; do not add `dark:` variants.

## Typography

**Display Font:** Source Serif 4 (with ui-serif, Georgia)
**Body Font:** Libre Franklin (with ui-sans-serif, system-ui)

**Character:** A newspaper pairing: a bookish serif for the sentences that carry judgement (verdict, section heads, the wordmark), and Franklin Gothic's workhorse sans for everything that is data. Tabular figures are on globally so numbers align in columns.

### Hierarchy
- **Display** (serif 600, 1.75rem, 1.15, -0.015em): the verdict line and page titles (Alerts, Settings, the failure title). One per screen.
- **Headline** (serif 600, 1.1875rem): section heads, "What matters" and "Also worth a look". Alert day headings use the same face at 1rem.
- **Title** (sans 600, 1.125rem, 1.3, balanced): the human headline on a company card ("Profit up 48.6% YoY in the Sep '26 quarter"). It is the largest thing on the card; the company name is 0.875rem 500 and the "TICKER · event · time" line is 0.75rem ink-2. Key figures on cards are 0.8125rem 600.
- **Body** (sans 400, 0.875rem, 1.4 to 1.45): row headlines, expanded detail, tables. Company names are 0.875 to 0.9375rem at 600.
- **Meta** (sans 400, 0.8125rem, ink-2): ticker · event · time lines, hints, source lines.
- **Label** (sans 400, 0.75rem): chip text, figure labels, table column heads. Tab labels drop to 0.6875rem.

### Named Rules
**The Serif Judges Rule.** Serif is reserved for sentences that state a verdict or name a section. Data, labels and controls are always sans.

**The Weight Not Colour Rule.** Hierarchy comes from size and weight (400 / 500 / 600). No all-caps, no letter-spaced labels.

## Layout

Single column, `max-width: 36rem`, 20px side padding, centred. Bottom padding clears the fixed tab bar plus the safe-area inset. A thin top bar (48px) carries only the FINN wordmark.

Brief order: date and "Last checked" line, verdict, one sub-line of counts, the Today / 7 days / 30 days control, an optional pending banner, "What matters" cards (12px gaps), "Also worth a look" rows, the routine-filings row, then a serif sign-off ("That's everything for today.") with "How ranking works" in a disclosure.

Rhythm runs on a 4px scale: 12px row padding, 14/16px card padding, 24 to 28px between sections. Every tap target is at least 44px tall. Text wraps cleanly at 200% zoom. No breakpoints: the phone layout simply centres on wider screens.

## Elevation & Depth

Flat. Depth comes from tone (card stock against paper, shaded paper for the control track and banner) and from 1px hairlines, not shadows. The single exception is the selected window segment, which lifts with `0 1px 2px` of ink at 12% so it reads as a pressed-out key.

### Named Rules
**The Paper Has No Shadows Rule.** Cards are separated by a hairline border and a lighter face, never a drop shadow.

## Shapes

Soft but restrained corners: cards 12px, avatars 8px, the window control and banner 8px, buttons and inputs 6px, the material marker and skeleton bars 2px, chips and the alert badge fully round. Icons are authored for this app on a 24px grid with one stroke family (1.75, round caps and joins). The FINN mark is five curved rays in tonal greens, light to dark, converging on the right into the serif wordmark: many signals in, one out. The header lockup is rays + "FINN" (Source Serif 4, 500, tracked 0.14em) on paper. App icon and favicon use four bolder rays on a paper tile so they read at 16 to 32px; a one-colour ink version is the manifest's monochrome icon. "Investment agent" appears only in the manifest name (install and splash screens), never in the header. Source: `web/scripts/logo.mjs` writes the SVGs; `web/scripts/icons.mjs` renders the PNGs from them with local Chrome.

## Components

### Company card ("What matters")
Character: a clipped newspaper item, about half the height of the first build. Card stock, hairline border, 12px radius, no shadow.
- **Company line:** 32px monogram avatar (sector tint), short company name (0.875rem 500), then "TICKER · event · filed time" (0.75rem ink-2); a chevron on the right says the card opens.
- **Headline:** the dominant line (title style) and the toggle; a stretched overlay makes the whole card tappable without nesting lists in a button. Clamped to 3 lines at normal text size; a filing with no human title leads with the person line from its card, never the raw exchange subject. The heading carries the company name for screen readers. Press: the card tints paper-2 and settles to 0.99 scale.
- **Numbers + sparkline, side by side:** each side has a small grey head naming its basis ("YoY" over the figures, "30 days" over the sparkline). Results show Rev and PAT (or the bank equivalents) as label / ₹ cr / signed YoY; fund raises show Size (₹ cr) and Dilution % when the filing states them. The sparkline (124 x 28px) sits to the right. Cards without numbers put the chips where the numbers would be.
- **Chips:** the reaction chip, which names its day ("12 Nov · −1.0% vs Nifty · 3.7× vol"), and on results cards the credibility chip ("Promises: Kept 3 · Missed 2 · Open 1").
- **Also lines:** one line per other P1 filing, 0.8125rem ink-2, "Also · event · title", truncated; the same title filed twice shows once.
- **Expanded body:** full table, "Why it's here", source link with page, "Also material" (each P1 behind an Also line as a full filing row: tap for detail and source page), "Filed with the results", then "+N more filings" (P2/P3 only).
- **200% text:** the card is a container; below ~15rem of text width the figure rows wrap (label, value, change), the sparkline drops below, chips wrap and the company line wraps. No horizontal scroll.

### Sparkline
30 trading days of closes in ink at 1.25px, Nifty rebased to the same start day as a faint ink-2 line (35%) beneath it, and a label under it: "+4.3% · Nifty +1.1%" (only the stock's figure is coloured). The filing's reaction day is a 7px accent square on the line with a faint vertical rule; while the reaction is pending the square is hollow and sits one trading day past the last bar. It draws in left to right once per company per visit.

### Credibility chip
"Promises: Kept 3 · Missed 2 · Open 1". Management's record on its own concall promises, from the cached Promised vs Delivered JSON, measured promises only: kept = hit or ahead, missed = miss, behind pace or moved away, open = on track ("Open" hidden at 0). No chip when nothing was measurable. Ink-blue text in a hairline pill because it links to Research; its hit area extends past the pill.

### Company row ("Also worth a look")
Hairline-separated, 32px avatar, name + event (+N folded) + reaction text on line one (it wraps rather than cut the name; the reaction day is left off because the row already shows a date); the headline wraps to two lines (never truncated) with the date on the right. Tap expands in place with the same body as the card.

### Filing row
Line 2 (the fact) wraps to two lines instead of truncating. The original 2-line row, still used inside "+N more", the routine list and expanded groups: ticker, event, the P1 accent square, then the rank reason right-aligned (bold when it boosted the rank). Reason parts drop whole rather than truncate.

### Reaction chip
Full-round, hairline border, 0.75rem. Quiet (ink-2) by default; when the reaction boosted the rank, the border darkens to ink at 50% and the text goes 600. Never shown while the reaction is pending.

### Window control
Three-segment control on a shaded paper track; selected segment is card stock, ink-blue, 600, with the one lift shadow. 44px tall.

### Alerts inbox row
One row per company per day: avatar, short name (+ "New" in ink-blue), one facts line ("−3.3% vs Nifty · 2.3× vol · Results"; signed figures coloured, extreme values 600 weight), then the filing's key fact in ink-2, clamped to 2 lines. The headline above names who needs a look, like the Brief's verdict. Rows with a filing open it in the Brief; market-only rows open the company page.

### How FINN works
Card stock, hairline, 12px radius, at the top of the Brief on first visit: serif title, a two-column list (Filter / Rank / Verify in 600, the line in ink-2), "Got it" bottom right. Mounts open; dismissal collapses (200ms). The list repeats under Settings.

### Live research checklist
Serif "Researching SYMBOL", elapsed time, then the backend's stages as hairline rows: done = filled ink circle with a paper tick drawn in (clip reveal), current = ring with an ink dot, label 600 and a quiet detail line ("Q1 FY27 call, 2 of 4"), pending = faint ring, ink-2 label. Weight, not colour.

### Desktop note
At ≥1024px with a fine pointer only: beside the column, a serif "FINN is built for your phone.", one ink-2 line and a QR code on card stock. The column itself never widens.

### Buttons
- **Secondary** ("Try again", "Reset to defaults"): 40px, 6px radius, ink border at 70%, paper-2 on hover; disabled falls back to hairline and ink-2.
- **Text toggles** ("Show", "+2 more filings", "Show 4 more companies"): ink-blue medium text, at least 44px tall; the "show more companies" toggle is full width inside a hairline 12px box.

### Inputs (Settings)
Number fields: 40px, right-aligned, paper ground, ink border at 40%, loss border plus one error line when invalid; saved on blur or Enter. Category toggles are native checkboxes in ink-blue on 44px hairline rows. Settings section heads are 0.8125rem 600 over an ink rule at 80%.

### Navigation
Fixed bottom tab bar (Brief, Alerts, Research, Settings), paper ground with a top hairline, 56px plus safe-area. Active tab: ink-blue + 600 and `aria-current`. Alerts carries an ink-blue count badge until the inbox is opened. Installable PWA: manifest name "FINN · Investment agent", short name "FINN", paper splash, ray icons (any, maskable, monochrome).

### States
- **Loading:** card-shaped and row-shaped skeletons in paper-2 that match the real layout.
- **Reaction pending:** said once, as a quiet paper-2 banner ("Prices are in up to 9 Nov..."), never on each row.
- **Quiet day:** the verdict says so ("Nothing material today."), with counts and a link to widen the window.
- **Failure:** a serif "The brief didn't load." with a plain cause and "Try again"; a filing that can't be parsed still shows with its raw link.

### Motion
One curve for everything, a strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`; Tailwind's `ease-out` is overridden to it), and nothing over 250ms. Nothing enters from nothing: no page entrances, no staggered lists.
- **Expand / collapse** (cards, rows, filing rows, the routine list, folds): height via grid rows 0fr to 1fr plus opacity, 200ms; chevrons rotate in step. Closed content is `inert`.
- **Press:** cards tint and settle to 0.99 scale, rows tint paper-2, 150ms.
- **Tabs:** React `<ViewTransition>` crossfades the page, 180ms.
- **Sparkline:** a left-to-right clip reveal, 250ms, once per company per visit.
- **Alert badge:** pops from 0.6 scale with a fade when its count changes, 220ms.
- **Reduced motion:** every animation and transition drops to 1ms and view transitions are off.

## Do's and Don'ts

### Do:
- **Do** make the company the unit: one entry per company per window, lead item by priority, the rest folded.
- **Do** cap "What matters" at 6 cards and put the rest behind one "Show N more companies" tap.
- **Do** colour only the signed percentage, via `Signed`.
- **Do** keep green inside the logo; the UI accent is ink-blue.
- **Do** keep every target at 44px or more and pad the fixed bars for safe areas.
- **Do** cite the source on every expanded item ("Open filing at p. N").
- **Do** derive avatar tints from sector, never from the ticker.

### Don't:
- **Don't** add drop shadows to cards, gradients, glassmorphism or coloured backgrounds.
- **Don't** use emoji, icon fonts or decorative icons; icons are only the four authored tab glyphs and chevrons.
- **Don't** use all-caps labels, eyebrows or kickers above headings.
- **Don't** write long LLM paragraphs or "insight" filler; headlines are one line with numbers copied from the filing.
- **Don't** add a dark theme or let the browser force one.
- **Don't** repeat "Reaction pending" on rows; it is one banner.
