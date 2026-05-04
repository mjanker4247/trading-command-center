"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createRun } from "@/lib/api";

const ANALYSTS = ["market", "social", "news", "fundamentals", "technical"];

const PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
  google: "gemini-2.0-flash",
};

interface Props {
  onSuccess: (runId: string) => void;
}

export function RunForm({ onSuccess }: Props) {
  const [ticker, setTicker] = useState("");
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().slice(0, 10));
  const [analysts, setAnalysts] = useState<string[]>(["market"]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [quickResearch, setQuickResearch] = useState(false);

  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => onSuccess(run.id),
  });

  function toggleAnalyst(name: string) {
    setAnalysts((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (analysts.length === 0) return;
    mutation.mutate({
      ticker,
      analysis_date: analysisDate,
      analysts,
      llm_provider: provider,
      llm_model: model || PLACEHOLDERS[provider],
      depth: quickResearch ? "quick" : "standard",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-navy-700 border border-slate-800 rounded-lg p-6 max-w-lg">
      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Ticker</label>
        <input
          required
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        />
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Analysis Date</label>
        <input
          required
          type="date"
          value={analysisDate}
          onChange={(e) => setAnalysisDate(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        />
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Analysts</label>
        <div className="flex flex-wrap gap-2">
          {ANALYSTS.map((a) => {
            const selected = analysts.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAnalyst(a)}
                className={`px-3 py-1 rounded border text-xs capitalize ${
                  selected
                    ? "bg-blue-700 text-white border-blue-600"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
        {analysts.length === 0 && (
          <p className="text-red-400 text-xs mt-1">Select at least one analyst.</p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">LLM Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        >
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="google">google</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">LLM Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={PLACEHOLDERS[provider]}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        />
      </div>

      <div className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={quickResearch}
            onChange={(e) => setQuickResearch(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-slate-400 text-xs">Quick research (faster, less thorough)</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || analysts.length === 0}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? "Launching…" : "Launch Run"}
      </button>

      {mutation.isError && (
        <p className="text-red-400 text-xs mt-2">Failed to launch run.</p>
      )}
    </form>
  );
}
