"use client";

import type { DateFormatId } from "@/lib/dateFormat";
import { DATE_FORMAT_OPTIONS } from "@/lib/dateFormat";
import { LlmConfigPicker, type LlmConfigValue } from "@/components/llm/LlmConfigPicker";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_INPUT_DATE_FORMAT_CLASS,
  SETTINGS_INPUT_MD_CLASS,
  SETTINGS_INPUT_NARROW_CLASS,
} from "@/components/settings/constants";
import { StatusAnnouncer } from "@/components/ui/StatusAnnouncer";
import { BTN_PRIMARY_SM_CLASS } from "@/lib/uiClasses";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

const LLM_PICKER_ID_PREFIX = "profile-default-llm";

export type ProfileSectionProps = {
  profileName: string;
  onProfileNameChange: (value: string) => void;
  currentPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  preferredCurrency: string;
  onPreferredCurrencyChange: (value: string) => void;
  dateFormat: DateFormatId;
  onDateFormatChange: (value: DateFormatId) => void;
  defaultLlmConfig: LlmConfigValue;
  onDefaultLlmConfigChange: (value: LlmConfigValue) => void;
  onSave: () => void;
  isSaving: boolean;
  status: "idle" | "success" | "error";
  error: string;
  onEdit: () => void;
};

export function ProfileSection({
  profileName,
  onProfileNameChange,
  currentPassword,
  onCurrentPasswordChange,
  newPassword,
  onNewPasswordChange,
  preferredCurrency,
  onPreferredCurrencyChange,
  dateFormat,
  onDateFormatChange,
  defaultLlmConfig,
  onDefaultLlmConfigChange,
  onSave,
  isSaving,
  status,
  error,
  onEdit,
}: ProfileSectionProps) {
  return (
    <SectionCard id="profile" title="My Profile" description="Your display name and login credentials.">
      <div className="px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <label htmlFor="profile-display-name" className="text-muted text-xs sm:w-32 shrink-0">Display Name</label>
          <input
            id="profile-display-name"
            type="text"
            value={profileName}
            onChange={(e) => { onProfileNameChange(e.target.value); onEdit(); }}
            className={SETTINGS_INPUT_CLASS}
          />
        </div>
        <SettingsDivider />
        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
          <legend className="text-muted text-xs">Change Password</legend>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label htmlFor="profile-current-password" className="text-muted text-xs sm:w-32 shrink-0">Current</label>
            <input
              id="profile-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => { onCurrentPasswordChange(e.target.value); onEdit(); }}
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
              onChange={(e) => { onNewPasswordChange(e.target.value); onEdit(); }}
              placeholder="New password"
              autoComplete="new-password"
              className={SETTINGS_INPUT_CLASS}
            />
          </div>
        </fieldset>
        <SettingsDivider />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="sm:w-32 shrink-0">
            <label htmlFor="profile-preferred-currency" className="text-muted text-xs">Preferred Currency</label>
            <p className="text-xs text-muted mt-0.5 hidden sm:block">
              Which currency to display when a holding reports more than one. Prices are not converted between currencies.
            </p>
          </div>
          <select
            id="profile-preferred-currency"
            value={preferredCurrency}
            onChange={(e) => { onPreferredCurrencyChange(e.target.value); onEdit(); }}
            className={SETTINGS_INPUT_NARROW_CLASS}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-xs text-muted mt-0.5 sm:hidden">
            Display only — prices are not converted between currencies.
          </p>
        </div>
        <SettingsDivider />
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <div className="sm:w-32 shrink-0">
            <label htmlFor="profile-date-format" className="text-muted text-xs">Date Format</label>
            <p className="text-xs text-muted mt-0.5 hidden sm:block">
              How dates and times appear in runs, portfolio, and exports. New-run date pickers always stay in ISO format.
            </p>
          </div>
          <select
            id="profile-date-format"
            value={dateFormat}
            onChange={(e) => { onDateFormatChange(e.target.value as DateFormatId); onEdit(); }}
            className={SETTINGS_INPUT_DATE_FORMAT_CLASS}
          >
            {DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted mt-0.5 sm:hidden">
            New-run date pickers always use ISO format.
          </p>
        </div>
        <SettingsDivider />
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted text-xs font-medium uppercase tracking-wide">Default LLM Configuration</p>
            <p className="text-xs text-muted mt-0.5">
              Pre-fills provider, model, depth, and response language on new runs, watchlist schedules, portfolio insights, and recommendations.
            </p>
          </div>
          <LlmConfigPicker
            idPrefix={LLM_PICKER_ID_PREFIX}
            value={defaultLlmConfig}
            onChange={(value) => { onDefaultLlmConfigChange(value); onEdit(); }}
            showDepth
            showLanguage
            providerClassName={SETTINGS_INPUT_CLASS}
            modelClassName={SETTINGS_INPUT_MD_CLASS}
            depthClassName={SETTINGS_INPUT_CLASS}
            languageClassName={SETTINGS_INPUT_CLASS}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={onSave} disabled={isSaving} className={BTN_PRIMARY_SM_CLASS}>
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
          {status === "success" && <StatusAnnouncer variant="success">Profile updated.</StatusAnnouncer>}
          {status === "error" && <StatusAnnouncer variant="error">{error}</StatusAnnouncer>}
        </div>
      </div>
    </SectionCard>
  );
}
