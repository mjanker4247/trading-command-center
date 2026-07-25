"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return (
    <SessionProvider>
      <QueryClientProvider client={qc}>
        <UserScopedQueryReset />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousUserKey = useRef<string | null | undefined>(undefined);
  const currentUserKey = status === "loading" ? undefined : sessionUserKey(session);

  useEffect(() => {
    if (currentUserKey === undefined) return;
    if (previousUserKey.current === undefined) {
      previousUserKey.current = currentUserKey;
      return;
    }
    if (previousUserKey.current === currentUserKey) return;

    previousUserKey.current = currentUserKey;
    void resetUserScopedClientState(queryClient);
  }, [currentUserKey, queryClient]);

  return null;
}
