"use client";
import { useId } from "react";

interface LogoProps {
  height?: number;
  iconOnly?: boolean;
  className?: string;
}

const ICON_W = 40;
const ICON_H = 40;
const TEXT_GAP = 12;
const TEXT_W = 110;
const FULL_VB_W = ICON_W + TEXT_GAP + TEXT_W;

export function Logo({ height = 30, iconOnly = false, className = "" }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const vbW = iconOnly ? ICON_W : FULL_VB_W;
  const vbH = ICON_H;
  const w = iconOnly ? height : Math.round(height * (vbW / vbH));
  const gradId = `af-g-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={w}
      height={height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AgentFloor"
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="36" x2="36" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      <polygon
        points="20,2 35.6,11 35.6,29 20,38 4.4,29 4.4,11"
        className="fill-[var(--af-logo-fill)]"
        stroke={`url(#${gradId})`}
        strokeWidth="1.8"
      />

      <line
        x1="8.5" y1="30.5" x2="31.5" y2="30.5"
        className="stroke-[var(--af-logo-stroke-muted)]"
        strokeWidth="1"
        strokeDasharray="2.5 2"
        strokeLinecap="round"
      />

      <polyline
        points="9,27 15,23 22,17 31,12"
        stroke={`url(#${gradId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="9" cy="27" r="2.8" fill="#3b82f6" />
      <circle cx="31" cy="12" r="2.8" fill="#8b5cf6" />

      {!iconOnly && (
        <text
          x={ICON_W + TEXT_GAP}
          y="26"
          fontSize="15"
          fontFamily="var(--font-geist-mono, ui-monospace, 'SF Mono', monospace)"
          letterSpacing="0.5"
        >
          <tspan className="fill-fg" fontWeight="700">Agent</tspan>
          <tspan fill="#3b82f6" className="dark:fill-[#60a5fa]" fontWeight="400">Floor</tspan>
        </text>
      )}
    </svg>
  );
}
