"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import {
  getWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
  updateWatchlistItem,
  triggerWatchlistRun,
} from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

const CRON_PRESETS = [
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Weekly Mon 9am", value: "0 9 * * 1" },
  { label: "Weekly Fri 4pm", value: "0 16 * * 5" },
  { label: "Manual only", value: null },
];

function CronLabel({ cron }: { cron: string | null }) {
  if (!cron) return <span className="text-slate-500 text-xs">Manual only</span>;
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  return <span className="text-slate-300 text-xs">{preset?.label ?? cron}</span>;
}

function ItemRow({
  item,
  onRemove,
  onToggle,
  onRunNow,
}: {
  item: WatchlistItem;
  onRemove: () => void;
  onToggle: () => void;
  onRunNow: () => void;
}) {
  return (
    <tr className="border-t border-slate-800 hover:bg-navy-700/40">
      <td className="px-4 py-3 font-semibold text-white">{item.ticker}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.llm_provider} / {item.llm_model}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.depth}</td>
      <td className="px-4 py-3"><CronLabel cron={item.schedule_cron} /></td>
      <td className="px-4 py-3 text-slate-500 text-xs">
        {item.last_run_at ? new Date(item.last_run_at).toLocaleDateString() : "Never"}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${item.enabled ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-500"}`}>
          {item.enabled ? "Active" : "Paused"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={onRunNow}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 border border-blue-800 rounded"
          >
            Run now
          </button>
          <button
            onClick={onToggle}
            className="text-xs text-slate-400 hover:text-slate-300 px-2 py-1 border border-slate-700 rounded"
          >
            {item.enabled ? "Pause" : "Resume"}
          </button>
          <button
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-900 rounded"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddItemForm({ onAdd }: { onAdd: (ticker: string, cron: string | null) => void }) {
  const [ticker, setTicker] = useState("");
  const [cron, setCron] = useState<string | null>(null);

  return (
    <div className="flex gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Ticker</label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          className="bg-navy-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-28 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Schedule</label>
        <select
          value={cron ?? "null"}
          onChange={(e) => setCron(e.target.value === "null" ? null : e.target.value)}
          className="bg-navy-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {CRON_PRESETS.map((p) => (
            <option key={p.label} value={p.value ?? "null"}>{p.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => { if (ticker) { onAdd(ticker, cron); setTicker(""); } }}
        disabled={!ticker}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        Add
      </button>
    </div>
  );
}

export default function WatchlistPage() {
  const qc = useQueryClient();
  const { data: watchlist, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
  });

  const addMutation = useMutation({
    mutationFn: ({ ticker, cron }: { ticker: string; cron: string | null }) =>
      addWatchlistItem({
        ticker,
        llm_provider: "openai",
        llm_model: "gpt-4o-mini",
        depth: "standard",
        analysts: ["market", "sentiment", "news", "fundamentals"],
        schedule_cron: cron,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const removeMutation = useMutation({
    mutationFn: removeWatchlistItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateWatchlistItem(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: triggerWatchlistRun,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      window.open(`/runs/${data.run_id}/live`, "_blank");
    },
  });

  return (
    <div className="min-h-screen bg-navy-900">
      <TopNav />
      <main className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/runs" className="text-blue-400 hover:underline text-sm">← Back to History</Link>
          <h1 className="text-lg font-semibold text-white">Watchlist</h1>
        </div>

        <div className="bg-navy-800 border border-slate-700 rounded-xl p-5">
          <AddItemForm
            onAdd={(ticker, cron) => addMutation.mutate({ ticker, cron })}
          />
          {addMutation.error && (
            <p className="text-red-400 text-sm mt-2">{String(addMutation.error)}</p>
          )}
        </div>

        {isLoading && <div className="text-slate-400 text-sm">Loading watchlist…</div>}

        {watchlist && (
          <div className="bg-navy-800 border border-slate-700 rounded-xl overflow-hidden">
            {watchlist.items.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-10">
                No tickers yet. Add a ticker above to start tracking.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-navy-900">
                  <tr>
                    {["Ticker", "Model", "Depth", "Schedule", "Last Run", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watchlist.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onRemove={() => removeMutation.mutate(item.id)}
                      onToggle={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
                      onRunNow={() => runNowMutation.mutate(item.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
