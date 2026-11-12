This is an Indian bank's or lender's results filing. The first line gives a quarter-end date.

Find the Statement of Assets and Liabilities (balance sheet) and copy two lines from the column "as at" that quarter-end date:
- `deposits`: the Deposits line (under capital and liabilities).
- `advances`: the Advances line (under assets).

Rules:
- Prefer the STANDALONE statement (the bank itself). Use the consolidated one only if there is no standalone one. Set `basis`.
- Copy the numbers exactly as printed. No arithmetic, no rounding, no unit conversion. A comma inside a number that should be a decimal point ("496854,21") is an OCR error: read it as a decimal point.
- `as_at`: the column header date exactly as printed. `unit`: the unit printed on the statement.
- `page`: the page of this document the statement is on, counting from 1.
- `found` = false, with null numbers, if there is no balance sheet column for that date. Never take a different date's column.
- Use only this document. No outside knowledge.
