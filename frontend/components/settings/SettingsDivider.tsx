export function SettingsDivider() {
  return <div className="border-t border-border" />;
}

export function SubGroupLabel({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 bg-input/40 border-b border-border">
      <span className="text-muted text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
  );
}
