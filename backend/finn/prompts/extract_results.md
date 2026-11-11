Extract the quarterly profit and loss table from this Indian listed-company results filing.

Rules:
- Use the CONSOLIDATED statement if present, otherwise standalone. Set `basis` accordingly.
- Return exactly three columns in this order: current quarter, preceding quarter, same quarter last year. Ignore half-year and full-year columns.
- Copy every number exactly as printed. No arithmetic, no rounding, no unit conversion. Brackets mean negative.
- `unit` is the unit printed on the table (e.g. "₹ crore", "₹ lakh", "₹ million").
- Use null when a line is not in the table. Do not use outside knowledge.
- `exceptional_items`: the total of exceptional items for that column (0 if the line shows "-"; null if there is no such line).
- `profit_before_exceptional_and_tax`: the "profit before exceptional items and tax" line as printed; null if the table has no such line.
- `profit_before_tax`: profit before tax after exceptional items.
- `profit_after_tax`: profit for the period / net profit, before other comprehensive income. For consolidated tables use the total before minority / non-controlling interest.
- `profit_attributable_to_owners`: the "profit for the period attributable to owners / shareholders / equity holders of the company" line, or "net profit after minority interest". null if the table does not print it. Do not use the other-comprehensive-income or total-comprehensive-income split.
- Banks: `interest_earned` = Interest earned (the total), `interest_expended` = Interest expended.
- NBFCs and other lenders: `interest_earned` = Interest income (often a sub-line under Revenue from operations), `interest_expended` = Finance costs. Fill both even though the same numbers also appear in other fields.
- The text may contain [p.N] page markers; they are page numbers, not data.
