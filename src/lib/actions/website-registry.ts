"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { WebsiteRegistryEntry } from "@/types";
import { createWebsite, deleteWebsite, getWebsite, getWebsiteRegistry, updateWebsite } from "@/lib/data/website-registry-store";
import { getKnowledgeBase } from "@/lib/data/repository";
import { triggerWebsiteSync } from "@/lib/n8n/website-sync-client";
import { recordSyncAttempt, getSyncLog } from "@/lib/data/website-sync-log-store";
import { isAllowedN8nHost } from "@/lib/n8n/config";
import { requireAdmin } from "@/lib/auth/require-admin";
import { requireWorkspaceContext } from "@/lib/auth/workspace-context";
import { logAudit } from "@/lib/audit/log";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateKbPaths() {
  revalidatePath("/knowledge-base");
  revalidatePath("/automation-hub/knowledge-base");
  revalidatePath("/automation-hub");
}

function validateWebhookPath(raw: string): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) && !isAllowedN8nHost(raw)) {
    return "Webhook URL must be on the same host as N8N_BASE_URL, or entered as a bare path (e.g. \"webhook/my-site-kb\").";
  }
  return null;
}

const WebsiteSchema = z.object({
  label: z.string().min(1, "Label is required"),
  url: z.string().min(1, "Website URL is required"),
  webhookPath: z.string().optional(),
  webhookEnvVar: z.string().optional(),
  active: z.boolean().default(true),
  autoSyncEnabled: z.boolean().default(false),
  dailySyncEnabled: z.boolean().default(false),
});

export async function listWebsitesAction(): Promise<WebsiteRegistryEntry[]> {
  const { workspaceId } = await requireWorkspaceContext();
  return getWebsiteRegistry(workspaceId);
}

export async function createWebsiteAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const { workspaceId } = await requireWorkspaceContext();
  const parsed = WebsiteSchema.safeParse({
    label: formData.get("label"),
    url: formData.get("url"),
    webhookPath: formData.get("webhookPath") || undefined,
    webhookEnvVar: formData.get("webhookEnvVar") || undefined,
    active: formData.get("active") === "true",
    autoSyncEnabled: formData.get("autoSyncEnabled") === "true",
    dailySyncEnabled: formData.get("dailySyncEnabled") === "true",
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid website data." };
  }
  const webhookError = validateWebhookPath(parsed.data.webhookPath ?? "");
  if (webhookError) return { success: false, message: webhookError };

  try {
    const site = await createWebsite({ ...parsed.data, workspaceId });
    revalidateKbPaths();
    await logAudit({ actor, action: "website_registry.create", target: site.id, success: true, details: { label: site.label, cacheKey: site.cacheKey } });
    return { success: true, message: `${site.label} added to the Website Registry.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add website.";
    await logAudit({ actor, action: "website_registry.create_failed", success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function updateWebsiteAction(id: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const { workspaceId } = await requireWorkspaceContext();
  const parsed = WebsiteSchema.partial().safeParse({
    label: formData.get("label") || undefined,
    url: formData.get("url") || undefined,
    webhookPath: formData.get("webhookPath") || undefined,
    webhookEnvVar: formData.get("webhookEnvVar") || undefined,
    active: formData.has("active") ? formData.get("active") === "true" : undefined,
    autoSyncEnabled: formData.has("autoSyncEnabled") ? formData.get("autoSyncEnabled") === "true" : undefined,
    dailySyncEnabled: formData.has("dailySyncEnabled") ? formData.get("dailySyncEnabled") === "true" : undefined,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid website data." };
  }
  if (parsed.data.webhookPath !== undefined) {
    const webhookError = validateWebhookPath(parsed.data.webhookPath);
    if (webhookError) return { success: false, message: webhookError };
  }

  try {
    const site = await updateWebsite(id, workspaceId, parsed.data);
    revalidateKbPaths();
    await logAudit({ actor, action: "website_registry.update", target: id, success: true, details: { fields: Object.keys(parsed.data) } });
    return { success: true, message: `${site.label} updated.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update website.";
    await logAudit({ actor, action: "website_registry.update_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function deleteWebsiteAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const { workspaceId } = await requireWorkspaceContext();
  try {
    const site = await getWebsite(id, workspaceId);
    await deleteWebsite(id, workspaceId);
    revalidateKbPaths();
    await logAudit({ actor, action: "website_registry.delete", target: id, success: true, details: { label: site?.label } });
    return { success: true, message: `${site?.label ?? "Website"} removed.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove website.";
    await logAudit({ actor, action: "website_registry.delete_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

/** Part 8: triggers the site's sync webhook, then re-reads its KB_Cache rows to refresh
 *  pagesIndexed/lastSyncAt/syncStatus from what n8n actually wrote -- never assumes success just
 *  because the trigger call was accepted. */
export async function syncWebsiteAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const { workspaceId } = await requireWorkspaceContext();
  const site = await getWebsite(id, workspaceId);
  if (!site) return { success: false, message: "Website not found." };

  await updateWebsite(id, workspaceId, { syncStatus: "syncing" });
  revalidateKbPaths();

  const trigger = await triggerWebsiteSync(site);
  if (!trigger.success) {
    await updateWebsite(id, workspaceId, { syncStatus: "failed", lastErrorSummary: trigger.message });
    await recordSyncAttempt({ websiteId: id, websiteLabel: site.label, outcome: "failure", message: trigger.message, at: new Date().toISOString() });
    await logAudit({ actor, action: "website_registry.sync", target: id, success: false, details: { error: trigger.message } });
    revalidateKbPaths();
    return trigger;
  }

  try {
    // The cacheKey resolved above is already workspace-exclusive by construction (slugifyCacheKey
    // never reuses a key, the same precedent as globally-unique Campaign/Demo IDs and tracking
    // tokens) -- safe to read without a second workspace check, same as findLeadByTrackingToken.
    const kb = await getKnowledgeBase(site.cacheKey);
    await updateWebsite(id, workspaceId, {
      syncStatus: kb.sourceCount > 0 ? "idle" : "failed",
      lastSyncAt: new Date().toISOString(),
      pagesIndexed: kb.sourceCount,
      lastErrorSummary: kb.sourceCount > 0 ? undefined : "Sync was triggered but no content was found for this site yet -- check the n8n execution log.",
    });
    await recordSyncAttempt({ websiteId: id, websiteLabel: site.label, outcome: kb.sourceCount > 0 ? "success" : "failure", message: trigger.message, at: new Date().toISOString() });
    await logAudit({ actor, action: "website_registry.sync", target: id, success: true, details: { pagesIndexed: kb.sourceCount } });
    revalidateKbPaths();
    return { success: true, message: `${site.label} synced -- ${kb.sourceCount} page${kb.sourceCount === 1 ? "" : "s"} indexed.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync triggered, but re-reading the Knowledge Base failed.";
    await updateWebsite(id, workspaceId, { syncStatus: "failed", lastErrorSummary: message });
    await recordSyncAttempt({ websiteId: id, websiteLabel: site.label, outcome: "failure", message, at: new Date().toISOString() });
    revalidateKbPaths();
    return { success: false, message };
  }
}

export async function getWebsiteSyncLogAction(websiteId?: string) {
  return getSyncLog(websiteId);
}
