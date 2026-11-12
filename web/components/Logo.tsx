// FINN mark: curved rays, light to dark, converging on the right into the wordmark: many signals in, one out.
// Paths from scripts/logo.mjs (which also writes app/icon.svg and public/icons/*). Green lives only here;
// in the UI green means "up", so it never leaves the logo.
const RAYS: [string, string][] = [
  ["M9.57 1.45Q24 4.57 42 16.5Q24 5.83 8.43 3.75Z", "#b9c9a4"],
  ["M4.72 7.35Q22 9.6 42 16.5Q22 11.2 3.27 10.25Z", "#93ac7e"],
  ["M2.85 14.1Q22 15.06 42 16.5Q22 16.93 1.15 17.5Z", "#6d8d5b"],
  ["M3.95 20.9Q22 20.95 42 16.5Q22 23.05 2.05 24.7Z", "#4a6c40"],
  ["M8.05 27.3Q24 26.24 42 16.5Q24 28.55 5.95 31.5Z", "#2d4a2c"],
];

export function Rays({ className = "h-6 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 33" className={className} aria-hidden="true">
      {RAYS.map(([d, c]) => <path key={c} d={d} fill={c} />)}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-1.5">
      <Rays />
      <span className="font-serif text-[1.25rem] leading-none font-medium tracking-[0.14em]">FINN</span>
    </span>
  );
}
