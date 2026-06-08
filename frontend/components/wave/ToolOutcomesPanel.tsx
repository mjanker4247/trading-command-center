import type { ToolOutcome } from "@/lib/wave/types";

interface ToolOutcomesPanelProps {
  outcomes: ToolOutcome[];
}

export function ToolOutcomesPanel({ outcomes }: ToolOutcomesPanelProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="px-2 py-1">Engine</th>
            <th className="px-2 py-1">Enabled</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Result</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((o) => (
            <tr key={o.tool_name} className="border-t border-zinc-800 text-zinc-200">
              <td className="px-2 py-1">{o.tool_name}</td>
              <td className="px-2 py-1">{o.enabled ? "✓" : "—"}</td>
              <td className="px-2 py-1">{o.status}</td>
              <td className="px-2 py-1">{o.headline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
