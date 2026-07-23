"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { resetUserScopedClientState } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmed = useRef(false);
  const userKey = session?.user?.email ?? (session as { accessToken?: string } | null)?.accessToken ?? null;
  const lastUserKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncUserScopedCache() {
      if (status === "unauthenticated") {
        lastUserKey.current = null;
        warmed.current = false;
        await resetUserScopedClientState();
        return;
      }

      if (status !== "authenticated" || !userKey) return;

      if (lastUserKey.current === null) {
        lastUserKey.current = userKey;
      } else if (lastUserKey.current !== userKey) {
        lastUserKey.current = userKey;
        warmed.current = false;
        await resetUserScopedClientState();
      }

      if (cancelled || warmed.current) return;
      warmed.current = true;
      void prefetchAppData(queryClient);
    }

    void syncUserScopedCache();
    return () => {
      cancelled = true;
    };
  }, [status, userKey, queryClient]);

  return null;
}
