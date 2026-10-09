"use client";
import { useEffect, useRef } from "react";
import type { AgentEventPayload } from "@/lib/types";

interface AgentFeedProps {
  events: AgentEventPayload[];
}

const agentNameColor: Record<AgentEventPayload["type"], string> = {
  started: "text-blue-300",
  token: "text-muted",
  completed: "text-green-400",
  error: "text-red-400",
  run_completed: "text-green-400",
  run_aborted: "text-yellow-400",
};

/** Longest pipeline ids (e.g. conservative_analyst) need ~11rem at text-xs mono. */
const AGENT_COL_CLASS =
  "w-[11rem] shrink-0 truncate text-xs font-mono";

export function AgentFeed({ events }: AgentFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      // Stay pinned only while the user is near the bottom; otherwise leave their place.
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = remaining < 48;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !stickToBottom.current) return;
    // Scroll the feed pane only — never scrollIntoView (that moves the whole page).
    el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page rounded-sm border border-border p-3"
    >
      <div className="space-y-1">
        {events.map((event, i) => {
          const agentLabel = event.agent ?? event.type;
          return (
            <div key={i} className="flex gap-2 min-w-0 items-start">
              <span
                className={`${AGENT_COL_CLASS} ${agentNameColor[event.type]}`}
                title={agentLabel}
              >
                {agentLabel}
              </span>
              <span className="min-w-0 flex-1 text-fg-secondary text-xs font-mono whitespace-pre-wrap break-words">
                {event.token ?? event.summary ?? event.message ?? ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
