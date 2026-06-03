"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { buildChartFigure } from "@/lib/wave/buildChartFigure";
import type { ChartTheme } from "@/lib/wave/chartTheme";
import type { ChartPayload } from "@/lib/wave/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface AnalysisChartProps {
  chart: ChartPayload;
  title: string;
  theme: ChartTheme;
  hover: boolean;
}

export function AnalysisChart({ chart, title, theme, hover }: AnalysisChartProps) {
  const { data, layout } = useMemo(
    () => buildChartFigure(chart, title, theme, hover),
    [chart, title, theme, hover],
  );

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-700/50">
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true }}
        style={{ width: "100%", height: "650px" }}
        useResizeHandler
      />
    </div>
  );
}
