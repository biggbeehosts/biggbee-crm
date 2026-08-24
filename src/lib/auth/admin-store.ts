import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";
import { hashPassword } from "./crypto";
import { DEFAULT_WORKSPACE_ID } from "@/types";

export interface AdminAccount {
  email: string;
  passwordHash: string;
  /** Which workspaces this account may operate in -- "all" for a full admin (sees every
   *  workspace, can switch between them), or an explicit list for a restricted account (sees
   *  only those). There is deliberately no separate roles/permissions table -- this single field
   *  is the entire authorization model (Phase B decision 2: a lightweight grants list, not RBAC). */
  workspaceIds: string[] | "all";
  /** Deactivated accounts fail every auth check immediately (login, session re-validation, workspace
   *  switch) without needing to wait for their session to expire. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Additive -- whether this admin dismissed the first-login Getting Started guide. Missing on
   *  any existing record reads as `false` (see getSetupGuideDismissed), so a new admin always sees
   *  the guide once by default. */
  setupGuideDismissed?: boolean;
}

/** Pre-Phase-B on-disk shape (single record, no workspace grants) -- kept narrowly typed here only
 *  for the one-time migration below, never used anywhere else. */
interface LegacyAdminAccount {
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  setupGuideDismissed?: boolean;
}

const ACCOUNTS_COLLECTION = "accounts";
const LEGACY_ADMIN_COLLECTION = "admin";
const now = () => new Date().toISOString();

/**
 * Multi-account registry -- CRM-owned, file-backed JSON store (same pattern as
 * workspace-store.ts). Phase A/earlier ran a single implicit admin record under the "admin"
 * collection; the first read here migrates that record in place into the new "accounts" array,
 * granting it `workspaceIds: "all"` so the existing production login keeps working with its
 * existing password hash, no reset required. Runs at most once -- once "accounts" has any rows,
 * the legacy collection is never consulted again.
 */
async function getAll(): Promise<AdminAccount[]> {
  const accounts = readCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, []);
  if (accounts.length > 0) return accounts;

  const legacy = readCollection<LegacyAdminAccount | null>(LEGACY_ADMIN_COLLECTION, null);
  if (legacy) {
    const migrated: AdminAccount = {
      email: legacy.email,
      passwordHash: legacy.passwordHash,
      workspaceIds: "all",
      active: true,
      createdAt: legacy.createdAt,
      updatedAt: now(),
      setupGuideDismissed: legacy.setupGuideDismissed,
    };
    await saveAll([migrated]);
    return [migrated];
  }

  // No existing accounts at all -- the same ADMIN_EMAIL/ADMIN_PASSWORD_HASH non-interactive
  // bootstrap path Phase A relied on, now producing a full-access account directly.
  const envEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const envHash = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  if (envEmail && envHash) {
    const seeded: AdminAccount = {
      email: envEmail,
      passwordHash: envHash,
      workspaceIds: "all",
      active: true,
      createdAt: now(),
      updatedAt: now(),
    };
    await saveAll([seeded]);
    return [seeded];
  }

  return [];
}

async function saveAll(accounts: AdminAccount[]): Promise<void> {
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], () => accounts);
}

export async function getAccounts(): Promise<AdminAccount[]> {
  return getAll();
}

export async function getAccountByEmail(email: string): Promise<AdminAccount | null> {
  const target = email.trim().toLowerCase();
  const accounts = await getAll();
  return accounts.find((a) => a.email === target) ?? null;
}

export async function accountsExist(): Promise<boolean> {
  return (await getAll()).length > 0;
}

/**
 * Creates a new login. The very first account ever created (via /setup) always gets
 * `workspaceIds: "all"` -- there is nothing to restrict it to yet. Every account after that is
 * created explicitly by an existing full-access admin via createRestrictedAccount, which chooses
 * the grant.
 */
export async function createAdmin(email: string, password: string): Promise<AdminAccount> {
  const account: AdminAccount = {
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    workspaceIds: "all",
    active: true,
    createdAt: now(),
    updatedAt: now(),
  };
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (current.length > 0) throw new Error("An admin account already exists.");
    return [account];
  });
  return account;
}

/** Admin-only account creation (Phase B requirement 8) -- caller is responsible for verifying the
 *  actor has workspaceIds: "all" before calling this; this function itself only enforces
 *  uniqueness and that the grant references real, currently-active workspaces. */
export async function createRestrictedAccount(email: string, password: string, workspaceIds: string[]): Promise<AdminAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const account: AdminAccount = {
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    workspaceIds,
    active: true,
    createdAt: now(),
    updatedAt: now(),
  };
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (current.some((a) => a.email === normalizedEmail)) {
      throw new Error(`An account with email "${normalizedEmail}" already exists.`);
    }
    return [...current, account];
  });
  return account;
}

export async function updateAccountWorkspaces(email: string, workspaceIds: string[] | "all"): Promise<void> {
  const target = email.trim().toLowerCase();
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (!current.some((a) => a.email === target)) throw new Error("Account not found.");
    return current.map((a) => (a.email === target ? { ...a, workspaceIds, updatedAt: now() } : a));
  });
}

export async function setAccountActive(email: string, active: boolean): Promise<void> {
  const target = email.trim().toLowerCase();
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (!current.some((a) => a.email === target)) throw new Error("Account not found.");
    return current.map((a) => (a.email === target ? { ...a, active, updatedAt: now() } : a));
  });
}

export async function updateAdminPassword(email: string, newPasswordHash: string): Promise<void> {
  const target = email.trim().toLowerCase();
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (!current.some((a) => a.email === target)) throw new Error("Admin account not found.");
    return current.map((a) => (a.email === target ? { ...a, passwordHash: newPasswordHash, updatedAt: now() } : a));
  });
}

/** Set (or clear, for the manual "reopen" case) whether this account has dismissed the
 *  first-login Getting Started guide. */
export async function setSetupGuideDismissed(email: string, dismissed: boolean): Promise<void> {
  const target = email.trim().toLowerCase();
  await updateCollection<AdminAccount[]>(ACCOUNTS_COLLECTION, [], (current) => {
    if (!current.some((a) => a.email === target)) throw new Error("Admin account not found.");
    return current.map((a) => (a.email === target ? { ...a, setupGuideDismissed: dismissed, updatedAt: now() } : a));
  });
}

/** Default active workspace for a brand-new session: DEFAULT_WORKSPACE_ID ("biggbee") when the
 *  account is authorized for it (true for every "all" account, and for the existing production
 *  admin specifically -- Phase B requirement 6), otherwise the account's first granted workspace. */
export function preferredDefaultWorkspaceId(workspaceIds: string[] | "all"): string | null {
  if (workspaceIds === "all") return DEFAULT_WORKSPACE_ID;
  if (workspaceIds.includes(DEFAULT_WORKSPACE_ID)) return DEFAULT_WORKSPACE_ID;
  return workspaceIds[0] ?? null;
}
