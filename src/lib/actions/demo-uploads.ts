"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getActiveStorageProvider, type StorageHealth, type UploadSignature } from "@/lib/storage";
import { createDemo, generateNextDemoId, replaceDemoVersion, updateDemoMetadata, archiveDemo } from "@/lib/data/demo-library-store";
import { recordUploadAttempt, summarizeUploadLog, type UploadLogSummary } from "@/lib/data/demo-upload-log-store";
import { logAudit } from "@/lib/audit/log";
import type { DemoRecord } from "@/types";
import { requireWorkspaceContext } from "@/lib/auth/workspace-context";

/**
 * Server side of the Cloudinary upload pipeline (Stage 6, Part 6). The browser never sees the
 * Cloudinary API secret: this module signs an upload, the client POSTs the file directly to
 * Cloudinary with that signature (real progress events via XHR), then calls back here to register
 * the result. Every action goes through getActiveStorageProvider() -- never `cloudinaryProvider`
 * directly -- so a future provider swap needs no changes here.
 */

export interface UploadSignatureResult {
  configured: boolean;
  demoId?: string;
  signature?: UploadSignature;
  message?: string;
}

/** Step 1: reserve a demo id and sign an upload for it. Never throws on "not configured" -- the
 *  UI uses `configured: false` to show a clear warning and disable the upload control instead of
 *  crashing (Part 6, requirement 6). */
export async function createDemoUploadSignatureAction(fileName: string, contentType: string): Promise<UploadSignatureResult> {
  await requireAdmin();
  const provider = getActiveStorageProvider();
  if (!provider.isConfigured()) {
    return { configured: false, message: "Cloudinary is not configured on this server -- set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET." };
  }
  if (!contentType.startsWith("video/")) {
    return { configured: true, message: "Only video files can be uploaded to the Demo Library." };
  }

  const demoId = await generateNextDemoId();
  try {
    const signature = provider.createUploadSignature({ folder: "demo-library", publicId: demoId, resourceType: "video" });
    return { configured: true, demoId, signature };
  } catch (err) {
    return { configured: false, message: err instanceof Error ? err.message : "Could not sign the upload." };
  }
}

function formatDuration(seconds: number | undefined): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface RegisterUploadInput {
  demoId: string;
  secureUrl: string;
  publicId: string;
  bytes?: number;
  durationSeconds?: number;
  format?: string;
  fileName: string;
  name?: string;
  service?: string;
  industry?: string;
  language?: string;
  businessType?: string;
  leadGenerationType?: string;
  country?: string;
  priority: number;
  active: boolean;
  isFallback: boolean;
  notes?: string;
  /** When replacing an existing demo's video (Part 6 versioning) -- the demo id being superseded.
   *  Omit for a brand-new demo. */
  replacesDemoId?: string;
}

export interface RegisterUploadResult {
  success: boolean;
  demo?: DemoRecord;
  message: string;
}

/**
 * Step 2: the browser calls this once Cloudinary confirms the upload. Writes the Demo_Library
 * row (create or version-replace), invalidates the CRM's own Sheets cache, and revalidates the
 * page -- n8n has no separate demo cache to refresh (it reads Demo_Library live on every run, see
 * the workflow's "Read Demo Library" node), so the Sheet write above IS the n8n-side refresh.
 */
export async function registerDemoUploadAction(input: RegisterUploadInput): Promise<RegisterUploadResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const provider = getActiveStorageProvider();

  try {
    const thumbnailUrl = provider.deriveThumbnailUrl(input.secureUrl) ?? undefined;
    const publicDownloadUrl = provider.deriveDownloadUrl(input.secureUrl) ?? undefined;

    const demoData = {
      demoId: input.demoId,
      workspaceId,
      name: input.name,
      demoType: "video",
      service: input.service,
      businessType: input.businessType,
      industry: input.industry,
      leadGenerationType: input.leadGenerationType,
      language: input.language,
      country: input.country,
      publicWatchUrl: input.secureUrl,
      publicDownloadUrl,
      fileName: input.fileName,
      mimeType: input.format ? `video/${input.format}` : undefined,
      thumbnailUrl,
      duration: formatDuration(input.durationSeconds),
      active: input.active,
      priority: input.priority,
      isFallback: input.isFallback,
      notes: input.notes,
      storageProvider: provider.id,
      storagePublicId: input.publicId,
    };

    const demo = input.replacesDemoId ? await replaceDemoVersion(input.replacesDemoId, workspaceId, demoData) : await createDemo(demoData);

    await recordUploadAttempt({ demoId: demo.demoId, fileName: input.fileName, outcome: "success", bytes: input.bytes, at: new Date().toISOString() });
    await logAudit({ actor, action: "demo.uploaded", target: demo.demoId, success: true, details: { fileName: input.fileName, replacesDemoId: input.replacesDemoId } });
    revalidatePath("/demo-library");
    revalidatePath("/automation-hub/demo-library");
    revalidatePath("/automation-hub");
    revalidatePath("/campaigns");

    return { success: true, demo, message: `${demo.name || demo.fileName || demo.demoId} uploaded and available to email automation immediately.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to register the uploaded demo.";
    await recordUploadAttempt({ fileName: input.fileName, outcome: "failure", errorMessage: message, at: new Date().toISOString() });
    await logAudit({ actor, action: "demo.uploaded", target: input.demoId, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function updateDemoMetadataAction(demoId: string, fields: Partial<DemoRecord>): Promise<RegisterUploadResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    await updateDemoMetadata(demoId, workspaceId, fields);
    await logAudit({ actor, action: "demo.updated", target: demoId, success: true, details: { fields: Object.keys(fields) } });
    revalidatePath("/demo-library");
    revalidatePath("/automation-hub/demo-library");
    revalidatePath("/automation-hub");
    revalidatePath("/campaigns");
    return { success: true, message: "Demo updated." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed to update demo." };
  }
}

export async function archiveDemoAction(demoId: string): Promise<RegisterUploadResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    await archiveDemo(demoId, workspaceId);
    await logAudit({ actor, action: "demo.archived", target: demoId, success: true });
    revalidatePath("/demo-library");
    revalidatePath("/automation-hub/demo-library");
    revalidatePath("/automation-hub");
    revalidatePath("/campaigns");
    return { success: true, message: "Demo archived -- no longer eligible for matching, but existing leads that already reference it are unaffected." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed to archive demo." };
  }
}

export interface StorageHealthResult {
  health: StorageHealth;
  uploadLog: UploadLogSummary;
}

export async function getStorageHealthAction(): Promise<StorageHealthResult> {
  const provider = getActiveStorageProvider();
  const health = await provider.getHealth();
  return { health, uploadLog: summarizeUploadLog() };
}
