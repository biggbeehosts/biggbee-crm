import "server-only";
import { updateCollection, readCollection } from "@/lib/store/json-store";

const COLLECTION = "login-attempts";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number[]; // epoch ms of recent failures within the window
  lockedUntil: number | null;
}

type Store = Record<string, AttemptRecord>;

/** Keyed by "email:ip" so one bad actor can't lock out a legitimate admin from a different IP,
 *  while still bounding brute-force attempts against a single account+source pair. */
function keyFor(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}:${ip}`;
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(email: string, ip: string): RateLimitStatus {
  const store = readCollection<Store>(COLLECTION, {});
  const record = store[keyFor(email, ip)];
  if (!record?.lockedUntil) return { allowed: true };
  const now = Date.now();
  if (now < record.lockedUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export async function recordLoginFailure(email: string, ip: string): Promise<RateLimitStatus> {
  const key = keyFor(email, ip);
  const now = Date.now();
  let status: RateLimitStatus = { allowed: true };
  await updateCollection<Store>(COLLECTION, {}, (store) => {
    const record: AttemptRecord = store[key] ?? { failures: [], lockedUntil: null };
    const recentFailures = record.failures.filter((t) => now - t < WINDOW_MS);
    recentFailures.push(now);
    let lockedUntil = record.lockedUntil;
    if (recentFailures.length >= MAX_ATTEMPTS) {
      lockedUntil = now + LOCKOUT_MS;
      status = { allowed: false, retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000) };
    }
    return { ...store, [key]: { failures: recentFailures, lockedUntil } };
  });
  return status;
}

export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  const key = keyFor(email, ip);
  await updateCollection<Store>(COLLECTION, {}, (store) => {
    if (!(key in store)) return store;
    const next = { ...store };
    delete next[key];
    return next;
  });
}
