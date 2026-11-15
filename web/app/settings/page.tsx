"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULTS, lastDays, P1_CATS, sentence, shortDate, useFeed, useSettings, type Settings } from "@/lib/feed";
import { label, pct } from "@/lib/rank";
import { Name } from "@/components/Company";
import { Signed } from "@/components/Signed";
import { HowItWorksList } from "@/components/HowItWorks";
import { BUTTON } from "@/components/States";

// "Saved" shows for 1.6s beside whatever just changed (and is announced once, politely).
function useSaved() {
  const [at, setAt] = useState<string | null>(null);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const flash = (id: string) => { clearTimeout(t.current); setAt(id); t.current = window.setTimeout(() => setAt(null), 1600); };
  return [at, flash] as const;
}
const Saved = ({ show }: { show: boolean }) => (
  <span aria-hidden="true" className={`font-mono text-11 font-normal tracking-[0.04em] text-accent uppercase transition-opacity duration-150 ease-out ${show ? "opacity-100" : "opacity-0"}`}>
    Saved
  </span>
);

export default function SettingsPage() {
  const [s, update] = useSettings();
  const [saved, flash] = useSaved();
  const save = (id: string, patch: Partial<Settings> | null) => { update(patch); flash(id); };
  const toggle = (cat: string) => save(cat, { cats: s.cats.includes(cat) ? s.cats.filter((c) => c !== cat) : [...s.cats, cat] });
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULTS);

  return (
    <>
      <section className="pt-6 pb-2">
        <p className="kicker">Settings</p>
        <h1 className="mt-2 font-serif text-28 leading-[1.05] font-semibold tracking-[-0.01em]">Your thresholds</h1>
        <p className="mt-2 text-13 text-ink-2">Settings are stored on this device, not in an account. Changes re-rank the brief straight away.</p>
      </section>
      <p role="status" aria-live="polite" className="sr-only">{saved ? "Saved" : ""}</p>

      <h2 className="section-head mt-6">Market reaction</h2>
      <p className="pt-2 text-13 text-ink-2">
        A filing whose reaction day crosses either threshold ranks higher, and each crossing raises an alert.
      </p>
      <div className="card mt-2 px-3">
        <NumberField id="vol" label="Volume" hint="times the 20-day average" unit="×" value={s.volN} min={1} step={0.5} saved={saved === "vol"} onSave={(v) => save("vol", { volN: v })} />
        <NumberField id="move" label="Move vs Nifty" hint="either direction" unit="%" prefix="±" value={s.moveX} min={0.5} step={0.5} saved={saved === "move"} onSave={(v) => save("move", { moveX: v })} />
      </div>

      <h2 className="section-head mt-8">Alert me on filings about</h2>
      <CatGroup cats={P1_CATS} s={s} toggle={toggle} saved={saved} />
      <p className="pt-2 text-13 text-ink-2">Only material filings alert. Dividends, calls, press releases and routine paperwork still show in the brief.</p>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" disabled={isDefault} onClick={() => save("reset", null)} className={BUTTON}>Reset to defaults</button>
        <Saved show={saved === "reset"} />
      </div>

      <Holdings />

      <h2 id="how" className="section-head mt-12 scroll-mt-4">How FINN works</h2>
      <HowItWorksList />
    </>
  );
}

