"use server";

import { revalidatePath } from "next/cache";
import type { DemoRecord } from "@/types";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { computeDemoValidationStatus } from "@/lib/utils/cloudinary";
import { readCollection, writeCollection } from "@/lib/store/json-store";

const SNAPSHOT_COLLECTION = "demo-library-snapshot";

/** Hash of the fields an operator could actually change on a row -- deliberately excludes
 *  Created At/Updated At/rowNumber so a sheet that doesn't maintain those still detects edits. */
function demoFingerprint(demo: DemoRecord): string {
  return JSON.stringify([
    demo.name,
    demo.demoType,
    demo.service,
    demo.businessType,
    demo.industry,
    demo.leadGenerationType,
    demo.country,
    demo.publicWatchUrl,
    demo.publicDownloadUrl,
    demo.fileName,
    demo.mimeType,
    demo.active,
    demo.priority,
    demo.notes,
  ]);
}

export interface DemoLibraryRefreshResult {
  total: number;
  newCount: number;
  updatedCount: number;
  invalidCount: number;
  inactiveCount: number;
  healthyCount: number;
  refreshedAt: string;
}

/**
 * Part B: forces a fresh read of Demo_Library (the store already reads the sheet live on every
 * call -- there is no stale in-process cache to bust) and diffs it against the last-known
 * fingerprint snapshot (CRM-owned local state, not sheet data) to report new/updated/invalid/
 * inactive counts. Never crashes on a malformed row -- normalizeDemoRecord always returns a
 * DemoRecord, and computeDemoValidationStatus classifies rather than throws.
 */
export async function refreshDemoLibraryAction(): Promise<DemoLibraryRefreshResult> {
  const demos = await getDemoLibrary();
  const previous = readCollection<Record<string, string>>(SNAPSHOT_COLLECTION, {});

  let newCount = 0;
  let updatedCount = 0;
  let invalidCount = 0;
  let inactiveCount = 0;
  let healthyCount = 0;

  const next: Record<string, string> = {};
  for (const demo of demos) {
    if (!demo.demoId) continue;
    const fingerprint = demoFingerprint(demo);
    next[demo.demoId] = fingerprint;

    const prevFingerprint = previous[demo.demoId];
    if (prevFingerprint === undefined) newCount += 1;
    else if (prevFingerprint !== fingerprint) updatedCount += 1;

    const status = computeDemoValidationStatus(demo);
    if (status === "healthy") healthyCount += 1;
    else if (status === "inactive") inactiveCount += 1;
    else invalidCount += 1;
  }

  await writeCollection(SNAPSHOT_COLLECTION, next);
  revalidatePath("/demo-library");
  revalidatePath("/automation-hub/demo-library");
  revalidatePath("/automation-hub");

  return {
    total: demos.length,
    newCount,
    updatedCount,
    invalidCount,
    inactiveCount,
    healthyCount,
    refreshedAt: new Date().toISOString(),
  };
}
