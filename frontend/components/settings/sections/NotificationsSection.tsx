"use client";

import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import { LINK_INLINE_CLASS, STATUS_CONFIGURED_CLASS, STATUS_WARNING_CLASS } from "@/lib/uiClasses";

type NotificationsSectionProps = {
  isLoading: boolean;
  isError: boolean;
  smtpStatus: { configured: boolean; from_address: string | null } | undefined;
};

export function NotificationsSection({ isLoading, isError, smtpStatus }: NotificationsSectionProps) {
  return (
    <SectionCard
      id="notifications"
      title="Email Notifications"
      description="Notifies users when their analysis runs complete."
    >
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-muted text-xs sm:w-32 shrink-0">Status</span>
          {isLoading ? (
            <span className="text-muted text-xs">Checking…</span>
          ) : isError ? (
            <span className="text-muted text-xs">Unavailable — restart the backend to load status</span>
          ) : smtpStatus?.configured ? (
            <span className={STATUS_CONFIGURED_CLASS}>Configured</span>
          ) : (
            <span className={STATUS_WARNING_CLASS}>Not configured — run-completion emails are off</span>
          )}
        </div>
        {!isLoading && !isError && smtpStatus?.configured && smtpStatus.from_address && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-muted text-xs sm:w-32 shrink-0">Sending from</span>
            <span className="text-fg-secondary text-xs font-mono">{smtpStatus.from_address}</span>
          </div>
        )}
        {!isLoading && !isError && smtpStatus && !smtpStatus.configured && (
          <>
            <SettingsDivider />
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
  );
}
