// Runs the same case table as backend/tests/test_rank.py. `npm test` (Node runs .ts directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rank } from "./rank.ts";

const cases = JSON.parse(readFileSync(new URL("../../backend/tests/rank_cases.json", import.meta.url), "utf8"));

for (const c of cases) {
  test(c.name, () => assert.deepEqual(rank(c.item, 2.0, 3.0), c.want));
}
