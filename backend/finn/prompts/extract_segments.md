This is an Indian listed company's quarterly results filing. The first line gives a quarter-end date.

Find the SEGMENT INFORMATION table (segment revenue and segment results) and copy, for every segment line:
- `revenue_q`: segment revenue in the column for the 3 months ended on that quarter-end date.
- `revenue_yago`: segment revenue in the column for the same 3 months one year earlier.
- `result_q` / `result_yago`: segment result (profit before interest / finance costs and tax) in those same two columns.

Rules:
- Prefer the CONSOLIDATED segment table. Use the standalone one only if there is no consolidated one. Set `basis`.
- Copy the numbers exactly as printed. No arithmetic, no rounding, no unit conversion. A number in brackets is negative: copy it with a minus sign.
- `name`: the segment name exactly as printed. Skip total, inter-segment, unallocated and corporate lines.
- `col_q` and `col_yago`: the two column headers exactly as printed (dates). `unit`: the unit printed on the table.
- `page`: the page of this document the table is on, counting from 1.
- Use only the 3-month columns, never 6-month, 9-month or year columns.
- `found` = false, with an empty list, if there is no segment table or no column for that quarter-end date.
- Use only this document. No outside knowledge.
