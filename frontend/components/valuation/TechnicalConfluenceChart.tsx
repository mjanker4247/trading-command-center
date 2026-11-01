"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ValuationSeriesPoint } from "@/lib/valuationTypes";

type Props = {
  points: ValuationSeriesPoint[];
  height?: number;
};

/** Downsample daily closes so the canvas stays responsive (~1 point / week max for long histories). */
function downsample(points: ValuationSeriesPoint[], maxPoints = 520): ValuationSeriesPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: ValuationSeriesPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[i]!);
  }
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.date !== last.date) out.push(last);
  return out;
}

function toChartTime(iso: string): UTCTimestamp {
  // YYYY-MM-DD → UTC noon to avoid DST edge flips
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  return Math.floor(t / 1000) as UTCTimestamp;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function TechnicalConfluenceChart({ points, height = 320 }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: cssVar("--af-surface", "#ffffff") },
        textColor: cssVar("--af-muted", "#475569"),
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: cssVar("--af-border", "#e2e8f0") },
        horzLines: { color: cssVar("--af-border", "#e2e8f0") },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: cssVar("--af-info", "#2563eb") } },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: cssVar("--af-info", "#2563eb"),
      topColor: "rgba(37, 99, 235, 0.28)",
      bottomColor: "rgba(37, 99, 235, 0.02)",
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => {
      // autoSize handles most cases; keep explicit height sync
      chart.applyOptions({ height });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = downsample(points)
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ time: toChartTime(p.date), value: p.value }));
    series.setData(data);
    chart.timeScale().fitContent();
  }, [points]);

  if (!points.length) {
    return (
      <p className="py-10 text-center text-sm text-muted">No price history for technical chart.</p>
    );
  }

  return <div ref={hostRef} className="w-full" style={{ height }} />;
}
