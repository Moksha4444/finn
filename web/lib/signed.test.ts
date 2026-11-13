import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNED_NUM } from "./signed.ts";

const signed = (s: string) => s.split(SIGNED_NUM).filter((_, i) => i % 2);

test("true signed changes are coloured", () => {
  assert.deepEqual(signed("Revenue +16.9% YoY; PAT −1.2%"), ["+16.9%", "−1.2%"]);
  assert.deepEqual(signed("−4.1% (−3.6% vs Nifty)"), ["−4.1%", "−3.6%"]);
});

test("ranges are not signed", () => {
  assert.deepEqual(signed("target 10-12%"), []);
  assert.deepEqual(signed("target 8−10% band"), []);
  assert.deepEqual(signed("guidance of 10–12% growth"), []);
});
