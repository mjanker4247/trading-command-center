"use client";

import { useEffect, useRef } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  BTN_DANGER_SM_CLASS,
  BTN_GHOST_CLASS,
  FIELD_INPUT_CLASS,
  STATUS_ERROR_CLASS,
  STATUS_OK_CLASS,
} from "@/lib/uiClasses";

type RestoreDatabaseModalProps = {
  open: boolean;
  file: File;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  elapsedSecs: number;
  onClose: () => void;
  mutation: UseMutationResult<unknown, Error, void, unknown>;
};

export function RestoreDatabaseModal({
  open,
  file,
  confirmText,
  onConfirmTextChange,
  elapsedSecs,
  onClose,
  mutation,
}: RestoreDatabaseModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const estimatedSecs = Math.max(10, Math.round(file.size / (5 * 1024 * 1024)));
  const remaining = Math.max(0, estimatedSecs - elapsedSecs);

  function handleClose() {
    if (mutation.isPending) return;
    mutation.reset();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="restore-dialog-title"
      aria-describedby="restore-dialog-desc"
      className="fixed inset-0 z-50 m-auto w-full max-w-md border-0 bg-transparent p-0 backdrop:bg-black/60 open:flex open:items-center open:justify-center"
      onCancel={(e) => {
        if (mutation.isPending) {
          e.preventDefault();
          return;
        }
        handleClose();
      }}
      onClose={handleClose}
    >
      <div className="bg-elevated border border-input-border rounded-xl shadow-xl w-[calc(100%-2rem)] max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-danger shrink-0" aria-hidden>
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <h2 id="restore-dialog-title" className="text-base font-semibold text-fg">Restore Database</h2>
        </div>

        {mutation.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-fg-secondary">
              <span className="inline-block w-4 h-4 border-2 border-muted border-t-fg rounded-full animate-spin shrink-0" />
              Restoring database…
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext="Restore in progress — timing is estimated"
              className="w-full bg-muted-surface rounded-full h-1.5 overflow-hidden"
            >
              <div className="h-full w-2/3 bg-danger rounded-full motion-safe:animate-pulse" />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{elapsedSecs}s elapsed</span>
              <span>{remaining > 0 ? `~${remaining}s remaining (estimate)` : "Finishing up…"}</span>
            </div>
            <p id="restore-dialog-desc" className="text-xs text-muted">
              {elapsedSecs < 3
                ? "Uploading backup file…"
                : elapsedSecs < 8
                  ? "Dropping existing tables…"
                  : "Importing data…"}
            </p>
          </div>
        ) : (
          <>
            <p id="restore-dialog-desc" className="text-sm text-fg-secondary">
              This will <span className="text-danger font-medium">replace all current data</span> with the contents of:
            </p>
            <p className="text-xs text-muted font-mono bg-input rounded-sm px-3 py-2 break-all">{file.name}</p>
            <p className="text-xs text-muted">
              Overwrites all runs, portfolios, watchlists, API keys, and user accounts. This cannot be undone.
            </p>
            <div className="space-y-1">
              <label htmlFor="restore-confirm-text" className="text-xs text-muted">
                Type <span className="font-mono text-fg">RESTORE</span> to confirm
              </label>
              <input
                id="restore-confirm-text"
                type="text"
                value={confirmText}
                onChange={(e) => onConfirmTextChange(e.target.value)}
                placeholder="RESTORE"
                autoComplete="off"
                className={`${FIELD_INPUT_CLASS} font-mono focus-visible:border-danger`}
              />
            </div>
            <p className="text-xs text-muted">
              Est. restore time: ~{estimatedSecs}s
              {file.size > 0 && ` (${(file.size / (1024 * 1024)).toFixed(1)} MB)`}
            </p>
          </>
        )}

        {mutation.isError && (
          <p className={STATUS_ERROR_CLASS} role="alert">{mutation.error.message}</p>
        )}
        {mutation.isSuccess && (
          <p className={STATUS_OK_CLASS} role="status" aria-live="polite">Database restored successfully.</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={handleClose} disabled={mutation.isPending} className={BTN_GHOST_CLASS}>
            Cancel restore
          </button>
          {!mutation.isPending && (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={confirmText !== "RESTORE"}
              className={BTN_DANGER_SM_CLASS}
            >
              Restore Database
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
