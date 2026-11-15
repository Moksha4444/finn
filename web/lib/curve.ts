// Smooth SVG path through points: monotone cubic (Fritsch–Carlson, as d3's curveMonotoneX). It passes through every
// point and never overshoots between two of them, so a smoothed line can't invent a high or low that wasn't there.
export type Pt = [number, number];

export function curve(p: Pt[]): string {
  const n = p.length;
  if (n === 0) return "";
  const f = (v: number) => +v.toFixed(2);
  if (n < 3) return p.map(([x, y], k) => `${k ? "L" : "M"}${f(x)},${f(y)}`).join("");
  const d = p.slice(1).map(([x, y], k) => (y - p[k][1]) / (x - p[k][0] || 1)); // secant slopes
  const m = p.map((_, k) => (k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2));
  for (let k = 0; k < n - 1; k++) { // keep each segment monotone
    if (d[k] === 0) { m[k] = m[k + 1] = 0; continue; }
    const a = m[k] / d[k], b = m[k + 1] / d[k], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[k] = t * a * d[k]; m[k + 1] = t * b * d[k]; }
  }
  let out = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let k = 0; k < n - 1; k++) {
    const [x0, y0] = p[k], [x1, y1] = p[k + 1], h = (x1 - x0) / 3;
    out += `C${f(x0 + h)},${f(y0 + m[k] * h)} ${f(x1 - h)},${f(y1 - m[k + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return out;
}
