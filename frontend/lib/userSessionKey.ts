type SessionLike = {
  user?: {
    id?: unknown;
    email?: unknown;
  } | null;
} | null | undefined;

export function getSessionUserKey(session: SessionLike): string | null {
  const id = session?.user?.id;
  if (typeof id === "string" && id.length > 0) return id;
  const email = session?.user?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}
