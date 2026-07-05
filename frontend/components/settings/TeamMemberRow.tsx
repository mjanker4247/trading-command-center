"use client";
import { useMutation } from "@tanstack/react-query";
import { updateUserRole, deleteUser } from "@/lib/api";
import type { User } from "@/lib/types";

interface TeamMemberRowProps {
  user: User;
  currentUserId: string;
  onChanged: () => void;
}

const ROW_ACTION_CLASS =
  "rounded-sm px-1 py-2 text-xs touch-manipulation transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50";

export function TeamMemberRow({ user, currentUserId, onChanged }: TeamMemberRowProps) {
  const isSelf = user.id === currentUserId;

  const roleMutation = useMutation({
    mutationFn: () => updateUserRole(user.id, user.role === "admin" ? "member" : "admin"),
    onSuccess: onChanged,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: onChanged,
  });

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-fg text-sm truncate">{user.name}</p>
        <p className="text-muted text-xs truncate">{user.email}</p>
      </div>
      <span
        className={`text-xs px-2 py-0.5 rounded ${
          user.role === "admin" ? "bg-blue-900 text-blue-300" : "bg-muted-surface text-fg-secondary"
        }`}
      >
        {user.role}
      </span>
      {!isSelf && (
        <>
          <button
            type="button"
            onClick={() => roleMutation.mutate()}
            disabled={roleMutation.isPending}
            className={`${ROW_ACTION_CLASS} text-muted hover:text-fg-secondary`}
          >
            {user.role === "admin" ? "Make member" : "Make admin"}
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className={`${ROW_ACTION_CLASS} text-danger hover:text-danger/80`}
          >
            Remove member
          </button>
        </>
      )}
    </div>
  );
}
