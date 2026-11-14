"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { pct } from "@/lib/rank";
import { API, countsText, indexUrl, KEPT, MISSED, NYM, researchUrl, useJson, VERDICT_TEXT, type Cite, type IndexRow, type PromiseRow, type Research } from "@/lib/research";
import { Bars, PathLine, PriceLine } from "./Charts";
import { Chevron, Collapse } from "./Collapse";
import { Avatar, shortName } from "./Company";
import { crore } from "./FeedRow";
import { Signed } from "./Signed";
import { LoadFailed } from "./States";

const H1 = "font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance";
const H2 = "font-serif text-[1.1875rem] leading-tight font-semibold";
const SYMBOL = /^[A-Z0-9&-]{1,20}$/;

// ---- skeleton matching the company page (header, sentence, three rows) ----
const Bar = ({ w, h = "h-3" }: { w: string; h?: string }) => <span className={`block rounded-[2px] bg-paper-2 ${h} ${w}`} />;
function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading research" className="pt-4">
      <span className="flex items-center gap-3"><Bar w="size-10" h="" /><span className="flex-1"><Bar w="w-48" h="h-6" /><span className="mt-2 block"><Bar w="w-32" /></span></span></span>
      <span className="mt-4 block"><Bar w="w-full" h="h-20" /></span>
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
    <section className="pt-5">
      <h1 className={H1}>Research</h1>
      <p className="mt-2 text-[0.9375rem] leading-snug text-ink-2">
        What management promised on its last four earnings calls, and what it delivered. From transcripts and results filings only.
      </p>
      <form role="search" onSubmit={go} className="mt-4">
        <label htmlFor="sym" className="sr-only">NSE symbol or company name</label>
        <div className="flex h-12 items-center gap-2 rounded-md border border-ink/40 bg-paper px-3 focus-within:border-accent">
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5l5 5" />
          </svg>
          <input id="sym" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            enterKeyHint="go" placeholder="Any NSE symbol or name"
            className="h-full min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-ink-2" />
          {query && SYMBOL.test(query) && (
            <button type="submit" className="-mr-1 h-9 shrink-0 rounded-[0.375rem] px-2 text-[0.875rem] font-medium text-accent active:bg-paper-2">Open</button>
          )}
        </div>
      </form>
      {!rows ? (
        <ol className="mt-5 border-t border-rule">
          {Array.from({ length: 6 }, (_, k) => (
            <li key={k} className="flex items-center gap-3 border-b border-rule py-3"><Bar w="size-8" h="" /><span className="flex-1"><Bar w="w-36" h="h-3.5" /><span className="mt-2 block"><Bar w="w-24" /></span></span></li>
          ))}
        </ol>
      ) : (
        <>
          <h2 className="mt-6 text-[0.8125rem] text-ink-2">
            {query ? `${list.length} of ${rows.length} researched` : `${rows.length} researched · track record on promises, last 4 calls`}
          </h2>
          {list.length > 0 ? (
            <ol className="mt-1 border-t border-rule">
              {list.map((r) => (
                <li key={r.symbol}>
                  <Link href={`/research?symbol=${r.symbol}`}
                    className="flex min-h-14 items-center gap-3 border-b border-rule py-2.5 transition-colors duration-150 ease-out active:bg-paper-2">
                    <Avatar name={r.name} sector={r.sector} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[0.9375rem] font-medium">{shortName(r.name)}</span>
                      <span className="text-[0.75rem] text-ink-2">{r.symbol}</span>
                    </span>
                    <span className="shrink-0 text-right text-[0.8125rem] leading-tight">
                      {r.summary.measured > 0 ? (
                        <>
                          <span className="block font-medium">{countsText(r.summary)}</span>
                          <span className="text-[0.75rem] text-ink-2">of {r.summary.measured} measured</span>
                        </>
                      ) : (
                        <span className="text-ink-2">{r.summary.total ? "Nothing measurable yet" : "No promises found"}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <NotResearched symbol={query} inline />
          )}
        </>
      )}
    </section>
  );
}

// ---- a symbol with no research file: research it now (live) or say why not ----
const BTN = "mt-4 inline-flex h-11 items-center rounded-md border border-ink/70 px-4 text-[0.9375rem] font-medium hover:bg-paper-2 disabled:opacity-50";
function NotResearched({ symbol, inline = false }: { symbol: string; inline?: boolean }) {
  const ok = API && SYMBOL.test(symbol);
  const body = (
    <>
      <p className={inline ? "font-serif text-[1.1875rem] font-semibold" : H1}>{symbol || "This company"} isn&rsquo;t researched yet.</p>
      <p className="mt-2 text-[0.9375rem] leading-snug text-ink-2">
        {ok ? "FINN can research it now from its last four call transcripts and its results filings. It takes a few minutes."
          : "Research on request isn't available right now. The companies listed under Research are ready."}
      </p>
      {ok && inline && <Link href={`/research?symbol=${encodeURIComponent(symbol)}&run=1`} className={BTN}>Research this company</Link>}
    </>
  );
  if (inline) return <div className="border-t border-rule pt-4">{body}</div>;
  return (
    <section className="pt-5">
      {body}
      <Link href="/research" className="mt-4 inline-flex h-11 items-center rounded-md border border-ink/70 px-4 text-[0.9375rem] font-medium hover:bg-paper-2">
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

function LiveResearch({ symbol, auto, onDone }: { symbol: string; auto: boolean; onDone: (d: Research) => void }) {
  const [st, setSt] = useState<{ stage?: string; error?: string; seconds?: number }>({});
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const call = async (path: string, init?: RequestInit) => {
    let r: Response;
    try { r = await fetch(`${API}${path}`, init); } catch { throw new Error("Couldn't reach the research server. Check your connection, then try again."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail?.message ?? `The research server answered ${r.status}. Try again in a minute.`);
    return j;
  };
  const run = async () => {
    setSt({ stage: "Waking up the research server…" }); // Render's free tier sleeps: the first answer can take a minute
    try {
      let job = await call(`/research/${symbol}`, { method: "POST" });
      while (job.status === "running" && alive.current) {
        setSt({ stage: job.stage, seconds: job.seconds });
        await new Promise((ok) => setTimeout(ok, 2500));
        job = await call(`/jobs/${job.id}`);
      }
      if (!alive.current) return;
      if (job.status !== "done") throw new Error(job.message ?? "Research didn't finish. Try again in a few minutes.");
      const d: Research = await call(`/research/${symbol}`);
      if (!d.pvd_error) try { localStorage.setItem(saved(symbol), JSON.stringify(d)); } catch { /* storage full: the server cache still has it */ }
      if (alive.current) onDone(d);
    } catch (e) {
      if (alive.current) setSt({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  const started = useRef(false);
  useEffect(() => { if (auto && !started.current) { started.current = true; run(); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = !!st.stage && !st.error;
  return (
    <section className="pt-5">
      <p className={H1}>{symbol}</p>
      {busy ? (
        <>
          <p className="mt-3 text-[1rem] font-medium" role="status" aria-live="polite">{st.stage}</p>
          {st.seconds != null && <p className="text-[0.8125rem] text-ink-2 tabular-nums" aria-hidden="true">{Math.floor(st.seconds / 60)}:{String(st.seconds % 60).padStart(2, "0")} elapsed</p>}
          <p className="mt-1 text-[0.875rem] leading-snug text-ink-2">Reading the last four call transcripts and the results filings. This takes a few minutes; keep this page open.</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink-2" role={st.error ? "alert" : undefined}>
            {st.error ?? "Not researched yet. FINN can research it now from its last four call transcripts and its results filings. It takes a few minutes."}
          </p>
          <button type="button" onClick={run} className={BTN}>{st.error ? "Try again" : "Research this company"}</button>
        </>
      )}
    </section>
  );
}

// ---- company page ----
export function CompanyResearch({ symbol, auto = false }: { symbol: string; auto?: boolean }) {
  const { data: stat, missing, error, retry } = useJson<Research>(SYMBOL.test(symbol) ? researchUrl(symbol) : null);
  const [live, setLive] = useState<Research | null>(() => (typeof window === "undefined" ? null : readSaved(symbol)));
  const d = stat ?? (missing ? live : undefined);
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
        <div className="flex items-center gap-3">
          <Avatar name={d.name} sector={d.sector} />
          <div className="min-w-0">
            <h1 className={H1}>{shortName(d.name)}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-pretty text-ink-2">{d.symbol}{d.sector && ` · ${d.sector}`}{d.latest_quarter && ` · results to ${d.latest_quarter}`}</p>
          </div>
        </div>
        {d.prices && d.prices.closes.length > 4 && (
          <div className="mt-4">
            <p className="mb-1 text-[0.75rem] text-ink-2">90 days, vs Nifty 50</p>
            <PriceLine closes={d.prices.closes} nifty={d.prices.nifty} drawKey={`price-${d.symbol}`} />
          </div>
        )}
      </header>

      <section id="pvd" aria-labelledby="pvd-h" className="mt-6 scroll-mt-4 border-t border-ink/80 pt-4">
        <h2 id="pvd-h" className={H2}>Promised vs delivered</h2>
        {d.summary.measured > 0 && (
          <p className="mt-2 text-[0.8125rem] font-medium">
            {countsText(d.summary)} <span className="font-normal text-ink-2">of {d.summary.measured} measured {d.summary.measured === 1 ? "promise" : "promises"}</span>
          </p>
        )}
        <p className="mt-1 font-serif text-[1.1875rem] leading-snug font-semibold text-balance">{d.pvd_error ?? d.summary.sentence}</p>
        {d.model_note && <p className="mt-1.5 text-[0.75rem] text-ink-2">{d.model_note}</p>}
        {measured.some((p) => p.chart) && (
          <p className="mt-3 text-[0.8125rem] leading-snug text-pretty text-ink-2">Shaded: the target, up to its deadline. Dots: each quarter since the call.</p>
        )}
        {measured.length > 0 && (
          <ol className="mt-3 border-t border-rule">{measured.map((p, k) => <PromiseItem key={k} p={p} k={k} sym={d.symbol} />)}</ol>
        )}
        {open.length > 0 && <Unmeasured rows={open} />}
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
      <Link href="/research" className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-[0.875rem] font-medium text-accent">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true"><path d="M10 4L6 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Research
      </Link>
    </nav>
  );
}

const ExtLink = ({ c, className = "" }: { c: Cite; className?: string }) =>
  c.url ? (
    c.url.startsWith("#") ? <a href={c.url} className={`text-accent underline ${className}`}>{c.label}</a>
      : <a href={c.url} target="_blank" rel="noopener" className={`text-accent underline ${className}`}>{c.label}</a>
  ) : <span className={className}>{c.label}</span>;

// Inline citations are one line of small text: extend the hit area to 44px without changing the layout.
const HIT = "relative after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']";

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
    <section className="pt-5">
      <p className={H1}>{shortName(d.name ?? d.symbol)}&rsquo;s research is being rebuilt.</p>
      <p className="mt-2 text-[0.9375rem] leading-snug text-ink-2">Check back in a few minutes. The call transcripts it uses:</p>
      <ul className="mt-1 text-[0.875rem]">
        {(d.calls ?? []).map((c) => (
          <li key={c.transcript} className="flex min-h-11 items-center">
            <a href={c.transcript} target="_blank" rel="noopener" className="text-accent underline">{c.call} earnings call transcript</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Misses carry the most ink (filled), kept is outlined, everything in between is quiet: weight, not colour.
function Verdict({ v }: { v: string }) {
  const style = MISSED.includes(v) ? "border-ink bg-ink text-paper" : KEPT.includes(v) ? "border-ink/70 text-ink" : "border-rule text-ink-2";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.75rem] leading-[1.1rem] font-semibold ${style}`}>{VERDICT_TEXT[v] ?? v}</span>;
}

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
    <li className="border-b border-rule py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[0.9375rem] leading-snug font-semibold">{title(p)}</p>
        <Verdict v={p.verdict} />
      </div>
      <blockquote className="mt-1 text-[0.875rem] leading-snug">
        <p className={open ? "" : "line-clamp-3"}>&ldquo;{p.quote}&rdquo;</p>
        <footer className="mt-0.5 text-[0.75rem] text-ink-2">
          <a href={p.transcript} target="_blank" rel="noopener" className={`text-accent underline ${HIT}`}>{call}</a>
        </footer>
      </blockquote>
      {c && (
        <div className="mt-2.5">
          <PathLine points={c.points} lo={c.lo} hi={c.hi} end={c.end} signed={c.kind === "growth"} drawKey={`${sym}-${k}`} describe={desc} />
        </div>
      )}
      <p className={`mt-2 text-[0.8125rem] leading-snug text-pretty ${open ? "" : "line-clamp-3"}`}><Signed text={actualShort(p.actual)} /></p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="mt-0.5 -mb-2 flex min-h-11 items-center gap-1 text-[0.8125rem] font-medium text-accent">
        {open ? "Hide how it was measured" : "How it was measured"} <Chevron open={open} />
      </button>
      <Collapse open={open} id={id}>
        <div className="pb-1 text-[0.8125rem] leading-snug">
          <p>{plain(p.why)}</p>
          {p.path && <p className="mt-1 text-ink-2">Path: <Signed text={p.path} /></p>}
          {p.actual_source && <p className="mt-1 text-ink-2">Source: {p.actual_source}{p.model && !p.model.startsWith("python") ? ` · evidence picked by ${p.model.split(" ")[0].split("/").pop()}` : ""}</p>}
          {p.cites.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {p.cites.map((c, j) => <li key={j} className="py-1.5"><ExtLink c={c} className={HIT} /></li>)}
            </ul>
          )}
        </div>
      </Collapse>
    </li>
  );
}

function Unmeasured({ rows }: { rows: PromiseRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-rule">
      <button type="button" aria-expanded={open} aria-controls="nym" onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-[0.875rem] font-medium text-accent">
        {open ? `Hide the ${rows.length} unmeasured` : `${rows.length} more ${rows.length === 1 ? "promise" : "promises"} can't be measured yet`}
        <Chevron open={open} />
      </button>
      <Collapse open={open} id="nym">
        <ol className="border-t border-rule">
          {rows.map((p, k) => (
            <li key={k} className="border-b border-rule py-3 text-[0.8125rem] leading-snug last:border-b-0">
              <p className="text-[0.875rem] font-medium">{title(p)} · {p.target}</p>
              <p className="mt-0.5 line-clamp-2">&ldquo;{p.quote}&rdquo;</p>
              <p className="mt-0.5 text-ink-2">
                <a href={p.transcript} target="_blank" rel="noopener" className={`text-accent underline ${HIT}`}>{p.call} call{p.page ? `, p.${p.page}` : ""}</a> · {plain(p.why)}
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

function Claim({ id, claim, children }: { id: string; claim: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-4 border-t border-rule py-3.5">
      <p className="text-[0.9375rem] leading-snug font-medium text-pretty"><Signed text={claim} /></p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Snapshot({ d }: { d: Research }) {
  const s = d.snapshot;
  const q = s.quarters, m = s.margin;
  const last = q ? q.periods.length - 1 : 0;
  const yago = q ? q.periods.indexOf(q.periods[last].replace(/\d{4}$/, (y) => String(+y - 1))) : -1;
  const mark = [yago, last].filter((k) => k >= 0);
  const cash = s.cash && "years" in s.cash ? s.cash : null;
  const lev = s.leverage && "years" in s.leverage ? s.leverage : null;
  const note = (s.cash && "note" in s.cash && s.cash.note) || null;
  if (!q && !m && !cash && !lev) return null;
  return (
    <section aria-labelledby="snap-h" className="mt-9">
      <h2 id="snap-h" className={H2}>Financial snapshot</h2>
      <p className="mt-1 text-[0.8125rem] text-ink-2">{s.basis[0].toUpperCase() + s.basis.slice(1)} · ₹ crore · from the results filings</p>
      <div className="mt-3">
        {q && (
          <Claim id="quarters" claim={q.claim}>
            <p className="text-[0.75rem] text-ink-2">{q.revenue_name}</p>
            <Bars periods={q.periods.map(short)} series={[{ name: q.revenue_name, values: q.revenue, tone: "ink" }]} labelAt={mark}
              format={(v) => crore(v)} describe={`${q.revenue_name} by quarter, ₹ crore: ${q.periods.map((p, k) => `${p} ${crore(q.revenue[k])}`).join(", ")}.`} />
            <p className="mt-1 text-[0.75rem] text-ink-2">PAT</p>
            <Bars periods={q.periods.map(short)} series={[{ name: "PAT", values: q.pat, tone: "ink" }]} labelAt={mark} height={32}
              format={(v) => crore(v)} describe={`PAT by quarter, ₹ crore: ${q.periods.map((p, k) => `${p} ${crore(q.pat[k])}`).join(", ")}.`} />
          </Claim>
        )}
        {m && (
          <Claim id="margin" claim={m.claim}>
            <p className="text-[0.75rem] text-ink-2">{m.name}</p>
            <PathLine points={m.periods.map((p, k) => [short(p), m.values[k]] as [string, number])} plot={40}
              labelAt={[m.periods.length - 5, m.periods.length - 1].filter((k) => k >= 0)} drawKey={`margin-${d.symbol}`}
              describe={`${m.name} by quarter: ${m.periods.map((p, k) => `${p} ${m.values[k].toFixed(1)}%`).join(", ")}.`} />
          </Claim>
        )}
        {cash && (
          <Claim id="cash" claim={cash.claim}>
            <Bars periods={cash.years} series={[{ name: "CFO", values: cash.cfo, tone: "ink" }, { name: "PAT", values: cash.pat, tone: "faint" }]}
              labelAt={[cash.years.length - 1]} format={(_, name) => name}
              describe={`Cash from operations vs PAT, ₹ crore: ${cash.years.map((y, k) => `${y} ${crore(cash.cfo[k])} vs ${crore(cash.pat[k])}`).join(", ")}.`} />
          </Claim>
        )}
        {lev && (
          <Claim id="leverage" claim={lev.claim}>
            <Bars periods={lev.years} series={[{ name: "Debt/equity", values: lev.values, tone: "ink" }]} labelAt={lev.values.map((_, k) => k)} height={32}
              format={(v) => v.toFixed(2)} describe={`Debt to equity at year end: ${lev.years.map((y, k) => `${y} ${lev.values[k].toFixed(2)}`).join(", ")}.`} />
          </Claim>
        )}
        {note && <p className="border-t border-rule pt-3 text-[0.8125rem] text-ink-2">Cash conversion and debt/equity: {note.replace(/^Not shown for lenders: /, "not shown for lenders; ")}</p>}
      </div>
    </section>
  );
}

// ---- bull vs bear: model-written, every number checked against the cited evidence ----
function BullBear({ d }: { d: Research }) {
  const b = d.bull_bear;
  if (!b) return (
    <section className="mt-9 border-t border-rule pt-3">
      <p className="text-[0.8125rem] text-ink-2">The bull and bear case isn&rsquo;t available for {shortName(d.name)} right now. Everything else on this page is computed from the filings.</p>
    </section>
  );
  const side = (name: string, pts: typeof b.bull) => (
    <div className="mt-4">
      <h3 className="text-[0.9375rem] font-semibold">{name}</h3>
      <ol className="mt-1 border-t border-rule">
        {pts.map((p, k) => (
          <li key={k} className="border-b border-rule py-2.5">
            <p className="text-[0.9375rem] leading-snug"><Signed text={p.point} />{p.why && <span className="text-ink-2"> {p.why}</span>}</p>
            <p className="mt-1 text-[0.75rem] leading-6 text-ink-2">{p.cites.map((c, j) => <span key={j}>{j > 0 && " · "}<ExtLink c={c} className={HIT} /></span>)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section aria-labelledby="bb-h" className="mt-9">
      <h2 id="bb-h" className={H2}>Bull and bear</h2>
      {side("Bull", b.bull)}
      {side("Bear", b.bear)}
      <p className="mt-2 text-[0.75rem] leading-snug text-ink-2">
        Written by {b.model.split("/").pop()} from the cited statements, questions and figures only.
        {b.dropped > 0 && ` ${b.dropped} ${b.dropped === 1 ? "point was" : "points were"} dropped because ${b.dropped === 1 ? "its" : "their"} numbers weren't in the cited source.`}
        {b.model_note && ` ${b.model_note}.`}
      </p>
    </section>
  );
}

function Sources({ d }: { d: Research }) {
  const when = new Date(d.generated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <section aria-labelledby="src-h" className="mt-9">
      <h2 id="src-h" className={H2}>Sources</h2>
      <ul className="mt-1 text-[0.8125rem] leading-snug">
        {d.sources.map((c) => <li key={c.url} className="flex min-h-11 items-center"><ExtLink c={c} /></li>)}
      </ul>
      {d.skipped_calls.length > 0 && (
        <p className="mt-2 text-[0.75rem] text-ink-2">Skipped: {d.skipped_calls.map((c) => `${c.call} (transcript didn't open)`).join(", ")}.</p>
      )}
      <p className="mt-2 text-[0.75rem] text-ink-2">
        {d.margin_definition && `Margin promises are judged on ${d.margin_definition.name}. `}Built {when} IST.
      </p>
    </section>
  );
}
