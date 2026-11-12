This is a fund-raise disclosure (QIP, preferential issue, warrants, rights, IPO of a subsidiary, debentures, commercial paper) filed by an Indian listed company. Copy the figures it states. Do not calculate anything.

Rules:
- Use only this filing. No outside knowledge.
- `instrument`: equity (shares, QIP, preferential shares, rights), warrants, debt (NCDs, debentures, bonds, commercial paper) or other.
- `size_text`: the total amount raised, allotted or approved by this filing, copied exactly as printed with its currency and unit (e.g. "INR 42,646 million", "₹ 57,99,99,97,400", "INR 7,816 crore", "up to INR 8,000 Crores"). Prefer the Indian-rupee figure when both USD and INR are printed. null if the filing states no total amount (a price per share alone is not a total).
- `size_page`: page of `size_text` within this PDF (first page = 1), or null.
- `units_issued`: number of shares or warrants issued or allotted by this filing, as printed (e.g. "7,683,981"). null for debt or if not stated.
- `shares_before`: total equity shares of the company outstanding before this issue, as printed, or null.
- `shares_after`: total equity shares of the company outstanding after this issue (post-issue paid-up capital, or fully diluted after warrant conversion), as printed, or null.
- Copy numbers digit for digit with the filing's separators. If a figure is not in this filing, null.
