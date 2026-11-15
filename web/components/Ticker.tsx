// A ticker standing alone as a list row's identifier: a chip that hugs its text, inside a column wide enough for the
// longest portfolio ticker, so every company name or kicker after it starts at the same x. Style and widths live in
// one place (.chip, .ticker-col, .under-ticker in globals.css; --ticker-col in tokens.css) so screens can't drift.
// Not for tickers inside a sentence ("RESULTS · DIXON TECHNOLOGIES"), the company page header, or the market strip.
export function Ticker({ symbol }: { symbol: string }) {
  return (
    <span className="ticker-col">
      <span className="chip" title={symbol}>{symbol}</span>
    </span>
  );
}
