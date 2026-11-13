"use client";
import { LoadFailed } from "@/components/States";

// Last line of defence (CLAUDE.md rule 9): a research file the page can't render shows a retry, never a blank screen.
export default function ResearchError({ error, retry }: { error: unknown; retry: () => void }) {
  return <LoadFailed what="This research page" error={error instanceof Error ? error.message : String(error)} retry={retry} />;
}
