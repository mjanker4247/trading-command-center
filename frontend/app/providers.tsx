"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousKey = useRef<string | null>(null);
  const currentKey = status === "authenticated" ? sessionUserKey(session) : status;

  useEffect(() => {
    if (currentKey === "loading" || !currentKey) return;
    if (previousKey.current === null) {
      previousKey.current = currentKey;
      return;
    }
    if (previousKey.current !== currentKey) {
      previousKey.current = currentKey;
      resetUserScopedClientState(queryClient);
    }
  }, [currentKey, queryClient]);

  return null;
}

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
