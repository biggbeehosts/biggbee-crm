/**
 * Canonical demo model, shared by the Demo Library page, Campaign demo settings, Lead/outreach
 * records, and n8n's demo selection (src/lib/calculations/demo-match.ts is ported 1:1 into the
 * n8n Code node so both sides run the identical rule). Backed by the Demo_Library sheet tab --
 * `demoType/publicWatchUrl/publicDownloadUrl/fileName/thumbnailUrl/duration` are the six
 * pre-existing columns; everything else is additive (see ensureTabWithHeaders in
 * demo-library-mutations.ts).
 */
export interface DemoRecord {
  /** Stable id (e.g. "demo-000001"). Backfilled onto any row missing one and persisted back to
   *  that row -- never inferred from row position (see migrateMissingDemoIds). Every uploaded
   *  video gets its own fresh id (Part 6 versioning: re-uploading never reuses/overwrites an id). */
  demoId: string;
  /** Which workspace owns this demo (see types/workspace.ts). Demos are workspace-specific by
   *  default -- a demo never appears in another workspace's auto-match candidates unless
   *  explicitly shared (not yet implemented; every demo is single-workspace today). */
  workspaceId: string;
  name?: string;
  demoType: string;
  service?: string;
  businessType?: string;
  industry?: string;
  leadGenerationType?: string;
  /** Campaign-targeting language this demo is recorded/localized in, e.g. "English", "Spanish" --
   *  matched against the campaign's own `language` field (Stage 6, Part 7). */
  language?: string;
  country?: string;
  publicWatchUrl?: string;
  publicDownloadUrl?: string;
  fileName?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: string;
  /** Defaults to true for legacy rows written before this column existed. */
  active: boolean;
  /** Tie-breaker in Automatic-mode matching -- higher wins. Defaults to 0. */
  priority: number;
  /** When true, this demo is eligible as the last-resort match when nothing else fits (Stage 6,
   *  Part 7's "Fallback Demo" tier) -- an explicit operator opt-in, never inferred from priority
   *  alone, so a highly-specific demo can never accidentally get sent to an unrelated lead just
   *  because it has a high priority number. */
  isFallback: boolean;
  /** 1 for a brand-new demo; incremented each time it's re-uploaded (Part 6 versioning). Re-upload
   *  never overwrites the previous row -- it's archived and a new row/id created instead. */
  version: number;
  /** True once superseded by a newer version -- excluded from matching regardless of `active`. */
  archived: boolean;
  /** Demo ID of the version this one replaced, if any -- lets the UI show version history. */
  previousVersionId?: string;
  /** Which StorageProvider hosts this demo's file -- "cloudinary" today; recorded per-row (not
   *  assumed globally) so a future provider migration can coexist with older rows. */
  storageProvider?: string;
  /** Provider-specific asset id (Cloudinary public_id) -- needed for any future management call
   *  against the file itself (delete, re-transform); never displayed, audit/debug only. */
  storagePublicId?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Row position in the Demo_Library sheet tab, used for targeted updates. Absent in mock mode. */
  rowNumber?: number;
}

export type DemoValidationStatus = "healthy" | "missing-url" | "missing-file" | "inactive" | "invalid-mapping";

export type UrlHealth = "ok" | "missing" | "invalid";
