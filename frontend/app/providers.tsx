"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/sessionUserKey";

function UserScopedQueryReset({ queryClient }: { queryClient: QueryClient }) {
  const { data: session, status } = useSession();
  const lastUserKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;

    const currentUserKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (lastUserKey.current === undefined) {
      lastUserKey.current = currentUserKey;
      return;
    }

    if (lastUserKey.current !== currentUserKey) {
      resetPortfolioPrefetchState();
      void queryClient.cancelQueries();
      queryClient.clear();
      lastUserKey.current = currentUserKey;
    }
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
