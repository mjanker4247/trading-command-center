"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import { ComparisonPanel } from "@/components/runs/ComparisonPanel";
import { compareRuns } from "@/lib/api";

function CompareContent() {
  const params = useSearchParams();
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", a, b],
    queryFn: () => compareRuns(a, b),
    enabled: !!a && !!b,
  });

  if (!a || !b) {
    return (
      <div className="text-slate-400 text-sm">
        Provide two run IDs: <code className="text-slate-300">/runs/compare?a=&lt;id&gt;&amp;b=&lt;id&gt;</code>
      </div>
    );
  }

  if (isLoading) return <div className="text-slate-400 text-sm">Loading comparison…</div>;
  if (error) return <div className="text-red-400 text-sm">Failed to load comparison.</div>;
  if (!data) return null;

  return <ComparisonPanel a={data.a} b={data.b} />;
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-navy-900">
      <TopNav />
      <main className="p-6 max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/runs" className="text-blue-400 hover:underline text-sm">
            ← Back to History
          </Link>
          <h1 className="text-lg font-semibold text-white">Run Comparison</h1>
        </div>
        <Suspense fallback={<div className="text-slate-400 text-sm">Loading…</div>}>
          <CompareContent />
        </Suspense>
      </main>
    </div>
  );
}
