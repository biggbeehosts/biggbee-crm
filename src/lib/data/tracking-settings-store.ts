import "server-only";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/** Stage 5, Part K/N -- tracking data retention configuration. Purge is a manual admin-triggered
 *  action (see purgeOldTrackingEventsAction in analytics actions), not a cron -- this app has no
 *  scheduler infra, and a silent background deletion of tracking history is a worse default than
 *  a deliberate, audited button press. */

const COLLECTION = "tracking-settings";

export interface TrackingSettings {
  retentionDays: number;
}

const DEFAULT_SETTINGS: TrackingSettings = { retentionDays: 365 };

export function getTrackingSettings(): TrackingSettings {
  return readCollection<TrackingSettings>(COLLECTION, DEFAULT_SETTINGS);
}

export async function setRetentionDays(days: number): Promise<TrackingSettings> {
  const clamped = Math.min(Math.max(Math.round(days), 30), 3650);
  const next = { ...getTrackingSettings(), retentionDays: clamped };
  await writeCollection(COLLECTION, next);
  return next;
}
