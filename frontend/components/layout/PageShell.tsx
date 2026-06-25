import type { ElementType, ReactNode } from "react";

/**
 * Page width presets — pick the narrowest width that fits the primary content:
 * - `default` (max-w-5xl): run history, run detail, performance, new run forms
 * - `wide` (max-w-6xl): watchlist tables, compare
 * - `full` / `xl` / `none`: portfolio holdings, dashboards with wide tables
 * - `settings` (max-w-3xl): stacked settings sections
 * - `narrow` (max-w-2xl): auth-adjacent or single-column flows
 */
export type PageWidth = "none" | "narrow" | "settings" | "default" | "wide" | "xl" | "full";
export type PageGap = "none" | "4" | "6" | "8";

const WIDTH_CLASSES: Record<PageWidth, string> = {
  none: "w-full min-w-0",
  narrow: "max-w-2xl mx-auto w-full min-w-0",
  settings: "max-w-3xl mx-auto w-full min-w-0",
  default: "max-w-5xl mx-auto w-full min-w-0",
  wide: "max-w-6xl mx-auto w-full min-w-0",
  xl: "max-w-7xl mx-auto w-full min-w-0",
  full: "max-w-screen-2xl mx-auto w-full min-w-0",
};

const GAP_CLASSES: Record<PageGap, string> = {
  none: "",
  "4": "space-y-4",
  "6": "flex flex-col gap-6",
  "8": "flex flex-col gap-8",
};

type PageShellProps = {
  children: ReactNode;
  width?: PageWidth;
  gap?: PageGap;
  as?: ElementType;
  className?: string;
};

export function PageShell({
  children,
  width = "none",
  gap = "none",
  as: Component = "main",
  className = "",
}: PageShellProps) {
  const classes = [
    "px-4 py-4 sm:p-6",
    WIDTH_CLASSES[width],
    GAP_CLASSES[gap],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes}>{children}</Component>;
}
