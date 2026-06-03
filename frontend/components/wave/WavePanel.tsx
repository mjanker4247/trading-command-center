"use client";

import { useQuery } from "@tanstack/react-query";
import { analyzeWave } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/wave/types";
import { AnalysisChart } from "@/components/wave/AnalysisChart";
import { OverviewBanner } from "@/components/wave/OverviewBanner";
import { ScenarioPanel } from "@/components/wave/ScenarioPanel";
import { TradeRegionsPanel } from "@/components/wave/TradeRegionsPanel";
import { ToolOutcomesPanel } from "@/components/wave/ToolOutcomesPanel";

interface WavePanelProps {
  ticker: string;
}

export function WavePanel({ ticker }: WavePanelProps) {
  const { data, isLoading, isError, error } = useQuery<AnalyzeResponse>({
    queryKey: ["wave-analyze", ticker],
    queryFn: () => analyzeWave(ticker),
    staleTime: 1000 * 60 * 60 * 4,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-muted uppercase tracking-widest font-medium">
          Elliott Wave &amp; Fibonacci
        </p>
        <div className="h-32 bg-input/50 rounded-sm animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-muted uppercase tracking-widest font-medium">
          Elliott Wave &amp; Fibonacci
        </p>
        <p className="text-xs text-muted">
          {error instanceof Error ? error.message : "Analysis unavailable for this ticker."}
        </p>
      </div>
    );
  }

  const title = `${data.instrument.symbol} · ${data.instrument.exchange ?? "—"}`;

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted uppercase tracking-widest font-medium">
        Elliott Wave &amp; Fibonacci
      </p>
      {data.overview && <OverviewBanner overview={data.overview} />}
      <AnalysisChart chart={data.chart} title={title} theme="dark" hover />
      <ScenarioPanel scenarios={data.top_scenarios} />
      <TradeRegionsPanel regions={data.trade_regions} />
      {data.overview?.tool_outcomes && (
        <ToolOutcomesPanel outcomes={data.overview.tool_outcomes} />
      )}
    </div>
  );
}
