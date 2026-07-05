"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const WRAPPER_CLASS =
  "relative inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation rounded-lg p-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500/60";

const TRACK_CLASS =
  "relative block h-[22px] w-10 shrink-0 rounded-[11px] border border-input-border bg-input/70 transition-colors duration-150 hover:border-link";

function ThemeSwitchTrack({ isDark }: { isDark: boolean }) {
  return (
    <span className={TRACK_CLASS}>
      <span
        className={`absolute left-px top-px flex h-[18px] w-[18px] items-center justify-center rounded-full bg-elevated text-muted shadow-sm transition-transform duration-200 motion-reduce:transition-none ${
          isDark ? "translate-x-[18px]" : "translate-x-0"
        }`}
      >
        <Sun
          className={`absolute h-3 w-3 transition-opacity duration-150 motion-reduce:transition-none ${isDark ? "opacity-0" : "opacity-100"}`}
          aria-hidden="true"
        />
        <Moon
          className={`absolute h-3 w-3 transition-opacity duration-150 motion-reduce:transition-none ${isDark ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
      </span>
    </span>
  );
}

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className={WRAPPER_CLASS} aria-hidden>
        <span className="block h-[22px] w-10 rounded-[11px] border border-border bg-input/70" />
      </span>
    );
  }

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={WRAPPER_CLASS}
    >
      <ThemeSwitchTrack isDark={isDark} />
    </button>
  );
}