// The portfolio as FINN knows it: tickers only. FINN has no quantities, prices paid or P&L, and shows none (every
// number on screen must trace to a filing or an exchange price). The move is the market strip's latest day vs Nifty.
function Holdings() {
  const { feed, error } = useFeed();
  if (error) return null; // the Brief already says the feed didn't load; settings still work without it
  const last = feed ? lastDays(feed) : null;
  const syms = feed ? feed.portfolio ?? [...last!.keys()] : [];
  const day = last && [...last.values()].map((d) => d.date).sort().at(-1);
  return (
    <section aria-labelledby="h-hold" className="mt-8">
      <h2 id="h-hold" className="section-head flex justify-between">
        Holdings{feed && <span className="font-mono font-normal tracking-normal text-ink-3">{syms.length}</span>}
      </h2>
      <p className="pt-2 text-13 text-ink-2">
        FINN tracks a watchlist, not positions: no quantities, prices paid or P&amp;L.{day && <> Moves are vs Nifty on <span className="font-mono">{shortDate(day)}</span>.</>}
      </p>
      <ol className="card mt-2 px-3" aria-busy={!feed}>
        {!feed
          ? Array.from({ length: 5 }, (_, k) => <li key={k} className="h-12 border-b border-rule last:border-b-0" />)
          : syms.map((s) => {
            const d = last!.get(s);
            const v = d ? d.excess_pct ?? d.move_pct : null;
            return (
              <li key={s} className="border-b border-rule last:border-b-0">
                <Link href={`/research?symbol=${s}`} className="press flex min-h-12 items-center gap-2">
                  <span className="w-[5.5rem] shrink-0 truncate font-mono text-13 font-semibold text-ink">{s}</span>
                  <Name name={feed.companies?.[s]?.name ?? s} className="min-w-0 text-15 text-ink-2" />
                  <span className="ml-auto shrink-0 pl-2 font-mono text-13 whitespace-nowrap">{v == null ? <span className="text-ink-3">–</span> : <Signed text={pct(v)} arrows />}</span>
                </Link>
              </li>
            );
          })}
      </ol>
    </section>
  );
}

// iOS-style switches in navy; the whole row is the label, so the row is the tap target.
function CatGroup({ cats, s, toggle, saved }: { cats: string[]; s: Settings; toggle: (c: string) => void; saved: string | null }) {
  return (
    <fieldset className="card mt-2 px-3">
      <legend className="sr-only">Material filings</legend>
      <ul>
        {cats.map((c) => (
          <li key={c} className="border-b border-rule last:border-b-0">
            <label className="press flex min-h-12 cursor-pointer items-center gap-3 text-15 text-ink">
              <span className="min-w-0 flex-1">{sentence(label(c))}</span>
              <Saved show={saved === c} />
              <input type="checkbox" role="switch" className="peer sr-only" checked={s.cats.includes(c)} onChange={() => toggle(c)} />
              <span className="switch" aria-hidden="true" />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

// A number with its unit inside the field and − / + steppers either side (44px each). Typing still works; a bad
// value is refused with a reason, never saved.
function NumberField(p: { id: string; label: string; hint: string; unit: string; prefix?: string; value: number; min: number; step: number; saved: boolean; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing the saved value
  const v = draft == null ? null : Number(draft);
  const bad = draft != null && (draft.trim() === "" || !Number.isFinite(v) || v! < p.min);
  const commit = () => {
    if (!bad && v != null && v !== p.value) p.onSave(v);
    if (!bad) setDraft(null);
  };
  const step = (d: number) => { setDraft(null); p.onSave(Math.max(p.min, Math.round((p.value + d) * 100) / 100)); };
  const STEP = "press flex size-11 shrink-0 items-center justify-center rounded-[4px] font-mono text-20 text-accent disabled:text-ink-3/50";
  return (
    <div className="border-b border-rule py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={p.id} className="min-w-0 text-15 font-semibold text-ink">
          {p.label} <Saved show={p.saved} />
          <span className="block text-13 font-normal text-ink-3">{p.hint}</span>
        </label>
        <span className="-mr-2 flex shrink-0 items-center">
          <button type="button" aria-label={`Decrease ${p.label.toLowerCase()} by ${p.step}`} disabled={p.value - p.step < p.min} onClick={() => step(-p.step)} className={STEP}>−</button>
          <span className={`flex h-11 w-[5.25rem] items-center rounded-[4px] border bg-paper px-2 font-mono text-17 focus-within:border-accent focus-within:shadow-[inset_0_0_0_1px_var(--accent)] ${bad ? "border-down" : "border-rule"}`}>
            {p.prefix && <span className="text-ink-3">{p.prefix}</span>}
            <input
              id={p.id}
              type="text"
              inputMode="decimal"
              value={draft ?? String(p.value)}
              aria-invalid={bad}
              aria-describedby={bad ? `${p.id}-err` : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-right text-ink outline-none focus-visible:outline-none"
            />
            <span className="pl-0.5 text-ink-3">{p.unit}</span>
          </span>
          <button type="button" aria-label={`Increase ${p.label.toLowerCase()} by ${p.step}`} onClick={() => step(p.step)} className={STEP}>+</button>
        </span>
      </div>
      {bad && <p id={`${p.id}-err`} className="mt-1.5 text-13 text-down">Enter a number of at least {p.min}.</p>}
    </div>
  );
}
