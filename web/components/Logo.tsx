// FINN mark: an "F" drawn as a ranked list. Two bars of falling length, then the accent square that marks
// a material filing in the feed. Same geometry as app/icon.svg and public/icons/*.
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="6" y="5" width="4.5" height="22" rx="1" fill="currentColor" />
      <rect x="6" y="5" width="20" height="4.5" rx="1" fill="currentColor" />
      <rect x="6" y="13.75" width="13.5" height="4.5" rx="1" fill="currentColor" />
      <rect x="13" y="22.5" width="4.5" height="4.5" rx="1" className="fill-accent" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark className="size-[1.375rem]" />
      <span className="font-serif text-[1.2rem] leading-none font-semibold tracking-[0.02em]">FINN</span>
    </span>
  );
}
