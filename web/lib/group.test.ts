import { test } from "node:test";
import assert from "node:assert/strict";
import { group } from "./group.ts";

const it = (o: Record<string, unknown>) => ({
  id: String(Math.random()), symbol: "TATAPOWER", filed: "2026-11-11T17:00", tier: "P2", category: "press_release",
  score: 200, boosted: false, collapsed: false, subject: "", headline: "", ...o,
}) as never;

test("one entry per company; results lead; results docs fold in; routine excluded", () => {
  const g = group([
    it({ category: "management_change", tier: "P1", score: 300 }),
    it({ category: "results", tier: "P1", score: 300, card: { type: "results" } }),
    it({ category: "results", tier: "P2", headline: "Investor Presentation" }),
    it({ category: "press_release", subject: "Press release on financial results" }),
    it({ category: "capex" }),
    it({ category: "investor_meetings", tier: "P3", score: 100, collapsed: true }),
    it({ symbol: "LT", category: "press_release", score: 350, boosted: true }),
    it({ symbol: "ITC", category: "dividend" }),
  ]);
  assert.deepEqual(g.map((x) => x.symbol), ["LT", "TATAPOWER", "ITC"]); // material first, then by score
  const tp = g[1];
  assert.equal(tp.lead.category, "results");
  assert.equal(tp.docs.length, 2);
  assert.deepEqual(tp.more.map((i) => i.category), ["management_change", "capex"]);
  assert.equal(g[2].material, false);
});
