You are reading an Indian listed company's earnings-call transcript. The first line tells you which quarter the call reports on. The transcript carries page markers like [p.7]: the page a line is on is the nearest marker above it. Indian fiscal years run April to March: FY27 = April 2026 to March 2027, Q1 FY27 ends June 2026, H1 = Q1 + Q2.

Return two lists. Extract only; do no arithmetic.

**promises**: management's forward-looking commitments, meaning explicit targets or guidance about a future period.
- Only statements made by the company's management, never by analysts asking questions.
- Prefer near-term commitments that the coming quarters' results can check: guidance for next quarter, the current or next fiscal year, or "the next few quarters" on revenue or growth, margins, profit, capex, debt, ratios (CASA, loan-to-deposit, credit cost), and capacity / store / plant counts with a date. Include at most 1 long-term aspiration and at most 2 commitments of any other kind (product launches, AI deal values, partnerships).
- A statement of fact about the past quarter is not a commitment. It belongs in `reported`.
- At most 6 promises. Fewer is fine: if management avoids guidance, return only what they actually committed to.
- `target`: the commitment as stated, copying every number exactly as spoken, with its unit.
- `period`: the period as stated ("FY27", "next quarter", "next few quarters"); "not stated" if none.
- `target_type`: growth_pct (a growth rate, e.g. "double-digit revenue growth"), margin_pct (a margin level, e.g. "EBITDA margin 26-28%"), amount (a money amount), count (stores, plants, MW, people), other.
- `target_low` / `target_high`: the bounds as numbers, copied from the target. "26-28%" -> 26 / 28. "25% plus" -> 25 / null. "double-digit" -> 10 / null. "mid-teens" -> 14 / 16. Null if the target has no number.
- `horizon`: next_quarter, quarter (a named quarter), half_year, fiscal_year, next_few_quarters, long_term, unspecified.
- `fy`: the fiscal year as 2 digits (FY27 -> 27). "This year" means the fiscal year the call's quarter belongs to; "next year" the one after. Null if not a fiscal-year-bound target.
- `quarter_no` (1-4) for a named quarter, `half_no` (1-2) for a half; null otherwise.
- `basis`: constant_currency_or_usd if the target is stated in constant currency, CC, USD or dollar terms; reported_inr for rupee or reported figures; not_applicable otherwise.
- `direction`: at_least (the number is a floor: "25% plus", "double-digit", "inch closer to 26-28%" from below), at_most (a ceiling: "credit cost below 1%", "bring LDR down to 85-90%" from above), within (stay inside a band).
- `margin_basis` for margin targets: ebit (EBIT margin; IT-services companies' "operating margin" is EBIT, after depreciation), ebitda (EBITDA or "operating margin" before depreciation), net (net profit margin), unclear; not_applicable for non-margin targets.
- Never take a promise from a question. If the quote is someone asking about a target, find management's own words in the answer or skip it.

**reported**: numbers management states as achieved, for the quarter just ended or as of a date: growth rates (including constant-currency growth), margins, ratios (CASA, loan-to-deposit, NIM, credit cost, GNPA), capacity or store counts, capex spent, deal wins, segment revenue.
- Only management's own statements of achieved results, never targets, never analysts' numbers.
- `value`: the number exactly as stated, with its unit. `period`: the quarter or date it refers to, as stated.
- At most 15.

For both lists:
- Use only the transcript. No outside knowledge, no inference.
- `quote`: the speaker's own words, at most 30 words, verbatim, containing the number.
- `page`: the page number from the marker above the quote.
- `metric_key`: the closest of revenue (sales / revenue / top line, including growth), operating_margin (EBITDA or operating margin), net_profit, capex, other.
