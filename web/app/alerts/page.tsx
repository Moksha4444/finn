"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chevron, Collapse } from "@/components/Collapse";
import { Name, shortName } from "@/components/Company";
import { eventLabel, keyFact } from "@/components/FeedRow";
import { Count, Signed } from "@/components/Signed";
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
      <section className="pt-6 pb-2">
        <p className="kicker">The wire</p>
        <h1 className="mt-2 font-serif text-34 leading-[1.08] font-semibold tracking-[-0.01em] text-balance">{head}</h1>
        <p className="mt-2 text-13 leading-[1.45] text-ink-2">
          <span className="font-mono text-ink"><Count value={shown.length} /></span> {shown.length === 1 ? "alert" : "alerts"} in the {all ? "last 30 days" : `last ${ALERT_DAYS} days`}: moves of{" "}
          <span className="font-mono">±{s.moveX}%</span> vs Nifty, volume at <span className="font-mono">{s.volN}×</span> the 20-day average, material filings in{" "}
          <Link href="/settings" className="font-semibold text-accent">your categories</Link>.
        </p>
      </section>

      {shown.length === 0 ? (
        <p className="mt-4 border-t-[1.5px] border-rule-strong pt-4 text-15 text-ink-2">
          Nothing crossed your thresholds in the last {ALERT_DAYS} days.
        </p>
      ) : (
        days.map((d) => <Day key={d} d={d} rows={shown.filter((r) => r.date === d)} feed={feed} isNew={isNew} />)
      )}
      {(older > 0 || all) && (
        <button type="button" onClick={() => setAll(!all)} className="press mt-4 flex min-h-11 items-center rounded-[4px] text-13 font-semibold text-accent">
          {all ? `Show the last ${ALERT_DAYS} days only` : `${older} older ${older === 1 ? "alert" : "alerts"} (30 days)`}
        </button>
      )}
    </>
  );
}

// One day under a dateline rule: most severe first; volume-only spikes under 3× fold behind one line.
function Day({ d, rows, feed, isNew }: { d: string; rows: AlertRow[]; feed: Feed; isNew: (r: AlertRow) => boolean }) {
  const [open, setOpen] = useState(false);
  const main = rows.filter((r) => !r.minor), minor = rows.filter((r) => r.minor);
  const id = `minor-${d}`;
  return (
    <section aria-labelledby={`d-${d}`} className="mt-6">
      <h2 id={`d-${d}`} className="section-head font-mono tracking-[0.08em]">{shortDate(d).toUpperCase()}</h2>
      <ul>{main.map((r) => <Row key={r.key} r={r} feed={feed} isNew={isNew(r)} />)}</ul>
      {minor.length > 0 && (
        <>
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
            className="press flex min-h-11 w-full items-center justify-between gap-3 border-b border-rule text-left text-13 text-ink-3">
            {open ? "Hide the smaller volume spikes" : <span><span className="font-mono">{minor.length}</span> smaller volume {minor.length === 1 ? "spike" : "spikes"} (under <span className="font-mono">{MINOR_VOL}×</span>)</span>}
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

// "TATAPOWER Tata Power / ▼ 3.3% vs Nifty · 2.3× vol · Results", then the filing's fact. Extremes carry weight, not colour.
function Row({ r, feed, isNew }: { r: AlertRow; feed: Feed; isNew: boolean }) {
  const co = feed.companies?.[r.symbol];
  const lead = r.filings[0]?.item;
  const facts = [...(r.market?.parts ?? []).map((p) => ({ ...p, num: true })), ...[...new Set(r.filings.map((f) => eventLabel(f.item!)))].map((t) => ({ t, strong: false, num: false }))];
  // the smallest Brief window that still contains the filing's day
  const winFor = (filed: string) => {
    const hours = (Date.parse(feed.generated_at) - Date.parse(`${filed}:00+05:30`)) / 36e5;
    return hours <= 24 ? "24h" : hours <= 24 * 7 ? "7d" : "30d";
  };
  const href = lead ? `/?open=${r.symbol}&w=${winFor(lead.filed)}` : r.errors.length ? null : `/research?symbol=${r.symbol}`;
  const body = (
    <>
      <span className="flex items-baseline gap-2">
        <span className="w-[5.5rem] shrink-0 truncate font-mono text-13 font-semibold text-ink">{r.symbol}</span>
        <Name name={co?.name ?? lead?.name ?? r.symbol} className="font-serif text-17 font-semibold text-ink" />
        {isNew && <span className="kicker ml-auto shrink-0 text-accent">New</span>}
      </span>
      <span className="block pl-[6rem]">
        {facts.length > 0 && (
          <span className="mt-1 block text-13 leading-[1.45] text-ink-2">
            {facts.map((f, k) => (
              <span key={k}>{k > 0 && <span className="text-ink-3">{"00a0·00a0"}</span>}<span className={`${f.num ? "font-mono" : "kicker text-ink-2"} ${f.strong ? "font-semibold text-ink" : ""}`}><Signed text={f.t} arrows /></span></span>
            ))}
          </span>
        )}
        {lead && <span className="mt-1 line-clamp-2 block text-15 leading-[1.4] text-ink-2 [overflow-wrap:anywhere]">{keyFact(lead)}</span>}
        {r.errors.map((e) => <span key={e.key} className="mt-1 block text-13 leading-[1.4] text-ink-3">{e.text}</span>)}
      </span>
    </>
  );
  return (
    <li className="border-b border-rule">
      {href ? <Link href={href} className="press block py-3">{body}</Link> : <div className="py-3">{body}</div>}
    </li>
  );
}
