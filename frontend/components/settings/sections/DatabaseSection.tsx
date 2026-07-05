"use client";

import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import { BTN_DANGER_CLASS, BTN_SECONDARY_CLASS, STATUS_ERROR_CLASS } from "@/lib/uiClasses";

type DatabaseSectionProps = {
  backupLoading: boolean;
  backupError: string;
  restoreFile: File | null;
  onDownloadBackup: () => void;
  onRestoreFileChange: (file: File | null) => void;
  onOpenRestoreModal: () => void;
};

export function DatabaseSection({
  backupLoading,
  backupError,
  restoreFile,
  onDownloadBackup,
  onRestoreFileChange,
  onOpenRestoreModal,
}: DatabaseSectionProps) {
  return (
    <SectionCard
      id="database"
      title="Database"
      description="Download a full backup or restore from a file you exported earlier."
    >
      <div className="px-4 py-4 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex-1">
            <p className="text-fg-secondary text-xs font-medium mb-0.5">Download Backup</p>
            <p className="text-muted text-xs">
              Exports a compressed backup (.dump) of all runs, portfolios, watchlists, and settings.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadBackup}
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden>
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

        <SettingsDivider />

        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <p className="text-fg-secondary text-xs font-medium mb-0.5">Restore from Backup</p>
            <p className="text-muted text-xs">
              Choose a .dump file from this app. Restore replaces everything currently stored — runs, portfolios, API keys, and users.
            </p>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <label className={`${BTN_SECONDARY_CLASS} cursor-pointer text-fg-secondary hover:border-border-strong text-center`}>
              {restoreFile ? restoreFile.name : "Choose file…"}
              <input
                type="file"
                accept=".dump"
                className="hidden"
                onChange={(e) => onRestoreFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={onOpenRestoreModal}
              disabled={!restoreFile}
              className={BTN_DANGER_CLASS}
            >
              Restore…
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
