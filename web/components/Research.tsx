"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { pct } from "@/lib/rank";
import { istStamp } from "@/lib/time";
import { API, indexUrl, KEPT, MISSED, NYM, researchUrl, useJson, VERDICT_TEXT, type Cite, type IndexRow, type PromiseRow, type Research } from "@/lib/research";
import { Bars, PathLine, PriceLine } from "./charts/Charts";
import { Chevron, Collapse } from "./Collapse";
import { Name, promiseCounts, shortName } from "./Company";
import { crore } from "./FeedRow";
import { Signed } from "./Signed";
import { BUTTON, LoadFailed } from "./States";

const H1 = "font-serif text-28 leading-[1.05] font-semibold tracking-[-0.01em] text-balance";
const H2 = "section-head";
const SYMBOL = /^[A-Z0-9&-]{1,20}$/;

// ---- skeleton matching the company page (header, sentence, three rows) ----
const Bar = ({ w, h = "h-3" }: { w: string; h?: string }) => <span className={`block bg-rule/60 ${h} ${w}`} />;
function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading research" className="pt-4">
      <Bar w="w-24" /><span className="mt-2 block"><Bar w="w-48" h="h-7" /></span>
      <span className="mt-4 block"><Bar w="w-full" h="h-[120px]" /></span>
      <span className="mt-7 block"><Bar w="w-[85%]" h="h-5" /></span>
      <span className="mt-2 block"><Bar w="w-[60%]" h="h-5" /></span>
      {[0, 1, 2].map((k) => <span key={k} className="mt-6 block border-t border-rule pt-4"><Bar w="w-20" h="h-5" /><span className="mt-3 block"><Bar w="w-full" h="h-12" /></span><span className="mt-3 block"><Bar w="w-full" h="h-16" /></span></span>)}
    </div>
  );
}

// ---- Research tab: search + the researched companies with their track record ----
export function ResearchHome() {
  const router = useRouter();
  const { data: rows, error, retry } = useJson<IndexRow[]>(indexUrl);
  const [q, setQ] = useState("");
  const query = q.trim().toUpperCase();
  const list = useMemo(() => {
    const all = [...(rows ?? [])].sort((a, b) => shortName(a.name).localeCompare(shortName(b.name)));
    return query ? all.filter((r) => r.symbol.includes(query) || r.name.toUpperCase().includes(query)) : all;
  }, [rows, query]);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const exact = rows?.find((r) => r.symbol === query);
    const target = exact?.symbol ?? (list.length === 1 ? list[0].symbol : query);
    if (target && SYMBOL.test(target)) router.push(`/research?symbol=${encodeURIComponent(target)}`);
  };
  if (error) return <LoadFailed what="Research" error={error} retry={retry} />;
  return (
    <section className="pt-6">
      <p className="kicker">Research</p>
      <h1 className={`mt-2 ${H1}`}>Promised vs delivered</h1>
      <p className="mt-2 text-15 leading-[1.45] text-ink-2">
        What management promised on its last four earnings calls, and what it delivered. From transcripts and results filings only.
      </p>
      <form role="search" onSubmit={go} className="mt-4">
        <label htmlFor="sym" className="sr-only">NSE symbol or company name</label>
        {/* one field: the input is the box (48px, 1px edge); focus adds a 2px navy ring as a shadow, so nothing moves */}
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-3.5 left-3 size-5 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5l5 5" />
          </svg>
          <input id="sym" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            enterKeyHint="go" placeholder="Any NSE symbol or name"
            className={`block h-12 w-full rounded-[6px] border border-rule bg-paper-raised pl-10 font-mono text-17 text-ink outline-none placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] focus-visible:outline-none ${query && SYMBOL.test(query) ? "pr-20" : "pr-3"}`} />
          {query && SYMBOL.test(query) && (
            <button type="submit" className="press absolute top-0.5 right-0.5 h-11 rounded-[4px] px-3 text-13 font-semibold text-accent">Open</button>
          )}
        </div>
      </form>
      {!rows ? (
        <ol className="card mt-8 px-3">
          {Array.from({ length: 6 }, (_, k) => (
            <li key={k} className="flex items-center gap-3 border-b border-rule py-4 last:border-b-0"><Bar w="w-16" /><Bar w="w-36" h="h-4" /></li>
          ))}
        </ol>
      ) : (
        <>
          {list.length > 0 ? (
            GROUPS.map(([head, test]) => {
              const rows = list.filter(test);
              return rows.length > 0 && (
                <section key={head} className="mt-8">
                  <h2 className="section-head flex justify-between">{head}<span className="font-mono font-normal tracking-normal text-ink-3">{rows.length}</span></h2>
                  <ol className="card mt-2 px-3">{rows.map((r) => <IndexItem key={r.symbol} r={r} />)}</ol>
                </section>
              );
            })
          ) : (
            <>
              <p className="mt-6 text-13 text-ink-3">No researched company matches &ldquo;{q.trim()}&rdquo;.</p>
              <NotResearched symbol={query} inline />
            </>
          )}
        </>
      )}
    </section>
  );
}

