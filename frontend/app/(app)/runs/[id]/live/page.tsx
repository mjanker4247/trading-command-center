"use client";
import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AgentFeed } from "@/components/runs/AgentFeed";
import { AgentSidebar } from "@/components/runs/AgentSidebar";
import { PipelinePanel } from "@/components/runs/PipelinePanel";
import { getRun, abortRun, getRunEvents } from "@/lib/api";
import { useAgentStream } from "@/lib/websocket";
import { useRunTabTitle } from "@/lib/useRunTabTitle";
import type { AgentEventPayload, Run } from "@/lib/types";
import {
  APP_CONTENT_CONTAINER_CLASS,
  APP_PAGE_PADDING_X_CLASS,
  TOP_NAV_HEIGHT_REM,
} from "@/components/layout/constants";
import { BTN_PRIMARY_CLASS } from "@/lib/uiClasses";

/** Isolate sidebar from token-spam re-renders when only events change. */
const MemoSidebar = memo(function MemoSidebar({
  run,
  onAbort,
}: {
  run: Run | undefined;
  onAbort: () => void;
}) {
  return <AgentSidebar run={run} onAbort={onAbort} />;
});

export default function LiveRunPage() {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<AgentEventPayload[]>([]);
  const seenSequences = useRef(new Set<number>());

  const { data: run, refetch } = useQuery({
    queryKey: ["run", id],
    queryFn: () => getRun(id),
    refetchInterval: 3000,
  });

  useEffect(() => {
    getRunEvents(id).then((past) => {
      setEvents(past);
      past.forEach((e) => {
        if (e.sequence != null) seenSequences.current.add(e.sequence);
      });
    }).catch(() => {});
  }, [id]);

  const handleEvent = useCallback((e: AgentEventPayload) => {
    if (e.sequence != null && seenSequences.current.has(e.sequence)) return;
    if (e.sequence != null) seenSequences.current.add(e.sequence);
    setEvents((prev) => [...prev, e]);
    if (e.type === "run_completed" || e.type === "run_aborted" || (e.type === "error" && !e.agent)) {
      refetch();
    }
  }, [refetch]);

  useAgentStream(id, handleEvent);
  useRunTabTitle(run?.ticker, run?.status);

  const handleAbort = useCallback(async () => {
    await abortRun(id);
    refetch();
  }, [id, refetch]);

  const isDone =
    run?.status === "completed" ||
    run?.status === "failed" ||
    run?.status === "aborted";

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden"
      style={{ height: `calc(100dvh - ${TOP_NAV_HEIGHT_REM})` }}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-4 sm:py-6 lg:flex-row ${APP_CONTENT_CONTAINER_CLASS} ${APP_PAGE_PADDING_X_CLASS}`}
      >
        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain lg:w-64 lg:max-h-full">
          {isDone && (
            <Link
              href={`/runs/${id}`}
              className={`${BTN_PRIMARY_CLASS} block text-center`}
            >
              View Results
            </Link>
          )}
          <MemoSidebar run={run} onAbort={handleAbort} />
          {run && (
            <PipelinePanel analysts={run.analysts} events={events} runStatus={run.status} />
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h1 className="text-fg text-sm font-semibold">Live Event Feed</h1>
            <span className="text-muted text-xs">{events.length} events</span>
          </div>
          <AgentFeed events={events} />
        </section>
      </div>
    </div>
  );
}
