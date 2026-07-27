import type { Session } from "next-auth";

type SessionStatus = "authenticated" | "unauthenticated" | "loading";
type SessionWithIdentity = Session & {
  accessToken?: string | null;
  user?: Session["user"] & { id?: string | null; email?: string | null };
};

export function sessionUserKey(
  status: SessionStatus,
  session: SessionWithIdentity | null | undefined
): string | null {
  if (status === "loading") return null;
  if (status !== "authenticated") return status;

  return (
    session?.user?.id ??
    session?.user?.email ??
    session?.accessToken ??
    "authenticated"
  );
}
