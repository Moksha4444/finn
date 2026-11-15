"use client";
import { useEffect, useRef, useState } from "react";
import { shortDate } from "@/lib/feed";
import { pct } from "@/lib/rank";
import { Signed } from "../Signed";

// One chart family (REDESIGN.md §2). Ink line, faint context, values labelled on the marks (no legends, no axes).
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
  if (pts.length < 5) return null;
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
  return (
    <div className="relative h-9 w-[120px] shrink-0">
      <div ref={ref} className={`absolute inset-0 ${cls}`}>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-3/50" />}
          <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-ink" />
        </svg>
        {mk >= 0 && (
          <>
            <span className="absolute inset-y-0 w-px bg-accent/30" style={{ left: `${x(mk)}%` }} />
            <span className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] ring-2 ring-paper ${pending ? "border-2 border-accent bg-paper" : "bg-accent"}`}
              style={{ left: `${x(mk)}%`, top: `${(my / 36) * 100}%` }} />
          </>
        )}
      </div>
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
export function PathLine({ points: all, lo = null, hi = null, end = null, signed = false, labelAt, drawKey, describe, height = 96 }: {
  points: [string, number][]; lo?: number | null; hi?: number | null; end?: string | null; signed?: boolean; labelAt?: number[];
  drawKey?: string; describe: string; height?: number;
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
  const gut = banded ? 15 : 7; // left gutter holds the band labels
  const x = (k: number) => (n === 1 ? (gut + 93) / 2 : gut + (k * (91 - gut)) / (n - 1));
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * plot;
  // a value label sits above its dot, or below it when a target line would run through the text
  const lines = [lo, hi].filter((b): b is number => b != null).map(y);
  const clash = (t: number) => lines.some((l) => l > t - 1 && l < t + 15);
  const labelY = (v: number) => {
    const up = y(v) - 16, down = y(v) + 6;
    return clash(up) && !clash(down) && down + 14 <= top + plot + 4 ? down : up;
  };
  const show = new Set(labelAt ?? points.map((_, k) => k));
  const value = (v: number) => (signed ? <Signed text={pct(v)} /> : fmt1(v));
  const bandTop = hi != null ? y(hi) : top, bandBottom = lo != null ? y(lo) : top + plot;
  const endAt = end ? points.findIndex(([q]) => q === end) : -1; // the deadline quarter, if it's on the chart
  const bandRight = endAt >= 0 && endAt < n - 1 ? (x(endAt) + x(endAt + 1)) / 2 : 100;
  return (
    <div role="img" aria-label={describe} className="relative" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {banded && <rect x={gut - 4} width={bandRight - gut + 4} y={bandTop} height={Math.max(0, bandBottom - bandTop)} className="fill-ink/[0.06]" />}
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
            <polyline points={points.map(([, v], k) => `${x(k)},${y(v)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-ink" />
          </svg>
        )}
        {points.map(([q, v], k) => (
          <span key={q} aria-hidden="true" className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${k === endAt ? "size-[9px] border-2 border-ink bg-paper" : `size-[7px] ring-2 ring-paper ${show.has(k) ? "bg-ink" : "bg-ink-3"}`}`}
            style={{ left: `${x(k)}%`, top: y(v) }} />
        ))}
        {points.map(([q, v], k) => show.has(k) && (
          <Label key={q} x={x(k)} y={labelY(v)} className="font-medium text-ink">{value(v)}</Label>
        ))}
      </div>
      {points.map(([q], k) => (show.has(k) || n <= 5) && <Label key={q} x={x(k)} y={height - 14} className={k === endAt ? "font-medium text-ink" : "text-ink-3"}>{q}</Label>)}
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
  const day = (d: string) => shortDate(d).toUpperCase();
  return (
    <div role="img" aria-label={`Last 90 days: stock ${pct(sEnd)}${nEnd != null ? `, Nifty ${pct(nEnd)}` : ""}.`} className="relative" style={{ height: H + 16 }}>
      <div ref={ref} className={`absolute inset-x-0 top-0 ${cls}`} style={{ height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <line x1="0" x2="76" y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-rule" />
          {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-3/60" />}
          <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-ink" />
        </svg>
      </div>
      <Label x={78} y={ys} align="left" className="font-semibold"><Signed text={pct(sEnd)} /></Label>
      {nEnd != null && <Label x={78} y={yn} align="left" className="text-ink-3">NIFTY {pct(nEnd)}</Label>}
      <Label x={0} y={H + 2} align="left" className="text-ink-3">{day(closes[0][0])}</Label>
      <Label x={76} y={H + 2} align="right" className="text-ink-3">{day(closes[closes.length - 1][0])}</Label>
    </div>
  );
}

// ---- bars: 88px. One series: the latest two in ink, the rest ink-3. Two series (CFO vs PAT): ink vs ink-3.
// Values labelled only where `labelAt` says (first and last), so the rest stay quiet. ----
export function Bars({ periods, series, labelAt, format, describe, drawKey }: {
  periods: string[]; series: { name: string; values: number[]; tone: "ink" | "faint" }[];
  labelAt: number[]; format: (v: number, series: string) => string; describe: string; drawKey?: string;
}) {
  const [ref, cls] = useDraw(drawKey);
  const height = 54;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const top = 16, zero = top + (hi / span) * height;
  const slot = 100 / periods.length, gap = series.length > 1 ? 0.12 : 0.22;
  const bw = (slot * (1 - gap * 2)) / series.length;
  const n = periods.length;
  return (
    <div role="img" aria-label={describe} className="relative" style={{ height: top + height + 18 }}>
      <div ref={ref} className={`absolute inset-0 ${cls}`}>
        {periods.map((p, k) => series.map((s, j) => {
          const v = s.values[k];
          const hpx = (Math.abs(v) / span) * height;
          const left = k * slot + slot * gap + j * bw;
          const dark = series.length > 1 ? (s.tone === "ink" ? "bg-ink" : "bg-ink-3/70") : k >= n - 2 ? "bg-ink" : "bg-ink-3/45";
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
      {periods.map((p, k) => <Label key={p} x={k * slot + slot / 2} y={top + height + 3} className="text-ink-3">{p}</Label>)}
    </div>
  );
}
