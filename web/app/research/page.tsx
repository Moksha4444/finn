"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CompanyResearch, ResearchHome } from "@/components/Research";

// One static route: /research lists researched companies, /research?symbol=TCS opens one (static export, no server).
function Page() {
  const params = useSearchParams();
  const sym = params.get("symbol")?.trim().toUpperCase();
  return sym ? <CompanyResearch key={sym} symbol={sym} auto={params.get("run") === "1"} /> : <ResearchHome />;
}

export default function Research() {
  return <Suspense><Page /></Suspense>;
}
