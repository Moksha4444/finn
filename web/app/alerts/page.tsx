"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chevron, Collapse } from "@/components/Collapse";
import { Avatar, shortName } from "@/components/Company";
import { eventLabel, keyFact } from "@/components/FeedRow";
import { Signed } from "@/components/Signed";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { alertRows, needsLook, type AlertRow } from "@/lib/alerts";
import { ALERT_DAYS, buildAlerts, MINOR_VOL, shortDate, useFeed, useSettings, useUnseen, type Feed } from "@/lib/feed";

export default function Alerts() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const alerts = useMemo(() => (feed ? buildAlerts(feed, s) : undefined), [feed, s]);
  const rows = useMemo(() => (alerts ? alertRows(alerts) : []), [alerts]);
  const { unseen, markAll, ready } = useUnseen(alerts);
  const [all, setAll] = useState(false); // last 7 days by default (user, 13 Nov); the export holds 30
  // Freeze what was new when the inbox opened, then mark everything seen so the badge clears.
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!alerts || !ready || fresh) return;
    setFresh(new Set(unseen.map((a) => a.key)));
    markAll();
  }, [alerts, ready, unseen, fresh, markAll]);

  if (error) return <LoadFailed error={error} retry={retry} />;
  if (!alerts || !feed) return <FeedSkeleton header={false} rows={6} />;

  const isNew = (r: AlertRow) => r.keys.some((k) => fresh?.has(k));
  const since = new Date(Date.parse(feed.generated_at) - ALERT_DAYS * 864e5).toISOString().slice(0, 10);
  const shown = all ? rows : rows.filter((r) => r.date >= since);
  const older = rows.length - shown.length;
  const days = [...new Set(shown.map((r) => r.date))];
  const name = (sym: string) => { const n = shortName(feed.companies?.[sym]?.name ?? sym); return n.length > 24 ? sym : n; };
  const news = [...new Set(rows.filter((r) => isNew(r) && needsLook(r)).map((r) => r.symbol))];
  const head = news.length === 0 ? "No new alerts."
    : news.length <= 2 ? `${news.map(name).join(" and ")} ${news.length === 1 ? "needs" : "need"} a look.`
    : `${news.length} companies need a look.`;
  return (
    <>
      <section className="pt-5 pb-4">
        <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance">{head}</h1>
        <p className="mt-1 text-[0.9375rem] leading-snug text-ink-2">
          {shown.length} {shown.length === 1 ? "alert" : "alerts"} in the {all ? "last 30 days" : `last ${ALERT_DAYS} days`}: moves of ±{s.moveX}% vs Nifty,
          volume at {s.volN}× the 20-day average, material filings in{" "}
          <Link href="/settings" className="text-accent underline">your categories</Link>.
        </p>
      </section>

      {shown.length === 0 ? (
        <p className="border-t border-ink/80 pt-4 text-[0.9375rem] text-ink-2">
          Nothing crossed your thresholds in the last {ALERT_DAYS} days.
        </p>
      ) : (
        days.map((d) => <Day key={d} d={d} rows={shown.filter((r) => r.date === d)} feed={feed} isNew={isNew} />)
      )}
      {(older > 0 || all) && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 flex min-h-12 items-center text-[0.875rem] font-medium text-accent">
          {all ? `Show the last ${ALERT_DAYS} days only` : `Show ${older} older ${older === 1 ? "alert" : "alerts"} (30 days)`}
        </button>
      )}
    </>
  );
}

// One day: most severe first; volume-only spikes under 3× fold behind one line.
function Day({ d, rows, feed, isNew }: { d: string; rows: AlertRow[]; feed: Feed; isNew: (r: AlertRow) => boolean }) {
  const [open, setOpen] = useState(false);
  const main = rows.filter((r) => !r.minor), minor = rows.filter((r) => r.minor);
  const id = `minor-${d}`;
  return (
    <section aria-labelledby={`d-${d}`}>
      <h2 id={`d-${d}`} className="border-b border-rule pt-5 pb-1.5 font-serif text-[1rem] font-semibold">{shortDate(d)}</h2>
      <ul>{main.map((r) => <Row key={r.key} r={r} feed={feed} isNew={isNew(r)} />)}</ul>
      {minor.length > 0 && (
        <>
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-rule text-left text-[0.8125rem] text-ink-2">
            {open ? "Hide the smaller volume spikes" : `+${minor.length} smaller volume ${minor.length === 1 ? "spike" : "spikes"} (under ${MINOR_VOL}×)`}
            <Chevron open={open} />
          </button>
          <Collapse open={open} id={id}>
            <ul>{minor.map((r) => <Row key={r.key} r={r} feed={feed} isNew={isNew(r)} />)}</ul>
          </Collapse>
        </>
      )}
    </section>
  );
}

// "Tata Power · −3.3% vs Nifty · 2.3× vol · Results", then the filing's fact. Extreme values carry weight, not colour.
function Row({ r, feed, isNew }: { r: AlertRow; feed: Feed; isNew: boolean }) {
  const co = feed.companies?.[r.symbol];
  const lead = r.filings[0]?.item;
  const facts = [...(r.market?.parts ?? []), ...[...new Set(r.filings.map((f) => eventLabel(f.item!)))].map((t) => ({ t, strong: false }))];
  // the smallest Brief window that still contains the filing's day
  const winFor = (filed: string) => {
    const hours = (Date.parse(feed.generated_at) - Date.parse(`${filed}:00+05:30`)) / 36e5;
    return hours <= 24 ? "24h" : hours <= 24 * 7 ? "7d" : "30d";
  };
  const href = lead ? `/?open=${r.symbol}&w=${winFor(lead.filed)}` : r.errors.length ? null : `/research?symbol=${r.symbol}`;
  const body = (
    <>
      <Avatar name={co?.name ?? lead?.name ?? r.symbol} sector={co?.sector} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-[0.875rem] font-semibold">{co ? shortName(co.name) : r.symbol}</span>
          {isNew && <span className="ml-auto shrink-0 text-[0.75rem] font-semibold text-accent">New</span>}
        </span>
        {facts.length > 0 && (
          <span className="mt-0.5 block text-[0.875rem] leading-[1.4]">
            {facts.map((f, k) => (
              <span key={k}>{k > 0 && <span className="text-ink-2"> · </span>}<span className={f.strong ? "font-semibold" : ""}><Signed text={f.t} /></span></span>
            ))}
          </span>
        )}
        {lead && <span className="mt-0.5 line-clamp-2 block text-[0.8125rem] leading-[1.4] text-ink-2 [overflow-wrap:anywhere]">{keyFact(lead)}</span>}
        {r.errors.map((e) => <span key={e.key} className="mt-0.5 block text-[0.8125rem] leading-[1.4] text-ink-2">{e.text}</span>)}
      </span>
    </>
  );
  return (
    <li className="border-b border-rule">
      {href ? (
        <Link href={href} className="flex items-center gap-3 py-3 transition-colors duration-150 ease-out active:bg-paper-2">
          {body}
          <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-2" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      ) : (
        <div className="flex items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}
