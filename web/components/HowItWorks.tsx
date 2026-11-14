"use client";
import { useState, useSyncExternalStore } from "react";
import { localStore } from "@/lib/feed";
import { Collapse } from "./Collapse";

// What FINN does, in three lines. Shown once at the top of the Brief (dismissed for good on this device);
// always readable under Settings.
const LINES: [string, string][] = [
  ["Filter", "Every filing across your portfolio; routine paperwork hidden."],
  ["Rank", "What matters first, and why, with the market’s reaction vs Nifty."],
  ["Verify", "Did management deliver what it promised? Tap any company."],
];

export function HowItWorksList() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.875rem] leading-[1.4]">
      {LINES.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold">{k}</dt>
          <dd className="text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const intro = localStore("finn.intro");

export function HowItWorksCard() {
  const seen = useSyncExternalStore(intro.subscribe, intro.get, () => "ssr"); // hidden until we know
  const [closing, setClosing] = useState(false);
  if (seen !== null) return null;
  // mounts open (no entrance); only the dismissal animates, then it's remembered
  const dismiss = () => { setClosing(true); setTimeout(() => intro.set("seen"), 200); };
  return (
    <Collapse open={!closing}>
      <section aria-labelledby="how-h" className="mt-4 rounded-xl border border-rule bg-card px-4 pt-3 pb-1">
        <h2 id="how-h" className="font-serif text-[1.0625rem] font-semibold">How FINN works</h2>
        <div className="mt-2"><HowItWorksList /></div>
        <div className="flex justify-end">
          <button type="button" onClick={dismiss}
            className="-mr-2 min-h-11 px-2 text-[0.875rem] font-medium text-accent transition-transform duration-150 ease-out active:scale-[0.97]">
            Got it
          </button>
        </div>
      </section>
    </Collapse>
  );
}
