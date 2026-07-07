"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Star, X } from "lucide-react";
import { addWatchlistItem, getWatchlist } from "@/lib/api";
import { isCrypto } from "@/lib/asset";
import { IconButton } from "@/components/ui/IconButton";
import { TOUCH_TARGET_ICON_CLASS } from "@/lib/uiClasses";
import { DEFAULT_RESPONSE_LANGUAGE } from "@/lib/responseLanguage";
import type { ResponseLanguage } from "@/lib/responseLanguage";
import { LlmConfigPicker, type LlmConfigValue } from "@/components/llm/LlmConfigPicker";
import { useDefaultLlmConfig } from "@/lib/useDefaultLlmConfig";
import { DEFAULT_LLM_DEPTH } from "@/lib/llmConfig";

interface WatchDraft {
  llm_provider: string;
  llm_model: string;
  depth: string;
  response_language: ResponseLanguage;
}

export type { WatchDraft };

export function WatchButton({ ticker, compact = false }: { ticker: string; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { provider, model, depth, responseLanguage, resolveModel } = useDefaultLlmConfig();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WatchDraft>({
    llm_provider: provider,
    llm_model: model,
    depth,
    response_language: responseLanguage,
  });
  const [llmConfig, setLlmConfig] = useState<LlmConfigValue>({
    provider,
    model,
    depth,
    response_language: responseLanguage,
  });
  const [success, setSuccess] = useState(false);

  const { data: watchlist } = useQuery({ queryKey: ["watchlist"], queryFn: getWatchlist });
  const watched = watchlist?.items.some((i) => i.ticker.toUpperCase() === ticker.toUpperCase()) ?? false;

  useEffect(() => {
    if (!open) return;
    setLlmConfig({ provider, model, depth, response_language: responseLanguage });
    setDraft((d) => ({
      ...d,
      llm_provider: provider,
      llm_model: model,
      depth,
      response_language: responseLanguage,
    }));
  }, [open, provider, model, depth, responseLanguage]);

  const addMutation = useMutation({
    mutationFn: () =>
      addWatchlistItem({
        ticker,
        llm_provider: llmConfig.provider,
        llm_model: resolveModel(llmConfig),
        depth: llmConfig.depth ?? DEFAULT_LLM_DEPTH,
        response_language: llmConfig.response_language ?? DEFAULT_RESPONSE_LANGUAGE,
        analysts: isCrypto(ticker)
          ? ["market", "social", "news"]
          : ["market", "social", "news", "fundamentals"],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      setOpen(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  if (watched || success) {
    if (compact) {
      return (
        <span
          className={`${TOUCH_TARGET_ICON_CLASS} rounded-sm text-yellow-400`}
          title="Already on watchlist"
          aria-label={`${ticker} is already on watchlist`}
        >
          <Star className="h-4 w-4 fill-current" aria-hidden="true" />
        </span>
      );
    }

    return (
      <span className="text-xs text-yellow-400 cursor-default" title="Already on watchlist">
        ★ Watching
      </span>
    );
  }

  if (!open) {
    if (compact) {
      return (
        <IconButton
          icon={Star}
          label={`Add ${ticker} to watchlist`}
          title="Add to watchlist"
          tone="warning"
          onClick={() => setOpen(true)}
        />
      );
    }

    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-yellow-400 transition-colors py-2 coarse:py-3 touch-manipulation"
        title="Add to watchlist"
      >
        Watch
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <LlmConfigPicker
        layout="compact"
        value={llmConfig}
        onChange={setLlmConfig}
        providerClassName="bg-input border border-input-border rounded-sm px-1.5 py-0.5 text-xs text-fg focus:outline-hidden"
        modelClassName="bg-input border border-input-border rounded-sm px-1.5 py-0.5 text-xs text-fg focus:outline-hidden max-w-[140px]"
        depthClassName="bg-input border border-input-border rounded-sm px-1.5 py-0.5 text-xs text-fg focus:outline-hidden"
        languageClassName="bg-input border border-input-border rounded-sm px-1.5 py-0.5 text-xs text-fg focus:outline-hidden"
        showDepth
        showLanguage
      />
      <IconButton
        icon={addMutation.isPending ? LoaderCircle : Check}
        label={`Add ${ticker} to watchlist`}
        title="Add"
        tone="success"
        onClick={() => addMutation.mutate()}
        disabled={addMutation.isPending}
        iconClassName={addMutation.isPending ? "animate-spin" : undefined}
      />
      <IconButton
        icon={X}
        label="Cancel adding to watchlist"
        title="Cancel"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
