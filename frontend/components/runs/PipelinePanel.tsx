"use client";
import type { AgentEventPayload } from "@/lib/types";

interface PipelinePanelProps {
  analysts: string[];
  events: AgentEventPayload[];
}

type AnalystStatus = "waiting" | "running" | "done" | "error";

function getAnalystStatus(analyst: string, events: AgentEventPayload[]): AnalystStatus {
  const analystEvents = events.filter((e) => e.agent === analyst);
  if (analystEvents.length === 0) return "waiting";
  if (analystEvents.some((e) => e.type === "error")) return "error";
  if (analystEvents.some((e) => e.type === "completed")) return "done";
  if (analystEvents.some((e) => e.type === "started")) return "running";
  return "waiting";
}

const statusDot: Record<AnalystStatus, string> = {
  waiting: "bg-slate-500",
  running: "bg-blue-400 animate-pulse",
  done: "bg-green-400",
  error: "bg-red-400",
};

const statusLabel: Record<AnalystStatus, string> = {
  waiting: "waiting",
  running: "running",
  done: "done",
  error: "error",
};

export function PipelinePanel({ analysts, events }: PipelinePanelProps) {
  return (
    <div className="bg-navy-700 rounded border border-slate-800 p-4">
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Pipeline</p>
      <div className="space-y-2">
        {analysts.map((analyst) => {
          const status = getAnalystStatus(analyst, events);
          return (
            <div key={analyst} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[status]}`} />
              <span className="text-slate-300 text-sm capitalize flex-1">{analyst}</span>
              <span className="text-slate-500 text-xs">{statusLabel[status]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
