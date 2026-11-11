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
          <span className="mt-4 block"><Bar w="w-40" h="h-9" /></span>
        </div>
      )}
      <ol className="border-t border-ink/80">
        {Array.from({ length: rows }, (_, k) => (
          <li key={k} className="border-b border-rule py-3">
            <span className="flex justify-between"><Bar w={k % 2 ? "w-36" : "w-44"} h="h-3.5" /><Bar w="w-20" /></span>
            <span className="mt-2 block"><Bar w={k % 3 ? "w-[85%]" : "w-[70%]"} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LoadFailed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="pt-5" role="alert">
      <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">The brief didn&rsquo;t load.</h1>
      <p className="mt-2 text-[0.9375rem] text-ink-2">
        The data file couldn&rsquo;t be fetched ({error}). Check your connection, then try again. The original filings are still on BSE and NSE.
      </p>
      <button type="button" onClick={retry} className="mt-4 h-10 rounded-md border border-ink/70 px-4 text-[0.9375rem] font-medium hover:bg-paper-2">
        Try again
      </button>
    </section>
  );
}
