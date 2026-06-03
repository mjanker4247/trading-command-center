import type { TradeRegion } from "@/lib/wave/types";

interface TradeRegionsPanelProps {
  regions: TradeRegion[];
}

export function TradeRegionsPanel({ regions }: TradeRegionsPanelProps) {
  if (regions.length === 0) {
    return (
      <p className="text-sm text-zinc-400">No trade regions generated.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="px-2 py-1">Direction</th>
            <th className="px-2 py-1">Zone low</th>
            <th className="px-2 py-1">Zone high</th>
            <th className="px-2 py-1">Stop</th>
            <th className="px-2 py-1">Targets</th>
            <th className="px-2 py-1">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800 text-zinc-200">
              <td className="px-2 py-1">{r.direction}</td>
              <td className="px-2 py-1">{r.zone_low.toFixed(4)}</td>
              <td className="px-2 py-1">{r.zone_high.toFixed(4)}</td>
              <td className="px-2 py-1">{r.stop_level.toFixed(4)}</td>
              <td className="px-2 py-1">{r.target_levels.join(", ")}</td>
              <td className="px-2 py-1">{r.confidence.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
