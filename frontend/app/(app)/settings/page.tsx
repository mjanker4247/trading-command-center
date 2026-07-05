"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApiKeys,
  getUsers,
  inviteUser,
  updateProfile,
  getSmtpStatus,
  getMe,
  downloadDbBackup,
  restoreDbBackup,
  getInvestorProfile,
  getAppSettings,
  updateAppSettings,
} from "@/lib/api";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMAT, type DateFormatId } from "@/lib/dateFormat";
import { useDateFormat } from "@/lib/useDateFormat";
import {
  CLOUD_LLM_PROVIDERS,
  DEFAULT_LLM_DEPTH,
  DEFAULT_LLM_PROVIDER,
  LLM_API_KEY_PLACEHOLDERS,
  LLM_PROVIDER_DOCS_URLS,
  LLM_PROVIDER_LABELS,
  LLM_SETTINGS_SHORT_LABELS,
  LOCAL_LLM_PROVIDERS,
  validateDefaultLlmConfig,
  type LlmDepth,
  type LlmProvider,
} from "@/lib/llmConfig";
import { LlmConfigPicker, type LlmConfigValue } from "@/components/llm/LlmConfigPicker";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { InfoPopover } from "@/components/settings/InfoPopover";
import { ServerUrlRow } from "@/components/settings/ServerUrlRow";
import { TeamMemberRow } from "@/components/settings/TeamMemberRow";
import {
  APP_SETTINGS_DEFAULTS,
  APP_SETTINGS_RANGES,
  validateAppSettings,
  type KalmanProcessingMode,
  type AppSettings,
} from "@/lib/appSettings";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader, PageTitle } from "@/components/layout/PageHeader";
import { StatusAnnouncer } from "@/components/ui/StatusAnnouncer";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { visibleSettingsSections } from "@/lib/settingsNav";
import {
  BTN_DANGER_CLASS,
  BTN_DANGER_SM_CLASS,
  BTN_GHOST_CLASS,
  BTN_PRIMARY_SM_CLASS,
  BTN_SECONDARY_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_INPUT_SM_CLASS,
  STATUS_CONFIGURED_CLASS,
  STATUS_ERROR_CLASS,
  STATUS_OK_CLASS,
  STATUS_WARNING_CLASS,
  LINK_INLINE_CLASS,
} from "@/lib/uiClasses";

const SETTINGS_INPUT_CLASS = `${FIELD_INPUT_CLASS} w-full sm:max-w-xs`;
const SETTINGS_INPUT_MD_CLASS = `${FIELD_INPUT_CLASS} w-full sm:max-w-md`;
const SETTINGS_INPUT_DATE_FORMAT_CLASS = `${FIELD_INPUT_CLASS} w-full min-w-[15rem] sm:max-w-lg`;
const SETTINGS_INPUT_NARROW_CLASS = `${FIELD_INPUT_CLASS} w-32`;
const SETTINGS_INPUT_COMPACT_CLASS = `${FIELD_INPUT_SM_CLASS} w-full sm:max-w-xs`;

function Divider() {
  return <div className="border-t border-border" />;
}

function SubGroupLabel({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 bg-input/40 border-b border-border">
      <span className="text-muted text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
  );
}

const KALMAN_TOOLTIPS = {
  observationCovariance:
    "How much daily price wiggles are smoothed out. Higher values draw a steadier trend line but react slower to new moves — useful when you want the big picture, not every tick. Lower values hug the price closely, which can look noisier but catches turns faster.",
  transitionCovariance:
    "How quickly the underlying trend is allowed to change. Higher values let the trend line pivot fast when the market shifts regime. Lower values keep a stable baseline — better when you believe the current trend will persist.",
  mode:
    "Live Tracking uses only data available up to each day — required for signals and backtests (no look-ahead). Historical View uses the full price history to draw a perfectly smooth line for research; do not use it for live decisions.",
};

interface AppSettingsDraft {
  observationCovariance: string;
  transitionCovariance: string;
  mode: KalmanProcessingMode;
  enableKalmanFilter: boolean;
  enableElliottWave: boolean;
  enableMarkovRegime: boolean;
}

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

function StrategySettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data: persistedSettings = APP_SETTINGS_DEFAULTS, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    retry: false,
  });
  const [draft, setDraft] = useState<AppSettingsDraft | null>(null);
  const [openInfo, setOpenInfo] = useState<keyof typeof KALMAN_TOOLTIPS | null>(null);
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

  const inputClass = SETTINGS_INPUT_CLASS;
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
            tooltip={KALMAN_TOOLTIPS.observationCovariance}
            open={openInfo === "observationCovariance"}
            onToggle={() => setOpenInfo(openInfo === "observationCovariance" ? null : "observationCovariance")}
          />
          <div className="flex-1">
            <input
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
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-muted">0.0001–10.0 (default 0.1). Higher = smoother trend, slower to react.</p>
          </div>
        </div>

        <Divider />

        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <InfoPopover
            label="Trend responsiveness (Q)"
            tooltip={KALMAN_TOOLTIPS.transitionCovariance}
            open={openInfo === "transitionCovariance"}
            onToggle={() => setOpenInfo(openInfo === "transitionCovariance" ? null : "transitionCovariance")}
          />
          <div className="flex-1">
            <input
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
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-muted">0.0001–1.0 (default 0.01). Higher = trend adapts faster to shifts.</p>
          </div>
        </div>

        <Divider />

        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <InfoPopover
            label="Processing Mode"
            tooltip={KALMAN_TOOLTIPS.mode}
            open={openInfo === "mode"}
            onToggle={() => setOpenInfo(openInfo === "mode" ? null : "mode")}
          />
          <select
            value={values.mode}
            onChange={(e) => {
              setDraft({ ...values, mode: e.target.value as KalmanProcessingMode });
              setStatus("idle");
            }}
            disabled={disabled}
            className={SETTINGS_INPUT_CLASS}
          >
            <option value="causal">Live Tracking — for signals and backtests</option>
            <option value="historical">Historical View — research overlay only</option>
          </select>
        </div>

        <Divider />

        <div className="space-y-2">
          <div>
            <p className="text-muted text-xs font-medium uppercase tracking-wide">Analysis modules</p>
            <p className="text-[10px] text-muted mt-0.5">
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
          <button
            onClick={handleSave}
            disabled={disabled}
            className={BTN_PRIMARY_SM_CLASS}
          >
            {mutation.isPending ? "Saving…" : "Save Strategy Settings"}
          </button>
          <button
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

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const currentUserId = (session?.user as { id?: string })?.id ?? "";
  const queryClient = useQueryClient();

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: getApiKeys,
    enabled: isAdmin,
  });

  const { data: smtpStatus, isPending: smtpLoading, isError: smtpError } = useQuery({
    queryKey: ["smtpStatus"],
    queryFn: getSmtpStatus,
    enabled: isAdmin,
    retry: false,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: isAdmin,
  });

  const localKey = (provider: string) => apiKeys.find((k) => k.provider === provider);
  const refetchKeys = () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const { data: investorProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: getInvestorProfile,
  });

  const HORIZON_LABELS: Record<string, string> = {
    lt_1y: "< 1 year", "1_3y": "1–3 years", "3_7y": "3–7 years",
    "7_15y": "7–15 years", gt_15y: "15+ years",
  };
  const RISK_LABELS: Record<number, string> = {
    1: "Very conservative", 2: "Conservative", 3: "Moderate", 4: "Aggressive", 5: "Very aggressive",
  };
  const STYLE_LABELS: Record<string, string> = {
    passive: "Passive", active: "Active", hybrid: "Hybrid",
  };

  const [profileName, setProfileName] = useState((session?.user as { name?: string })?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState<DateFormatId>(DEFAULT_DATE_FORMAT);
  const { formatFilenameDate } = useDateFormat();
  const [defaultLlmConfig, setDefaultLlmConfig] = useState<LlmConfigValue>({
    provider: DEFAULT_LLM_PROVIDER,
    model: "",
    depth: DEFAULT_LLM_DEPTH,
  });
  const [profileStatus, setProfileStatus] = useState<"idle" | "success" | "error">("idle");
  const [profileError, setProfileError] = useState("");

  // Sync preferred_currency and default LLM config from server once loaded
  useEffect(() => {
    if (me?.preferred_currency) setPreferredCurrency(me.preferred_currency);
    if (me?.date_format) setDateFormat(me.date_format as DateFormatId);
    if (me) {
      setDefaultLlmConfig({
        provider: (me.default_llm_provider as LlmProvider) ?? DEFAULT_LLM_PROVIDER,
        model: me.default_llm_model ?? "",
        depth: (me.default_llm_depth as LlmDepth) ?? DEFAULT_LLM_DEPTH,
      });
    }
  }, [me?.preferred_currency, me?.date_format, me?.default_llm_provider, me?.default_llm_model, me?.default_llm_depth, me]);

  const profileMutation = useMutation({
    mutationFn: () => {
      const validationError = validateDefaultLlmConfig(
        defaultLlmConfig.provider,
        defaultLlmConfig.model,
        defaultLlmConfig.depth ?? DEFAULT_LLM_DEPTH,
      );
      if (validationError) {
        throw new Error(validationError);
      }
      return updateProfile({
        ...(profileName.trim() ? { name: profileName.trim() } : {}),
        ...(currentPassword && newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
        preferred_currency: preferredCurrency,
        date_format: dateFormat,
        default_llm_provider: defaultLlmConfig.provider,
        default_llm_model: defaultLlmConfig.model.trim() || null,
        default_llm_depth: defaultLlmConfig.depth ?? DEFAULT_LLM_DEPTH,
      });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setProfileStatus("success");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-current"] });
    },
    onError: (err: Error) => {
      setProfileStatus("error");
      setProfileError(err.message);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteUser(inviteEmail),
    onSuccess: (data) => {
      setInviteEmail("");
      setInviteStatus("success");
      setInviteUrl(data.invite_url);
    },
    onError: (err: Error) => {
      setInviteStatus("error");
      setInviteError(err.message);
      setInviteUrl(null);
    },
  });

  // Database backup / restore
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreElapsed, setRestoreElapsed] = useState(0);

  const restoreMutation = useMutation({
    mutationFn: () => restoreDbBackup(restoreFile!),
    onSuccess: () => {
      setRestoreModalOpen(false);
      setRestoreFile(null);
      setRestoreConfirmText("");
    },
  });

  // Tick elapsed seconds while restore is in progress
  useEffect(() => {
    if (!restoreMutation.isPending) { setRestoreElapsed(0); return; }
    setRestoreElapsed(0);
    const id = setInterval(() => setRestoreElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [restoreMutation.isPending]);

  async function handleDownloadBackup() {
    setBackupLoading(true);
    setBackupError("");
    try {
      const blob = await downloadDbBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentfloor-backup-${formatFilenameDate()}.dump`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBackupError((err as Error).message);
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <>
    <PageShell gap="6">
        <PageHeader title={<PageTitle>Settings</PageTitle>} />

        <SettingsLayout sections={visibleSettingsSections(isAdmin)}>

        <SectionCard id="profile" title="My Profile" description="Your display name and login credentials.">
          <div className="px-4 py-4 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <label htmlFor="profile-display-name" className="text-muted text-xs sm:w-32 shrink-0">Display Name</label>
              <input
                id="profile-display-name"
                type="text"
                value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setProfileStatus("idle"); }}
                className={SETTINGS_INPUT_CLASS}
              />
            </div>
            <Divider />
            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs">Change Password</span>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label htmlFor="profile-current-password" className="text-muted text-xs sm:w-32 shrink-0">Current</label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setProfileStatus("idle"); }}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className={SETTINGS_INPUT_CLASS}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label htmlFor="profile-new-password" className="text-muted text-xs sm:w-32 shrink-0">New</label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setProfileStatus("idle"); }}
                  placeholder="New password"
                  autoComplete="new-password"
                  className={SETTINGS_INPUT_CLASS}
                />
              </div>
            </div>
            <Divider />
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="sm:w-32 shrink-0">
                <label htmlFor="profile-preferred-currency" className="text-muted text-xs">Preferred Currency</label>
                <p className="text-[10px] text-muted mt-0.5 hidden sm:block">
                  Which currency to display when a holding reports more than one. Prices are not converted between currencies.
                </p>
              </div>
              <select
                id="profile-preferred-currency"
                value={preferredCurrency}
                onChange={(e) => { setPreferredCurrency(e.target.value); setProfileStatus("idle"); }}
                className={SETTINGS_INPUT_NARROW_CLASS}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted mt-0.5 sm:hidden">
                Display only — prices are not converted between currencies.
              </p>
            </div>
            <Divider />
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="sm:w-32 shrink-0">
                <label htmlFor="profile-date-format" className="text-muted text-xs">Date Format</label>
                <p className="text-[10px] text-muted mt-0.5 hidden sm:block">
                  How dates and times appear in runs, portfolio, and exports. New-run date pickers always stay in ISO format.
                </p>
              </div>
              <select
                id="profile-date-format"
                value={dateFormat}
                onChange={(e) => { setDateFormat(e.target.value as DateFormatId); setProfileStatus("idle"); }}
                className={SETTINGS_INPUT_DATE_FORMAT_CLASS}
              >
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted mt-0.5 sm:hidden">
                New-run date pickers always use ISO format.
              </p>
            </div>
            <Divider />
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-muted text-xs font-medium uppercase tracking-wide">Default LLM Configuration</p>
                <p className="text-[10px] text-muted mt-0.5">
                  Pre-fills provider, model, and depth on new runs, watchlist schedules, portfolio insights, and recommendations.
                </p>
              </div>
              <LlmConfigPicker
                value={defaultLlmConfig}
                onChange={(value) => { setDefaultLlmConfig(value); setProfileStatus("idle"); }}
                showDepth
                providerClassName={SETTINGS_INPUT_CLASS}
                modelClassName={SETTINGS_INPUT_MD_CLASS}
                depthClassName={SETTINGS_INPUT_CLASS}
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending}
                className={BTN_PRIMARY_SM_CLASS}
              >
                {profileMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
              {profileStatus === "success" && <StatusAnnouncer variant="success">Profile updated.</StatusAnnouncer>}
              {profileStatus === "error" && <StatusAnnouncer variant="error">{profileError}</StatusAnnouncer>}
            </div>
          </div>
        </SectionCard>

        <SectionCard id="investor-dna" title="Investor DNA" description="Personalize AI insights with your investment context.">
          <div className="px-4 py-4">
            {profileLoading ? (
              <div className="h-8 bg-input rounded-sm animate-pulse w-48" />
            ) : investorProfile ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-6 text-sm">
                  {investorProfile.time_horizon && (
                    <div>
                      <span className="text-muted text-xs">Horizon</span>
                      <p className="text-fg">{HORIZON_LABELS[investorProfile.time_horizon] ?? investorProfile.time_horizon}</p>
                    </div>
                  )}
                  {investorProfile.risk_willingness && (
                    <div>
                      <span className="text-muted text-xs">Risk</span>
                      <p className="text-fg">{RISK_LABELS[investorProfile.risk_willingness] ?? investorProfile.risk_willingness}</p>
                    </div>
                  )}
                  {investorProfile.investment_style && (
                    <div>
                      <span className="text-muted text-xs">Style</span>
                      <p className="text-fg">{STYLE_LABELS[investorProfile.investment_style] ?? investorProfile.investment_style}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className={STATUS_CONFIGURED_CLASS}>● DNA active</span>
                  <a href="/settings/investor-profile" className={BTN_SECONDARY_CLASS}>Edit profile</a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted text-sm">Personalize your AI insights by sharing your investment context.</p>
                <a href="/settings/investor-profile" className={`${BTN_SECONDARY_CLASS} text-purple-400 hover:text-purple-300 border-purple-500/30`}>Set up →</a>
              </div>
            )}
          </div>
        </SectionCard>

        <StrategySettingsPanel isAdmin={isAdmin} />

        {isAdmin && (
          <SectionCard id="llm-providers" title="LLM Providers" description="API keys and server URLs used when running analyses.">
            <SubGroupLabel label="Cloud APIs" />
            {CLOUD_LLM_PROVIDERS.map((provider, i) => (
              <div key={provider}>
                {i > 0 && <Divider />}
                <ApiKeyRow
                  provider={provider}
                  label={LLM_PROVIDER_LABELS[provider]}
                  placeholder={LLM_API_KEY_PLACEHOLDERS[provider]}
                  docsUrl={LLM_PROVIDER_DOCS_URLS[provider]}
                  isSet={apiKeys.find((k) => k.provider === provider)?.is_valid ?? false}
                  onSaved={refetchKeys}
                />
              </div>
            ))}
            <SubGroupLabel label="Local Servers" />
            {LOCAL_LLM_PROVIDERS.map((provider, i) => (
              <div key={provider}>
                {i > 0 && <Divider />}
                <ServerUrlRow
                  provider={provider}
                  label={LLM_SETTINGS_SHORT_LABELS[provider]}
                  isValid={localKey(provider)?.is_valid ?? false}
                  onSaved={refetchKeys}
                />
              </div>
            ))}
          </SectionCard>
        )}

        {isAdmin && (
          <SectionCard
            id="data-providers"
            title="Data Providers"
            description="Third-party data sources used for portfolio prices and outcome tracking."
          >
            <ApiKeyRow
              provider="finnhub"
              label="Finnhub"
              description="Live portfolio prices, fundamentals, news, and outcome tracking"
              placeholder="Your Finnhub API key"
              docsUrl="https://finnhub.io/dashboard"
              isSet={apiKeys.find((k) => k.provider === "finnhub")?.is_valid ?? false}
              capabilities={apiKeys.find((k) => k.provider === "finnhub")?.capabilities}
              capabilityWarning={apiKeys.find((k) => k.provider === "finnhub")?.last_error_message ?? null}
              onSaved={refetchKeys}
            />
          </SectionCard>
        )}

        {isAdmin && (
          <SectionCard
            id="notifications"
            title="Email Notifications"
            description="Notifies users when their analysis runs complete."
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-muted text-xs sm:w-32 shrink-0">Status</span>
                {smtpLoading ? (
                  <span className="text-muted text-xs">Checking…</span>
                ) : smtpError ? (
                  <span className="text-muted text-xs">Unavailable — restart the backend to load status</span>
                ) : smtpStatus?.configured ? (
                  <span className={STATUS_CONFIGURED_CLASS}>Configured</span>
                ) : (
                  <span className={STATUS_WARNING_CLASS}>Not configured — run-completion emails are off</span>
                )}
              </div>
              {!smtpLoading && !smtpError && smtpStatus?.configured && smtpStatus.from_address && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="text-muted text-xs sm:w-32 shrink-0">Sending from</span>
                  <span className="text-fg-secondary text-xs font-mono">{smtpStatus.from_address}</span>
                </div>
              )}
              {!smtpLoading && !smtpError && smtpStatus && !smtpStatus.configured && (
                <>
                  <Divider />
                  <div className="text-muted text-xs">
                    Set the following environment variables to enable email notifications:
                  </div>
                  <pre className="bg-input rounded-sm p-3 text-xs text-fg-secondary font-mono leading-relaxed overflow-x-auto">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourdomain.com`}
                  </pre>
                  <p className="text-muted text-xs">
                    For Gmail, use an{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className={LINK_INLINE_CLASS}
                    >
                      App Password
                    </a>{" "}
                    instead of your account password. Restart the backend after updating.
                  </p>
                </>
              )}
            </div>
          </SectionCard>
        )}

        {isAdmin && (
          <SectionCard id="team" title="Team" description="Manage members and send invitations.">
            <div className="divide-y divide-border">
              {users.map((u) => (
                <TeamMemberRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
                />
              ))}
              {users.length === 0 && (
                <p className="text-muted text-xs px-4 py-3">No team members found.</p>
              )}
            </div>
            <div className="border-t border-border px-4 py-3 flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus("idle"); }}
                placeholder="member@example.com"
                aria-label="Email address for team invite"
                className={SETTINGS_INPUT_COMPACT_CLASS}
              />
              <button
                onClick={() => { setInviteStatus("idle"); setInviteUrl(null); inviteMutation.mutate(); }}
                disabled={inviteMutation.isPending || !inviteEmail}
                className={BTN_PRIMARY_SM_CLASS}
              >
                {inviteMutation.isPending ? "Sending…" : "Invite Member"}
              </button>
              {inviteStatus === "success" && !inviteUrl && <StatusAnnouncer variant="success">Invite email sent.</StatusAnnouncer>}
              {inviteStatus === "error" && <StatusAnnouncer variant="error">{inviteError}</StatusAnnouncer>}
            </div>
            {inviteUrl && (
              <div className="border-t border-border px-4 py-3 flex flex-col gap-1">
                <span className="text-muted text-xs">SMTP is not configured — copy this invite link and send it manually:</span>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    className="bg-input border border-input-border rounded-sm px-2 py-1 text-xs text-fg-secondary font-mono flex-1 focus:outline-hidden"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    className={`${BTN_SECONDARY_CLASS} shrink-0 font-mono text-fg-secondary`}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {isAdmin && (
          <SectionCard
            id="database"
            title="Database"
            description="Download a full backup or restore from a file you exported earlier."
          >
            <div className="px-4 py-4 flex flex-col gap-5">
              {/* Backup */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1">
                  <p className="text-fg-secondary text-xs font-medium mb-0.5">Download Backup</p>
                  <p className="text-muted text-xs">
                    Exports a compressed backup (.dump) of all runs, portfolios, watchlists, and settings.
                  </p>
                </div>
                <button
                  onClick={handleDownloadBackup}
                  disabled={backupLoading}
                  className={`${BTN_SECONDARY_CLASS} shrink-0`}
                >
                  {backupLoading ? (
                    <>
                      <span className="inline-block w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" />
                      Exporting…
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                        <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                      </svg>
                      Download Backup
                    </>
                  )}
                </button>
              </div>
              {backupError && (
                <p className={`${STATUS_ERROR_CLASS} -mt-3`} role="alert">{backupError}</p>
              )}

              <Divider />

              {/* Restore */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-fg-secondary text-xs font-medium mb-0.5">Restore from Backup</p>
                  <p className="text-muted text-xs">
                    Choose a .dump file from this app. Restore replaces everything currently stored — runs, portfolios, API keys, and users.
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <label className={`${BTN_SECONDARY_CLASS} cursor-pointer text-fg-secondary hover:border-border-strong`}>
                    {restoreFile ? restoreFile.name : "Choose file…"}
                    <input
                      type="file"
                      accept=".dump"
                      className="hidden"
                      onChange={(e) => { setRestoreFile(e.target.files?.[0] ?? null); }}
                    />
                  </label>
                  <button
                    onClick={() => setRestoreModalOpen(true)}
                    disabled={!restoreFile}
                    className={BTN_DANGER_CLASS}
                  >
                    Restore…
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        </SettingsLayout>

      </PageShell>

      {/* Restore confirmation modal */}
      {restoreModalOpen && restoreFile && (() => {
        // Estimate restore time: ~5 MB/s effective rate for pg_restore
        const estimatedSecs = Math.max(10, Math.round(restoreFile.size / (5 * 1024 * 1024)));
        // Fake progress: grows fast then slows, caps at 95% until done
        const progress = restoreMutation.isSuccess
          ? 100
          : restoreMutation.isPending
            ? Math.min(95, Math.round(100 * (1 - Math.exp(-restoreElapsed / (estimatedSecs * 0.7)))))
            : 0;
        const remaining = Math.max(0, estimatedSecs - restoreElapsed);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="bg-elevated border border-input-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-danger shrink-0">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <h2 className="text-base font-semibold text-fg">Restore Database</h2>
              </div>

              {restoreMutation.isPending ? (
                /* ── In-progress view ── */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-fg-secondary">
                    <span className="inline-block w-4 h-4 border-2 border-muted border-t-white rounded-full animate-spin shrink-0" />
                    Restoring database…
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-muted-surface rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{restoreElapsed}s elapsed</span>
                    <span>
                      {remaining > 0
                        ? `~${remaining}s remaining`
                        : "finishing up…"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {restoreElapsed < 3
                      ? "Uploading backup file…"
                      : restoreElapsed < 8
                        ? "Dropping existing tables…"
                        : "Importing data…"}
                  </p>
                </div>
              ) : (
                /* ── Confirmation view ── */
                <>
                  <p className="text-sm text-fg-secondary">
                    This will <span className="text-danger font-medium">replace all current data</span> with the contents of:
                  </p>
                  <p className="text-xs text-muted font-mono bg-input rounded-sm px-3 py-2">{restoreFile.name}</p>
                  <p className="text-xs text-muted">
                    Overwrites all runs, portfolios, watchlists, API keys, and user accounts. This cannot be undone.
                  </p>
                  <div className="space-y-1">
                    <label htmlFor="restore-confirm-text" className="text-xs text-muted">Type <span className="font-mono text-fg">RESTORE</span> to confirm</label>
                    <input
                      id="restore-confirm-text"
                      type="text"
                      value={restoreConfirmText}
                      onChange={(e) => setRestoreConfirmText(e.target.value)}
                      placeholder="RESTORE"
                      className={`${FIELD_INPUT_CLASS} font-mono focus:border-red-500`}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    Est. restore time: ~{estimatedSecs}s
                    {restoreFile.size > 0 && ` (${(restoreFile.size / (1024 * 1024)).toFixed(1)} MB)`}
                  </p>
                </>
              )}

              {restoreMutation.isError && (
                <p className={STATUS_ERROR_CLASS} role="alert">{(restoreMutation.error as Error).message}</p>
              )}
              {restoreMutation.isSuccess && (
                <p className={STATUS_OK_CLASS} role="status" aria-live="polite">Database restored successfully.</p>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setRestoreModalOpen(false); setRestoreConfirmText(""); restoreMutation.reset(); }}
                  disabled={restoreMutation.isPending}
                  className={BTN_GHOST_CLASS}
                >
                  Cancel restore
                </button>
                {!restoreMutation.isPending && (
                  <button
                    onClick={() => restoreMutation.mutate()}
                    disabled={restoreConfirmText !== "RESTORE"}
                    className={BTN_DANGER_SM_CLASS}
                  >
                    Restore Database
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
