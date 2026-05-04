"use client";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { RunForm } from "@/components/runs/RunForm";

export default function NewRunPage() {
  const router = useRouter();

  return (
    <>
      <TopNav />
      <main className="p-6">
        <h1 className="text-slate-200 text-lg font-semibold mb-6">New Run</h1>
        <RunForm onSuccess={(runId) => router.push(`/runs/${runId}/live`)} />
      </main>
    </>
  );
}
