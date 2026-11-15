import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, istStamp, stamp } from "./time.ts";
import { curve } from "./curve.ts";

test("timestamps read as 11 Nov, 5:29 pm", () => {
  assert.equal(stamp("2026-11-11 17:29"), "11 Nov, 5:29 pm");
  assert.equal(clock("00:05"), "12:05 am");
  assert.equal(clock("12:00"), "12:00 pm");
  assert.equal(istStamp("2026-11-14T13:05:00Z"), "14 Nov, 6:35 pm");
});

test("the smoothed line passes through every point and never overshoots a flat step", () => {
  const d = curve([[0, 10], [10, 10], [20, 0], [30, 0]]);
  assert.ok(d.startsWith("M0,10C") && d.endsWith(" 30,0"));
  const ys = [...d.matchAll(/[ C](-?[\d.]+),(-?[\d.]+)/g)].map((m) => +m[2]);
  assert.ok(ys.every((y) => y >= 0 && y <= 10), d);
  assert.equal(curve([[0, 1], [5, 2]]), "M0,1L5,2");
});
