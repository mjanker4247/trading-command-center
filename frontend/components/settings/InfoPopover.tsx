"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DEFAULT_POPOVER_WIDTH = 288;
const VIEWPORT_PADDING = 12;
const GAP = 8;

interface InfoPopoverProps {
  /** Optional field label shown before the (i) button. */
  label?: string;
  tooltip: ReactNode;
  open: boolean;
  onToggle: () => void;
  controlId?: string;
  /** Wrapper around label + button. Defaults suit Settings rows. */
  className?: string;
  popoverWidth?: number;
  /** Accessible name when `label` is omitted. */
  ariaLabel?: string;
}

export function InfoPopover({
  label,
  tooltip,
  open,
  onToggle,
  controlId,
  className,
  popoverWidth = DEFAULT_POPOVER_WIDTH,
  ariaLabel,
}: InfoPopoverProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const wrapperClass =
    className ??
    (label
      ? "flex items-center gap-1.5 text-muted text-xs sm:w-44 shrink-0"
      : "inline-flex items-center");

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = buttonRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(popoverWidth, window.innerWidth - VIEWPORT_PADDING * 2);
      let left = rect.left;
      if (left + width > window.innerWidth - VIEWPORT_PADDING) {
        left = window.innerWidth - VIEWPORT_PADDING - width;
      }
      left = Math.max(VIEWPORT_PADDING, left);

      setPosition({
        top: rect.bottom + GAP,
        left,
        width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, popoverWidth]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onToggle();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onToggle]);

  return (
    <>
      <div className={wrapperClass}>
        {label &&
          (controlId ? (
            <label htmlFor={controlId} className="cursor-default">
              {label}
            </label>
          ) : (
            <span>{label}</span>
          ))}
        <button
          ref={buttonRef}
          type="button"
          onClick={onToggle}
          aria-label={ariaLabel ?? (label ? `Explain ${label}` : "Model tool calling info")}
          aria-expanded={open}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full touch-manipulation sm:min-h-7 sm:min-w-7"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-input-border text-[10px] leading-none text-muted hover:border-link hover:text-link transition-colors">
            i
          </span>
        </button>
      </div>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              zIndex: 1000,
            }}
            className="rounded-md border border-input-border bg-elevated p-3 text-xs leading-relaxed text-fg-secondary shadow-lg"
          >
            {tooltip}
          </div>,
          document.body,
        )}
    </>
  );
}
