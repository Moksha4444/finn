"use client";
import { useState } from "react";
import { DEFAULTS, P1_CATS, P2_CATS, sentence, useSettings, type Settings } from "@/lib/feed";
import { label } from "@/lib/rank";

export default function SettingsPage() {
  const [s, update] = useSettings();
  const toggle = (cat: string) => update({ cats: s.cats.includes(cat) ? s.cats.filter((c) => c !== cat) : [...s.cats, cat] });
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULTS);

  return (
    <>
      <section className="pt-5 pb-4">
        <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">Settings</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-2">Saved on this device. Changes re-rank the brief straight away.</p>
      </section>

      <h2 className="border-b border-ink/80 pb-1.5 text-[0.8125rem] font-semibold">Market reaction</h2>
      <p className="pt-2 text-[0.8125rem] text-ink-2">
        A filing whose reaction day crosses either threshold ranks higher, and each crossing raises an alert.
      </p>
      <NumberField id="vol" label="Volume" hint="times the 20-day average" unit="×" value={s.volN} min={1} step={0.5} onSave={(v) => update({ volN: v })} />
      <NumberField id="move" label="Move vs Nifty" hint="either direction" unit="%" prefix="±" value={s.moveX} min={0.5} step={0.5} onSave={(v) => update({ moveX: v })} />

      <h2 className="mt-8 border-b border-ink/80 pb-1.5 text-[0.8125rem] font-semibold">Alert me on filings about</h2>
      <CatGroup title="Material by default" cats={P1_CATS} s={s} toggle={toggle} />
      <CatGroup title="Usually worth a look" cats={P2_CATS} s={s} toggle={toggle} />
      <p className="pt-2 text-[0.8125rem] text-ink-2">Routine paperwork (investor meets, postal ballots, small insider trades) never alerts.</p>

      <button
        type="button"
        disabled={isDefault}
        onClick={() => update(null)}
        className="mt-8 h-10 rounded-md border border-ink/70 px-4 text-[0.9375rem] font-medium hover:bg-paper-2 disabled:border-rule disabled:text-ink-2 disabled:hover:bg-transparent"
      >
        Reset to defaults
      </button>
    </>
  );
}

function CatGroup({ title, cats, s, toggle }: { title: string; cats: string[]; s: Settings; toggle: (c: string) => void }) {
  return (
    <fieldset className="pt-3">
      <legend className="text-[0.8125rem] text-ink-2">{title}</legend>
      <ul className="mt-1">
        {cats.map((c) => (
          <li key={c} className="border-b border-rule">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[0.9375rem]">
              {sentence(label(c))}
              <input type="checkbox" className="size-[1.125rem]" checked={s.cats.includes(c)} onChange={() => toggle(c)} />
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
        <label htmlFor={p.id} className="text-[0.9375rem]">
          {p.label}
          <span className="block text-[0.8125rem] text-ink-2">{p.hint}</span>
        </label>
        <span className="flex items-baseline gap-1 text-[1rem]">
          {p.prefix && <span className="text-ink-2">{p.prefix}</span>}
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
            className={`h-10 w-[4.5rem] rounded-md border bg-paper px-2 text-right text-[1rem] ${bad ? "border-loss" : "border-ink/40"}`}
          />
          <span className="w-3 text-ink-2">{p.unit}</span>
        </span>
      </div>
      {bad && <p id={`${p.id}-err`} className="mt-1.5 text-[0.8125rem] text-loss">Enter a number of at least {p.min}.</p>}
    </div>
  );
}
