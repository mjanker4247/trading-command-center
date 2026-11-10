"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSmtpSettings, updateSmtpSettings, type SmtpSettings } from "@/lib/api";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import { SETTINGS_INPUT_CLASS, SETTINGS_INPUT_NARROW_CLASS } from "@/components/settings/constants";
import { StatusAnnouncer } from "@/components/ui/StatusAnnouncer";
import {
  BTN_PRIMARY_SM_CLASS,
  STATUS_CONFIGURED_CLASS,
  STATUS_WARNING_CLASS,
} from "@/lib/uiClasses";

type Draft = {
  host: string;
  port: string;
  user: string;
  password: string;
  fromAddress: string;
  startTls: boolean;
  clearPassword: boolean;
};

function toDraft(cfg: SmtpSettings): Draft {
  return {
    host: cfg.host,
    port: String(cfg.port),
    user: cfg.user,
    password: "",
    fromAddress: cfg.from_address,
    startTls: cfg.start_tls,
    clearPassword: false,
  };
}

const FIELD_IDS = {
  host: "smtp-host",
  port: "smtp-port",
  user: "smtp-user",
  password: "smtp-password",
  from: "smtp-from",
  startTls: "smtp-start-tls",
} as const;

export function NotificationsSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["smtpSettings"],
    queryFn: getSmtpSettings,
    retry: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);

  const values = draft ?? (data ? toDraft(data) : null);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!values) throw new Error("Nothing to save");
      const port = Number(values.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Port must be an integer between 1 and 65535");
      }
      if (values.host.trim() && !values.fromAddress.trim()) {
        throw new Error("From address is required when host is set");
      }
      return updateSmtpSettings({
        host: values.host.trim(),
        port,
        user: values.user.trim(),
        from_address: values.fromAddress.trim() || "noreply@agentfloor.local",
        start_tls: values.startTls,
        ...(values.clearPassword
          ? { clear_password: true }
          : values.password
            ? { password: values.password }
            : {}),
      });
    },
    onSuccess: (saved) => {
      setDraft(toDraft(saved));
      setStatus("success");
      setError("");
      queryClient.setQueryData(["smtpSettings"], saved);
      queryClient.invalidateQueries({ queryKey: ["smtpStatus"] });
    },
    onError: (err: Error) => {
      setStatus("error");
      setError(err.message);
    },
  });

  function patch(partial: Partial<Draft>) {
    if (!values) return;
    setStatus("idle");
    setDraft({ ...values, ...partial });
  }

  return (
    <SectionCard
      id="notifications"
      title="Email Notifications"
      description="Outbound SMTP for run-completion mail, team invites, and morning briefs. Password is stored encrypted."
    >
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-muted text-xs sm:w-32 shrink-0">Status</span>
          {isLoading ? (
            <span className="text-muted text-xs">Checking…</span>
          ) : isError ? (
            <span className="text-muted text-xs">Unavailable — restart the backend to load status</span>
          ) : data?.configured ? (
            <span className={STATUS_CONFIGURED_CLASS}>Configured</span>
          ) : (
            <span className={STATUS_WARNING_CLASS}>Not configured — outbound email is off</span>
          )}
        </div>

        {!isLoading && !isError && values && (
          <>
            <SettingsDivider />
            <p className="text-muted text-xs">
              House deploy: join Docker network <span className="font-mono">mail</span>, then use host{" "}
              <span className="font-mono">smtp-relay</span>, port <span className="font-mono">25</span>, empty
              user/password, STARTTLS off, and a From address on your mail domain (e.g.{" "}
              <span className="font-mono">noreply@ululuu.de</span>).
            </p>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.host} className="text-muted text-xs sm:w-32 shrink-0">
                Host
              </label>
              <input
                id={FIELD_IDS.host}
                className={SETTINGS_INPUT_CLASS}
                value={values.host}
                onChange={(e) => patch({ host: e.target.value })}
                placeholder="smtp-relay"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.port} className="text-muted text-xs sm:w-32 shrink-0">
                Port
              </label>
              <input
                id={FIELD_IDS.port}
                className={SETTINGS_INPUT_NARROW_CLASS}
                inputMode="numeric"
                value={values.port}
                onChange={(e) => patch({ port: e.target.value })}
                placeholder="25"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.user} className="text-muted text-xs sm:w-32 shrink-0">
                Username
              </label>
              <input
                id={FIELD_IDS.user}
                className={SETTINGS_INPUT_CLASS}
                value={values.user}
                onChange={(e) => patch({ user: e.target.value })}
                placeholder="(optional)"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.password} className="text-muted text-xs sm:w-32 shrink-0">
                Password
              </label>
              <div className="flex flex-col gap-1 min-w-0 flex-1 sm:max-w-xs">
                <input
                  id={FIELD_IDS.password}
                  type="password"
                  className={SETTINGS_INPUT_CLASS}
                  value={values.password}
                  onChange={(e) => patch({ password: e.target.value, clearPassword: false })}
                  placeholder={data?.password_set ? "•••••••• (leave blank to keep)" : "(optional)"}
                  autoComplete="new-password"
                  disabled={values.clearPassword}
                />
                {data?.password_set && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={values.clearPassword}
                      onChange={(e) =>
                        patch({ clearPassword: e.target.checked, password: e.target.checked ? "" : values.password })
                      }
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                    Clear stored password
                  </label>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.from} className="text-muted text-xs sm:w-32 shrink-0">
                From address
              </label>
              <input
                id={FIELD_IDS.from}
                className={SETTINGS_INPUT_CLASS}
                value={values.fromAddress}
                onChange={(e) => patch({ fromAddress: e.target.value })}
                placeholder="noreply@ululuu.de"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor={FIELD_IDS.startTls} className="text-muted text-xs sm:w-32 shrink-0">
                STARTTLS
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input
                  id={FIELD_IDS.startTls}
                  type="checkbox"
                  checked={values.startTls}
                  onChange={(e) => patch({ startTls: e.target.checked })}
                  className="h-4 w-4 accent-blue-600"
                />
                Enable (port 587 / Gmail). Off for smtp-relay:25. Port 465 uses implicit TLS automatically.
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                className={BTN_PRIMARY_SM_CLASS}
                disabled={saveMutation.isPending}
                onClick={() => {
                  setStatus("idle");
                  saveMutation.mutate();
                }}
              >
                {saveMutation.isPending ? "Saving…" : "Save SMTP"}
              </button>
              {status === "success" && (
                <StatusAnnouncer variant="success">SMTP settings saved.</StatusAnnouncer>
              )}
              {status === "error" && <StatusAnnouncer variant="error">{error}</StatusAnnouncer>}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
