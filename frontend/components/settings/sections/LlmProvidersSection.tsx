"use client";

import type { ApiKeyStatus } from "@/lib/types";
import {
  CLOUD_LLM_PROVIDERS,
  LLM_API_KEY_PLACEHOLDERS,
  LLM_PROVIDER_DOCS_URLS,
  LLM_PROVIDER_LABELS,
  LLM_SETTINGS_SHORT_LABELS,
  LOCAL_LLM_PROVIDERS,
} from "@/lib/llmConfig";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { ServerUrlRow } from "@/components/settings/ServerUrlRow";
import { ProviderModelCatalogPanel } from "@/components/settings/ProviderModelCatalogPanel";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider, SubGroupLabel } from "@/components/settings/SettingsDivider";

type LlmProvidersSectionProps = {
  apiKeys: ApiKeyStatus[];
  onKeysChanged: () => void;
};

export function LlmProvidersSection({ apiKeys, onKeysChanged }: LlmProvidersSectionProps) {
  const localKey = (provider: string) => apiKeys.find((k) => k.provider === provider);

  return (
    <SectionCard id="llm-providers" title="LLM Providers" description="API keys and server URLs used when running analyses.">
      <SubGroupLabel label="Cloud APIs" />
      {CLOUD_LLM_PROVIDERS.map((provider, i) => {
        const keyRow = apiKeys.find((k) => k.provider === provider);
        const isSet = keyRow?.is_valid ?? false;
        const hasKey = Boolean(keyRow);
        return (
          <div key={provider}>
            {i > 0 && <SettingsDivider />}
            <ApiKeyRow
              provider={provider}
              label={LLM_PROVIDER_LABELS[provider]}
              placeholder={LLM_API_KEY_PLACEHOLDERS[provider]}
              docsUrl={LLM_PROVIDER_DOCS_URLS[provider]}
              isSet={isSet}
              onSaved={onKeysChanged}
            />
            <div className="px-4 pb-3">
              <ProviderModelCatalogPanel provider={provider} enabled={hasKey} />
            </div>
          </div>
        );
      })}
      <SubGroupLabel label="Local Servers" />
      {LOCAL_LLM_PROVIDERS.map((provider, i) => (
        <div key={provider}>
          {i > 0 && <SettingsDivider />}
          <ServerUrlRow
            provider={provider}
            label={LLM_SETTINGS_SHORT_LABELS[provider]}
            isValid={localKey(provider)?.is_valid ?? false}
            onSaved={onKeysChanged}
          />
        </div>
      ))}
    </SectionCard>
  );
}
