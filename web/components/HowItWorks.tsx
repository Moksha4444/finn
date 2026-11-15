// What FINN does, in three lines. Lives in Settings ("How FINN works"); the Brief links to it from its masthead.
const LINES: [string, string][] = [
  ["Filter", "Every filing across your portfolio; routine paperwork hidden."],
  ["Rank", "What matters first, and why, with the market’s reaction vs Nifty."],
  ["Verify", "Did management deliver what it promised? Tap any company."],
];

export function HowItWorksList() {
  return (
    <dl className="grid grid-cols-[4.5rem_1fr] text-15 leading-[1.4]">
      {LINES.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="kicker border-b border-rule py-3 text-ink">{k}</dt>
          <dd className="border-b border-rule py-3 pl-3 text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
