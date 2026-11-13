"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CompanyResearch, ResearchHome } from "@/components/Research";

// One static route: /research lists researched companies, /research?symbol=TCS opens one (static export, no server).
function Page() {
  const sym = useSearchParams().get("symbol")?.trim().toUpperCase();
  return sym ? <CompanyResearch key={sym} symbol={sym} /> : <ResearchHome />;
}

export default function Research() {
  return <Suspense><Page /></Suspense>;
}
