import "server-only";
import { getActiveStorageProvider } from "@/lib/storage";
import type { ProviderAdapter, ProviderHealth } from "./types";

/** Thin wrapper over the existing StorageProvider seam -- delegates entirely to
 *  getActiveStorageProvider().getHealth() rather than reimplementing any Cloudinary logic. */
export const cloudinaryAdapter: ProviderAdapter = {
  id: "cloudinary",
  name: "Cloudinary (Demo Library storage)",
  category: "storage",
  isConfigured(): boolean {
    return getActiveStorageProvider().isConfigured();
  },
  async getHealth(): Promise<ProviderHealth> {
    const health = await getActiveStorageProvider().getHealth();
    return {
      configured: health.configured,
      connected: health.connected,
      detail: health.usage?.storageBytes != null ? `${Math.round(health.usage.storageBytes / 1_000_000)} MB used` : undefined,
      error: health.error,
    };
  },
};
