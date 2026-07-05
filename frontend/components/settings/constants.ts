import { FIELD_INPUT_CLASS, FIELD_INPUT_SM_CLASS } from "@/lib/uiClasses";
import type { KalmanProcessingMode } from "@/lib/appSettings";

export const SETTINGS_INPUT_CLASS = `${FIELD_INPUT_CLASS} w-full sm:max-w-xs`;
export const SETTINGS_INPUT_MD_CLASS = `${FIELD_INPUT_CLASS} w-full sm:max-w-md`;
export const SETTINGS_INPUT_DATE_FORMAT_CLASS = `${FIELD_INPUT_CLASS} w-full min-w-[15rem] sm:max-w-lg`;
export const SETTINGS_INPUT_NARROW_CLASS = `${FIELD_INPUT_CLASS} w-32`;
export const SETTINGS_INPUT_COMPACT_CLASS = `${FIELD_INPUT_SM_CLASS} w-full sm:max-w-xs`;

export const KALMAN_TOOLTIPS = {
  observationCovariance:
    "How much daily price wiggles are smoothed out. Higher values draw a steadier trend line but react slower to new moves — useful when you want the big picture, not every tick. Lower values hug the price closely, which can look noisier but catches turns faster.",
  transitionCovariance:
    "How quickly the underlying trend is allowed to change. Higher values let the trend line pivot fast when the market shifts regime. Lower values keep a stable baseline — better when you believe the current trend will persist.",
  mode:
    "Live Tracking uses only data available up to each day — required for signals and backtests (no look-ahead). Historical View uses the full price history to draw a perfectly smooth line for research; do not use it for live decisions.",
} as const;

export type KalmanTooltipKey = keyof typeof KALMAN_TOOLTIPS;

export const INVESTOR_DNA_HORIZON_LABELS: Record<string, string> = {
  lt_1y: "< 1 year",
  "1_3y": "1–3 years",
  "3_7y": "3–7 years",
  "7_15y": "7–15 years",
  gt_15y: "15+ years",
};

export const INVESTOR_DNA_RISK_LABELS: Record<number, string> = {
  1: "Very conservative",
  2: "Conservative",
  3: "Moderate",
  4: "Aggressive",
  5: "Very aggressive",
};

export const INVESTOR_DNA_STYLE_LABELS: Record<string, string> = {
  passive: "Passive",
  active: "Active",
  hybrid: "Hybrid",
};

export interface AppSettingsDraft {
  observationCovariance: string;
  transitionCovariance: string;
  mode: KalmanProcessingMode;
  enableKalmanFilter: boolean;
  enableElliottWave: boolean;
  enableMarkovRegime: boolean;
}
