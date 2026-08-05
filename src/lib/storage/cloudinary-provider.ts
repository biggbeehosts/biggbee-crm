import "server-only";
import crypto from "node:crypto";
import { deriveCloudinaryDownloadUrl, isCloudinaryUrl } from "@/lib/utils/cloudinary";
import type { StorageHealth, StorageProvider, UploadSignature, UploadSignatureParams } from "./types";

/**
 * Real Cloudinary implementation of StorageProvider (Stage 6, Part 6). Signed uploads only -- the
 * API secret never leaves this module; the browser gets a timestamp+signature it can use to POST
 * directly to Cloudinary (see demo-uploads.ts's createDemoUploadSignatureAction).
 */

function env() {
  return {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY ?? "").trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET ?? "").trim(),
  };
}

function isConfigured(): boolean {
  const { cloudName, apiKey, apiSecret } = env();
  return Boolean(cloudName && apiKey && apiSecret);
}

/** Cloudinary's documented signing algorithm: sha1 of the sorted `key=value&...` param string
 *  (excluding file/cloud_name/api_key/resource_type/signature) with the api secret appended. */
function sign(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto
    .createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

function createUploadSignature(params: UploadSignatureParams): UploadSignature {
  const { cloudName, apiKey, apiSecret } = env();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured -- set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.");
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // overwrite=false is defense-in-depth: every publicId is a freshly generated demo id (see
  // demo-library-store.ts's generateDemoId), so a collision should never happen, but this makes
  // "never overwrite an existing demo" (Part 6, versioning) true at the storage layer too, not
  // just the Sheet-row layer.
  const toSign = { folder: params.folder, public_id: params.publicId, overwrite: "false", timestamp };
  const signature = sign(toSign, apiSecret);

  return {
    provider: "cloudinary",
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${params.resourceType}/upload`,
    fields: {
      api_key: apiKey,
      timestamp,
      signature,
      public_id: params.publicId,
      folder: params.folder,
      overwrite: "false",
    },
  };
}

/** Cloudinary auto-generates a poster-frame JPG for any video delivery URL when the same path is
 *  requested with a .jpg extension -- no separate thumbnail upload/job needed. Real, not a guess:
 *  this is Cloudinary's documented default video-thumbnail behavior (frame at 0s). */
function deriveThumbnailUrl(deliveryUrl: string): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  const lastDot = deliveryUrl.lastIndexOf(".");
  const lastSlash = deliveryUrl.lastIndexOf("/");
  if (lastDot === -1 || lastDot < lastSlash) return null;
  return `${deliveryUrl.slice(0, lastDot)}.jpg`;
}

function deriveDownloadUrl(deliveryUrl: string): string | null {
  return deriveCloudinaryDownloadUrl(deliveryUrl);
}

async function getHealth(): Promise<StorageHealth> {
  const { cloudName, apiKey, apiSecret } = env();
  if (!cloudName || !apiKey || !apiSecret) {
    return { provider: "cloudinary", configured: false, connected: false, usage: null };
  }
  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { provider: "cloudinary", configured: true, connected: false, usage: null, error: `Cloudinary responded HTTP ${res.status}` };
    }
    const data = (await res.json()) as { storage?: { usage?: number }; credits?: { usage?: number } };
    return {
      provider: "cloudinary",
      configured: true,
      connected: true,
      usage: {
        storageBytes: typeof data.storage?.usage === "number" ? data.storage.usage : null,
        credits: typeof data.credits?.usage === "number" ? data.credits.usage : null,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      provider: "cloudinary",
      configured: true,
      connected: false,
      usage: null,
      error: err instanceof Error ? err.message : "Could not reach Cloudinary.",
    };
  }
}

export const cloudinaryProvider: StorageProvider = {
  id: "cloudinary",
  isConfigured,
  createUploadSignature,
  deriveThumbnailUrl,
  deriveDownloadUrl,
  getHealth,
};
