"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

export interface HydratedLlmConfigValue {
  provider: LlmProvider;
  model: string;
  depth?: LlmDepth;
  response_language?: ResponseLanguage;
}

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

export { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_DEPTH };

function llmConfigValue(
  provider: LlmProvider,
  model: string,
  depth: LlmDepth,
  responseLanguage: ResponseLanguage,
): HydratedLlmConfigValue {
  return { provider, model, depth, response_language: responseLanguage };
}

export function useHydratedLlmConfig(
  provider: LlmProvider,
  model: string,
  depth: LlmDepth,
  responseLanguage: ResponseLanguage,
  options: {
    initialValue?: HydratedLlmConfigValue;
    hydrate?: boolean;
  } = {},
): [
  HydratedLlmConfigValue,
  Dispatch<SetStateAction<HydratedLlmConfigValue>>,
  () => void,
] {
  const hydrate = options.hydrate ?? true;
  const dirtyRef = useRef(false);
  const [llmConfig, setLlmConfigState] = useState<HydratedLlmConfigValue>(
    () => options.initialValue ?? llmConfigValue(provider, model, depth, responseLanguage),
  );

  useEffect(() => {
    if (!hydrate || dirtyRef.current) return;
    setLlmConfigState(llmConfigValue(provider, model, depth, responseLanguage));
  }, [hydrate, provider, model, depth, responseLanguage]);

  const setLlmConfig: Dispatch<SetStateAction<HydratedLlmConfigValue>> = useCallback((value) => {
    dirtyRef.current = true;
    setLlmConfigState(value);
  }, []);

  const resetLlmConfig = useCallback(() => {
    dirtyRef.current = false;
    setLlmConfigState(llmConfigValue(provider, model, depth, responseLanguage));
  }, [provider, model, depth, responseLanguage]);

  return [llmConfig, setLlmConfig, resetLlmConfig];
}
