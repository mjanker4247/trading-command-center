"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProviderModels } from "@/lib/api";
import {
  LLM_DEPTHS,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  isLocalLlmProvider,
  type LlmDepth,
  type LlmProvider,
} from "@/lib/llmConfig";
import { DEFAULT_RESPONSE_LANGUAGE, RESPONSE_LANGUAGE_OPTIONS } from "@/lib/responseLanguage";
import type { ResponseLanguage } from "@/lib/responseLanguage";
import { useLlmProviderDefaults } from "@/lib/useDefaultLlmConfig";
import { FIELD_INPUT_CLASS, FIELD_INPUT_SM_CLASS } from "@/lib/uiClasses";

export interface LlmConfigValue {
  provider: LlmProvider;
  model: string;
  depth?: LlmDepth;
  response_language?: ResponseLanguage;
}

interface Props {
  value: LlmConfigValue;
  onChange: (value: LlmConfigValue) => void;
  showDepth?: boolean;
  showLanguage?: boolean;
  layout?: "stacked" | "inline" | "compact";
  enabled?: boolean;
  className?: string;
  providerClassName?: string;
  modelClassName?: string;
  depthClassName?: string;
  languageClassName?: string;
  idPrefix?: string;
}

const INPUT_CLASS = FIELD_INPUT_CLASS;
const COMPACT_INPUT_CLASS = FIELD_INPUT_SM_CLASS;

export function LlmConfigPicker({
  value,
  onChange,
  showDepth = false,
  showLanguage = true,
  layout = "stacked",
  enabled = true,
  className = "",
  providerClassName,
  modelClassName,
  depthClassName,
  languageClassName,
  idPrefix,
}: Props) {
  const isLocal = isLocalLlmProvider(value.provider);
  const inputClass = layout === "compact" ? COMPACT_INPUT_CLASS : INPUT_CLASS;
  const { data: providerDefaults } = useLlmProviderDefaults();
  const modelPlaceholder = providerDefaults?.default_models[value.provider] ?? "model name";

  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ["models", value.provider],
    queryFn: () => getProviderModels(value.provider),
    enabled,
    retry: false,
  });

  useEffect(() => {
    if (isLocal && models.length > 0 && !value.model) {
      onChange({ ...value, model: models[0] });
    }
  }, [models, isLocal, value.model, value.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleProviderChange(provider: LlmProvider) {
    onChange({ ...value, provider, model: "" });
  }

  const providerId = idPrefix ? `${idPrefix}-provider` : undefined;
  const modelId = idPrefix ? `${idPrefix}-model` : undefined;
  const depthId = idPrefix ? `${idPrefix}-depth` : undefined;
  const languageId = idPrefix ? `${idPrefix}-language` : undefined;

  const providerSelect = (
    <div className={layout === "inline" ? "space-y-1" : "mb-0"}>
      {layout !== "compact" && (
        <label htmlFor={providerId} className="block text-muted text-xs mb-1">LLM Provider</label>
      )}
      <select
        id={providerId}
        value={value.provider}
        onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
        disabled={!enabled}
        className={providerClassName ?? `${inputClass} w-full`}
      >
        {LLM_PROVIDERS.map((provider) => (
          <option key={provider} value={provider}>
            {layout === "compact" ? provider : LLM_PROVIDER_LABELS[provider]}
          </option>
        ))}
      </select>
    </div>
  );

  const modelControl = modelsLoading ? (
    <select disabled className={`${inputClass} w-full text-muted`}>
      <option>Loading models…</option>
    </select>
  ) : models.length > 0 ? (
    <select
      id={modelId}
      value={value.model}
      onChange={(e) => onChange({ ...value, model: e.target.value })}
      disabled={!enabled}
      className={modelClassName ?? `${inputClass} w-full`}
    >
      {models.map((model) => (
        <option key={model} value={model}>{model}</option>
      ))}
    </select>
  ) : (
    <>
      <input
        id={modelId}
        type="text"
        value={value.model}
        onChange={(e) => onChange({ ...value, model: e.target.value })}
        placeholder={modelPlaceholder}
        disabled={!enabled}
        className={modelClassName ?? `${inputClass} w-full`}
      />
      {isLocal && layout !== "compact" && (
        <p className="text-warning text-xs mt-1">Server unreachable — enter model name manually</p>
      )}
    </>
  );

  const modelField = (
    <div className={layout === "inline" ? "space-y-1" : "mb-0"}>
      {layout !== "compact" && (
        <label htmlFor={modelId} className="block text-muted text-xs mb-1">LLM Model</label>
      )}
      {modelControl}
    </div>
  );

  const depthField = showDepth && (
    <div className={layout === "inline" ? "space-y-1" : "mb-0"}>
      {layout !== "compact" && (
        <label htmlFor={depthId} className="block text-muted text-xs mb-1">Research Depth</label>
      )}
      <select
        id={depthId}
        value={value.depth ?? "standard"}
        onChange={(e) => onChange({ ...value, depth: e.target.value as LlmDepth })}
        disabled={!enabled}
        className={depthClassName ?? `${inputClass} w-full`}
      >
        {LLM_DEPTHS.map((depth) => (
          <option key={depth} value={depth}>
            {layout === "compact" ? depth : (
              depth === "quick" ? "Quick — 1 debate round, faster"
                : depth === "standard" ? "Standard — 2 debate rounds"
                  : "Deep — 3 debate rounds, most thorough"
            )}
          </option>
        ))}
      </select>
    </div>
  );

  const languageField = showLanguage && (
    <div className={layout === "inline" ? "space-y-1" : "mb-0"}>
      {layout !== "compact" && (
        <label htmlFor={languageId} className="block text-muted text-xs mb-1">Response Language</label>
      )}
      <select
        id={languageId}
        value={value.response_language ?? DEFAULT_RESPONSE_LANGUAGE}
        onChange={(e) => onChange({ ...value, response_language: e.target.value as ResponseLanguage })}
        disabled={!enabled}
        className={languageClassName ?? `${inputClass} w-full`}
      >
        {RESPONSE_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );

  if (layout === "inline") {
    return (
      <div className={`flex flex-wrap items-end gap-3 ${className}`}>
        {providerSelect}
        {modelField}
        {depthField}
        {languageField}
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
        {providerSelect}
        {modelField}
        {depthField}
        {languageField}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {providerSelect}
      {modelField}
      {depthField}
      {languageField}
    </div>
  );
}
