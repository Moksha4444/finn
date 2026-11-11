import { test } from "node:test";
import assert from "node:assert/strict";

import { period } from "./period.ts";

test("period labels from real filings", () => {
  const want = "Sep ’26";
  for (const p of ["30.09.2026", "September 30, 2026", "30-Sep-26", "Sep 30, 2026", "30th Sep'26", "30 September 2026", "30 Sep 26", "3 Months ended 30.09.2026"])
    assert.equal(period(p), want, p);
  assert.equal(period("Q2"), "Q2"); // unknown: shown as printed
});
