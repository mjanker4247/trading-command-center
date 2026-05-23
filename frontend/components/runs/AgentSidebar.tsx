"use client";
import type { Run } from "@/lib/types";

interface AgentSidebarProps {
  run: Run | undefined;
  onAbort: () => void;
}

const statusBadge: Record<Run["status"], string> = {
  pending: "bg-slate-700 text-slate-300",
  running: "bg-blue-900 text-blue-300",
  completed: "bg-green-900 text-green-300",
  aborted: "bg-yellow-900 text-yellow-300",
  failed: "bg-red-900 text-red-300",
};

const verdictBadge: Record<NonNullable<Run["verdict"]>, string> = {
  buy: "bg-green-900 text-green-300",
  sell: "bg-red-900 text-red-300",
  hold: "bg-yellow-900 text-yellow-300",
};

export function AgentSidebar({ run, onAbort }: AgentSidebarProps) {
  if (!run) {
    return (
      <div className="space-y-3 p-4">
        <div className="bg-slate-700 rounded-sm animate-pulse h-4 w-full" />
        <div className="bg-slate-700 rounded-sm animate-pulse h-4 w-full" />
        <div className="bg-slate-700 rounded-sm animate-pulse h-4 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-navy-700 rounded-sm border border-slate-800 p-4 space-y-4">
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Ticker</p>
        <p className="text-slate-200 font-mono font-semibold">{run.ticker}</p>
      </div>
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Status</p>
        <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium ${statusBadge[run.status]}`}>
          {run.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
          )}
          {run.status}
        </span>
      </div>
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Verdict</p>
        {run.verdict ? (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${verdictBadge[run.verdict]}`}>
            {run.verdict}
          </span>
        ) : (
          <span className="text-slate-600 text-sm">—</span>
        )}
      </div>
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Analysts</p>
        <ul className="space-y-0.5">
          {run.analysts.map((a) => (
            <li key={a} className="text-slate-300 text-xs capitalize">{a}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Created</p>
        <p className="text-slate-400 text-xs">{new Date(run.created_at).toLocaleString()}</p>
      </div>
      {run.started_at && (
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Started</p>
          <p className="text-slate-400 text-xs">{new Date(run.started_at).toLocaleString()}</p>
        </div>
      )}
      {run.completed_at && (
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Completed</p>
          <p className="text-slate-400 text-xs">{new Date(run.completed_at).toLocaleString()}</p>
        </div>
      )}
      {run.status === "running" && (
        <button
          onClick={onAbort}
          className="bg-red-800 hover:bg-red-700 text-white rounded-sm px-3 py-1.5 text-sm w-full"
        >
          Abort Run
        </button>
      )}
    </div>
  );
}
