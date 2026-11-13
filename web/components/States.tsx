// Loading and failure states shared by every screen. Skeleton rows match the real 2-line row so nothing jumps.

const Bar = ({ w, h = "h-3" }: { w: string; h?: string }) => <span className={`block rounded-[2px] bg-paper-2 ${h} ${w}`} />;

export function FeedSkeleton({ rows = 7, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading the brief">
      {header && (
        <div className="pt-5 pb-4">
          <Bar w="w-56" />
          <span className="mt-2.5 block"><Bar w="w-64" h="h-7" /></span>
          <span className="mt-2 block"><Bar w="w-48" h="h-4" /></span>
          <span className="mt-4 block"><Bar w="w-full" h="h-11" /></span>
        </div>
      )}
      {header ? (
        <ol className="mt-6 space-y-3">
          {[0, 1].map((k) => (
            <li key={k} className="rounded-xl border border-rule bg-card px-4 py-3.5">
              <span className="flex items-center gap-3"><Bar w="size-10" h="" /><span className="flex-1"><Bar w="w-32" h="h-4" /><span className="mt-1.5 block"><Bar w="w-48" /></span></span></span>
              <span className="mt-4 block"><Bar w="w-[80%]" h="h-5" /></span>
              <span className="mt-4 grid grid-cols-2 gap-4"><Bar w="w-24" h="h-9" /><Bar w="w-24" h="h-9" /></span>
              <span className="mt-4 block"><Bar w="w-full" h="h-8" /></span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="border-t border-rule">
          {Array.from({ length: rows }, (_, k) => (
            <li key={k} className="flex items-center gap-3 border-b border-rule py-3">
              <Bar w="size-8" h="" />
              <span className="flex-1"><Bar w={k % 2 ? "w-36" : "w-44"} h="h-3.5" /><span className="mt-2 block"><Bar w="w-[75%]" /></span></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function LoadFailed({ error, retry, what = "The brief" }: { error: string; retry: () => void; what?: string }) {
  return (
    <section className="pt-5" role="alert">
      <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">{what} didn&rsquo;t load.</h1>
      <p className="mt-2 text-[0.9375rem] text-ink-2">
        {error.startsWith("HTTP 5")
          ? `FINN's data server didn't respond (${error}). Try again in a minute.`
          : `The data file couldn't be fetched (${error}). Check your connection, then try again.`}{" "}
        The original filings are still on BSE and NSE.
      </p>
      <button type="button" onClick={retry} className="mt-4 h-10 rounded-md border border-ink/70 px-4 text-[0.9375rem] font-medium hover:bg-paper-2">
        Try again
      </button>
    </section>
  );
}
