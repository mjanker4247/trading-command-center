import type { Session } from "next-auth";

export function getSessionUserKey(
  status: "loading" | "authenticated" | "unauthenticated",
  session: Session | null | undefined,
): string | null {
  if (status === "loading") return null;
  if (status !== "authenticated") return "signed-out";

  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  if (user?.id) return `user:${user.id}`;
  if (user?.email) return `email:${user.email}`;
  return "authenticated";
}
