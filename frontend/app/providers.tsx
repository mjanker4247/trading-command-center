"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/sessionUserKey";

function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const key = status === "loading" ? undefined : status === "authenticated" ? sessionUserKey(session) : null;
    if (key === undefined) return;
    if (previousKey.current === undefined) {
      previousKey.current = key;
      return;
    }
    if (previousKey.current !== key) {
      resetPortfolioPrefetchState();
      queryClient.clear();
      previousKey.current = key;
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
        <UserScopedQueryReset />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
