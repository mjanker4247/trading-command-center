"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api";
import { createDateFormatter, normalizeDateFormat } from "@/lib/dateFormat";

export function useDateFormat() {
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });

  const dateFormat = normalizeDateFormat(me?.date_format);

  return useMemo(() => createDateFormatter(dateFormat), [dateFormat]);
}
