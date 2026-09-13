import type { Session } from "next-auth";

export function sessionUserKey(session: Session | null | undefined): string | null {
  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  return user?.id ?? user?.email ?? null;
}
