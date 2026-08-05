import "server-only";
import { cloudinaryProvider } from "./cloudinary-provider";
import type { StorageProvider } from "./types";

export type { StorageProvider, StorageHealth, StorageUsage, UploadSignature, UploadSignatureParams } from "./types";

/**
 * Single switch point for the active storage provider (Stage 6, Part 6/7). Adding a second
 * provider later (S3, R2, Drive) means: implement StorageProvider in a new file, add it here --
 * no changes to any action, page, or component, which all depend on this function's return type,
 * never on `cloudinaryProvider` directly.
 */
export function getActiveStorageProvider(): StorageProvider {
  return cloudinaryProvider;
}
