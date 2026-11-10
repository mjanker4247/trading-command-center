"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomNewsProvider,
  deleteNewsProvider,
  getNewsProviders,
  testNewsProvider,
  updateNewsProviders,
} from "@/lib/api";
import type { NewsProviderConfig } from "@/lib/newsProviders";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";
import {
  BTN_DANGER_SM_CLASS,
  BTN_PRIMARY_SM_CLASS,
  BTN_SECONDARY_CLASS,
  FIELD_INPUT_SM_CLASS,
  STATUS_ERROR_CLASS,
  STATUS_OK_CLASS,
} from "@/lib/uiClasses";

type TestState = { ok: boolean; message: string } | null;

function ProviderRow({
  provider,
  onChanged,
}: {
  provider: NewsProviderConfig;
  onChanged: () => void;
}) {
  const [testState, setTestState] = useState<TestState>(null);
  const [limit, setLimit] = useState(String(provider.article_limit));

  const toggleMutation = useMutation({
    mutationFn: () =>
      updateNewsProviders([{ provider_id: provider.provider_id, is_enabled: !provider.is_enabled }]),
    onSuccess: onChanged,
  });

  const limitMutation = useMutation({
    mutationFn: (article_limit: number) =>
      updateNewsProviders([{ provider_id: provider.provider_id, article_limit }]),
    onSuccess: onChanged,
  });

  const testMutation = useMutation({
    mutationFn: () => testNewsProvider(provider.provider_id),
    onSuccess: (data) => setTestState(data),
    onError: (err: Error) => setTestState({ ok: false, message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNewsProvider(provider.provider_id),
    onSuccess: onChanged,
  });

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-fg text-sm font-medium">{provider.display_name}</div>
          <div className="text-muted text-xs mt-0.5">
            {provider.kind.toUpperCase()}
            {provider.endpoint_url ? ` · ${provider.endpoint_url}` : ""}
            {provider.has_api_key && provider.masked_api_key
              ? ` · key ${provider.masked_api_key}`
              : ""}
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-fg shrink-0">
          <input
            type="checkbox"
            className="rounded border-input-border"
            checked={provider.is_enabled}
            disabled={toggleMutation.isPending}
            onChange={() => toggleMutation.mutate()}
          />
          Enabled
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          Article limit
          <input
            className={`${FIELD_INPUT_SM_CLASS} mt-1 w-24`}
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => {
              const next = Number(limit);
              if (!Number.isFinite(next) || next === provider.article_limit) return;
              limitMutation.mutate(Math.min(100, Math.max(1, Math.floor(next))));
            }}
          />
        </label>
        <button
          type="button"
          className={BTN_SECONDARY_CLASS}
          disabled={testMutation.isPending}
          onClick={() => {
            setTestState(null);
            testMutation.mutate();
          }}
        >
          {testMutation.isPending ? "Testing…" : "Test connection"}
        </button>
        {provider.kind !== "builtin" && (
          <button
            type="button"
            className={BTN_DANGER_SM_CLASS}
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Remove
          </button>
        )}
      </div>

      {testState && (
        <div className={testState.ok ? STATUS_OK_CLASS : STATUS_ERROR_CLASS}>
          {testState.message}
        </div>
      )}
    </div>
  );
}

export function NewsSourcesSection() {
  const queryClient = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["newsProviders"],
    queryFn: getNewsProviders,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"rest" | "rss">("rss");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [formError, setFormError] = useState("");

  const sorted = useMemo(
    () => [...providers].sort((a, b) => a.priority - b.priority || a.display_name.localeCompare(b.display_name)),
    [providers],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["newsProviders"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createCustomNewsProvider({
        display_name: name.trim(),
        kind,
        endpoint_url: url.trim(),
        auth_token: token.trim() || undefined,
        is_enabled: true,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName("");
      setUrl("");
      setToken("");
      setFormError("");
      refresh();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  return (
    <SectionCard
      id="news-sources"
      title="News Sources"
      description="Choose which providers feed portfolio news. Finnhub is built-in; add custom REST or RSS endpoints as needed. API keys for Finnhub stay under Data Providers."
    >
      {isLoading ? (
        <div className="px-4 py-3 text-sm text-muted">Loading news sources…</div>
      ) : (
        sorted.map((provider, index) => (
          <div key={provider.provider_id}>
            {index > 0 && <SettingsDivider />}
            <ProviderRow provider={provider} onChanged={refresh} />
          </div>
        ))
      )}

      <SettingsDivider />
      <div className="px-4 py-3 space-y-3">
        {!showForm ? (
          <button type="button" className={BTN_SECONDARY_CLASS} onClick={() => setShowForm(true)}>
            Add custom source
          </button>
        ) : (
          <div className="space-y-3 max-w-xl">
            <div className="text-sm text-fg font-medium">New custom source</div>
            <label className="block text-xs text-muted">
              Name
              <input className={`${FIELD_INPUT_SM_CLASS} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-xs text-muted">
              Type
              <select
                className={`${FIELD_INPUT_SM_CLASS} mt-1`}
                value={kind}
                onChange={(e) => setKind(e.target.value as "rest" | "rss")}
              >
                <option value="rss">RSS Feed</option>
                <option value="rest">REST API</option>
              </select>
            </label>
            <label className="block text-xs text-muted">
              Endpoint URL
              <input
                className={`${FIELD_INPUT_SM_CLASS} mt-1`}
                placeholder="https://… or use {ticker}"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted">
              Auth token (optional)
              <input
                className={`${FIELD_INPUT_SM_CLASS} mt-1`}
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            {formError && <div className={STATUS_ERROR_CLASS}>{formError}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN_PRIMARY_SM_CLASS}
                disabled={!name.trim() || !url.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving…" : "Save source"}
              </button>
              <button
                type="button"
                className={BTN_SECONDARY_CLASS}
                onClick={() => {
                  setShowForm(false);
                  setFormError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
