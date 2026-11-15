"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { shortDate } from "@/lib/feed";
import { pct } from "@/lib/rank";
import { Signed } from "../Signed";

// One chart family (REDESIGN.md §2). The company in --accent, context (Nifty, history) faint, values labelled on the
// marks (no legends, no axes). Red/green colour numbers only, never chart fills; a missed promise's dots are --down.
// The SVG stretches to the column; text and dots are HTML laid over it so they never distort.
// Positions are % of width, px of height. Every chart's left edge is flush with the text column.

// Draw-in once per chart per visit, when first scrolled into view (400ms clip reveal; off under reduced motion).
const drawn = new Set<string>();
export function useDraw(key?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"done" | "wait" | "draw">(() => (!key || drawn.has(key) ? "done" : "wait"));
  useEffect(() => {
    if (state !== "wait" || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { drawn.add(key!); setState("draw"); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(ref.current.parentElement ?? ref.current); // the parent: a fully clipped element never counts as visible
    return () => io.disconnect();
  }, [state, key]);
  return [ref, state === "wait" ? "draw-wait" : state === "draw" ? "animate-draw" : ""] as const;
}

// ---- touch: tap or drag a chart for a crosshair and the values under the finger, snapped to the nearest point.
// Release dismisses (a quick tap lingers 1.6s so it can be read). touch-action pan-y keeps vertical scrolling: the
// browser cancels the scrub when the finger moves to scroll. A mouse hovers instead. ----
function useScrub(xs: number[]) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState<number | null>(null);
  const g = useRef({ x: 0, t: 0, moved: false, timer: 0 });
  useEffect(() => () => clearTimeout(g.current.timer), []);
  const pick = (cx: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !xs.length) return;
    const p = ((cx - r.left) / r.width) * 100;
    let best = 0;
    xs.forEach((x, i) => { if (Math.abs(x - p) < Math.abs(xs[best] - p)) best = i; });
    setK(best);
  };
  const off = () => setK(null);
  const bind = {
    ref: box,
    onPointerDown: (e: React.PointerEvent) => { clearTimeout(g.current.timer); g.current = { x: e.clientX, t: e.timeStamp, moved: false, timer: 0 }; pick(e.clientX); },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" && !e.buttons) return;
      if (Math.abs(e.clientX - g.current.x) > 4) g.current.moved = true;
      pick(e.clientX);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (!g.current.moved && e.timeStamp - g.current.t < 300) g.current.timer = window.setTimeout(off, 1600);
      else off();
    },
    onPointerCancel: off,
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === "mouse") off(); },
    onClick: (e: React.MouseEvent) => e.stopPropagation(), // a tap on a chart reads it; it doesn't open the story
  };
  return [k, bind] as const;
}

// The value tip: above the chart (below it if that would leave the screen), shifted sideways to stay 8px inside
// the screen edge. Measured after layout, so it never overflows whatever its width.
function Tip({ x, children }: { x: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    Object.assign(el.style, { translate: "-50% 0", top: "", bottom: "100%" });
    let r = el.getBoundingClientRect();
    if (r.top < 8) { Object.assign(el.style, { top: "100%", bottom: "auto" }); r = el.getBoundingClientRect(); }
    const vw = document.documentElement.clientWidth;
    const dx = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
    el.style.translate = `calc(-50% + ${dx}px) 0`;
  });
  return (
    // no transition, ever: under reduced motion globals.css gives every property a 1ms transition, and a tip
    // mid-transition measures at its old place (the edge clamp then misses)
    <div ref={ref} aria-hidden="true" data-tip="" style={{ left: `${x}%`, transitionProperty: "none" }}
      className="pointer-events-none absolute z-30 my-1.5 rounded-[4px] border border-rule-strong bg-paper-raised px-2 py-1 font-mono text-11 leading-4 whitespace-nowrap text-ink">
      {children}
    </div>
  );
}
const Cross = ({ x, top = 0, bottom = 0 }: { x: number; top?: number; bottom?: number }) => (
  <span aria-hidden="true" className="pointer-events-none absolute w-px bg-ink/45" style={{ left: `${x}%`, top, bottom }} />
);
const Dot = ({ x, y, className = "bg-accent" }: { x: number; y: number | string; className?: string }) => (
  <span aria-hidden="true" className={`pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper-raised ${className}`} style={{ left: `${x}%`, top: y }} />
);
const day = (d: string) => shortDate(d).toUpperCase();

