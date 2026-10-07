"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProviderModelCatalog,
  refreshProviderModels,
  updateProviderVisibleModels,
  type ProviderModelCatalog,
} from "@/lib/api";
import { useDateFormat } from "@/lib/useDateFormat";
import {
  BTN_PRIMARY_SM_CLASS,
  BTN_SECONDARY_CLASS,
  FIELD_INPUT_SM_CLASS,
  STATUS_ERROR_CLASS,
  STATUS_OK_CLASS,
} from "@/lib/uiClasses";

type Props = {
  provider: string;
  enabled: boolean;
};

export function ProviderModelCatalogPanel({ provider, enabled }: Props) {
  const queryClient = useQueryClient();
  const { formatDateTime } = useDateFormat();
  const [filter, setFilter] = useState("");
  const [draftVisible, setDraftVisible] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["providerModelCatalog", provider],
    queryFn: () => getProviderModelCatalog(provider),
    enabled,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setDraftVisible(new Set(data.visible));
    setSaveStatus("idle");
  }, [data]);

  const refreshMutation = useMutation({
    mutationFn: () => refreshProviderModels(provider),
    onSuccess: (catalog) => {
      queryClient.setQueryData(["providerModelCatalog", provider], catalog);
      queryClient.invalidateQueries({ queryKey: ["models", provider] });
      setSaveStatus("idle");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateProviderVisibleModels(provider, Array.from(draftVisible)),
    onSuccess: (catalog) => {
      queryClient.setQueryData(["providerModelCatalog", provider], catalog);
      queryClient.invalidateQueries({ queryKey: ["models", provider] });
      setSaveStatus("ok");
    },
    onError: () => setSaveStatus("error"),
  });

  const filteredCatalog = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.catalog;
    return data.catalog.filter((model) => model.toLowerCase().includes(q));
  }, [data, filter]);

  if (!enabled) {
    return (
      <p className="text-xs text-muted sm:pl-[calc(9rem+1rem)]">
        Save an API key to download and curate the model list.
      </p>
    );
  }

  const showPicker = Boolean(data && (data.selection_required || data.source === "live"));
  const dirty =
    data != null &&
    (draftVisible.size !== data.visible.length ||
      data.visible.some((model) => !draftVisible.has(model)));

  function toggleModel(model: string) {
    setDraftVisible((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
    setSaveStatus("idle");
  }

  function selectSeedDefaults(catalog: ProviderModelCatalog) {
    setDraftVisible(new Set(catalog.visible));
    setSaveStatus("idle");
  }

  return (
    <div className="space-y-3 sm:pl-[calc(9rem+1rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className={BTN_SECONDARY_CLASS}
        >
          {refreshMutation.isPending ? "Refreshing…" : "Refresh models"}
        </button>
        {data?.refreshed_at && (
          <span className="text-xs text-muted">
            Last refreshed {formatDateTime(data.refreshed_at)}
            {data.source === "seed" ? " · using built-in list" : ""}
          </span>
        )}
        {!data?.refreshed_at && data?.source === "seed" && (
          <span className="text-xs text-muted">Using built-in list — refresh to pull from the provider</span>
        )}
        {data && (
          <span className="text-xs text-muted">
            {data.catalog.length} model{data.catalog.length === 1 ? "" : "s"}
            {data.selection_required ? ` · ${draftVisible.size} selected for pickers` : ""}
          </span>
        )}
      </div>

      {isLoading && <p className="text-xs text-muted">Loading catalog…</p>}
      {isError && <p className={STATUS_ERROR_CLASS}>{(error as Error).message}</p>}
      {refreshMutation.isError && (
        <p className={STATUS_ERROR_CLASS}>{(refreshMutation.error as Error).message}</p>
      )}

      {showPicker && data && data.selection_required && (
        <div className="space-y-2 rounded-lg border border-input-border bg-muted-surface/40 p-3">
          <p className="text-xs text-fg-secondary">
            This provider exposes many models. Choose which ones appear in run and portfolio pickers.
          </p>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter models…"
            aria-label={`Filter ${provider} models`}
            className={`${FIELD_INPUT_SM_CLASS} max-w-sm`}
          />
          <div className="max-h-48 overflow-y-auto rounded-md border border-input-border bg-input divide-y divide-input-border">
            {filteredCatalog.map((model) => {
              const checked = draftVisible.has(model);
              const id = `${provider}-model-${model}`;
              return (
                <label
                  key={model}
                  htmlFor={id}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-fg hover:bg-muted-surface/60 cursor-pointer"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(model)}
                    className="rounded border-input-border"
                  />
                  <span className="font-mono text-xs break-all">{model}</span>
                  {model === data.default_model && (
                    <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">default</span>
                  )}
                </label>
              );
            })}
            {filteredCatalog.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted">No models match the filter.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || draftVisible.size === 0 || !dirty}
              className={BTN_PRIMARY_SM_CLASS}
            >
              {saveMutation.isPending ? "Saving…" : "Save picker models"}
            </button>
            <button
              type="button"
              onClick={() => selectSeedDefaults(data)}
              disabled={saveMutation.isPending}
              className={BTN_SECONDARY_CLASS}
            >
              Reset to current
            </button>
            {saveStatus === "ok" && !dirty && <span className={STATUS_OK_CLASS}>Saved</span>}
            {(saveStatus === "error" || saveMutation.isError) && (
              <span className={STATUS_ERROR_CLASS}>
                {(saveMutation.error as Error | null)?.message ?? "Could not save selection"}
              </span>
            )}
          </div>
        </div>
      )}

      {showPicker && data && !data.selection_required && data.source === "live" && (
        <p className="text-xs text-muted">
          All {data.catalog.length} models are available in pickers.
        </p>
      )}
    </div>
  );
}
