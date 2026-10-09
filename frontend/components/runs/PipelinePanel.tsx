"use client";
import { AnalystIconBadge } from "@/components/runs/RunContextIcons";
import {
  getStageStatus,
  resolvePipelineTerminal,
  type StageStatus,
} from "@/lib/pipelineStatus";
import type { AgentEventPayload, Run } from "@/lib/types";

interface PipelinePanelProps {
  analysts: string[];
  events: AgentEventPayload[];
  /** Needed to finalize stages — `run_completed` is WS-only and not in persisted events. */
  runStatus?: Run["status"];
}

const DOWNSTREAM_STAGES = [
  { key: "bull_researcher", label: "Bull Research" },
  { key: "bear_researcher", label: "Bear Research" },
  { key: "research_manager", label: "Research Manager" },
  { key: "trader", label: "Trader" },
  { key: "aggressive_analyst", label: "Risk: Aggressive" },
  { key: "conservative_analyst", label: "Risk: Conservative" },
  { key: "neutral_analyst", label: "Risk: Neutral" },
  { key: "risk_judge", label: "Risk Judge" },
];

const statusDot: Record<StageStatus, string> = {
  waiting: "bg-subtle",
  running: "bg-blue-400 animate-pulse",
  done: "bg-green-400",
  error: "bg-red-400",
};

const statusLabel: Record<StageStatus, string> = {
  waiting: "waiting",
  running: "running",
  done: "done",
  error: "error",
};

function StageRow({ label, status, analyst }: { label: string; status: StageStatus; analyst?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[status]}`} />
      {analyst && <AnalystIconBadge analyst={analyst} />}
      <span className="text-fg-secondary text-sm flex-1">{label}</span>
      <span className="text-muted text-xs">{statusLabel[status]}</span>
    </div>
  );
}

export function PipelinePanel({ analysts, events, runStatus }: PipelinePanelProps) {
  const terminal = resolvePipelineTerminal(runStatus, events);

  return (
    <div className="bg-surface rounded-sm border border-border p-4">
      <p className="text-muted text-xs uppercase tracking-wider mb-3">Pipeline</p>
      <div className="space-y-2">
        {analysts.map((analyst) => (
          <StageRow
            key={analyst}
            label={analyst.charAt(0).toUpperCase() + analyst.slice(1)}
            status={getStageStatus(analyst, events, terminal)}
            analyst={analyst}
          />
        ))}
        <div className="border-t border-input-border my-2" />
        {DOWNSTREAM_STAGES.map((stage) => (
          <StageRow
            key={stage.key}
            label={stage.label}
            status={getStageStatus(stage.key, events, terminal)}
          />
        ))}
      </div>
    </div>
  );
}
