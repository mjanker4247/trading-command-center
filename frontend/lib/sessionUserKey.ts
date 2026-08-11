type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null;

export function sessionUserKey(session: SessionLike): string | null {
  return session?.user?.id ?? session?.user?.email ?? null;
}
