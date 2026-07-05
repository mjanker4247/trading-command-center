"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppSettings, updateAppSettings } from "@/lib/api";
import {
  APP_SETTINGS_DEFAULTS,
  APP_SETTINGS_RANGES,
  validateAppSettings,
  type AppSettings,
} from "@/lib/appSettings";
import { InfoPopover } from "@/components/settings/InfoPopover";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import {
  KALMAN_TOOLTIPS,
  SETTINGS_INPUT_CLASS,
  type AppSettingsDraft,
  type KalmanTooltipKey,
} from "@/components/settings/constants";
import { StatusAnnouncer } from "@/components/ui/StatusAnnouncer";
import { BTN_PRIMARY_SM_CLASS } from "@/lib/uiClasses";

const STRATEGY_IDS = {
  observation: "strategy-observation-r",
  transition: "strategy-transition-q",
  mode: "strategy-processing-mode",
} as const;

function toDraft(settings: AppSettings): AppSettingsDraft {
  return {
    observationCovariance: String(settings.observationCovariance),
    transitionCovariance: String(settings.transitionCovariance),
    mode: settings.mode,
    enableKalmanFilter: settings.enableKalmanFilter,
    enableElliottWave: settings.enableElliottWave,
    enableMarkovRegime: settings.enableMarkovRegime,
  };
}

function ModuleToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-md border border-input-border bg-input/40 px-3 py-2 ${disabled ? "opacity-60" : ""}`}>
      <span className="text-xs text-fg-secondary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
  );
}

export function StrategySection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data: persistedSettings = APP_SETTINGS_DEFAULTS, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    retry: false,
  });
  const [draft, setDraft] = useState<AppSettingsDraft | null>(null);
  const [openInfo, setOpenInfo] = useState<KalmanTooltipKey | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const values = draft ?? toDraft(persistedSettings);

  function currentSettings(): AppSettings {
    return {
      observationCovariance: Number(values.observationCovariance),
      transitionCovariance: Number(values.transitionCovariance),
      mode: values.mode,
      enableKalmanFilter: values.enableKalmanFilter,
      enableElliottWave: values.enableElliottWave,
      enableMarkovRegime: values.enableMarkovRegime,
    };
  }

  const mutation = useMutation({
    mutationFn: updateAppSettings,
    onSuccess: (settings) => {
      setDraft(toDraft(settings));
      setStatus("success");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["ticker-kalman"] });
      queryClient.invalidateQueries({ queryKey: ["ticker-regime"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-regime"] });
      queryClient.invalidateQueries({ queryKey: ["ticker-wave"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-wave"] });
      queryClient.invalidateQueries({ queryKey: ["wave-analyze"] });
    },
    onError: (err: Error) => {
      setStatus("error");
      setError(err.message);
    },
  });

  function handleSave() {
    const settings = currentSettings();
    const validationError = validateAppSettings(settings);
    if (validationError) {
      setStatus("error");
      setError(validationError);
      return;
    }
    mutation.mutate(settings);
  }

  function resetDefaults() {
    setDraft(toDraft(APP_SETTINGS_DEFAULTS));
    if (isAdmin) mutation.mutate(APP_SETTINGS_DEFAULTS);
  }

  const disabled = !isAdmin || isLoading || mutation.isPending;

  return (
    <SectionCard
      id="strategy"
      title="Strategy Configuration"
      description="Choose which analysis modules appear in the app and tune how trend lines are drawn."
    >
      <div className="px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <InfoPopover
            label="Price noise filter (R)"
            controlId={STRATEGY_IDS.observation}
            tooltip={KALMAN_TOOLTIPS.observationCovariance}
            open={openInfo === "observationCovariance"}
            onToggle={() => setOpenInfo(openInfo === "observationCovariance" ? null : "observationCovariance")}
          />
          <div className="flex-1">
            <input
              id={STRATEGY_IDS.observation}
              type="number"
              min={APP_SETTINGS_RANGES.observationCovariance.min}
              max={APP_SETTINGS_RANGES.observationCovariance.max}
              step="0.0001"
              value={values.observationCovariance}
              onChange={(e) => {
                setDraft({ ...values, observationCovariance: e.target.value });
                setStatus("idle");
              }}
              disabled={disabled}
              className={SETTINGS_INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-muted">0.0001–10.0 (default 0.1). Higher = smoother trend, slower to react.</p>
          </div>
        </div>

        <SettingsDivider />

        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <InfoPopover
            label="Trend responsiveness (Q)"
            controlId={STRATEGY_IDS.transition}
            tooltip={KALMAN_TOOLTIPS.transitionCovariance}
            open={openInfo === "transitionCovariance"}
            onToggle={() => setOpenInfo(openInfo === "transitionCovariance" ? null : "transitionCovariance")}
          />
          <div className="flex-1">
            <input
              id={STRATEGY_IDS.transition}
              type="number"
              min={APP_SETTINGS_RANGES.transitionCovariance.min}
              max={APP_SETTINGS_RANGES.transitionCovariance.max}
              step="0.0001"
              value={values.transitionCovariance}
              onChange={(e) => {
                setDraft({ ...values, transitionCovariance: e.target.value });
                setStatus("idle");
              }}
              disabled={disabled}
              className={SETTINGS_INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-muted">0.0001–1.0 (default 0.01). Higher = trend adapts faster to shifts.</p>
          </div>
        </div>

        <SettingsDivider />

        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <InfoPopover
            label="Processing Mode"
            controlId={STRATEGY_IDS.mode}
            tooltip={KALMAN_TOOLTIPS.mode}
            open={openInfo === "mode"}
            onToggle={() => setOpenInfo(openInfo === "mode" ? null : "mode")}
          />
          <select
            id={STRATEGY_IDS.mode}
            value={values.mode}
            onChange={(e) => {
              setDraft({ ...values, mode: e.target.value as AppSettingsDraft["mode"] });
              setStatus("idle");
            }}
            disabled={disabled}
            className={SETTINGS_INPUT_CLASS}
          >
            <option value="causal">Live Tracking — for signals and backtests</option>
            <option value="historical">Historical View — research overlay only</option>
          </select>
        </div>

        <SettingsDivider />

        <div className="space-y-2">
          <div>
            <p className="text-muted text-xs font-medium uppercase tracking-wide">Analysis modules</p>
            <p className="text-xs text-muted mt-0.5">
              Turn modules off to hide their charts, badges, and confirmation cards everywhere in the app.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ModuleToggle
              label="Kalman trend filter"
              checked={values.enableKalmanFilter}
              disabled={disabled}
              onChange={(checked) => {
                setDraft({ ...values, enableKalmanFilter: checked });
                setStatus("idle");
              }}
            />
            <ModuleToggle
              label="Elliott Wave analysis"
              checked={values.enableElliottWave}
              disabled={disabled}
              onChange={(checked) => {
                setDraft({ ...values, enableElliottWave: checked });
                setStatus("idle");
              }}
            />
            <ModuleToggle
              label="Markov regime detection"
              checked={values.enableMarkovRegime}
              disabled={disabled}
              onChange={(checked) => {
                setDraft({ ...values, enableMarkovRegime: checked });
                setStatus("idle");
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={handleSave} disabled={disabled} className={BTN_PRIMARY_SM_CLASS}>
            {mutation.isPending ? "Saving…" : "Save Strategy Settings"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={!isAdmin || mutation.isPending}
            className="text-xs text-muted hover:text-fg-secondary disabled:opacity-50"
          >
            Reset defaults
          </button>
          {!isAdmin && <span className="text-muted text-xs">Only admins can change strategy settings.</span>}
          {isLoading && <span className="text-muted text-xs">Loading strategy settings…</span>}
          {status === "success" && <StatusAnnouncer variant="success">Strategy settings saved.</StatusAnnouncer>}
          {status === "error" && <StatusAnnouncer variant="error">{error}</StatusAnnouncer>}
        </div>
      </div>
    </SectionCard>
  );
}
