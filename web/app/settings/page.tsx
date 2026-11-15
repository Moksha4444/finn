"use client";
import { useState } from "react";
import { DEFAULTS, P1_CATS, sentence, useSettings, type Settings } from "@/lib/feed";
import { label } from "@/lib/rank";
import { HowItWorksList } from "@/components/HowItWorks";
import { BUTTON } from "@/components/States";

export default function SettingsPage() {
  const [s, update] = useSettings();
  const toggle = (cat: string) => update({ cats: s.cats.includes(cat) ? s.cats.filter((c) => c !== cat) : [...s.cats, cat] });
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULTS);

  return (
    <>
      <section className="pt-6 pb-2">
        <p className="kicker">Settings</p>
        <h1 className="mt-2 font-serif text-34 leading-[1.08] font-semibold tracking-[-0.01em]">Your thresholds</h1>
        <p className="mt-2 text-13 text-ink-2">Saved on this device. Changes re-rank the brief straight away.</p>
      </section>

      <h2 className="section-head mt-6">Market reaction</h2>
      <p className="pt-2 text-13 text-ink-2">
        A filing whose reaction day crosses either threshold ranks higher, and each crossing raises an alert.
      </p>
      <NumberField id="vol" label="Volume" hint="times the 20-day average" unit="×" value={s.volN} min={1} step={0.5} onSave={(v) => update({ volN: v })} />
      <NumberField id="move" label="Move vs Nifty" hint="either direction" unit="%" prefix="±" value={s.moveX} min={0.5} step={0.5} onSave={(v) => update({ moveX: v })} />

      <h2 className="section-head mt-8">Alert me on filings about</h2>
      <CatGroup cats={P1_CATS} s={s} toggle={toggle} />
      <p className="pt-2 text-13 text-ink-2">Only material filings alert. Dividends, calls, press releases and routine paperwork still show in the brief.</p>

      <button type="button" disabled={isDefault} onClick={() => update(null)} className={`mt-6 ${BUTTON}`}>
        Reset to defaults
      </button>

      <h2 id="how" className="section-head mt-12 scroll-mt-4">How FINN works</h2>
      <HowItWorksList />
    </>
  );
}

function CatGroup({ cats, s, toggle }: { cats: string[]; s: Settings; toggle: (c: string) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Material filings</legend>
      <ul>
        {cats.map((c) => (
          <li key={c} className="border-b border-rule">
            <label className="press flex min-h-12 cursor-pointer items-center justify-between gap-3 text-15 text-ink">
              {sentence(label(c))}
              <input type="checkbox" className="size-5" checked={s.cats.includes(c)} onChange={() => toggle(c)} />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function NumberField(p: { id: string; label: string; hint: string; unit: string; prefix?: string; value: number; min: number; step: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing the saved value
  const v = draft == null ? null : Number(draft);
  const bad = draft != null && (draft.trim() === "" || !Number.isFinite(v) || v! < p.min);
  const commit = () => {
    if (!bad && v != null) p.onSave(v);
    if (!bad) setDraft(null);
  };
  return (
    <div className="border-b border-rule py-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={p.id} className="text-15 font-semibold text-ink">
          {p.label}
          <span className="block text-13 font-normal text-ink-3">{p.hint}</span>
        </label>
        <span className="flex items-baseline gap-1 font-mono text-17">
          {p.prefix && <span className="text-ink-3">{p.prefix}</span>}
          <input
            id={p.id}
            type="number"
            inputMode="decimal"
            min={p.min}
            step={p.step}
            value={draft ?? String(p.value)}
            aria-invalid={bad}
            aria-describedby={bad ? `${p.id}-err` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className={`h-11 w-[5rem] rounded-[4px] border bg-paper-raised px-2 text-right font-mono text-17 text-ink outline-none focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--accent)] ${bad ? "border-down" : "border-rule"}`}
          />
          <span className="w-3 text-ink-3">{p.unit}</span>
        </span>
      </div>
      {bad && <p id={`${p.id}-err`} className="mt-1.5 text-13 text-down">Enter a number of at least {p.min}.</p>}
    </div>
  );
}
