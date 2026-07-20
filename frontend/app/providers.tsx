"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";

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
        <SessionScopedQueryCache>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            {children}
          </ThemeProvider>
        </SessionScopedQueryCache>
      </QueryClientProvider>
    </SessionProvider>
  );
}

function SessionScopedQueryCache({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const sessionKey = status === "authenticated" ? session?.user?.email ?? "authenticated" : null;
  const previousSessionKey = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (previousSessionKey.current === sessionKey) return;

    queryClient.clear();
    previousSessionKey.current = sessionKey;
  }, [queryClient, sessionKey, status]);

  return <>{children}</>;
}