// Track record needs 2+ measured promises; under that FINN shows no record at all (a record of one is not a record).
const GROUPS: [string, (r: IndexRow) => boolean][] = [
  ["Track record", (r) => promiseCounts(r.summary) != null],
  ["Not enough measured yet", (r) => promiseCounts(r.summary) == null && r.summary.total > 0],
  ["No promises found", (r) => !r.summary.total],
];

// Same row grammar as the Alerts wire: ticker column, name, then the detail line under the name.
function IndexItem({ r }: { r: IndexRow }) {
  const counts = promiseCounts(r.summary);
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link href={`/research?symbol=${r.symbol}`} className="press flex min-h-12 flex-col justify-center py-3">
        <span className="flex items-baseline gap-2">
          {/* Research list only: the ticker as a chip (navy 8%, the nav pill's navy), one fixed width so every name
              starts on the same line. Not on the Brief, Alerts or company pages, where the name is the headline. */}
          <span className="w-[5.75rem] shrink-0 truncate rounded-[4px] bg-accent/8 px-1.5 py-0.5 font-mono text-13 font-semibold text-accent uppercase">{r.symbol}</span>
          <Name name={r.name} className="font-serif text-17 font-semibold text-ink" />
        </span>
        {counts && <span className="mt-1 pl-[6.25rem] font-mono text-11 tracking-[0.04em] text-ink-2 uppercase">{counts}</span>}
      </Link>
    </li>
  );
}

// ---- a symbol with no research file: research it now (live) or say why not ----
const BTN = `mt-4 ${BUTTON}`;
function NotResearched({ symbol, inline = false }: { symbol: string; inline?: boolean }) {
  const ok = API && SYMBOL.test(symbol);
  const body = (
    <>
      <p className={inline ? "font-serif text-20 leading-[1.15] font-semibold" : H1}>{symbol || "This company"} isn&rsquo;t researched yet.</p>
      <p className="mt-2 text-15 leading-[1.45] text-ink-2">
        {ok ? "FINN can research it now from its last four call transcripts and its results filings, in about 1 to 2 minutes."
          : "Research on request isn't available right now. The companies listed under Research are ready."}
      </p>
      {ok && inline && <Link href={`/research?symbol=${encodeURIComponent(symbol)}&run=1`} className={BTN}>Research this company</Link>}
    </>
  );
  if (inline) return <div className="mt-2 border-t-[1.5px] border-rule-strong pt-4">{body}</div>;
  return (
    <section className="pt-6">
      {body}
      <Link href="/research" className={BTN}>
        Researched companies
      </Link>
    </section>
  );
}

// ---- live research: POST starts a job on the API, then poll its stage until the page is ready ----
const saved = (sym: string) => `finn:research:${sym}`;
function readSaved(sym: string): Research | null {
  try { return JSON.parse(localStorage.getItem(saved(sym)) ?? "null"); } catch { return null; }
}
function save(d: Research) { // only a finished page: a failed promise check or a pending bull/bear is tried again next visit
  if (!d.pvd_error && !d.bull_bear_pending) try { localStorage.setItem(saved(d.symbol), JSON.stringify(d)); } catch { /* storage full: the server cache still has it */ }
}

