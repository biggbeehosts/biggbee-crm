import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Generic file-backed JSON store for CRM-owned data that has nowhere else durable to live
 * (admin account, sessions, campaigns, option lists, audit log, unknown-sender review status).
 *
 * The Google Sheet stays the source of truth for everything n8n writes (Leads, Lead_Memory,
 * Demo_Library, Errors, Unknown_Senders, KB_Cache) -- this store is only for state the CRM itself
 * owns. Lives on a Docker named volume (LOCAL_DATA_DIR) so it survives image rebuilds/redeploys.
 *
 * Single Node process, low write volume (admin actions, not high-throughput data) -- synchronous
 * fs + atomic write-via-temp-file+rename is simpler and more robust here than a database
 * dependency, and avoids native-module Docker build complexity entirely.
 */

// turbopackIgnore: process.cwd() here is dynamic enough that Next's file tracer otherwise thinks
// the whole project might be read at runtime and traces everything -- it never actually is; the
// only real path used is LOCAL_DATA_DIR (a fixed Docker volume mount in production).
const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function filePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

/** In-process write queue per collection -- keeps concurrent writes from interleaving/corrupting. */
const writeQueues = new Map<string, Promise<unknown>>();

export function readCollection<T>(collection: string, fallback: T): T {
  ensureDir();
  const file = filePath(collection);
  if (!fs.existsSync(file)) return fallback;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt file is treated as empty rather than crashing the app; the bad file is preserved
    // alongside a .bad copy so nothing is silently lost.
    try {
      fs.copyFileSync(file, `${file}.bad-${Date.now()}`);
    } catch {
      // best-effort
    }
    return fallback;
  }
}

function writeCollectionSync<T>(collection: string, data: T): void {
  ensureDir();
  const file = filePath(collection);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Serializes writes to the same collection so a burst of mutations can't race each other. */
export async function writeCollection<T>(collection: string, data: T): Promise<void> {
  const prev = writeQueues.get(collection) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => writeCollectionSync(collection, data));
  writeQueues.set(collection, next);
  return next;
}

/** Read-modify-write helper: guarantees the read and write happen back-to-back in queue order. */
export async function updateCollection<T>(collection: string, fallback: T, mutate: (current: T) => T): Promise<T> {
  const prev = writeQueues.get(collection) ?? Promise.resolve();
  let result!: T;
  const next = prev
    .catch(() => undefined)
    .then(() => {
      const current = readCollection<T>(collection, fallback);
      result = mutate(current);
      writeCollectionSync(collection, result);
    });
  writeQueues.set(collection, next);
  await next;
  return result;
}
