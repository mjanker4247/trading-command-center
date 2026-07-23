import type { QueryClient } from "@tanstack/react-query";

let queryClient: QueryClient | null = null;
let stateVersion = 0;

export function registerUserScopedQueryClient(client: QueryClient): void {
  queryClient = client;
}

export function getUserScopedStateVersion(): number {
  return stateVersion;
}

export async function resetUserScopedClientState(): Promise<void> {
  stateVersion += 1;
  const client = queryClient;
  if (!client) return;

  await client.cancelQueries();
  client.clear();
}
