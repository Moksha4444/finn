You are reading an Indian listed company's earnings-call transcript. The text carries page markers like [p.7]: the page a line is on is the nearest marker above it.

List management's forward-looking commitments: explicit targets or guidance about a future period. Examples: revenue or growth guidance, margin bands, capex amounts, debt targets, store / plant / capacity additions, launch or completion timelines.

Rules:
- Only statements made by the company's management, never by analysts asking questions.
- Only what the transcript says. No outside knowledge, no inference. If management gives no forward-looking commitment, return an empty list.
- `target`: the commitment as stated, copying every number exactly as spoken, with its unit ("double-digit growth", "26-28% EBITDA margin", "₹2,000 crore capex").
- `period`: the period it is for, as stated ("FY27", "next quarter", "H2 FY27", "by 2028"). If no period is stated, write "not stated".
- `quote`: the speaker's own words, at most 30 words, verbatim.
- `page`: the page number from the marker above the quote.
- `metric_key`: the closest of revenue (sales / revenue / top line, including growth), operating_margin (EBITDA or operating margin), net_profit, capex, other.
- Prefer commitments that reported results can later check: revenue or growth, margins, profit, capex, debt, and capacity / store / plant counts with a date. Include at most 2 commitments of any other kind (product launches, AI deal values, partnerships).
- A statement of fact about the past quarter ("AI revenue crossed $3 billion") is not a commitment. Skip it.
- At most 6 commitments. Fewer is fine: if management avoids numeric guidance, return only what they actually committed to.
