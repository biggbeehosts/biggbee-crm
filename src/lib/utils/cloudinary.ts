/** Matches Cloudinary delivery URLs, e.g. https://res.cloudinary.com/<cloud>/video/upload/v123/demo.mp4 */
const CLOUDINARY_HOST = /res\.cloudinary\.com/i;
const UPLOAD_SEGMENT = "/upload/";

export function isValidUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isCloudinaryUrl(url: string | undefined | null): boolean {
  if (!url || !isValidUrl(url)) return false;
  return CLOUDINARY_HOST.test(url);
}

/**
 * Given a Cloudinary watch URL, safely insert the `fl_attachment` delivery flag right after
 * `/upload/` so the browser downloads the file instead of streaming it inline. Returns null for
 * anything that isn't a well-formed Cloudinary URL rather than guessing.
 */
export function deriveCloudinaryDownloadUrl(watchUrl: string | undefined | null): string | null {
  if (!isCloudinaryUrl(watchUrl)) return null;
  const url = watchUrl as string;
  const idx = url.indexOf(UPLOAD_SEGMENT);
  if (idx === -1) return null;
  const insertAt = idx + UPLOAD_SEGMENT.length;
  const before = url.slice(0, insertAt);
  const after = url.slice(insertAt);
  if (after.startsWith("fl_attachment")) return url; // already has the flag
  return `${before}fl_attachment/${after}`;
}

export type DemoUrlHealth = "ok" | "missing" | "invalid";

export function checkDemoUrlHealth(url: string | undefined | null): DemoUrlHealth {
  if (!url || !url.trim()) return "missing";
  return isValidUrl(url) ? "ok" : "invalid";
}

/**
 * Demo Library validation badge (Part G): one of five states, checked in priority order so a
 * demo never shows more than one badge. "missing-file" is distinct from "missing-url" -- a demo
 * can have a working watch link but nothing indicating a downloadable file exists at all.
 */
export function computeDemoValidationStatus(demo: {
  active: boolean;
  publicWatchUrl?: string;
  publicDownloadUrl?: string;
  fileName?: string;
}): "healthy" | "missing-url" | "missing-file" | "inactive" | "invalid-mapping" {
  if (!demo.active) return "inactive";
  const watchHealth = checkDemoUrlHealth(demo.publicWatchUrl);
  if (watchHealth === "missing") return "missing-url";
  if (watchHealth === "invalid") return "invalid-mapping";
  if (!demo.publicDownloadUrl && !demo.fileName && !deriveCloudinaryDownloadUrl(demo.publicWatchUrl)) return "missing-file";
  return "healthy";
}

/** Resolves the best download URL: explicit download URL first, else a derived Cloudinary one. */
export function resolveDownloadUrl(watchUrl: string | undefined | null, downloadUrl: string | undefined | null): string | null {
  if (downloadUrl && isValidUrl(downloadUrl)) return downloadUrl;
  return deriveCloudinaryDownloadUrl(watchUrl);
}
