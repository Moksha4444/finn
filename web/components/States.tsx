// Loading and failure states shared by every screen. Skeletons follow the real layout (rules, not boxes) so nothing jumps.

const Bar = ({ w, h = "h-3" }: { w: string; h?: string }) => <span className={`block bg-rule/60 ${h} ${w}`} />;

export function FeedSkeleton({ rows = 7, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading the brief">
      {header && (
        <div className="pt-4">
          <span className="mx-auto block w-32"><Bar w="w-32" h="h-8" /></span>
          <span className="mt-3 block border-y-[1.5px] border-rule-strong py-1.5"><Bar w="w-full" /></span>
          <span className="mt-4 block border-y border-rule py-3"><Bar w="w-full" h="h-5" /></span>
          <span className="mt-6 block"><Bar w="w-[80%]" h="h-9" /></span>
          <span className="mt-2 block"><Bar w="w-48" /></span>
          <span className="mt-6 block border border-rule px-4 py-4">
            <Bar w="w-40" /><span className="mt-3 block"><Bar w="w-[85%]" h="h-7" /></span>
            <span className="mt-4 flex justify-between"><Bar w="w-28" h="h-9" /><Bar w="w-[120px]" h="h-9" /></span>
          </span>
        </div>
      )}
      <ol className={header ? "mt-2" : "mt-4 border-t border-rule"}>
        {Array.from({ length: header ? 3 : rows }, (_, k) => (
          <li key={k} className="border-b border-rule py-4">
            <Bar w="w-32" /><span className="mt-2 block"><Bar w={k % 2 ? "w-[70%]" : "w-[85%]"} h="h-5" /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const BUTTON = "press inline-flex h-11 items-center rounded-[4px] border border-ink px-4 text-15 font-semibold text-ink disabled:border-rule disabled:text-ink-3";

export function LoadFailed({ error, retry, what = "The brief" }: { error: string; retry: () => void; what?: string }) {
  return (
    <section className="pt-6" role="alert">
      <p className="kicker">Not loaded</p>
      <h1 className="mt-2 font-serif text-26 leading-[1.1] font-semibold tracking-[-0.01em]">{what} didn&rsquo;t load.</h1>
      <p className="mt-2 text-15 text-ink-2">
        {error.startsWith("HTTP 5")
          ? `FINN's data server didn't respond (${error}). Try again in a minute.`
          : `The data file couldn't be fetched (${error}). Check your connection, then try again.`}{" "}
        The original filings are still on BSE and NSE.
      </p>
      <button type="button" onClick={retry} className={`mt-4 ${BUTTON}`}>Try again</button>
    </section>
  );
}
