import { test } from "node:test";
import assert from "node:assert/strict";
import { grade } from "./grade.ts";

test("grade from measured promises only", () => {
  assert.equal(grade({ kept: 1, missed: 0 }), null); // one measured: not graded
  assert.equal(grade({ kept: 0, missed: 0, open: 3 }), "C"); // all on track: half credit each
  assert.equal(grade({ kept: 4, missed: 1 }), "A");
  assert.equal(grade({ kept: 1, missed: 1, open: 1 }), "C");
  assert.equal(grade({ kept: 3, missed: 2 }), "B");
  assert.equal(grade({ kept: 0, missed: 2 }), "D");
});
