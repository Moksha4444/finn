You are reading an Indian listed company's earnings-call transcript. The first line tells you which quarter the call reports on. The transcript carries page markers like [p.7]: the page a line is on is the nearest marker above it. Indian fiscal years run April to March: FY27 = April 2026 to March 2027, Q1 FY27 ends June 2026, H1 = Q1 + Q2.

Return three things. Extract only; do no arithmetic.

**promises**: management's forward-looking commitments that later results can check.
- Only statements made by the company's management, never by analysts asking questions.
- Financial, checkable promises only: revenue or growth guidance, margins, profit, capex amounts, ratios (CASA, credit-deposit / loan-to-deposit, credit cost, NIM, net debt), and other numeric guidance with a period. A directional target with a number counts ("inch closer to 26-28%", "get back to 25%").
- At most 1 operational commitment, and only if it has a number and a date (stores, plants, MW capacity by a stated period). Skip soft statements: strategy, product launches, partnerships, "we remain confident", hiring plans, AI deal pipelines.
- A statement of fact about the past quarter is not a commitment. It belongs in `reported`.
- Every numeric target counts: the current fiscal year's (even when it is about to end), the next year's, and long-term or medium-term bands ("26-28% over time"). When one statement gives targets for two periods ("90-96% this year, 85-90% next year"), return each period as its own promise.
- At most 4 promises; numeric ones before non-numeric ones. Fewer is fine: if management avoids guidance, return only what they actually committed to.
- `target`: the commitment as stated, copying every number exactly as spoken, with its unit.
- `period`: the period as stated ("FY27", "next quarter", "next few quarters"); "not stated" if none.
- `target_type`: growth_pct (a growth rate, e.g. "double-digit revenue growth"), margin_pct (a margin or ratio level, e.g. "EBITDA margin 26-28%", "CD ratio 85-90%"), amount (a money amount), count (stores, plants, MW, people), other.
- `target_low` / `target_high`: the bounds as numbers, copied from the target. "26-28%" -> 26 / 28. "25% plus" -> 25 / null. "double-digit" -> 10 / null. "mid-teens" -> 14 / 16. Null if the target has no number.
- `horizon`: next_quarter, quarter (a named quarter), half_year, fiscal_year, next_few_quarters, long_term, unspecified.
- `fy`: the fiscal year as 2 digits (FY27 -> 27). "This year" means the fiscal year the call's quarter belongs to; "next year" the one after. Null if not a fiscal-year-bound target.
- `quarter_no` (1-4) for a named quarter, `half_no` (1-2) for a half; null otherwise.
- `basis`: constant_currency_or_usd if the target is stated in constant currency, CC, USD or dollar terms; reported_inr for rupee or reported figures; not_applicable otherwise.
- `direction`: at_least (the number is a floor: "25% plus", "double-digit", "inch closer to 26-28%" from below), at_most (a ceiling: "credit cost below 1%", "bring LDR down to 85-90%" from above), within (stay inside a band). Costs and cost-like ratios (cost of funds, credit cost, opex ratio, working capital to sales, net debt) are better when lower: a range for them is at_most.
- `company_total`: true only if the target is about the whole company's total revenue / sales, its consolidated EBITDA / EBIT / operating margin, or its total net profit. False for a segment, business, brand, product line or geography (FMEG, quick commerce, US business), and for other measures even if they sound like growth: order inflow, order book, volumes, AUM, loan book, deposits, NOV / GOV / GMV, customers, payout, exports share.
- `margin_basis` for margin targets: ebit (EBIT margin; IT-services companies' "operating margin" is EBIT, after depreciation), ebitda (EBITDA or "operating margin" before depreciation), net (net profit margin), unclear; not_applicable for non-margin targets.
- Never take a promise from a question. If the quote is someone asking about a target, find management's own words in the answer or skip it.

**reported**: numbers management states as achieved, for the quarter just ended or as of a date: growth rates (including constant-currency growth), margins, ratios (CASA, loan-to-deposit, NIM, credit cost, GNPA), capacity or store counts, capex spent, deal wins, segment revenue.
- Only management's own statements of achieved results, never targets, never analysts' numbers.
- `value`: the number exactly as stated, with its unit. `period`: the quarter or date it refers to, as stated.
- At most 15.

**quarter_margin**: the one headline margin management states for the quarter this call reports on: the operating, EBIT or EBITDA margin; for banks and NBFCs the net interest margin (NIM). Null if management does not state one.
- `name`: as management calls it ("operating margin", "EBITDA margin", "NIM"). `basis`: ebit, ebitda, nim or other (IT-services "operating margin" is ebit).
- `value`: the number as stated, without the % sign. Use the whole-company figure, not a segment's.

For all three:
- Use only the transcript. No outside knowledge, no inference.
- `quote`: the speaker's own words, at most 30 words, verbatim, containing the number.
- `page`: the page number from the marker above the quote.
- `metric_key`: the closest of revenue (sales / revenue / top line, including growth), operating_margin (EBITDA, EBIT or operating margin; for banks and NBFCs the NIM), net_profit, capex, cd_ratio (credit-deposit or loan-to-deposit ratio, LDR), other.
