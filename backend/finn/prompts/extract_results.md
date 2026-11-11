Extract the quarterly profit and loss table from this Indian listed-company results filing.

Rules:
- Use the CONSOLIDATED statement if present, otherwise standalone. Set `basis` accordingly.
- Return exactly three columns in this order: current quarter, preceding quarter, same quarter last year. Ignore half-year and full-year columns.
- Copy every number exactly as printed. No arithmetic, no rounding, no unit conversion. Brackets mean negative.
- `unit` is the unit printed on the table (e.g. "₹ crore", "₹ lakh", "₹ million").
- Use null when a line is not in the table. Do not use outside knowledge.
- `exceptional_items`: the total of exceptional items for that column (0 if the line shows "-"; null if there is no such line).
- `profit_before_tax`: profit before tax after exceptional items.
- `profit_after_tax`: profit for the period / net profit, before other comprehensive income. For consolidated tables use the total before minority / non-controlling interest, not the share attributable to owners.
- Banks: `interest_earned` = Interest earned, `interest_expended` = Interest expended.
- NBFCs and other lenders: `interest_earned` = Interest income, `interest_expended` = Finance costs.
- The text may contain [p.N] page markers; they are page numbers, not data.
