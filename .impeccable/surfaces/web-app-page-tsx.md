---
version: 1
slug: "web-app-page-tsx"
primary_target: "web/app/page.tsx"
related_targets: ["web/app/alerts/page.tsx","web/app/settings/page.tsx"]
---

# Surface brief: FINN Brief (feed), Alerts, Settings

Mode: Operate. Build path: code-led (Operate surface). Scope: web/app (Brief home, Alerts inbox, Settings). Research page is out of scope today.

Audience/job: a time-poor PM answers "what changed in my portfolio, and does it matter?" in under 30 seconds on a phone, morning or after close. Content: exported feed.json (ranked filings, results/mgmt cards, reactions, alerts). Constraints: static export, no backend, thresholds and categories in localStorage, client-side re-rank, no motion pass yet.

## Direction contract

THESIS: The feed is a ranked morning note whose ordering explains itself on every row. It refuses the category default of a boxed card grid with coloured tiles, badges and charts.

OWN-WORLD: Warm paper ground, near-black ink, warm grey secondary; one deep ink-blue accent for P1 markers, links and active controls only; muted green/red on signed numbers only. Source Serif 4 for the day's verdict and headings; Libre Franklin with tabular figures for everything else. Hairline rules, no boxes, no shadows.

STORY: Read the verdict line, scan the ranked rows, tap one to see the numbers with their source page, change thresholds and watch the ranking respond.

FIRST VIEWPORT: Top bar (FINN left, Alerts with unseen count and Settings right). Date and "as of" line, serif verdict ("3 things matter today."), one sans line with counts, 24h/7d/30d segmented control, then 6-8 two-line rows; routine row collapsed at the end.

FORM: seed: none (pinned) — DESIGN.md: "Direction: 'Morning paper' ... Feed items are compact: 2 lines, separated by hairline rules, not boxed cards." Signature move: the rank-reason line, where each row's signed move vs Nifty or volume multiple is the only colour on it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
