"use client";
import { useEffect, useState } from "react";
import { pct } from "@/lib/rank";
import { Signed } from "./Signed";

// Small charts for the research page, in the sparkline's grammar: ink line, faint context, values labelled
// on the marks themselves (no legends, no axes). The SVG stretches to the width; text and dots are HTML laid
// over it so they never distort. Positions are % of width, px of height.

const drawn = new Set<string>(); // the draw-in plays once per chart per visit
function useDrawOnce(key?: string) {
  const [animate] = useState(() => !!key && !drawn.has(key));
  useEffect(() => { if (key) drawn.add(key); }, [key]);
  return animate;
}

const fmt1 = (v: number) => `${v.toFixed(1)}%`;
const banded0 = (lo: number | null, hi: number | null) => lo != null || hi != null;
const Label = ({ x, y, children, className = "", align = "center" }: { x: number; y: number; children: React.ReactNode; className?: string; align?: "center" | "left" | "right" }) => (
  <span aria-hidden="true"
    className={`absolute text-[0.6875rem] leading-[0.875rem] whitespace-nowrap ${className}`}
    style={{ left: `${x}%`, top: y, transform: `translate(${align === "center" ? "-50%" : align === "right" ? "-100%" : "0"}, 0)` }}>
    {children}
  </span>
);

// ---- a quarterly path against a target band (Promised vs Delivered), also the margin trend (no band) ----
export function PathLine({ points, lo = null, hi = null, end = null, signed = false, labelAt, drawKey, describe, plot = 44 }: {
  points: [string, number][]; lo?: number | null; hi?: number | null; end?: string | null; signed?: boolean; labelAt?: number[];
  drawKey?: string; describe: string; plot?: number;
}) {
  const animate = useDrawOnce(drawKey);
  const n = points.length;
  const vals = points.map(([, v]) => v);
  const bounds = [...vals, ...[lo, hi].filter((v): v is number => v != null)];
  let min = Math.min(...bounds), max = Math.max(...bounds);
  const pad = (max - min || Math.abs(max) || 1) * 0.15;
  min -= pad; max += pad;
  const top = 16, h = top + plot + 18; // value labels | plot | quarter labels
  const gut = banded0(lo, hi) ? 15 : 7; // left gutter holds the band labels
  const x = (k: number) => (n === 1 ? (gut + 93) / 2 : gut + (k * (91 - gut)) / (n - 1));
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * plot;
  const show = new Set(labelAt ?? points.map((_, k) => k));
  const value = (v: number) => (signed ? <Signed text={pct(v)} /> : fmt1(v));
  const bandTop = hi != null ? y(hi) : top, bandBottom = lo != null ? y(lo) : top + plot;
  const endAt = end ? points.findIndex(([q]) => q === end) : -1; // the deadline quarter, if it's on the chart
  const bandRight = endAt >= 0 && endAt < n - 1 ? (x(endAt) + x(endAt + 1)) / 2 : 100;
  const after = (k: number) => endAt >= 0 && k > endAt;
  const banded = lo != null || hi != null;
  return (
    <div role="img" aria-label={describe} className="relative" style={{ height: h }}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {banded && <rect x={gut - 4} width={bandRight - gut + 4} y={bandTop} height={Math.max(0, bandBottom - bandTop)} className="fill-ink/[0.07]" />}
        {[lo, hi].map((b, k) => b != null && (
          <line key={k} x1={gut - 4} x2={bandRight} y1={y(b)} y2={y(b)} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-ink-2/60" />
        ))}
      </svg>
      {[lo, hi].map((b, k) => {
        if (b == null) return null;
        const close = lo != null && hi != null && y(lo) - y(hi) < 14; // a thin band: hi label above, lo below
        const ty = y(b) - 7 + (close ? (k === 0 ? 6 : -6) : 0);
        return <Label key={k} x={0} y={ty} align="left" className="text-ink-2">{k === 0 ? (hi == null ? `≥${b}%` : `${b}%`) : lo == null ? `≤${b}%` : `${b}%`}</Label>;
      })}
      <div className={`absolute inset-0 ${animate ? "animate-draw" : ""}`}>
        {n > 1 && (
          <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            <polyline points={points.map(([, v], k) => `${x(k)},${y(v)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-ink" />
          </svg>
        )}
        {points.map(([q, v], k) => (
          <span key={q} aria-hidden="true" className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${k === endAt ? "size-[9px] border-2 border-ink bg-card" : `size-[7px] ring-2 ring-card ${show.has(k) && !after(k) ? "bg-ink" : "bg-ink-2/60"}`}`}
            style={{ left: `${x(k)}%`, top: y(v) }} />
        ))}
        {points.map(([q, v], k) => show.has(k) && (
          <Label key={q} x={x(k)} y={y(v) - 16} className={after(k) ? "text-ink-2" : "font-medium"}>{value(v)}</Label>
        ))}
      </div>
      {points.map(([q], k) => (show.has(k) || n <= 5) && <Label key={q} x={x(k)} y={h - 14} className={k === endAt ? "font-medium text-ink" : "text-ink-2"}>{q}</Label>)}
    </div>
  );
}

