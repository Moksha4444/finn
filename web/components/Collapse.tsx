"use client";
import { useState } from "react";

// Expand/collapse in place. Height animates through grid rows 0fr -> 1fr (no measuring); content mounts on
// first open and stays mounted so it can animate closed. `inert` keeps closed content out of tab order.
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return (
    <div
      id={id}
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="min-h-0 overflow-hidden">{seen && children}</div>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 text-ink-2 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
