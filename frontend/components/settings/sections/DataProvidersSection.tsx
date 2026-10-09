"use client";

import type { ApiKeyStatus } from "@/lib/types";
import { DATA_PROVIDERS } from "@/lib/dataProviders";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { SectionCard } from "@/components/settings/SectionCard";
import { SettingsDivider } from "@/components/settings/SettingsDivider";

type DataProvidersSectionProps = {
  apiKeys: ApiKeyStatus[];
  onKeysChanged: () => void;
};

export function DataProvidersSection({ apiKeys, onKeysChanged }: DataProvidersSectionProps) {
  return (
    <SectionCard
      id="data-providers"
      title="Data Providers"
      description="Third-party data sources for portfolio prices, outcomes, and TradingAgents market/macro tools."
    >
      {DATA_PROVIDERS.map((meta, i) => {
        const keyRow = apiKeys.find((k) => k.provider === meta.id);
        return (
          <div key={meta.id}>
            {i > 0 && <SettingsDivider />}
            <ApiKeyRow
              provider={meta.id}
              label={meta.label}
              description={meta.description}
              placeholder={meta.placeholder}
              docsUrl={meta.docsUrl}
              inputType={meta.inputType}
              saveButtonLabel={meta.id === "sec_edgar" ? "Save" : undefined}
              isSet={keyRow?.is_valid ?? false}
              capabilities={meta.id === "finnhub" ? keyRow?.capabilities : undefined}
              capabilityWarning={meta.id === "finnhub" ? (keyRow?.last_error_message ?? null) : null}
              onSaved={onKeysChanged}
            />
          </div>
        );
      })}
    </SectionCard>
  );
}
