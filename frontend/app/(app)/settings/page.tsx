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
} from "@/lib/api";
import { DEFAULT_DATE_FORMAT, type DateFormatId } from "@/lib/dateFormat";
import { useDateFormat } from "@/lib/useDateFormat";
import { DEFAULT_LLM_DEPTH, DEFAULT_LLM_PROVIDER, validateDefaultLlmConfig, type LlmDepth, type LlmProvider } from "@/lib/llmConfig";
import { DEFAULT_RESPONSE_LANGUAGE } from "@/lib/responseLanguage";
import type { LlmConfigValue } from "@/components/llm/LlmConfigPicker";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader, PageTitle } from "@/components/layout/PageHeader";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { RestoreDatabaseModal } from "@/components/settings/RestoreDatabaseModal";
import { ProfileSection } from "@/components/settings/sections/ProfileSection";
import { InvestorDnaSummarySection } from "@/components/settings/sections/InvestorDnaSummarySection";
import { StrategySection } from "@/components/settings/sections/StrategySection";
import { LlmProvidersSection } from "@/components/settings/sections/LlmProvidersSection";
import { DataProvidersSection } from "@/components/settings/sections/DataProvidersSection";
import { NotificationsSection } from "@/components/settings/sections/NotificationsSection";
import { TeamSection } from "@/components/settings/sections/TeamSection";
import { DatabaseSection } from "@/components/settings/sections/DatabaseSection";
import { visibleSettingsSections } from "@/lib/settingsNav";

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const currentUserId = (session?.user as { id?: string })?.id ?? "";
  const queryClient = useQueryClient();
  const { formatFilenameDate } = useDateFormat();

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

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const { data: investorProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: getInvestorProfile,
  });

  const refetchKeys = () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] });

  const [profileName, setProfileName] = useState((session?.user as { name?: string })?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState<DateFormatId>(DEFAULT_DATE_FORMAT);
  const [defaultLlmConfig, setDefaultLlmConfig] = useState<LlmConfigValue>({
    provider: DEFAULT_LLM_PROVIDER,
    model: "",
    depth: DEFAULT_LLM_DEPTH,
    response_language: DEFAULT_RESPONSE_LANGUAGE,
  });
  const [profileStatus, setProfileStatus] = useState<"idle" | "success" | "error">("idle");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (me?.preferred_currency) setPreferredCurrency(me.preferred_currency);
    if (me?.date_format) setDateFormat(me.date_format as DateFormatId);
    if (me) {
      setDefaultLlmConfig({
        provider: (me.default_llm_provider as LlmProvider) ?? DEFAULT_LLM_PROVIDER,
        model: me.default_llm_model ?? "",
        depth: (me.default_llm_depth as LlmDepth) ?? DEFAULT_LLM_DEPTH,
        response_language: me.default_llm_response_language ?? DEFAULT_RESPONSE_LANGUAGE,
      });
    }
  }, [me?.preferred_currency, me?.date_format, me?.default_llm_provider, me?.default_llm_model, me?.default_llm_depth, me?.default_llm_response_language, me]);

  const profileMutation = useMutation({
    mutationFn: () => {
      const validationError = validateDefaultLlmConfig(
        defaultLlmConfig.provider,
        defaultLlmConfig.model,
        defaultLlmConfig.depth ?? DEFAULT_LLM_DEPTH,
        defaultLlmConfig.response_language,
      );
      if (validationError) throw new Error(validationError);
      return updateProfile({
        ...(profileName.trim() ? { name: profileName.trim() } : {}),
        ...(currentPassword && newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
        preferred_currency: preferredCurrency,
        date_format: dateFormat,
        default_llm_provider: defaultLlmConfig.provider,
        default_llm_model: defaultLlmConfig.model.trim() || null,
        default_llm_depth: defaultLlmConfig.depth ?? DEFAULT_LLM_DEPTH,
        default_llm_response_language: defaultLlmConfig.response_language,
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

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!restoreMutation.isPending) {
      setRestoreElapsed(0);
      return;
    }
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

  function closeRestoreModal() {
    setRestoreModalOpen(false);
    setRestoreConfirmText("");
    restoreMutation.reset();
  }

  return (
    <>
      <PageShell gap="6">
        <PageHeader title={<PageTitle>Settings</PageTitle>} />

        <SettingsLayout sections={visibleSettingsSections(isAdmin)}>
          <ProfileSection
            profileName={profileName}
            onProfileNameChange={setProfileName}
            currentPassword={currentPassword}
            onCurrentPasswordChange={setCurrentPassword}
            newPassword={newPassword}
            onNewPasswordChange={setNewPassword}
            preferredCurrency={preferredCurrency}
            onPreferredCurrencyChange={setPreferredCurrency}
            dateFormat={dateFormat}
            onDateFormatChange={setDateFormat}
            defaultLlmConfig={defaultLlmConfig}
            onDefaultLlmConfigChange={setDefaultLlmConfig}
            onSave={() => profileMutation.mutate()}
            isSaving={profileMutation.isPending}
            status={profileStatus}
            error={profileError}
            onEdit={() => setProfileStatus("idle")}
          />

          <InvestorDnaSummarySection isLoading={profileLoading} profile={investorProfile} />

          <StrategySection isAdmin={isAdmin} />

          {isAdmin && (
            <LlmProvidersSection apiKeys={apiKeys} onKeysChanged={refetchKeys} />
          )}

          {isAdmin && (
            <DataProvidersSection apiKeys={apiKeys} onKeysChanged={refetchKeys} />
          )}

          {isAdmin && (
            <NotificationsSection
              isLoading={smtpLoading}
              isError={smtpError}
              smtpStatus={smtpStatus}
            />
          )}

          {isAdmin && (
            <TeamSection
              users={users}
              currentUserId={currentUserId}
              inviteEmail={inviteEmail}
              onInviteEmailChange={setInviteEmail}
              onInvite={() => {
                setInviteStatus("idle");
                setInviteUrl(null);
                inviteMutation.mutate();
              }}
              isInviting={inviteMutation.isPending}
              inviteStatus={inviteStatus}
              inviteError={inviteError}
              inviteUrl={inviteUrl}
              onUsersChanged={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
              onInviteReset={() => setInviteStatus("idle")}
            />
          )}

          {isAdmin && (
            <DatabaseSection
              backupLoading={backupLoading}
              backupError={backupError}
              restoreFile={restoreFile}
              onDownloadBackup={handleDownloadBackup}
              onRestoreFileChange={setRestoreFile}
              onOpenRestoreModal={() => setRestoreModalOpen(true)}
            />
          )}
        </SettingsLayout>
      </PageShell>

      {restoreModalOpen && restoreFile && (
        <RestoreDatabaseModal
          open={restoreModalOpen}
          file={restoreFile}
          confirmText={restoreConfirmText}
          onConfirmTextChange={setRestoreConfirmText}
          elapsedSecs={restoreElapsed}
          onClose={closeRestoreModal}
          mutation={restoreMutation}
        />
      )}
    </>
  );
}
