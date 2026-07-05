"use client";

import type { ReactNode } from "react";
import { STATUS_ERROR_CLASS, STATUS_OK_CLASS } from "@/lib/uiClasses";

type StatusAnnouncerProps = {
  variant: "success" | "error";
  children: ReactNode;
};

/** Announces save/error feedback to screen readers without blocking the UI. */
export function StatusAnnouncer({ variant, children }: StatusAnnouncerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`shrink-0 ${variant === "success" ? STATUS_OK_CLASS : STATUS_ERROR_CLASS}`}
    >
      {children}
    </span>
  );
}
