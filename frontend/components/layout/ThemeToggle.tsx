"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "system", label: "System", icon: "◐" },
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className="inline-block w-[4.5rem] h-7 rounded border border-border bg-elevated"
        aria-hidden
      />
    );
  }

  const active = (theme ?? "system") as ThemeValue;

  return (
    <div
      className="flex items-center rounded border border-border bg-elevated p-0.5"
      role="group"
      aria-label="Appearance"
    >
      {OPTIONS.map(({ value, label, icon }) => {
        const selected = active === value;
        return (
          <button
            key={value}
            type="button"
            title={`${label}${value === "system" && resolvedTheme ? ` (${resolvedTheme})` : ""}`}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => setTheme(value)}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              selected
                ? "bg-blue-600 text-white"
                : "text-muted hover:text-fg-secondary"
            }`}
          >
            <span aria-hidden>{icon}</span>
          </button>
        );
      })}
    </div>
  );
}
