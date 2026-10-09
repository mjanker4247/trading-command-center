import type { AgentEventPayload, Run } from "@/lib/types";

export type StageStatus = "waiting" | "running" | "done" | "error";
export type PipelineTerminal = "completed" | "failed" | "aborted" | null;

/** Derive terminal pipeline state from run row and/or live WS events. */
export function resolvePipelineTerminal(
  runStatus: Run["status"] | undefined,
  events: AgentEventPayload[],
): PipelineTerminal {
  if (runStatus === "completed" || runStatus === "failed" || runStatus === "aborted") {
    return runStatus;
  }
  if (events.some((e) => e.type === "run_completed")) return "completed";
  if (events.some((e) => e.type === "run_aborted")) return "aborted";
  // Runner broadcasts run-level failures as { type: "error" } without an agent.
  if (events.some((e) => e.type === "error" && !e.agent)) return "failed";
  return null;
}

/**
 * Stage status from per-agent events, finalized when the run is terminal.
 * `run_completed` is WS-only (not persisted), so callers must also pass runStatus.
 */
export function getStageStatus(
  key: string,
  events: AgentEventPayload[],
  terminal: PipelineTerminal = null,
): StageStatus {
  const matched = events.filter((e) => e.agent === key || e.agent === `${key}_analyst`);

  let status: StageStatus = "waiting";
  if (matched.some((e) => e.type === "error")) status = "error";
  else if (matched.some((e) => e.type === "completed")) status = "done";
  else if (matched.some((e) => e.type === "started" || e.type === "token")) status = "running";

  if (terminal === "completed") {
    // Successful run — promote unfinished stages so the panel doesn't stay "running"/"waiting".
    if (status === "running" || status === "waiting") return "done";
    return status;
  }
  if (terminal === "failed" || terminal === "aborted") {
    if (status === "running") return "error";
    return status;
  }
  return status;
}