// Soft area under a company's line: navy 7% at the line's highest point fading to 0 at the plot's baseline.
// Lines only (never bars, never Nifty). `pts` is the polyline's "x,y x,y" string in the SVG's own units.
function Area({ pts, base }: { pts: string; base: number }) {
  const id = useId();
  const xy = pts.split(" ").filter(Boolean);
  if (xy.length < 2) return null;
  const first = xy[0].split(",")[0], last = xy[xy.length - 1].split(",")[0];
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1" className="text-accent">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.07" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${first},${base} ${xy.join(" ")} ${last},${base}`} fill={`url(#${id})`} />
    </>
  );
}
const rupees = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt1 = (v: number) => `${v.toFixed(1)}%`;
const Label = ({ x, y, children, className = "", align = "center" }: { x: number; y: number; children: React.ReactNode; className?: string; align?: "center" | "left" | "right" }) => (
  <span aria-hidden="true"
    className={`absolute font-mono text-11 leading-[0.875rem] whitespace-nowrap ${className}`}
    style={{ left: `${x}%`, top: y, transform: `translate(${align === "center" ? "-50%" : align === "right" ? "-100%" : "0"}, 0)` }}>
    {children}
  </span>
);

// ---- sparkline: 30 days, the stock and Nifty rebased to the same start. Always 120x36, right-aligned on the
// numbers row's baseline, its label hanging beneath (the row reserves the space with mb-5). ----
export function Sparkline({ sym, closes, nifty, mark, pending, end }: {
  sym: string; closes: [string, number][]; nifty?: [string, number][]; mark?: string; pending: boolean; end: string;
}) {
  const [ref, cls] = useDraw(`spark-${sym}`);
  const since = new Date(Date.parse(end) - 30 * 864e5).toISOString().slice(0, 10);
  const pts = closes.filter(([d]) => d >= since && d <= end);
  const s = pts.map(([, c]) => c / pts[0][1] - 1);
  // Nifty on the same dates (carry the last close over a missing day), rebased to the stock's first day
  const nm = new Map(nifty ?? []);
  let last: number | undefined;
  const nv = pts.map(([d]) => (last = nm.get(d) ?? last));
  const n0 = nv.find((v) => v != null);
  const n = n0 ? nv.map((v) => (v == null ? null : v / n0 - 1)) : [];
  const all = [...s, ...n.filter((v): v is number => v != null)];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const slots = pts.length + (pending ? 1 : 0); // a pending reaction sits one trading day past the last bar
  const x = (k: number) => (k / (slots - 1)) * 100;
  const y = (v: number) => 34 - ((v - lo) / span) * 32;
  const line = (vs: (number | null)[]) => vs.map((v, k) => (v == null ? "" : `${x(k).toFixed(2)},${y(v).toFixed(2)}`)).filter(Boolean).join(" ");
  const mk = pending ? pts.length : mark ? pts.findIndex(([d]) => d >= mark) : -1;
  const my = mk >= 0 ? y(s[Math.min(mk, s.length - 1)]) : 0;
  const chg = s[s.length - 1] * 100;
  const nchg = n.length && n[n.length - 1] != null ? n[n.length - 1]! * 100 : null;
  const [at, scrub] = useScrub(pts.map((_, k) => x(k)));
  if (pts.length < 5) return null;
  return (
    <div {...scrub} className="scrub relative z-10 h-9 w-[120px] shrink-0">
      <div ref={ref} className={`absolute inset-0 ${cls}`}>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <Area pts={line(s)} base={36} />
          {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-3/60" />}
          <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-accent" />
        </svg>
        {mk >= 0 && (
          <>
            <span className="absolute inset-y-0 w-px bg-accent/30" style={{ left: `${x(mk)}%` }} />
            <span className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] ring-2 ring-paper-raised ${pending ? "border-2 border-accent bg-paper-raised" : "bg-accent"}`}
              style={{ left: `${x(mk)}%`, top: `${(my / 36) * 100}%` }} />
          </>
        )}
      </div>
      {at != null && (
        <>
          <Cross x={x(at)} />
          <Dot x={x(at)} y={`${(y(s[at]) / 36) * 100}%`} />
          <Tip x={x(at)}>
            <span className="block text-ink-3">{day(pts[at][0])}</span>
            {rupees(pts[at][1])} · <Signed text={pct(s[at] * 100)} />
            {n[at] != null && <span className="block text-ink-3">NIFTY {pct(n[at]! * 100)}</span>}
          </Tip>
        </>
      )}
      <p className="absolute top-full right-0 mt-1 font-mono text-11 leading-4 whitespace-nowrap text-ink-3">
        <span className="sr-only">30 days: </span>
        <span aria-hidden="true">30D </span><Signed text={pct(chg)} />{nchg != null && <> · NIFTY {pct(nchg)}</>}
        <span className="sr-only">
          {mk >= 0 ? (pending ? ". Filing day marked; reaction not in yet." : `. Filing reaction day ${shortDate(pts[mk][0])} marked.`) : ""}
        </span>
      </p>
    </div>
  );
}

// ---- a quarterly path against a target band (Promised vs Delivered, 96px), also the margin line (88px) ----
export function PathLine({ points: all, lo = null, hi = null, end = null, signed = false, labelAt, drawKey, describe, height = 96, miss = false }: {
  points: [string, number][]; lo?: number | null; hi?: number | null; end?: string | null; signed?: boolean; labelAt?: number[];
  drawKey?: string; describe: string; height?: number; miss?: boolean;
}) {
  const [ref, cls] = useDraw(drawKey);
  // Quarters after the deadline aren't evidence for the promise: off the chart, so they can't stretch the scale
  // (L&T: a post-deadline +15.8% squeezed the FY26 dots at 10-11% up against the 15% line).
  const cut = end ? all.findIndex(([q]) => q === end) : -1;
  const points = cut >= 0 ? all.slice(0, cut + 1) : all;
  const n = points.length;
  const vals = points.map(([, v]) => v);
  const bounds = [...vals, ...[lo, hi].filter((v): v is number => v != null)];
  let min = Math.min(...bounds), max = Math.max(...bounds);
  const pad = (max - min || Math.abs(max) || 1) * 0.18; // padded so a band edge never runs through a dot's label
  min -= pad; max += pad;
  const top = 16, plot = height - top - 18; // value labels | plot | quarter labels
  const banded = lo != null || hi != null;
  // left gutter holds the band labels; an unbanded line keeps room either side for an end label set beside its dot
  const gut = banded ? 15 : 12, right = banded ? 91 : 86;
  const x = (k: number) => (n === 1 ? (gut + 93) / 2 : gut + (k * (right - gut)) / (n - 1));
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * plot;
  // A value label sits on the side of its dot away from the line: below when a neighbouring point is higher (the line
  // leaves upward, so text above would sit on it), above otherwise; and off a target line when one runs through it.
  const lines = [lo, hi].filter((b): b is number => b != null).map(y);
  const clash = (t: number) => lines.some((l) => l > t - 1 && l < t + 15);
  // With no room below, an end point's label goes beside its dot, outward (the line only leaves inward).
  const labelAt_ = (v: number, k: number): { x: number; y: number; align: "center" | "left" | "right" } => {
    const up = y(v) - 16, down = y(v) + 6, fits = down + 14 <= top + plot + 4;
    const nb = [points[k - 1]?.[1], points[k + 1]?.[1]].filter((w): w is number => w != null);
    const lineAbove = nb.some((w) => y(w) < y(v) - 2) && !nb.some((w) => y(w) > y(v) + 2);
    if (fits && !clash(down) && (clash(up) || lineAbove)) return { x: x(k), y: down, align: "center" };
    if (lineAbove && !banded && n > 1 && (k === n - 1 || k === 0))
      return k === 0 ? { x: x(k) - 2, y: y(v) - 7, align: "right" } : { x: x(k) + 2, y: y(v) - 7, align: "left" };
    return { x: x(k), y: up, align: "center" };
  };
  const show = new Set(labelAt ?? points.map((_, k) => k));
  const value = (v: number) => (signed ? <Signed text={pct(v)} /> : fmt1(v));
  const bandTop = hi != null ? y(hi) : top, bandBottom = lo != null ? y(lo) : top + plot;
  const endAt = end ? points.findIndex(([q]) => q === end) : -1; // the deadline quarter, if it's on the chart
  const bandRight = endAt >= 0 && endAt < n - 1 ? (x(endAt) + x(endAt + 1)) / 2 : 100;
  const [at, scrub] = useScrub(points.map((_, k) => x(k)));
  const target = lo != null && hi != null ? `${lo}–${hi}%` : lo != null ? `≥${lo}%` : hi != null ? `≤${hi}%` : null;
  return (
    <div {...scrub} role="img" aria-label={describe} className="scrub relative" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {banded && <rect x={gut - 4} width={bandRight - gut + 4} y={bandTop} height={Math.max(0, bandBottom - bandTop)} className="fill-accent/[0.08]" />}
        {[lo, hi].map((b, k) => b != null && (
          <line key={k} x1={gut - 4} x2={bandRight} y1={y(b)} y2={y(b)} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-ink-3" />
        ))}
      </svg>
      {[lo, hi].map((b, k) => {
        if (b == null) return null;
        const close = lo != null && hi != null && y(lo) - y(hi) < 14; // a thin band: hi label above, lo below
        const ty = y(b) - 7 + (close ? (k === 0 ? 6 : -6) : 0);
        return <Label key={k} x={0} y={ty} align="left" className="text-ink-3">{k === 0 ? (hi == null ? `≥${b}%` : `${b}%`) : lo == null ? `≤${b}%` : `${b}%`}</Label>;
      })}
      <div ref={ref} className={`absolute inset-0 ${cls}`}>
        {n > 1 && (
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {!banded && <Area pts={points.map(([, v], k) => `${x(k)},${y(v)}`).join(" ")} base={top + plot} />}
            <polyline points={points.map(([, v], k) => `${x(k)},${y(v)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-accent" />
          </svg>
        )}
        {points.map(([q, v], k) => (
          <span key={q} aria-hidden="true" className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${k === endAt ? `size-[9px] border-2 bg-paper-raised ${miss ? "border-down" : "border-accent"}` : `size-[7px] ring-2 ring-paper-raised ${miss ? "bg-down" : "bg-accent"} ${show.has(k) ? "" : "opacity-60"}`}`}
            style={{ left: `${x(k)}%`, top: y(v) }} />
        ))}
        {points.map(([q, v], k) => show.has(k) && (
          <Label key={q} {...labelAt_(v, k)} className="font-medium text-ink">{value(v)}</Label>
        ))}
      </div>
      {points.map(([q], k) => (show.has(k) || n <= 5) && <Label key={q} x={x(k)} y={height - 14} className={k === endAt ? "font-medium text-ink" : "text-ink-3"}>{q}</Label>)}
      {at != null && (
        <>
          <Cross x={x(at)} top={top - 4} bottom={18} />
          <Dot x={x(at)} y={y(points[at][1])} className={miss ? "bg-down" : "bg-accent"} />
          <Tip x={x(at)}>
            <span className="block text-ink-3">{points[at][0]}{at === endAt ? " · DEADLINE" : ""}</span>
            {value(points[at][1])}{target && <span className="text-ink-3"> · TARGET {target}</span>}
          </Tip>
        </>
      )}
    </div>
  );
}

// ---- 90 days: the stock and Nifty, both rebased to the first day, labelled at their ends. Full width, 120px. ----
export function PriceLine({ closes, nifty, drawKey }: { closes: [string, number][]; nifty: [string, number][]; drawKey: string }) {
  const [ref, cls] = useDraw(drawKey);
  const s = closes.map(([, c]) => (c / closes[0][1] - 1) * 100);
  const nm = new Map(nifty);
  let last: number | undefined;
  const nv = closes.map(([d]) => (last = nm.get(d) ?? last));
  const n0 = nv.find((v) => v != null);
  const n = n0 ? nv.map((v) => (v == null ? null : (v / n0 - 1) * 100)) : [];
  const all = [...s, ...n.filter((v): v is number => v != null), 0];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const H = 104, top = 6, plot = 92;
  const x = (k: number) => (k / (closes.length - 1)) * 76; // the right quarter holds the end labels
  const y = (v: number) => top + (1 - (v - lo) / span) * plot;
  const line = (vs: (number | null)[]) => vs.map((v, k) => (v == null ? "" : `${x(k)},${y(v)}`)).filter(Boolean).join(" ");
  const sEnd = s[s.length - 1], nEnd = n.length ? n[n.length - 1] : null;
  let ys = y(sEnd) - 7, yn = nEnd != null ? y(nEnd) - 7 : 0;
  if (nEnd != null && Math.abs(ys - yn) < 14) { // keep the two end labels apart
    const mid = (ys + yn) / 2, up = sEnd >= nEnd;
    ys = mid + (up ? -7 : 7); yn = mid + (up ? 7 : -7);
  }
  const [at, scrub] = useScrub(closes.map((_, k) => x(k)));
  return (
    <div {...scrub} role="img" aria-label={`Last 90 days: stock ${pct(sEnd)}${nEnd != null ? `, Nifty ${pct(nEnd)}` : ""}.`} className="scrub relative" style={{ height: H + 16 }}>
      <div ref={ref} className={`absolute inset-x-0 top-0 ${cls}`} style={{ height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <Area pts={line(s)} base={top + plot} />
          <line x1="0" x2="76" y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-rule" />
          {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-3/60" />}
          <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-accent" />
        </svg>
      </div>
      <Label x={78} y={ys} align="left" className="font-semibold"><Signed text={pct(sEnd)} /></Label>
      {nEnd != null && <Label x={78} y={yn} align="left" className="text-ink-3">NIFTY {pct(nEnd)}</Label>}
      <Label x={0} y={H + 2} align="left" className="text-ink-3">{day(closes[0][0])}</Label>
      <Label x={76} y={H + 2} align="right" className="text-ink-3">{day(closes[closes.length - 1][0])}</Label>
      {at != null && (
        <>
          <Cross x={x(at)} bottom={16} />
          {n[at] != null && <Dot x={x(at)} y={y(n[at]!)} className="bg-ink-3" />}
          <Dot x={x(at)} y={y(s[at])} />
          <Tip x={x(at)}>
            <span className="block text-ink-3">{day(closes[at][0])}</span>
            {rupees(closes[at][1])} · <Signed text={pct(s[at])} />
            {n[at] != null && <span className="block text-ink-3">NIFTY {pct(n[at]!)}</span>}
          </Tip>
        </>
      )}
    </div>
  );
}

// ---- bars: 88px. One series: the latest two in --accent, history at 35%. Two series (CFO vs PAT): accent vs accent 35%.
// Values labelled only where `labelAt` says (first and last), so the rest stay quiet. ----
export function Bars({ periods, series, labelAt, format, tipValue, describe, drawKey }: {
  periods: string[]; series: { name: string; values: number[]; tone: "ink" | "faint" }[];
  labelAt: number[]; format: (v: number, series: string) => string; tipValue?: (v: number) => string; describe: string; drawKey?: string;
}) {
  const [ref, cls] = useDraw(drawKey);
  const height = 54;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const top = 16, zero = top + (hi / span) * height;
  const slot = 100 / periods.length, gap = series.length > 1 ? 0.12 : 0.22;
  const bw = (slot * (1 - gap * 2)) / series.length;
  const n = periods.length;
  const [at, scrub] = useScrub(periods.map((_, k) => k * slot + slot / 2));
  return (
    <div {...scrub} role="img" aria-label={describe} className="scrub relative" style={{ height: top + height + 18 }}>
      <div ref={ref} className={`absolute inset-0 ${cls}`}>
        {periods.map((p, k) => series.map((s, j) => {
          const v = s.values[k];
          const hpx = (Math.abs(v) / span) * height;
          const left = k * slot + slot * gap + j * bw;
          const dark = series.length > 1 ? (s.tone === "ink" ? "bg-accent" : "bg-accent/35") : k >= n - 2 ? "bg-accent" : "bg-accent/35";
          return (
            <span key={`${p}${j}`} aria-hidden="true" className={`absolute ${dark}`}
              style={{ left: `${left}%`, width: `calc(${bw}% - 1px)`, top: v >= 0 ? zero - hpx : zero, height: Math.max(1, hpx) }} />
          );
        }))}
        {labelAt.map((k) => series.map((s, j) => {
          const v = s.values[k];
          const cx = k * slot + slot * gap + (j + 0.5) * bw;
          return <Label key={`${k}${j}`} x={cx} y={(v >= 0 ? zero - (v / span) * height : zero) - 15} className="font-medium text-ink">{format(v, s.name)}</Label>;
        }))}
      </div>
      <span aria-hidden="true" className="absolute inset-x-0 h-px bg-rule" style={{ top: zero }} />
      {/* past 6 periods the labels would touch: every other one, counted back from the latest (the tip names each) */}
      {periods.map((p, k) => (n <= 6 || (n - 1 - k) % 2 === 0) && <Label key={p} x={k * slot + slot / 2} y={top + height + 3} className="text-ink-3">{p}</Label>)}
      {at != null && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute bg-ink/[0.07]" style={{ left: `${at * slot}%`, width: `${slot}%`, top: top - 4, height: height + 8 }} />
          <Tip x={at * slot + slot / 2}>
            <span className="block text-ink-3">{periods[at]}</span>
            {series.map((sr, j) => <span key={sr.name}>{j > 0 && " · "}{series.length > 1 && `${sr.name} `}{(tipValue ?? ((v: number) => format(v, sr.name)))(sr.values[at])}</span>)}
          </Tip>
        </>
      )}
    </div>
  );
}
