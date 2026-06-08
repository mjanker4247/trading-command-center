import type { AnalysisOverview } from "@/lib/wave/types";

interface OverviewBannerProps {
  overview: AnalysisOverview;
}

export function OverviewBanner({ overview }: OverviewBannerProps) {
  const dirIcon =
    overview.top_direction === "long"
      ? "🟢"
      : overview.top_direction === "short"
        ? "🔴"
        : "⚪";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Top scenario" value={overview.top_scenario ?? "—"} />
        <Metric
          label="Direction"
          value={`${dirIcon} ${overview.top_direction ?? "—"}`}
        />
        <Metric
          label="Active tools"
          value={String(overview.active_tools.length)}
          hint={overview.active_tools.join(", ")}
        />
        <Metric
          label="Confidence"
          value={
            overview.trade_region
              ? overview.trade_region.confidence.toFixed(0)
              : "—"
          }
          hint="Score from top Elliott scenario (0–100)"
        />
      </div>
      {overview.warnings.map((w) => (
        <p
          key={w}
          className="rounded-md border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
        >
          {w}
        </p>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2"
      title={hint}
    >
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
