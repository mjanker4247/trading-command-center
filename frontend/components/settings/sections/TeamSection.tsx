"use client";

import { useState } from "react";
import type { User } from "@/lib/types";
import { TeamMemberRow } from "@/components/settings/TeamMemberRow";
import { SectionCard } from "@/components/settings/SectionCard";
import { StatusAnnouncer } from "@/components/ui/StatusAnnouncer";
import { BTN_PRIMARY_SM_CLASS, BTN_SECONDARY_CLASS } from "@/lib/uiClasses";
import { SETTINGS_INPUT_COMPACT_CLASS } from "@/components/settings/constants";

type TeamSectionProps = {
  users: User[];
  currentUserId: string;
  inviteEmail: string;
  onInviteEmailChange: (value: string) => void;
  onInvite: () => void;
  isInviting: boolean;
  inviteStatus: "idle" | "success" | "error";
  inviteError: string;
  inviteUrl: string | null;
  onUsersChanged: () => void;
  onInviteReset: () => void;
};

export function TeamSection({
  users,
  currentUserId,
  inviteEmail,
  onInviteEmailChange,
  onInvite,
  isInviting,
  inviteStatus,
  inviteError,
  inviteUrl,
  onUsersChanged,
  onInviteReset,
}: TeamSectionProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");

  async function handleCopyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopyStatus("success");
    window.setTimeout(() => setCopyStatus("idle"), 2500);
  }

  return (
    <SectionCard id="team" title="Team" description="Manage members and send invitations.">
      <div className="divide-y divide-border">
        {users.map((u) => (
          <TeamMemberRow
            key={u.id}
            user={u}
            currentUserId={currentUserId}
            onChanged={onUsersChanged}
          />
        ))}
        {users.length === 0 && (
          <p className="text-muted text-xs px-4 py-3">No team members found.</p>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          id="team-invite-email"
          type="email"
          value={inviteEmail}
          onChange={(e) => { onInviteEmailChange(e.target.value); onInviteReset(); }}
          placeholder="member@example.com"
          aria-label="Email address for team invite"
          className={SETTINGS_INPUT_COMPACT_CLASS}
        />
        <button
          type="button"
          onClick={onInvite}
          disabled={isInviting || !inviteEmail}
          className={`${BTN_PRIMARY_SM_CLASS} shrink-0`}
        >
          {isInviting ? "Sending…" : "Invite Member"}
        </button>
        {inviteStatus === "success" && !inviteUrl && (
          <StatusAnnouncer variant="success">Invite email sent.</StatusAnnouncer>
        )}
        {inviteStatus === "error" && <StatusAnnouncer variant="error">{inviteError}</StatusAnnouncer>}
      </div>
      {inviteUrl && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-1">
          <span className="text-muted text-xs">SMTP is not configured — copy this invite link and send it manually:</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              aria-label="Invite link"
              className="bg-input border border-input-border rounded-sm px-2 py-1 text-xs text-fg-secondary font-mono w-full focus:outline-hidden"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopyInvite}
              className={`${BTN_SECONDARY_CLASS} shrink-0 font-mono text-fg-secondary`}
            >
              Copy link
            </button>
            {copyStatus === "success" && (
              <StatusAnnouncer variant="success">Link copied.</StatusAnnouncer>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
