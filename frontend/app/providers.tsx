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
  const lastUserKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;

    const userKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (lastUserKey.current === undefined) {
      lastUserKey.current = userKey;
      return;
    }
    if (lastUserKey.current === userKey) return;

    resetUserScopedClientState(queryClient);
    lastUserKey.current = userKey;
  }, [queryClient, session, status]);

  return null;
}
