// Overall grade on management's promises, from measured promises only (DECISIONS.md, "Report-card grade").
// Kept counts 1, on track and partial count half, missed 0. Fewer than 2 measured: not graded.
export type Tally = { kept: number; missed: number; open?: number; partial?: number };

export function grade(t: Tally): string | null {
  const half = (t.open ?? 0) + (t.partial ?? 0);
  const n = t.kept + t.missed + half;
  if (n < 2) return null;
  const r = (t.kept + half / 2) / n;
  return r >= 0.8 ? "A" : r >= 0.6 ? "B" : r >= 0.4 ? "C" : "D";
}
