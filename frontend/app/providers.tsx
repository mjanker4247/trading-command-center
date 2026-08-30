"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";
import { getSessionUserKey } from "@/lib/userScopedClientState";

function UserScopedQueryReset({ queryClient }: { queryClient: QueryClient }) {
  const { data: session, status } = useSession();
  const previousUserKey = useRef<string | null>(null);

  useEffect(() => {
    const userKey = getSessionUserKey(status, session);
    if (!userKey) return;
    if (previousUserKey.current === null) {
      previousUserKey.current = userKey;
      return;
    }
    if (previousUserKey.current === userKey) return;

    previousUserKey.current = userKey;
    resetPortfolioPrefetchState();
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient, session, status]);

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
        <UserScopedQueryReset queryClient={qc} />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
