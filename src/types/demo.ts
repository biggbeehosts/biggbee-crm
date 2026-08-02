export interface DemoRecord {
  demoType: string;
  publicWatchUrl?: string;
  publicDownloadUrl?: string;
  fileName?: string;
  thumbnailUrl?: string;
  duration?: string;
}

export type UrlHealth = "ok" | "missing" | "invalid";
