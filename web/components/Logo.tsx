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
// Each ray's centreline (start S, control C, the shared point P), from LOCKUP in scripts/logo.mjs: the splash draws these.
const SPINES = ["M9 2.6Q24 5.2 42 16.5", "M4 8.8Q22 10.4 42 16.5", "M2 15.8Q22 16 42 16.5", "M3 22.8Q22 22 42 16.5", "M7 29.4Q24 27.4 42 16.5"];

export function Rays({ className = "h-6 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 33" className={className} aria-hidden="true">
      {RAYS.map(([d, c]) => <path key={c} d={d} fill={c} />)}
    </svg>
  );
}

export function Wordmark({ size = "text-20" }: { size?: string }) {
  return (
    <span className="wordmark flex items-center gap-2">
      <Rays />
      <span className={size}>FINN</span>
    </span>
  );
}

// Launch splash, CSS only (globals.css, "Splash"): the rays draw in one by one from the left and converge on the point,
// each wedge lands as its line arrives, then FINN slides out of that point; a beat; the splash fades into the Brief.
// Server-rendered so content never flashes before it.
export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="flex items-center">
        <svg viewBox="0 0 44 33" className="h-12 w-16 overflow-visible">
          {RAYS.map(([d, c], i) => (
            <g key={c} style={{ "--i": i } as React.CSSProperties}>
              <path d={SPINES[i]} pathLength={1} fill="none" stroke={c} strokeWidth={1.6} className="spine" />
              <path d={d} fill={c} className="wedge" />
            </g>
          ))}
        </svg>
        <span className="word wordmark ml-2 text-34">FINN</span>
      </div>
    </div>
  );
}
