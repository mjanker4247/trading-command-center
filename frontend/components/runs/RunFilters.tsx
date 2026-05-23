"use client";

interface FilterValues {
  ticker: string;
  status: string;
  verdict: string;
}

interface RunFiltersProps {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
}

const inputClass =
  "bg-navy-700 border border-slate-800 rounded-sm px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-blue-500";

export function RunFilters({ value, onChange }: RunFiltersProps) {
  return (
    <div className="flex items-center gap-3 bg-slate-800 rounded-sm px-4 py-3 mb-4">
      <input
        type="text"
        placeholder="TICKER"
        value={value.ticker}
        onChange={(e) => onChange({ ...value, ticker: e.target.value })}
        className={inputClass}
      />
      <select
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value })}
        className={inputClass}
      >
        <option value="">All statuses</option>
        <option value="pending">pending</option>
        <option value="running">running</option>
        <option value="completed">completed</option>
        <option value="aborted">aborted</option>
        <option value="failed">failed</option>
      </select>
      <select
        value={value.verdict}
        onChange={(e) => onChange({ ...value, verdict: e.target.value })}
        className={inputClass}
      >
        <option value="">All verdicts</option>
        <option value="buy">buy</option>
        <option value="sell">sell</option>
        <option value="hold">hold</option>
      </select>
    </div>
  );
}
