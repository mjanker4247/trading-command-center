"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLlmProviderDefaults, getMe } from "@/lib/api";
import {
  DEFAULT_LLM_DEPTH,
  DEFAULT_LLM_PROVIDER,
  llmConfigFromUserDefaults,
  resolveLlmModel,
  type LlmConfig,
  type LlmDepth,
  type LlmProvider,
} from "@/lib/llmConfig";
import type { ResponseLanguage } from "@/lib/responseLanguage";
import { DEFAULT_RESPONSE_LANGUAGE } from "@/lib/responseLanguage";

export const LLM_PROVIDER_DEFAULTS_QUERY_KEY = ["llm-provider-defaults"] as const;

export function useLlmProviderDefaults() {
  return useQuery({
    queryKey: LLM_PROVIDER_DEFAULTS_QUERY_KEY,
    queryFn: getLlmProviderDefaults,
    staleTime: 300_000,
  });
}

export function useDefaultLlmConfig() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
  const { data: systemDefaults, isLoading: defaultsLoading } = useLlmProviderDefaults();

  const defaultModels = useMemo(
    () => (systemDefaults?.default_models ?? {}) as Partial<Record<LlmProvider, string>>,
    [systemDefaults?.default_models],
  );
  const config = llmConfigFromUserDefaults(me, systemDefaults);

  const resolveModel = useCallback(
    (value: { provider: LlmProvider; model: string }) =>
      resolveLlmModel(value.provider, value.model, defaultModels),
    [defaultModels],
  );

  return {
    isLoading: meLoading || defaultsLoading,
    provider: config.provider as LlmProvider,
    model: config.model,
    depth: (config.depth ?? DEFAULT_LLM_DEPTH) as LlmDepth,
    responseLanguage: (config.response_language ?? DEFAULT_RESPONSE_LANGUAGE) as ResponseLanguage,
    config: config as LlmConfig,
    me,
    defaultModels,
    resolveModel,
  };
}

export function useHydratedLlmConfig(initialConfig?: Partial<LlmConfig>) {
  const defaults = useDefaultLlmConfig();
  const hasInitialConfig = Boolean(
    initialConfig?.provider
    || initialConfig?.model
    || initialConfig?.depth
    || initialConfig?.response_language,
  );
  const dirty = useRef(hasInitialConfig);

  const defaultConfig = useCallback(
    (): LlmConfig => ({
      provider: defaults.provider,
      model: defaults.model,
      depth: defaults.depth,
      response_language: defaults.responseLanguage,
    }),
    [defaults.provider, defaults.model, defaults.depth, defaults.responseLanguage],
  );

  const [llmConfig, setLlmConfigState] = useState<LlmConfig>(() => ({
    provider: initialConfig?.provider ?? defaults.provider,
    model: initialConfig?.model ?? defaults.model,
    depth: initialConfig?.depth ?? defaults.depth,
    response_language: initialConfig?.response_language ?? defaults.responseLanguage,
  }));

  useEffect(() => {
    if (dirty.current) return;
    setLlmConfigState(defaultConfig());
  }, [defaultConfig]);

  const setLlmConfig = useCallback((value: SetStateAction<LlmConfig>) => {
    dirty.current = true;
    setLlmConfigState(value);
  }, []);

  const resetLlmConfig = useCallback(() => {
    dirty.current = false;
    setLlmConfigState(defaultConfig());
  }, [defaultConfig]);

  return {
    ...defaults,
    llmConfig,
    setLlmConfig,
    resetLlmConfig,
  };
}

export { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_DEPTH };
