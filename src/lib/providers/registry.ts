import "server-only";
import type { ProviderAdapter } from "./types";
import { cloudinaryAdapter } from "./cloudinary-adapter";
import { n8nAdapter } from "./n8n-adapter";
import { sheetsAdapter } from "./sheets-adapter";

/** Every real provider adapter the CRM has -- add a new one here (and nowhere else) once it has
 *  its own adapter file. See types.ts for why OpenAI/SMTP aren't listed. */
export function getProviderAdapters(): ProviderAdapter[] {
  return [sheetsAdapter, n8nAdapter, cloudinaryAdapter];
}

export interface ProviderHealthRow {
  id: string;
  name: string;
  category: ProviderAdapter["category"];
  configured: boolean;
  connected: boolean;
  detail?: string;
  error?: string;
}

export async function getAllProviderHealth(): Promise<ProviderHealthRow[]> {
  const adapters = getProviderAdapters();
  return Promise.all(
    adapters.map(async (adapter) => {
      const health = await adapter.getHealth();
      return { id: adapter.id, name: adapter.name, category: adapter.category, ...health };
    })
  );
}
