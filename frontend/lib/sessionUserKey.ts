import type { Session } from "next-auth";

export function sessionUserKey(session: Session | null | undefined): string | null {
  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  const accessToken = (session as { accessToken?: string } | null | undefined)?.accessToken;
  return user?.id ?? user?.email ?? accessToken ?? null;
}
