import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";
import { hashPassword } from "./crypto";

export interface AdminAccount {
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  /** Additive -- whether this admin dismissed the first-login Getting Started guide. Missing on
   *  any existing record (including every admin created before this field existed) reads as
   *  `false` (see getSetupGuideDismissed), so a new admin always sees the guide once by default. */
  setupGuideDismissed?: boolean;
}

const COLLECTION = "admin";

/**
 * One admin account, stored locally (not in the Google Sheet -- this is CRM infrastructure
 * state, not business data). ADMIN_EMAIL/ADMIN_PASSWORD_HASH env vars are an optional
 * non-interactive bootstrap path; if unset, /setup creates this record interactively the first
 * time the app runs. Once a record exists (either way), /setup refuses to run again.
 */
export async function getAdmin(): Promise<AdminAccount | null> {
  const existing = readCollection<AdminAccount | null>(COLLECTION, null);
  if (existing) return existing;

  const envEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const envHash = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  if (envEmail && envHash) {
    const seeded: AdminAccount = {
      email: envEmail,
      passwordHash: envHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await updateCollection<AdminAccount | null>(COLLECTION, null, () => seeded);
    return seeded;
  }

  return null;
}

export async function adminExists(): Promise<boolean> {
  return (await getAdmin()) !== null;
}

/** Only succeeds once -- callers must check adminExists() first inside the same request. */
export async function createAdmin(email: string, password: string): Promise<AdminAccount> {
  const account: AdminAccount = {
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await updateCollection<AdminAccount | null>(COLLECTION, null, (current) => {
    if (current) throw new Error("An admin account already exists.");
    return account;
  });
  return account;
}

export async function updateAdminPassword(email: string, newPasswordHash: string): Promise<void> {
  await updateCollection<AdminAccount | null>(COLLECTION, null, (current) => {
    if (!current || current.email !== email.trim().toLowerCase()) {
      throw new Error("Admin account not found.");
    }
    return { ...current, passwordHash: newPasswordHash, updatedAt: new Date().toISOString() };
  });
}

/** Set (or clear, for the manual "reopen" case) whether this admin has dismissed the first-login
 *  Getting Started guide. Single-admin architecture -- no per-user table needed, this is already
 *  scoped correctly by being the one admin record. */
export async function setSetupGuideDismissed(email: string, dismissed: boolean): Promise<void> {
  await updateCollection<AdminAccount | null>(COLLECTION, null, (current) => {
    if (!current || current.email !== email.trim().toLowerCase()) {
      throw new Error("Admin account not found.");
    }
    return { ...current, setupGuideDismissed: dismissed, updatedAt: new Date().toISOString() };
  });
}