// The backend's stages (pvd.stage / research.py), in order; the job's stage line says which one is running.
const STEPS: [RegExp, string][] = [
  [/waking/i, "Wake the research server"],
  [/starting|finding/i, "Find the call transcripts and results"],
  [/reading/i, "Read the last four call transcripts"],
  [/checking/i, "Check each promise against the results"],
  [/snapshot/i, "Build the financial snapshot"],
  [/bull/i, "Write bull & bear (shown on the page when ready)"],
];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
type Fail = { message: string; code?: string };

function LiveResearch({ symbol, auto, onDone }: { symbol: string; auto: boolean; onDone: (d: Research) => void }) {
  const [st, setSt] = useState<{ stage?: string; fail?: Fail; t0?: number }>({});
  const [now, setNow] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { // elapsed time, counted here so it includes the server waking up
    if (!st.t0 || st.fail) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [st.t0, st.fail]);
  const call = async (path: string, init?: RequestInit) => {
    let r: Response;
    try { r = await fetch(`${API}${path}`, init); } catch { throw { message: "Couldn't reach the research server. Check your connection, then try again." }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { message: j.detail?.message ?? `The research server answered ${r.status}. Try again in a minute.`, code: j.detail?.error };
    return j;
  };
  const run = async () => {
    const t0 = Date.now();
    setNow(t0);
    setSt({ stage: "Waking up the research server…", t0 }); // Render's free tier sleeps: the first answer can take a minute
    try {
      let job = await call(`/research/${symbol}`, { method: "POST" });
      while (job.status === "running" && !job.page && alive.current) { // page: promises + snapshot are in; bull/bear follows on the page
        setSt({ stage: job.stage, t0 });
        await new Promise((ok) => setTimeout(ok, 2500));
        job = await call(`/jobs/${job.id}`);
      }
      if (!alive.current) return;
      if (job.status !== "done" && !job.page) throw { message: job.message ?? "Research didn't finish. Try again in a few minutes.", code: job.error ?? job.status };
      const d: Research = await call(`/research/${symbol}`);
      save(d);
      if (alive.current) onDone(d);
    } catch (e) {
      const f = e as Fail;
      if (alive.current) setSt({ fail: { message: f?.message ?? String(e), code: f?.code } });
    }
  };
  const started = useRef(false);
  useEffect(() => { if (auto && !started.current) { started.current = true; run(); } }); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.fail) return <ResearchFailed symbol={symbol} fail={st.fail} retry={run} />;
  if (!st.stage) return (
    <section className="pt-6">
      <p className="kicker"><span className="font-mono tracking-normal">{symbol}</span> · Research on request</p>
      <p className={`mt-2 ${H1}`}>{symbol} isn&rsquo;t researched yet.</p>
      <p className="mt-3 border-l-[1.5px] border-rule-strong pl-3 text-15 leading-[1.45] text-ink-2">
        FINN reads its last four earnings-call transcripts, checks each promise against the results filings, and builds the page.
        About 1 to 2 minutes; a minute more if the research server is asleep.
      </p>
      <button type="button" onClick={run} className={BTN}>Research this company</button>
    </section>
  );
  const at = Math.max(0, STEPS.findIndex(([rx]) => rx.test(st.stage!)));
  const reading = st.stage.match(/Reading (.+) transcript \((\d)\/(\d)\)/);
  return (
    <section className="pt-6" aria-busy="true">
      <p className="kicker"><span className="font-mono tracking-normal">{symbol}</span> · Research on request</p>
      <p className={`mt-2 ${H1}`}>Researching {symbol}</p>
      <p className="mt-2 text-13 text-ink-3"><span className="font-mono text-ink">{clock(Math.round((now - st.t0!) / 1000))}</span> elapsed · keep this page open</p>
      <ol className="mt-4 border-t-[1.5px] border-rule-strong">
        {STEPS.map(([, label], k) => {
          const state = k < at ? "done" : k === at ? "current" : "pending";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined}
              className={`flex min-h-12 items-start gap-3 border-b border-rule py-3 text-15 leading-snug transition-colors duration-200 ease-out ${state === "pending" ? "text-ink-3" : "text-ink"}`}>
              <StepMark state={state} />
              <span>
                <span className={state === "current" ? "font-semibold" : ""}>{label}</span>
                {state === "current" && (
                  <span className="mt-0.5 block text-13 text-ink-2" role="status" aria-live="polite">
                    {reading ? `${reading[1]} call, ${reading[2]} of ${reading[3]}` : k === 0 ? "Free hosting sleeps when idle; this takes up to a minute." : st.stage}
                  </span>
                )}
                <span className="sr-only">{state === "done" ? " (done)" : state === "pending" ? " (to do)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// done: a tick drawn in (clip reveal); current: a filled ink dot; pending: an empty ring. Weight, not colour.
function StepMark({ state }: { state: "done" | "current" | "pending" }) {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" fill={state === "done" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"
        className={`origin-center transition-opacity duration-200 ease-out ${state === "pending" ? "opacity-40" : "opacity-100"} ${state === "done" ? "animate-pop [transform-box:fill-box]" : ""}`} />
      {state === "current" && <circle cx="10" cy="10" r="3.5" fill="currentColor" className="animate-pulse-dot origin-center [transform-box:fill-box]" />}
      {state === "done" && <path d="M6.5 10.5l2.3 2.3 4.7-5" fill="none" stroke="var(--color-paper)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" />}
    </svg>
  );
}

// Each failure says what happened and what the reader can still do.
function ResearchFailed({ symbol, fail, retry }: { symbol: string; fail: Fail; retry: () => void }) {
  const head = fail.code === "unknown_symbol" ? `FINN can’t find ${symbol}.`
    : fail.code === "daily_cap" || fail.code === "quota" ? "Today’s research runs are used up."
    : fail.code === "busy" ? "The research server is busy."
    : fail.code === "timeout" ? `${symbol} is taking longer than usual.`
    : `${symbol} couldn’t be researched just now.`;
  const again = !["unknown_symbol", "daily_cap", "quota"].includes(fail.code ?? "");
  return (
    <section className="pt-6" role="alert">
      <p className="kicker"><span className="font-mono tracking-normal">{symbol}</span> · Research on request</p>
      <p className={`mt-2 ${H1}`}>{head}</p>
      <p className="mt-3 border-l-[1.5px] border-rule-strong pl-3 text-15 leading-[1.45] text-ink-2">{fail.message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {again && <button type="button" onClick={retry} className={BTN.replace("mt-4 ", "")}>Try again</button>}
        <Link href="/research" className={BTN.replace("mt-4 ", "")}>{fail.code === "unknown_symbol" ? "Search again" : "Researched companies"}</Link>
      </div>
    </section>
  );
}

// ---- company page ----
export function CompanyResearch({ symbol, auto = false }: { symbol: string; auto?: boolean }) {
  const { data: stat, missing, error, retry } = useJson<Research>(SYMBOL.test(symbol) ? researchUrl(symbol) : null);
  const [live, setLive] = useState<Research | null>(() => (typeof window === "undefined" ? null : readSaved(symbol)));
  const d = stat ?? (missing ? live : undefined);
  const pending = !!live?.bull_bear_pending;
  useEffect(() => { // bull/bear is still being written: re-read the page until it lands; after 6 min, the quiet note
    if (!pending || !API) return;
    const t0 = Date.now();
    const id = setInterval(async () => {
      const r = await fetch(`${API}/research/${symbol}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (r && !r.bull_bear_pending) { clearInterval(id); save(r); setLive(r); }
      else if (Date.now() - t0 > 6 * 60_000) { clearInterval(id); setLive((l) => l && { ...l, bull_bear_pending: false }); }
    }, 5000);
    return () => clearInterval(id);
  }, [pending, symbol]);
  useEffect(() => { // the credibility chip links to #pvd; the section exists only once the data is in
    if (!d || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [d]);
  if (!SYMBOL.test(symbol) || (missing && !live && !API)) return <><Back /><NotResearched symbol={symbol} /></>;
  if (missing && !live) return <><Back /><LiveResearch symbol={symbol} auto={auto} onDone={setLive} /></>;
  if (error) return <><Back /><LoadFailed what="This research page" error={error} retry={retry} /></>;
  if (!d) return <><Back /><PageSkeleton /></>;
  if (!d.summary || !d.snapshot || !Array.isArray(d.promises)) return <><Back /><Rebuilding d={d} /></>;
  const measured = d.promises.filter((p) => p.verdict !== NYM);
  const open = d.promises.filter((p) => p.verdict === NYM);
  return (
    <article>
      <Back />
      <header className="pt-1">
        <p className="font-mono text-13 font-semibold text-ink">{d.symbol}</p>
        <h1 className="mt-1 font-serif text-28 leading-[1.05] font-semibold tracking-[-0.01em] text-balance">{shortName(d.name)}</h1>
        <p className="mt-1 text-13 text-pretty text-ink-3">{d.sector}{d.sector && d.latest_quarter && " · "}{d.latest_quarter && <>results to <span className="font-mono">{d.latest_quarter}</span></>}</p>
        {d.prices && d.prices.closes.length > 4 && (
          <div className="card mt-4 px-3 pt-3 pb-2">
            <p className="kicker mb-2">90 days vs Nifty 50</p>
            <PriceLine closes={d.prices.closes} nifty={d.prices.nifty} drawKey={`price-${d.symbol}`} />
          </div>
        )}
      </header>

      <section id="pvd" aria-labelledby="pvd-h" className="mt-8 scroll-mt-4">
        <h2 id="pvd-h" className={H2}>Promised vs delivered</h2>
        {promiseCounts(d.summary) && (
          <p className="mt-3 font-mono text-11 tracking-[0.04em] text-ink-2 uppercase">{promiseCounts(d.summary)}</p>
        )}
        <p className="mt-1 font-serif text-20 leading-[1.2] font-semibold text-balance">{d.pvd_error ?? d.summary.sentence}</p>
        {measured.some((p) => p.chart) && (
          <p className="mt-2 text-13 leading-snug text-pretty text-ink-3">Shaded: the target, up to its deadline. Dots: each quarter since the call.</p>
        )}
        {(measured.length > 0 || open.length > 0) && (
          <div className="card mt-3 px-3">
            {measured.length > 0 && <ol>{measured.map((p, k) => <PromiseItem key={k} p={p} k={k} sym={d.symbol} />)}</ol>}
            {open.length > 0 && <Unmeasured rows={open} />}
          </div>
        )}
      </section>

      <Snapshot d={d} />
      <BullBear d={d} />
      <Sources d={d} />
    </article>
  );
}

function Back() {
  return (
    <nav className="pt-2">
      <Link href="/research" className="press -ml-2 inline-flex h-11 items-center gap-1 rounded-[4px] px-2 text-13 font-semibold text-accent">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true"><path d="M10 4L6 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Research
      </Link>
    </nav>
  );
}

const ExtLink = ({ c, className = "" }: { c: Cite; className?: string }) =>
  c.url ? (
    c.url.startsWith("#") ? <a href={c.url} className={`text-accent ${className}`}>{c.label}</a>
      : <a href={c.url} target="_blank" rel="noopener" className={`text-accent ${className}`}>{c.label}</a>
  ) : <span className={className}>{c.label}</span>;

// Inline citations are one line of small text: extend the hit area to 44px without changing the layout.
const HIT = "relative transition-opacity duration-[90ms] active:opacity-60 after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']";

// "Loan-to-deposit ratio · FY26 (Apr 2025 – Mar 2026)": the period tells two promises on one metric apart.
const title = (p: PromiseRow) => {
  const m = p.metric[0].toUpperCase() + p.metric.slice(1);
  const skip = /^(not stated|unspecified|n\/a)$/i.test(p.period.trim()) || p.period.length > 32 || m.includes(p.period.replace(/'/g, ""));
  return skip ? m : `${m} · ${p.period}`;
};

// Reasons are written for a PM: no pipeline vocabulary ("computed in Python") or internal evidence ids ("R15").
const plain = (why: string) => why.replace(/;?\s*(computed|compared) in Python\.?/g, ".").replace(/\bR\d+\b,?\s*/g, "").replace(/\.\.$/, ".").trim();

// Shown for a research file from before this page existed (or half-written): calm, with the sources that do exist.
function Rebuilding({ d }: { d: Research }) {
  return (
    <section className="pt-6">
      <p className={H1}>{shortName(d.name ?? d.symbol)}&rsquo;s research is being rebuilt.</p>
      <p className="mt-2 text-15 leading-[1.45] text-ink-2">Check back in a few minutes. The call transcripts it uses:</p>
      <ul className="mt-2 border-t border-rule text-15">
        {(d.calls ?? []).map((c) => (
          <li key={c.transcript} className="flex min-h-11 items-center border-b border-rule">
            <a href={c.transcript} target="_blank" rel="noopener" className="font-semibold text-accent">{c.call} earnings call transcript</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The verdict mark sits in the left margin: missed is a heavy cross, kept a heavy tick, the rest a quiet dash.
function Mark({ v }: { v: string }) {
  const missed = MISSED.includes(v), kept = KEPT.includes(v);
  return (
    <svg viewBox="0 0 20 20" className={`mt-0.5 size-5 ${missed || kept ? "text-ink" : "text-ink-3"}`} aria-hidden="true">
      {missed ? <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
        : kept ? <path d="M3.5 10.5l4 4 9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
        : <path d="M5 10h10" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}
const verdictWeight = (v: string) => (MISSED.includes(v) ? "font-bold text-ink" : KEPT.includes(v) ? "font-semibold text-ink" : "font-semibold text-ink-3");

// "+10.4% → +15.8% (Q2 FY26 → Q2 FY27)" is what the chart shows; the actual line keeps only the measured result.
const actualShort = (a: string) => a.replace(/\s*·\s*[^·]*$/, (m) => (m.length > 60 ? "" : m));

function PromiseItem({ p, k, sym }: { p: PromiseRow; k: number; sym: string }) {
  const [open, setOpen] = useState(false);
  const c = p.chart;
  const id = `pr-${k}`;
  const call = `${p.call} call${p.page ? `, p.${p.page}` : ""}`;
  const desc = c ? `${p.metric} by quarter: ${c.points.map(([q, v]) => `${q} ${c.kind === "growth" ? pct(v) : `${v}%`}`).join(", ")}.` +
    ` Target ${c.lo != null && c.hi != null ? `${c.lo} to ${c.hi}%` : c.lo != null ? `at least ${c.lo}%` : `at most ${c.hi}%`}.` : "";
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-x-2 border-b border-rule py-4 last:border-b-0">
      <Mark v={p.verdict} />
      <div className="min-w-0">
      <p className={`kicker ${verdictWeight(p.verdict)}`}>{VERDICT_TEXT[p.verdict] ?? p.verdict}</p>
      <p className="mt-1 font-serif text-17 leading-[1.2] font-semibold text-ink">{title(p)}</p>
      <blockquote className="mt-2 text-15 leading-[1.45] text-ink-2">
        <p className={open ? "" : "line-clamp-3"}>&ldquo;{p.quote}&rdquo;</p>
        <footer className="mt-1 font-mono text-11 text-ink-3">
          <a href={p.transcript} target="_blank" rel="noopener" className={`text-accent ${HIT}`}>{call}</a>
        </footer>
      </blockquote>
      {c && (
        <div className="mt-3">
          <PathLine points={c.points} lo={c.lo} hi={c.hi} end={c.end} signed={c.kind === "growth"} drawKey={`${sym}-${k}`} describe={desc} miss={MISSED.includes(p.verdict)} />
        </div>
      )}
      <p className={`mt-2 text-13 leading-[1.45] text-pretty text-ink ${open ? "" : "line-clamp-3"}`}><span className="kicker mr-1">Actual</span><Signed text={actualShort(p.actual)} /></p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="press -mb-2 flex min-h-11 w-full items-center justify-between gap-1 rounded-[4px] text-left text-13 font-semibold text-accent">
        {open ? "Hide how it was measured" : "How it was measured"} <Chevron open={open} />
      </button>
      <Collapse open={open} id={id}>
        <div className="pb-1 text-13 leading-[1.45] text-ink-2">
          <p>{plain(p.why)}</p>
          {p.path && <p className="mt-1 text-ink-3">Path: <Signed text={p.path} /></p>}
          {p.actual_source && <p className="mt-1 text-ink-3">Source: {p.actual_source}</p>}
          {p.cites.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {p.cites.map((c, j) => <li key={j} className="py-1.5"><ExtLink c={c} className={HIT} /></li>)}
            </ul>
          )}
        </div>
      </Collapse>
      </div>
    </li>
  );
}

function Unmeasured({ rows }: { rows: PromiseRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-rule first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls="nym" onClick={() => setOpen(!open)}
        className="press flex min-h-12 w-full items-center justify-between gap-3 text-left text-13 font-semibold text-accent">
        {open ? `Hide the ${rows.length} unmeasured` : `${rows.length} more ${rows.length === 1 ? "promise" : "promises"} can't be measured yet`}
        <Chevron open={open} />
      </button>
      <Collapse open={open} id="nym">
        <ol className="border-t border-rule">
          {rows.map((p, k) => (
            <li key={k} className="border-b border-rule py-3 text-13 leading-[1.45] text-ink-2 last:border-b-0">
              <p className="text-15 font-semibold text-ink">{title(p)} · {p.target}</p>
              <p className="mt-1 line-clamp-2">&ldquo;{p.quote}&rdquo;</p>
              <p className="mt-1 text-ink-3">
                <a href={p.transcript} target="_blank" rel="noopener" className={`font-mono text-11 text-accent ${HIT}`}>{p.call} call{p.page ? `, p.${p.page}` : ""}</a> · {plain(p.why)}
              </p>
            </li>
          ))}
        </ol>
      </Collapse>
    </div>
  );
}

// ---- financial snapshot: each chart sits under the one-line claim it supports ----
const short = (p: string) => `${p.slice(0, 3)} ${p.slice(-2)}`; // "Sep 2026" -> "Sep 26"
const ends = (xs: unknown[]) => (xs.length > 1 ? [0, xs.length - 1] : [0]);

function Claim({ id, claim, children }: { id: string; claim: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-4 border-b border-rule py-4 last:border-b-0">
      <p className="font-serif text-17 leading-[1.25] font-semibold text-pretty text-ink"><Signed text={claim} /></p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Snapshot({ d }: { d: Research }) {
  const s = d.snapshot;
  const q = s.quarters, m = s.margin;
  const cash = s.cash && "years" in s.cash ? s.cash : null;
  const lev = s.leverage && "years" in s.leverage ? s.leverage : null;
  const note = (s.cash && "note" in s.cash && s.cash.note) || null;
  if (!q && !m && !cash && !lev) return (
    <section className="mt-10 border-t-[1.5px] border-rule-strong pt-3">
      <p className="text-13 text-ink-3">No financial snapshot: screener.in has no results tables for this company yet.</p>
    </section>
  );
  return (
    <section aria-labelledby="snap-h" className="mt-10">
      <h2 id="snap-h" className={H2}>Financial snapshot</h2>
      <p className="mt-2 text-13 text-ink-3">{s.basis[0].toUpperCase() + s.basis.slice(1)} · ₹ crore · from the results filings</p>
      <div className="card mt-2 px-3">
        {q && (
          <Claim id="quarters" claim={q.claim}>
            <p className="kicker mb-2">{q.revenue_name}</p>
            <Bars periods={q.periods.map(short)} series={[{ name: q.revenue_name, values: q.revenue, tone: "ink" }]} labelAt={ends(q.periods)} drawKey={`rev-${d.symbol}`}
              format={(v) => crore(v)} tipValue={(v) => `₹${crore(v)} cr`} describe={`${q.revenue_name} by quarter, ₹ crore: ${q.periods.map((p, k) => `${p} ${crore(q.revenue[k])}`).join(", ")}.`} />
            <p className="kicker mt-3 mb-2">PAT</p>
            <Bars periods={q.periods.map(short)} series={[{ name: "PAT", values: q.pat, tone: "ink" }]} labelAt={ends(q.periods)} drawKey={`pat-${d.symbol}`}
              format={(v) => crore(v)} tipValue={(v) => `₹${crore(v)} cr`} describe={`PAT by quarter, ₹ crore: ${q.periods.map((p, k) => `${p} ${crore(q.pat[k])}`).join(", ")}.`} />
          </Claim>
        )}
        {m && (
          <Claim id="margin" claim={m.claim}>
            <p className="kicker mb-2">{m.name}</p>
            <PathLine points={m.periods.map((p, k) => [short(p), m.values[k]] as [string, number])} height={88}
              labelAt={ends(m.periods)} drawKey={`margin-${d.symbol}`}
              describe={`${m.name} by quarter: ${m.periods.map((p, k) => `${p} ${m.values[k].toFixed(1)}%`).join(", ")}.`} />
          </Claim>
        )}
        {cash && (
          <Claim id="cash" claim={cash.claim}>
            <Bars periods={cash.years} series={[{ name: "CFO", values: cash.cfo, tone: "ink" }, { name: "PAT", values: cash.pat, tone: "faint" }]}
              labelAt={[cash.years.length - 1]} format={(_, name) => name} tipValue={(v) => `₹${crore(v)} cr`} drawKey={`cash-${d.symbol}`}
              describe={`Cash from operations vs PAT, ₹ crore: ${cash.years.map((y, k) => `${y} ${crore(cash.cfo[k])} vs ${crore(cash.pat[k])}`).join(", ")}.`} />
          </Claim>
        )}
        {lev && (
          <Claim id="leverage" claim={lev.claim}>
            <Bars periods={lev.years} series={[{ name: "Debt/equity", values: lev.values, tone: "ink" }]} labelAt={ends(lev.years)} drawKey={`lev-${d.symbol}`}
              format={(v) => v.toFixed(2)} describe={`Debt to equity at year end: ${lev.years.map((y, k) => `${y} ${lev.values[k].toFixed(2)}`).join(", ")}.`} />
          </Claim>
        )}
      </div>
      {note && <p className="pt-3 text-13 text-ink-3">Cash conversion and debt/equity: {note.replace(/^Not shown for lenders: /, "not shown for lenders; ")}</p>}
    </section>
  );
}

// ---- bull vs bear: model-written, every number checked against the cited evidence ----
function BullBear({ d }: { d: Research }) {
  const b = d.bull_bear;
  if (!b) return (
    <section className="mt-10 border-t-[1.5px] border-rule-strong pt-3">
      <p className="text-13 text-ink-3" role="status" aria-live="polite">
        {d.bull_bear_pending ? "Writing bull & bear…" : "No bull & bear: the AI models were unavailable when this page was built. Everything above comes straight from the filings."}
      </p>
    </section>
  );
  const side = (name: string, pts: typeof b.bull) => (
    <div className="mt-5">
      <h3 className="kicker flex items-center gap-3 text-ink before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">{name}</h3>
      <ol className="card mt-2 px-3">
        {pts.map((p, k) => (
          <li key={k} className="border-b border-rule py-3 last:border-b-0">
            <p className="text-15 leading-[1.45] text-ink-2"><strong className="font-semibold text-ink"><Signed text={p.point} /></strong>{p.why && <> {p.why}</>}</p>
            <p className="mt-1 font-mono text-11 leading-6 text-ink-3">{p.cites.map((c, j) => <span key={j}>{j > 0 && " · "}<ExtLink c={c} className={HIT} /></span>)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section aria-labelledby="bb-h" className="mt-10">
      <h2 id="bb-h" className={H2}>Bull and bear</h2>
      {b.bull.length > 0 && side("The case for", b.bull)}
      {b.bear.length > 0 && side("The case against", b.bear)}
      <p className="mt-3 text-11 leading-[1.45] text-ink-3">
        Generated from the cited statements and figures only.
        {b.dropped > 0 && ` ${b.dropped} ${b.dropped === 1 ? "point" : "points"} failed FINN's checks (numbers not in the source, a generic reason, or a clash with a promise verdict) and ${b.dropped === 1 ? "was" : "were"} dropped.`}
        {b.note && ` ${b.note}`}
      </p>
    </section>
  );
}

function Sources({ d }: { d: Research }) {
  const when = istStamp(d.generated_at);
  return (
    <section aria-labelledby="src-h" className="mt-10">
      <h2 id="src-h" className={H2}>Sources</h2>
      <ul className="card mt-2 px-3 text-13 leading-snug">
        {d.sources.map((c) => <li key={c.url} className="border-b border-rule last:border-b-0"><ExtLink c={c} className="press flex min-h-11 items-center py-2 font-semibold" /></li>)}
      </ul>
      {d.skipped_calls.length > 0 && (
        <p className="mt-2 text-11 text-ink-3">Skipped: {d.skipped_calls.map((c) => `${c.call} (transcript didn't open)`).join(", ")}.</p>
      )}
      <p className="mt-2 text-11 leading-[1.45] text-ink-3">
        {d.margin_definition && `Margin promises are judged on ${d.margin_definition.name}. `}Built {when} IST.
      </p>
    </section>
  );
}
