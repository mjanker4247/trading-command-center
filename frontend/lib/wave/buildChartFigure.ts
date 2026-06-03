import type { Data, Layout, Shape } from "plotly.js";

import { THEMES, type ChartTheme } from "@/lib/wave/chartTheme";
import type {
  ChartOverlay,
  ChartPayload,
  ElliottScenario,
  TradeRegion,
} from "@/lib/wave/types";

export function buildChartFigure(
  chart: ChartPayload,
  title: string,
  theme: ChartTheme,
  hover: boolean,
): { data: Data[]; layout: Partial<Layout> } {
  const t = THEMES[theme];
  const data: Array<Record<string, unknown>> = [];
  const shapes: Array<Partial<Shape>> = [];

  const times = chart.ohlcv.map((b) => b.time);

  data.push({
    type: "candlestick",
    x: times,
    open: chart.ohlcv.map((b) => b.open),
    high: chart.ohlcv.map((b) => b.high),
    low: chart.ohlcv.map((b) => b.low),
    close: chart.ohlcv.map((b) => b.close),
    name: "Price",
    increasing: { line: { color: t.candleUp } },
    decreasing: { line: { color: t.candleDown } },
  });

  if (chart.overlays.length > 0) {
    applyOverlays(chart.overlays, data, shapes, t);
  } else {
    applyLegacyLayers(chart, data, shapes, t);
  }

  const layout = {
    title: { text: title, font: { size: 15, color: t.font } },
    paper_bgcolor: t.paper,
    plot_bgcolor: t.bg,
    font: { color: t.font },
    height: 650,
    xaxis: {
      title: { text: "Date" },
      gridcolor: t.grid,
      linecolor: t.axis,
      tickcolor: t.axis,
      rangeslider: { visible: false },
    },
    yaxis: {
      title: { text: "Price" },
      gridcolor: t.grid,
      linecolor: t.axis,
      tickcolor: t.axis,
      side: "right",
    },
    hovermode: hover ? "x unified" : false,
    legend: { bgcolor: "rgba(0,0,0,0)", borderwidth: 0, font: { size: 11 } },
    margin: { l: 60, r: 40, t: 50, b: 40 },
    shapes,
  } as Partial<Layout>;

  return { data: data as Data[], layout };
}

function applyLegacyLayers(
  chart: ChartPayload,
  data: Array<Record<string, unknown>>,
  shapes: Array<Partial<Shape>>,
  t: (typeof THEMES)["dark"],
) {
  if (chart.pivots.length > 0) {
    data.push({
      type: "scatter",
      mode: "lines+markers+text" as const,
      x: chart.pivots.map((p) => p.time),
      y: chart.pivots.map((p) => p.price),
      text: chart.pivots.map((p) => p.kind[0]?.toUpperCase() ?? ""),
      textposition: "top center",
      name: "Pivots",
      line: { color: t.pivot, width: 1, dash: "dot" },
      marker: { color: t.pivot, size: 6 },
      textfont: { color: t.pivot, size: 10 },
    });
  }

  chart.scenarios.forEach((scenario, sIdx) => {
    addScenarioTraces(scenario, sIdx, data, t);
  });

  chart.trade_regions.forEach((region) => {
    addZoneShape(region, shapes, t);
  });
}

function applyOverlays(
  overlays: ChartOverlay[],
  data: Array<Record<string, unknown>>,
  shapes: Array<Partial<Shape>>,
  t: (typeof THEMES)["dark"],
) {
  const scenarioColors = new Map<string, string>();
  let scenarioIdx = 0;

  for (const overlay of overlays) {
    switch (overlay.kind) {
      case "pivot":
        data.push({
          type: "scatter",
          mode: "lines+markers+text",
          x: overlay.times,
          y: overlay.prices,
          text: overlay.labels,
          textposition: "top center",
          name: "Pivots",
          line: { color: t.pivot, width: 1, dash: "dot" },
          marker: { color: t.pivot, size: 6 },
        });
        break;
      case "wave_leg": {
        let color = scenarioColors.get(overlay.scenario_label);
        if (!color) {
          color = t.scenario[scenarioIdx % t.scenario.length];
          scenarioColors.set(overlay.scenario_label, color);
          scenarioIdx += 1;
        }
        data.push({
          type: "scatter",
          mode: "lines+text",
          x: [overlay.start_time, overlay.end_time],
          y: [overlay.start_price, overlay.end_price],
          text: ["", overlay.label],
          textposition: "top center",
          name: overlay.scenario_label,
          line: { color, width: 2 },
          textfont: { color, size: 11 },
          legendgroup: overlay.scenario_label,
          showlegend: !scenarioColors.has(overlay.scenario_label + "_shown"),
        });
        scenarioColors.set(overlay.scenario_label + "_shown", "1");
        break;
      }
      case "zone":
        shapes.push({
          type: "rect",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: overlay.y0,
          y1: overlay.y1,
          fillcolor:
            overlay.direction === "long" ? t.zoneLong : t.zoneShort,
          line: { width: 0 },
          layer: "below",
        });
        break;
      case "level":
        shapes.push({
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: overlay.price,
          y1: overlay.price,
          line: {
            color: overlay.color_hint ?? t.pivot,
            width: 1,
            dash:
              overlay.style === "dashed"
                ? "dash"
                : overlay.style === "dotted"
                  ? "dot"
                  : undefined,
          },
        });
        break;
      default:
        break;
    }
  }
}

function addScenarioTraces(
  scenario: ElliottScenario,
  sIdx: number,
  data: Array<Record<string, unknown>>,
  t: (typeof THEMES)["dark"],
) {
  const color = t.scenario[sIdx % t.scenario.length];
  const label = `${scenario.pattern}/${scenario.trend} (score=${scenario.score})`;
  let first = true;
  for (const leg of scenario.legs) {
    data.push({
      type: "scatter",
      mode: "lines+text" as const,
      x: [leg.start_time, leg.end_time],
      y: [leg.start_price, leg.end_price],
      text: ["", leg.label],
      textposition: "top center",
      line: { color, width: 2 },
      textfont: { color, size: 11 },
      name: label,
      legendgroup: label,
      showlegend: first,
    });
    first = false;
  }
}

function addZoneShape(
  region: TradeRegion,
  shapes: Array<Partial<Shape>>,
  t: (typeof THEMES)["dark"],
) {
  shapes.push({
    type: "rect",
    xref: "paper",
    x0: 0,
    x1: 1,
    y0: region.zone_low,
    y1: region.zone_high,
    fillcolor: region.direction === "long" ? t.zoneLong : t.zoneShort,
    line: { width: 0 },
    layer: "below",
  });
}
