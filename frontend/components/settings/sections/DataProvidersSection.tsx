"use client";

import type { ApiKeyStatus } from "@/lib/types";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { SectionCard } from "@/components/settings/SectionCard";

type DataProvidersSectionProps = {
  apiKeys: ApiKeyStatus[];
  onKeysChanged: () => void;
};

export function DataProvidersSection({ apiKeys, onKeysChanged }: DataProvidersSectionProps) {
  const finnhubKey = apiKeys.find((k) => k.provider === "finnhub");

  return (
    <SectionCard
      id="data-providers"
      title="Data Providers"
      description="Third-party data sources used for portfolio prices and outcome tracking."
    >
      <ApiKeyRow
        provider="finnhub"
        label="Finnhub"
        description="Live portfolio prices, fundamentals, news, and outcome tracking"
        placeholder="Your Finnhub API key"
        docsUrl="https://finnhub.io/dashboard"
        isSet={finnhubKey?.is_valid ?? false}
        capabilities={finnhubKey?.capabilities}
        capabilityWarning={finnhubKey?.last_error_message ?? null}
        onSaved={onKeysChanged}
      />
    </SectionCard>
  );
}
