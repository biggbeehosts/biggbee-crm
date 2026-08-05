export interface DemoRecord {
  /** Stable id (e.g. "demo-000001"). Backfilled onto any row missing one and persisted back to
   *  that row -- never inferred from row position (see migrateMissingDemoIds). */
  demoId?: string;
  name?: string;
  demoType: string;
  publicWatchUrl?: string;
  publicDownloadUrl?: string;
  fileName?: string;
  thumbnailUrl?: string;
  duration?: string;
}

export type UrlHealth = "ok" | "missing" | "invalid";
