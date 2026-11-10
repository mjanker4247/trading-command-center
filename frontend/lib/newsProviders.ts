export type NewsProviderKind = "builtin" | "rest" | "rss";

export interface NewsProviderConfig {
  id: string;
  provider_id: string;
  display_name: string;
  kind: NewsProviderKind;
  is_enabled: boolean;
  priority: number;
  article_limit: number;
  endpoint_url?: string | null;
  api_key_provider?: string | null;
  auth_header_name?: string | null;
  masked_api_key?: string | null;
  has_api_key: boolean;
  ui_visible: boolean;
  extra?: Record<string, unknown> | null;
}

export interface NewsProviderUpdateItem {
  provider_id: string;
  is_enabled?: boolean;
  priority?: number;
  article_limit?: number;
}

export interface CustomNewsProviderPayload {
  display_name: string;
  kind: "rest" | "rss";
  endpoint_url: string;
  auth_token?: string;
  auth_header_name?: string;
  article_limit?: number;
  priority?: number;
  is_enabled?: boolean;
  items_path?: string;
}

export interface TestConnectionResponse {
  ok: boolean;
  message: string;
}
