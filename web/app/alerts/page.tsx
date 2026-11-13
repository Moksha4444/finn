"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chevron, Collapse } from "@/components/Collapse";
import { Avatar, shortName } from "@/components/Company";
import { eventLabel, keyFact } from "@/components/FeedRow";
import { Signed } from "@/components/Signed";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { ALERT_DAYS, buildAlerts, MINOR_VOL, shortDate, useFeed, useSettings, useUnseen, type Alert, type Feed } from "@/lib/feed";

const KIND: Record<Alert["kind"], string> = { price: "Price", filing: "Filing", error: "Data" };

export default function Alerts() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const alerts = useMemo(() => (feed ? buildAlerts(feed, s) : undefined), [feed, s]);
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

  const since = new Date(Date.parse(feed.generated_at) - ALERT_DAYS * 864e5).toISOString().slice(0, 10);
  const shown = all ? alerts : alerts.filter((a) => a.date >= since);
  const older = alerts.length - shown.length;
  const days = [...new Set(shown.map((a) => a.date))];
  return (
    <>
      <section className="pt-5 pb-4">
        <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">Alerts</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-2">
          {all ? "Last 30 days" : `Last ${ALERT_DAYS} days`}: moves of ±{s.moveX}% vs Nifty, volume at {s.volN}× the 20-day average, and material filings in{" "}
          <Link href="/settings" className="text-accent underline">your categories</Link>.
        </p>
      </section>

      {shown.length === 0 ? (
        <p className="border-t border-ink/80 pt-4 text-[0.9375rem] text-ink-2">
          Nothing crossed your thresholds in the last {ALERT_DAYS} days.
        </p>
      ) : (
        days.map((d) => <Day key={d} d={d} alerts={shown.filter((a) => a.date === d)} feed={feed} fresh={fresh} />)
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
function Day({ d, alerts, feed, fresh }: { d: string; alerts: Alert[]; feed: Feed; fresh: Set<string> | null }) {
  const [open, setOpen] = useState(false);
  const main = alerts.filter((a) => !a.minor), minor = alerts.filter((a) => a.minor);
  const id = `minor-${d}`;
  return (
    <section aria-labelledby={`d-${d}`}>
      <h2 id={`d-${d}`} className="border-b border-rule pt-5 pb-1.5 font-serif text-[1rem] font-semibold">{shortDate(d)}</h2>
      <ul>{main.map((a) => <Row key={a.key} a={a} feed={feed} isNew={!!fresh?.has(a.key)} />)}</ul>
      {minor.length > 0 && (
        <>
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-rule text-left text-[0.8125rem] text-ink-2">
            {open ? "Hide the smaller volume spikes" : `+${minor.length} smaller volume ${minor.length === 1 ? "spike" : "spikes"} (under ${MINOR_VOL}×)`}
            <Chevron open={open} />
          </button>
          <Collapse open={open} id={id}>
            <ul>{minor.map((a) => <Row key={a.key} a={a} feed={feed} isNew={!!fresh?.has(a.key)} />)}</ul>
          </Collapse>
        </>
      )}
    </section>
  );
}

function Row({ a, feed, isNew }: { a: Alert; feed: Feed; isNew: boolean }) {
  // the smallest Brief window that still contains the alert's day
  const winFor = (filed: string) => {
    const hours = (Date.parse(feed.generated_at) - Date.parse(`${filed}:00+05:30`)) / 36e5;
    return hours <= 24 ? "24h" : hours <= 24 * 7 ? "7d" : "30d";
  };
  const kind = a.item ? eventLabel(a.item) : a.kind === "price" ? (a.text.includes("%") ? (a.text.includes("volume") ? "Price & volume" : "Price") : "Volume") : KIND[a.kind];
  const co = feed.companies?.[a.symbol];
  const body = (
    <>
      <Avatar name={co?.name ?? a.item?.name ?? a.symbol} sector={co?.sector} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[0.875rem] font-semibold">{co ? shortName(co.name) : a.symbol}</span>
          <span className="text-[0.8125rem] text-ink-2">{kind}</span>
          {isNew && <span className="ml-auto text-[0.75rem] font-semibold text-accent">New</span>}
        </span>
        <span className={`mt-0.5 block text-[0.875rem] leading-[1.4] [overflow-wrap:anywhere] ${a.kind === "error" ? "text-ink-2" : ""}`}>
          <Signed text={a.item ? keyFact(a.item) : a.text} />
        </span>
      </span>
    </>
  );
  return (
    <li className="border-b border-rule">
      {a.item ? (
        <Link href={`/?open=${a.symbol}&w=${winFor(a.item.filed)}`} className="flex items-center gap-3 py-3 active:bg-paper-2">
          {body}
          <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-2" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      ) : (
        <div className="flex items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}
