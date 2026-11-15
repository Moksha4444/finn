import { test } from "node:test";
import assert from "node:assert/strict";
import { alertRows, sameEvent, severity } from "./alerts.ts";

test("the same event filed on two days is one event; different events are not", () => {
  assert.ok(sameEvent(
    "Approval from the Reserve Bank of India for re-appointment of Mr. V. Srinivasa Rangan as the Whole-time Director (designated as Executive Director) of HDFC Bank Limited",
    "Re-appointment of Mr. V. Srinivasa Rangan as the Whole-time Director(designated as Executive Director) of HDFC Bank Limited.",
  ));
  assert.ok(!sameEvent("Anup Bagchi assumed charge as MD and CEO effective 27 October 2026", "Group Head Sanjay D'Souza superannuated on October 31, 2026"));
  assert.ok(!sameEvent("Outcome of board meeting", "Outcome of board meeting")); // too generic to call
});

test("one row per company per day; a filing with a move ranks first; folded only if all parts are minor", () => {
  const a = (o: object) => ({ key: Math.random().toString(), date: "2026-11-12", kind: "price", text: "", sev: 0, ...o }) as never;
  const rows = alertRows([
    a({ symbol: "IRCTC", sev: 106, minor: false }),
    a({ symbol: "TATAPOWER", sev: 203.3, minor: false }),
    a({ symbol: "TATAPOWER", kind: "filing", sev: 300 }),
    a({ symbol: "CDSL", sev: 102.1, minor: true }),
  ]);
  assert.deepEqual(rows.map((r) => r.symbol), ["TATAPOWER", "IRCTC", "CDSL"]);
  assert.equal(rows[0].filings.length, 1);
  assert.ok(rows[0].market && !rows[0].minor && rows[2].minor);
});

test("severity: a filing is high, a threshold crossing is watch, a small spike or data note is info", () => {
  const a = (kind: string, extra = {}) => ({ key: `${kind}${Math.random()}`, symbol: "X", date: "2026-11-13", kind, text: "", sev: 0, ...extra }) as never;
  const [filing] = alertRows([a("filing"), a("price")]);
  const [move] = alertRows([a("price")]);
  const [spike] = alertRows([a("price", { minor: true })]);
  const [note] = alertRows([a("error")]);
  assert.deepEqual([severity(filing), severity(move), severity(spike), severity(note)], ["high", "watch", "info", "info"]);
});
