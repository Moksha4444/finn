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
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.35
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
  avatar: "0.6rem"
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
    padding: "14px 16px 12px"
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
---

# Design System: FINN

## Overview

**Creative North Star: "Morning paper"**

A sharp printed brief, not a trading terminal: warm paper, near-black ink, one deep ink-blue accent, and a serif verdict at the top that says in one sentence what the day needs ("Tata Power and Bajaj Finance need a look today." / "Results season: 18 of 20 reported."). Everything under the verdict exists to justify it. The pre-build intent (calm, dense, editorial, read over morning chai) survived the build intact.

What changed after the user's phone review: the **company is the unit**, not the filing. Each company appears once per window, led by its most important filing (results > management change > fund raise > ...), with the rest folded behind "+N more filings", results documents folded into the results item, and any other material filing surfaced as an "Also:" line so it can never hide. Material companies get a rich card; the rest get a compact row. This deliberately replaced the original "2-line hairline rows, never boxed cards" rule for the top tier: a phone-sized card with numbers and a sparkline answered "does it matter?" faster than a row did. Hairline rows remain the grammar everywhere below the top tier.

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
- **Ink-blue** (accent): links, the active tab and window segment, "+N more" and "Show" toggles, the alert badge, focus rings, checkboxes, and the material marker (the square in the FINN mark, the P1 square on filing rows, the filing-day dot on sparklines). Chosen over oxblood because a red marker would read as "down" next to the loss colour.

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
- **Title** (sans 600, 1.0625rem, 1.35, balanced): the human headline on a company card ("Profit up 48.6% YoY in the Sep '26 quarter"). Key figures on cards use sans 600 at 1rem.
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

Soft but restrained corners: cards 12px, avatars ~10px, the window control and banner 8px, buttons and inputs 6px, the material marker and skeleton bars 2px, chips and the alert badge fully round. Icons are authored for this app on a 24px grid with one stroke family (1.75, round caps and joins). The FINN mark is an F built from ranked bars of falling length, with the accent square as its foot: the same square that marks a material filing in the feed.

## Components

### Company card ("What matters")
Character: a clipped newspaper item. Card stock, hairline border, 12px radius, no shadow.
- **Header:** monogram avatar (40px, sector tint) + short company name (600) + "TICKER · event · filed time" in ink-2.
- **Headline:** the toggle; a stretched overlay makes the whole card tappable without nesting lists in a button. Pressed state tints the card paper-2.
- **Also line:** a material filing that is not the lead, as "Also: Mgmt change · ...".
- **Key numbers:** results show two figures (Revenue and PAT, or the bank equivalents) as "₹X cr" with signed YoY beneath. Other events show the one-line note.
- **Reaction + sparkline:** the reaction chip and "30 days ±x%" sit on one row; below, a 32px ink-2 line of 30-day closes with the filing's reaction day marked by an accent square and a faint vertical rule.
- **Footer:** "Details" with a chevron; expanded body shows the full table, "Why it's here", "Filed with the results", and the source link with page. "+N more filings · incl. ..." sits under a hairline at the bottom.

### Company row ("Also worth a look")
Hairline-separated, 32px avatar, name + event (+N) + reaction text on line one, headline + date on line two. Tap expands in place with the same body as the card.

### Filing row
The original 2-line row, still used inside "+N more", the routine list and expanded groups: ticker, event, the P1 accent square, then the rank reason right-aligned (bold when it boosted the rank). Reason parts drop whole rather than truncate.

### Reaction chip
Full-round, hairline border, 0.75rem. Quiet (ink-2) by default; when the reaction boosted the rank, the border darkens to ink at 50% and the text goes 600. Never shown while the reaction is pending.

### Window control
Three-segment control on a shaded paper track; selected segment is card stock, ink-blue, 600, with the one lift shadow. 44px tall.

### Buttons
- **Secondary** ("Try again", "Reset to defaults"): 40px, 6px radius, ink border at 70%, paper-2 on hover; disabled falls back to hairline and ink-2.
- **Text toggles** ("Show", "+2 more filings", "Show 4 more companies"): ink-blue medium text, at least 44px tall; the "show more companies" toggle is full width inside a hairline 12px box.

### Inputs (Settings)
Number fields: 40px, right-aligned, paper ground, ink border at 40%, loss border plus one error line when invalid; saved on blur or Enter. Category toggles are native checkboxes in ink-blue on 44px hairline rows. Settings section heads are 0.8125rem 600 over an ink rule at 80%.

### Navigation
Fixed bottom tab bar (Brief, Alerts, Research, Settings), paper ground with a top hairline, 56px plus safe-area. Active tab: ink-blue + 600 and `aria-current`. Alerts carries an ink-blue count badge until the inbox is opened. Installable PWA with its own manifest and icons.

### States
- **Loading:** card-shaped and row-shaped skeletons in paper-2 that match the real layout.
- **Reaction pending:** said once, as a quiet paper-2 banner ("Prices are in up to 9 Nov..."), never on each row.
- **Quiet day:** the verdict says so ("Nothing material today."), with counts and a link to widen the window.
- **Failure:** a serif "The brief didn't load." with a plain cause and "Try again"; a filing that can't be parsed still shows with its raw link.

### Motion
Not done yet. The build has no transitions: expand/collapse, chevrons and pressed states are instant. A later pass is planned (under 200ms, ease-out, expand in place, no entrance theatrics, respect reduced motion).

## Do's and Don'ts

### Do:
- **Do** make the company the unit: one entry per company per window, lead item by priority, the rest folded.
- **Do** cap "What matters" at 6 cards and put the rest behind one "Show N more companies" tap.
- **Do** colour only the signed percentage, via `Signed`.
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