// ---- 90 days: the stock and Nifty, both rebased to the first day, labelled at their ends ----
export function PriceLine({ closes, nifty, drawKey }: { closes: [string, number][]; nifty: [string, number][]; drawKey: string }) {
  const animate = useDrawOnce(drawKey);
  const s = closes.map(([, c]) => (c / closes[0][1] - 1) * 100);
  const nm = new Map(nifty);
  let last: number | undefined;
  const nv = closes.map(([d]) => (last = nm.get(d) ?? last));
  const n0 = nv.find((v) => v != null);
  const n = n0 ? nv.map((v) => (v == null ? null : (v / n0 - 1) * 100)) : [];
  const all = [...s, ...n.filter((v): v is number => v != null), 0];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const H = 76, top = 6, plot = 52;
  const x = (k: number) => (k / (closes.length - 1)) * 76; // the right quarter holds the end labels
  const y = (v: number) => top + (1 - (v - lo) / span) * plot;
  const line = (vs: (number | null)[]) => vs.map((v, k) => (v == null ? "" : `${x(k)},${y(v)}`)).filter(Boolean).join(" ");
  const sEnd = s[s.length - 1], nEnd = n.length ? n[n.length - 1] : null;
  let ys = y(sEnd) - 7, yn = nEnd != null ? y(nEnd) - 7 : 0;
  if (nEnd != null && Math.abs(ys - yn) < 14) { // keep the two end labels apart
    const mid = (ys + yn) / 2, up = sEnd >= nEnd;
    ys = mid + (up ? -7 : 7); yn = mid + (up ? 7 : -7);
  }
  const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <div role="img" aria-label={`Last 90 days: stock ${pct(sEnd)}${nEnd != null ? `, Nifty ${pct(nEnd)}` : ""}.`} className="relative" style={{ height: H + 16 }}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 w-full overflow-visible" style={{ height: H }} aria-hidden="true">
        <line x1="0" x2="76" y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-rule" />
        {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-2/45" />}
        <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          className={`text-ink ${animate ? "animate-draw" : ""}`} />
      </svg>
      <Label x={78} y={ys} align="left" className="font-semibold"><Signed text={pct(sEnd)} /></Label>
      {nEnd != null && <Label x={78} y={yn} align="left" className="text-ink-2">Nifty {pct(nEnd)}</Label>}
      <Label x={0} y={H + 2} align="left" className="text-ink-2">{day(closes[0][0])}</Label>
      <Label x={76} y={H + 2} align="right" className="text-ink-2">{day(closes[closes.length - 1][0])}</Label>
    </div>
  );
}

// ---- bars: one or two series per period, values labelled only where `labelAt` says (others stay quiet) ----
export function Bars({ periods, series, labelAt, format, describe, height = 44 }: {
  periods: string[]; series: { name: string; values: number[]; tone: "ink" | "faint" }[];
  labelAt: number[]; format: (v: number, series: string) => string; describe: string; height?: number;
}) {
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const top = 16, zero = top + (hi / span) * height;
  const slot = 100 / periods.length, gap = series.length > 1 ? 0.12 : 0.22;
  const bw = (slot * (1 - gap * 2)) / series.length;
  const strong = new Set(labelAt);
  return (
    <div role="img" aria-label={describe} className="relative" style={{ height: top + height + 18 }}>
      {periods.map((p, k) => series.map((s, j) => {
        const v = s.values[k];
        const hpx = (Math.abs(v) / span) * height;
        const left = k * slot + slot * gap + j * bw;
        const dark = s.tone === "ink" ? (strong.has(k) || series.length > 1 ? "bg-ink" : "bg-ink-2/45") : "bg-ink-2/45";
        return (
          <span key={`${p}${j}`} aria-hidden="true" className={`absolute rounded-t-[2px] ${dark} ${v < 0 ? "rounded-t-none rounded-b-[2px]" : ""}`}
            style={{ left: `${left}%`, width: `calc(${bw}% - 1px)`, top: v >= 0 ? zero - hpx : zero, height: Math.max(1, hpx) }} />
        );
      }))}
      <span aria-hidden="true" className="absolute inset-x-0 h-px bg-rule" style={{ top: zero }} />
      {labelAt.map((k) => series.map((s, j) => {
        const v = s.values[k];
        const cx = k * slot + slot * gap + (j + 0.5) * bw;
        return <Label key={`${k}${j}`} x={cx} y={(v >= 0 ? zero - (v / span) * height : zero) - 15} className="font-medium">{format(v, s.name)}</Label>;
      }))}
      {periods.map((p, k) => <Label key={p} x={k * slot + slot / 2} y={top + height + 3} className="text-ink-2">{p}</Label>)}
    </div>
  );
}
