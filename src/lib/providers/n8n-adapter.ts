import "server-only";
import { isAdminApiConfigured, getWorkflowById, readableAdminError } from "@/lib/n8n/admin-client";
import type { ProviderAdapter, ProviderHealth } from "./types";

/** Wraps the existing n8n Admin API client -- no new n8n calls beyond the one it already makes
 *  for card metadata (getWorkflowById), reused here as a lightweight reachability check against
 *  N8N_WORKFLOW_ID when one is set. */
export const n8nAdapter: ProviderAdapter = {
  id: "n8n",
  name: "n8n (workflow engine)",
  category: "workflow-engine",
  isConfigured(): boolean {
    return isAdminApiConfigured();
  },
  async getHealth(): Promise<ProviderHealth> {
    if (!isAdminApiConfigured()) {
      return { configured: false, connected: false, detail: "N8N_ADMIN_API_KEY / N8N_BASE_URL not set." };
    }
    const workflowId = (process.env.N8N_WORKFLOW_ID ?? "").trim();
    if (!workflowId) {
      return { configured: true, connected: true, detail: "Admin API key present; set N8N_WORKFLOW_ID to verify reachability against a specific workflow." };
    }
    try {
      await getWorkflowById(workflowId, { bypassCache: true });
      return { configured: true, connected: true };
    } catch (err) {
      return { configured: true, connected: false, error: readableAdminError(err) };
    }
  },
};
