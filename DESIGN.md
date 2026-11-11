# DESIGN.md — FINN

## Direction: "Morning paper"
A sharp printed brief, not a trading terminal. Calm, dense, editorial. It should feel like a well-edited note from a smart colleague, read over morning chai.

## Colour
- Background: warm off-white "paper". Text: near-black "ink". Secondary text: a warm grey with enough contrast (WCAG AA).
- **One** accent, used sparingly: priority markers, links, active states. Choose a deep, serious ink colour (e.g. oxblood or deep ink-blue), not a tech-brand colour.
- Gains/losses: muted green / muted red **on the number only**. Never coloured backgrounds, never neon.
- No gradients, no glassmorphism, no drop-shadow card grids.

## Typography
- Headlines and the brief summary: a refined serif.
- Body and numbers: a clean sans with **tabular figures** so numbers align in columns.
- Clear hierarchy through size and weight, not colour.
- Fonts via next/font (self-hosted). Final choice is Impeccable's, within these constraints.

## Density and layout
- Mobile-first at 390px. Generous outer margins, tight inner rhythm (4/8px scale).
- Feed items are **compact: 2 lines**, separated by hairline rules, not boxed cards.
  - Line 1: TICKER · event type · priority marker
  - Line 2: the key fact · why it's ranked
- 6–8 items should fit on one phone screen. Tap to expand in place.
- Routine (P3) filings: one collapsed row at the bottom ("14 routine filings · show").

## Key states (design these deliberately)
- **Quiet day:** "Nothing material today." + "14 routine filings hidden" + "Last checked 16:42 IST".
- **Reaction pending:** a subtle inline label, not a warning.
- **Failure:** the item still shows, with the raw filing link. Never a blank screen.
- **Loading:** skeleton rows that match the real layout.

## Motion (Emil Kowalski pass, after layout is done)
Subtle and fast: under 200ms, ease-out for enter. Expand/collapse in place, collapsed-section reveal, alert badge. No entrance theatrics, no bouncing, nothing that delays reading.

## Avoid
Generic shadcn/Tailwind dashboard look, emoji, icons used as decoration, all-caps shouting, long AI paragraphs, "insight" filler text.
