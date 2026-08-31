import "server-only";
import type { WebsiteRegistryEntry } from "@/types";
import { DEFAULT_WORKSPACE_ID } from "@/types";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Website Registry -- CRM-owned configuration, file-backed JSON store (never the Sheet: the Sheet
 * only ever holds the *content* each site's KB_Cache rows carry, keyed by cacheKey).
 */

const COLLECTION = "website-registry";
const now = () => new Date().toISOString();

/** Mirrors the CRM's pre-Stage-6 single-site behavior exactly: cacheKey "latest" is what
 *  normalizeKnowledgeBase already fell back to, and N8N_WEBHOOK_REFRESH_KB is the existing
 *  refresh webhook -- so this seed is a description of what was already running, not a change. */
const SEED_WEBSITES: WebsiteRegistryEntry[] = [
  {
    id: "website-default",
    workspaceId: DEFAULT_WORKSPACE_ID,
    label: "Biggbees.com (default)",
    url: "https://biggbees.com",
    cacheKey: "latest",
    active: true,
    isDefault: true,
    webhookEnvVar: "N8N_WEBHOOK_REFRESH_KB",
    syncStatus: "never-synced",
    lastSyncAt: null,
    pagesIndexed: 0,
    autoSyncEnabled: false,
    dailySyncEnabled: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

async function getAll(): Promise<WebsiteRegistryEntry[]> {
  return readCollection<WebsiteRegistryEntry[]>(COLLECTION, SEED_WEBSITES);
}

async function saveAll(entries: WebsiteRegistryEntry[]): Promise<void> {
  await writeCollection(COLLECTION, entries);
}

/** Phase F: workspaceId is required -- a website/KB entry belongs to exactly one workspace, and
 *  its own id is never sufficient on its own to prove ownership (ids are short random slugs, not
 *  secrets, and must never be trusted as an implicit access boundary). */
export async function getWebsiteRegistry(workspaceId: string): Promise<WebsiteRegistryEntry[]> {
  return (await getAll()).filter((w) => w.workspaceId === workspaceId);
}

export async function getWebsite(id: string, workspaceId: string): Promise<WebsiteRegistryEntry | undefined> {
  const all = await getAll();
  return all.find((w) => w.id === id && w.workspaceId === workspaceId);
}

export async function getWebsiteByCacheKey(cacheKey: string, workspaceId: string): Promise<WebsiteRegistryEntry | undefined> {
  const all = await getAll();
  return all.find((w) => w.cacheKey === cacheKey && w.workspaceId === workspaceId);
}

export async function getDefaultWebsite(workspaceId: string): Promise<WebsiteRegistryEntry | undefined> {
  const all = await getAll();
  return all.find((w) => w.isDefault && w.workspaceId === workspaceId);
}

function generateEntryId(existing: Iterable<string>): string {
  const idSet = existing instanceof Set ? existing : new Set(existing);
  let candidate: string;
  do {
    candidate = `website-${Math.random().toString(36).slice(2, 10)}`;
  } while (idSet.has(candidate));
  return candidate;
}

function slugifyCacheKey(label: string, existing: Iterable<string>): string {
  const keySet = existing instanceof Set ? existing : new Set(existing);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site";
  let candidate = base;
  let n = 2;
  while (keySet.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export async function createWebsite(
  entry: Omit<WebsiteRegistryEntry, "id" | "cacheKey" | "isDefault" | "syncStatus" | "lastSyncAt" | "pagesIndexed" | "createdAt" | "updatedAt">
): Promise<WebsiteRegistryEntry> {
  const all = await getAll();
  const id = generateEntryId(all.map((w) => w.id));
  const cacheKey = slugifyCacheKey(entry.label, all.map((w) => w.cacheKey));
  const full: WebsiteRegistryEntry = {
    ...entry,
    id,
    cacheKey,
    isDefault: false,
    syncStatus: "never-synced",
    lastSyncAt: null,
    pagesIndexed: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveAll([...all, full]);
  return full;
}

export async function updateWebsite(
  id: string,
  workspaceId: string,
  fields: Partial<Omit<WebsiteRegistryEntry, "id" | "workspaceId" | "cacheKey" | "isDefault" | "createdAt">>
): Promise<WebsiteRegistryEntry> {
  const all = await getAll();
  const existing = all.find((w) => w.id === id && w.workspaceId === workspaceId);
  if (!existing) throw new Error(`Website "${id}" was not found.`);
  const updated: WebsiteRegistryEntry = { ...existing, ...fields, updatedAt: now() };
  await saveAll(all.map((w) => (w.id === id ? updated : w)));
  return updated;
}

export async function deleteWebsite(id: string, workspaceId: string): Promise<void> {
  const all = await getAll();
  const existing = all.find((w) => w.id === id && w.workspaceId === workspaceId);
  if (!existing) throw new Error(`Website "${id}" was not found.`);
  if (existing.isDefault) throw new Error("The default website cannot be removed.");
  await saveAll(all.filter((w) => w.id !== id));
}
