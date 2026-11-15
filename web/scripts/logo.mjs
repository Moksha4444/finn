// FINN mark: curved rays in tonal greens converging to one point on the right ("noise in, signal out").
// Writes the icon SVGs; prints the lockup paths used by components/Logo.tsx. Run: node scripts/logo.mjs
// PNGs (apple-touch, 192, 512, maskable) are rendered from these SVGs by scripts/icons.mjs.
import { writeFileSync } from "node:fs";

const PAPER = "#F2EDE2", INK = "#16161A";
const f = (n) => +n.toFixed(2);

// A ray is a wedge along a quadratic curve S -> P (control C), w = half-width at the start, tapering to a point.
// The start is cut on a slant, like the reference's parallel cuts.
function ray({ S, C, w }, P) {
  const [sx, sy] = S, [cx, cy] = C, [px, py] = P;
  return `M${f(sx + w * 0.5)} ${f(sy - w)}Q${f(cx)} ${f(cy - w * 0.55)} ${px} ${py}Q${f(cx)} ${f(cy + w * 0.55)} ${f(sx - w * 0.5)} ${f(sy + w)}Z`;
}

// Lockup: 5 rays, light (top) to dark (bottom), viewBox 0 0 44 32.
const LOCK_P = [42, 16.5];
export const LOCKUP = [
  { S: [9, 2.6], C: [24, 5.2], w: 1.15, c: "#b9c9a4" },
  { S: [4, 8.8], C: [22, 10.4], w: 1.45, c: "#93ac7e" },
  { S: [2, 15.8], C: [22, 16], w: 1.7, c: "#6d8d5b" },
  { S: [3, 22.8], C: [22, 22], w: 1.9, c: "#4a6c40" },
  { S: [7, 29.4], C: [24, 27.4], w: 2.1, c: "#2d4a2c" },
].map((r) => ({ d: ray(r, LOCK_P), c: r.c }));

// Icon: 4 bolder rays so it reads at 16-32px, viewBox 0 0 32 32 (content box 4..28).
const ICON_P = [27, 16];
const ICON = [
  { S: [7, 5.6], C: [17, 7.4], w: 2.2, c: "#9db487" },
  { S: [4.6, 12.6], C: [17, 13.4], w: 2.4, c: "#6d8d5b" },
  { S: [4.6, 19.4], C: [17, 18.6], w: 2.6, c: "#4a6c40" },
  { S: [7, 26.4], C: [17, 24.6], w: 2.8, c: "#2d4a2c" },
].map((r) => ({ d: ray(r, ICON_P), c: r.c }));

const paths = (rs, fill) => rs.map((r) => `<path d="${r.d}" fill="${fill ?? r.c}"/>`).join("");
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>\n`;
// maskable: full-bleed paper, rays inside the 80% safe circle (scaled 0.62 about the centre)
const files = {
  "app/icon.svg": svg(`<rect width="32" height="32" rx="7" fill="${PAPER}"/>${paths(ICON)}`),
  "public/icons/icon.svg": svg(`<rect width="32" height="32" fill="${PAPER}"/><g transform="translate(2.4 2.4) scale(.85)">${paths(ICON)}</g>`),
  "public/icons/maskable.svg": svg(`<rect width="32" height="32" fill="${PAPER}"/><g transform="translate(6.08 6.08) scale(.62)">${paths(ICON)}</g>`),
  "public/icons/mono.svg": svg(paths(ICON, INK)),
};
for (const [p, s] of Object.entries(files)) writeFileSync(new URL(`../${p}`, import.meta.url), s);
console.log(JSON.stringify(LOCKUP, null, 1));
