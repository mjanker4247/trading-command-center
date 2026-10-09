import { describe, expect, it } from "vitest";
import { getStageStatus, resolvePipelineTerminal } from "./pipelineStatus";
import type { AgentEventPayload } from "./types";

const started = (agent: string): AgentEventPayload => ({ type: "started", agent });
const completed = (agent: string): AgentEventPayload => ({ type: "completed", agent });

describe("resolvePipelineTerminal", () => {
  it("prefers run status over events", () => {
    expect(resolvePipelineTerminal("completed", [])).toBe("completed");
    expect(resolvePipelineTerminal("failed", [])).toBe("failed");
    expect(resolvePipelineTerminal("aborted", [])).toBe("aborted");
  });

  it("falls back to WS terminal events while run status is still running", () => {
    expect(resolvePipelineTerminal("running", [{ type: "run_completed" }])).toBe("completed");
    expect(resolvePipelineTerminal("running", [{ type: "run_aborted" }])).toBe("aborted");
    expect(resolvePipelineTerminal("running", [{ type: "error", message: "boom" }])).toBe("failed");
  });

  it("ignores per-agent errors for terminal detection", () => {
    expect(
      resolvePipelineTerminal("running", [{ type: "error", agent: "trader", message: "x" }]),
    ).toBeNull();
  });
});

describe("getStageStatus", () => {
  it("derives waiting/running/done/error from agent events", () => {
    expect(getStageStatus("trader", [])).toBe("waiting");
    expect(getStageStatus("trader", [started("trader")])).toBe("running");
    expect(getStageStatus("trader", [started("trader"), completed("trader")])).toBe("done");
    expect(getStageStatus("trader", [{ type: "error", agent: "trader" }])).toBe("error");
  });

  it("matches analyst keys to *_analyst agent ids", () => {
    expect(getStageStatus("market", [started("market_analyst")])).toBe("running");
    expect(getStageStatus("market", [completed("market_analyst")])).toBe("done");
  });

  it("finalizes unfinished stages when the run completed", () => {
    expect(getStageStatus("trader", [started("trader")], "completed")).toBe("done");
    expect(getStageStatus("risk_judge", [], "completed")).toBe("done");
  });

  it("marks running stages as error when the run failed or aborted", () => {
    expect(getStageStatus("trader", [started("trader")], "failed")).toBe("error");
    expect(getStageStatus("trader", [started("trader")], "aborted")).toBe("error");
    expect(getStageStatus("risk_judge", [], "failed")).toBe("waiting");
  });
});
