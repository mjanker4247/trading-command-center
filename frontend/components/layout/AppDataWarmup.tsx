"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";

export function AppDataWarmup() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const warmed = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || warmed.current) return;
    warmed.current = true;
    void prefetchAppData(queryClient);
  }, [status, queryClient]);

  return null;
}
