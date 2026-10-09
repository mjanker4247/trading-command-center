/** Data-vendor keys stored via Settings → Data Providers (api_keys.provider). */

export type DataProviderId =
  | "finnhub"
  | "fred"
  | "alpha_vantage"
  | "typesafe"
  | "sec_edgar";

export type DataProviderInputType = "password" | "text";

export interface DataProviderMeta {
  id: DataProviderId;
  label: string;
  description: string;
  placeholder: string;
  docsUrl: string;
  inputType: DataProviderInputType;
}

/** AgentFloor portfolio / outcomes — not injected into TradingAgents. */
export const FINNHUB_PROVIDER: DataProviderMeta = {
  id: "finnhub",
  label: "Finnhub",
  description: "Live portfolio prices, fundamentals, news, and outcome tracking",
  placeholder: "Your Finnhub API key",
  docsUrl: "https://finnhub.io/dashboard",
  inputType: "password",
};

/** Injected into TradingAgents runs as the matching env vars. */
export const TRADINGAGENTS_DATA_PROVIDERS: readonly DataProviderMeta[] = [
  {
    id: "fred",
    label: "FRED",
    description: "Macro indicators (rates, CPI, unemployment) for the news analyst",
    placeholder: "Your FRED API key",
    docsUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
    inputType: "password",
  },
  {
    id: "alpha_vantage",
    label: "Alpha Vantage",
    description: "Optional alternate market / fundamentals vendor when configured in TradingAgents",
    placeholder: "Your Alpha Vantage API key",
    docsUrl: "https://www.alphavantage.co/support/#api-key",
    inputType: "password",
  },
  {
    id: "typesafe",
    label: "TypeSafe (Jev)",
    description: "Optional screening of StockTwits / Reddit posts for the sentiment analyst",
    placeholder: "Your TypeSafe API key",
    docsUrl: "https://typesafe.ai",
    inputType: "password",
  },
  {
    id: "sec_edgar",
    label: "SEC EDGAR User-Agent",
    description: "Contact string SEC can reach you at (name + email). Not a secret.",
    placeholder: "Your Name your@email.com",
    docsUrl: "https://www.sec.gov/os/accessing-edgar-data",
    inputType: "text",
  },
] as const;

export const DATA_PROVIDERS: readonly DataProviderMeta[] = [
  FINNHUB_PROVIDER,
  ...TRADINGAGENTS_DATA_PROVIDERS,
];
