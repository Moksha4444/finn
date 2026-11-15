"use client";
// Colours signed percentages, not ranges (lib/signed.ts): muted green/red on the number itself, never a background.
// `arrows` typesets a signal ("+3.2% vs Nifty" -> "▲ 3.2% vs Nifty"); the sign survives for screen readers.
import { useEffect, useRef, useState } from "react";
import { SIGNED_NUM as NUM } from "@/lib/signed";

export function Signed({ text, arrows = false }: { text: string; arrows?: boolean }) {
  return (
    <>
      {text.split(NUM).map((part, i) => {
        if (i % 2 === 0) return part;
        const up = part.startsWith("+");
        return (
          <span key={i} className={up ? "text-up" : "text-down"}>
            {arrows ? <><span aria-hidden="true">{up ? "▲" : "▼"}&#8201;{part.slice(1)}</span><span className="sr-only">{part}</span></> : part}
          </span>
        );
      })}
    </>
  );
}

// A figure that counts to its new value (250ms) when it changes, e.g. after a threshold edit; with `from`, also on arrival.
export function Count({ value, from: start }: { value: number; from?: number }) {
  const [shown, setShown] = useState(start ?? value);
  const from = useRef(start ?? value);
  useEffect(() => {
    const a = from.current, b = value;
    from.current = value;
    if (a === b || matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(b);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 250);
      setShown(Math.round(a + (b - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}
