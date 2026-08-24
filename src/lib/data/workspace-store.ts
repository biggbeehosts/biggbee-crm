import "server-only";
import type { Workspace } from "@/types";
import { DEFAULT_WORKSPACE_ID } from "@/types";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Workspace registry -- CRM-owned configuration, file-backed JSON store (same pattern as
 * website-registry-store.ts and admin-store.ts): this is sending-identity/credential-routing
 * config the CRM itself owns, never something the Sheet or n8n writes. Holds no secrets --
 * smtpCredentialRef/imapCredentialRef are n8n credential IDs, resolved only inside n8n.
 */

const COLLECTION = "workspaces";
const now = () => new Date().toISOString();

/** The production Biggbee identity, exactly as it already runs today -- seeding this is a
 *  description of what's already live, not a change (Phase A migration doc, decision 4). */
const SEED_WORKSPACES: Workspace[] = [
  {
    workspaceId: DEFAULT_WORKSPACE_ID,
    workspaceName: "Biggbee AI",
    senderDisplayName: "Biggbee AI",
    senderEmail: "office@biggbees.com",
    replyToEmail: "office@biggbees.com",
    reportEmail: "office@biggbees.com",
    website: "https://www.biggbees.com",
    signatureName: "Biggbee AI",
    signatureWebsite: "https://www.biggbees.com",
    // The exact existing n8n credentials this session already verified are live and correctly
    // scoped to office@biggbees.com -- see "SMTP account" / "IMAP account" in workflow
    // 55q30dkVXZGwb8TR. Referenced by ID only; no secret value lives here or ever will.
    smtpCredentialRef: "vEtw2lRmEd0lQJhT",
    imapCredentialRef: "cLPDBYvWth50CLMd",
    // The existing default Website Registry entry (src/lib/data/website-registry-store.ts) --
    // already the live KB source for every current campaign, unchanged by this migration.
    websiteRegistryId: "website-default",
    active: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

async function getAll(): Promise<Workspace[]> {
  return readCollection<Workspace[]>(COLLECTION, SEED_WORKSPACES);
}

async function saveAll(workspaces: Workspace[]): Promise<void> {
  await writeCollection(COLLECTION, workspaces);
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return getAll();
}

export async function getActiveWorkspaces(): Promise<Workspace[]> {
  return (await getAll()).filter((w) => w.active);
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
  const all = await getAll();
  return all.find((w) => w.workspaceId === workspaceId);
}

/** Throws if the workspace doesn't exist or is deactivated -- the guard every workspace-scoped
 *  server entry point should call before trusting a workspaceId, so an inactive/unknown workspace
 *  can never silently read/write as if it were valid. */
export async function requireActiveWorkspace(workspaceId: string): Promise<Workspace> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Unknown workspace "${workspaceId}".`);
  if (!workspace.active) throw new Error(`Workspace "${workspaceId}" is not active.`);
  return workspace;
}

export async function createWorkspace(workspace: Omit<Workspace, "createdAt" | "updatedAt">): Promise<Workspace> {
  const all = await getAll();
  if (all.some((w) => w.workspaceId === workspace.workspaceId)) {
    throw new Error(`Workspace "${workspace.workspaceId}" already exists.`);
  }
  const full: Workspace = { ...workspace, createdAt: now(), updatedAt: now() };
  await saveAll([...all, full]);
  return full;
}

export async function updateWorkspace(workspaceId: string, fields: Partial<Omit<Workspace, "workspaceId" | "createdAt">>): Promise<Workspace> {
  const all = await getAll();
  const existing = all.find((w) => w.workspaceId === workspaceId);
  if (!existing) throw new Error(`Workspace "${workspaceId}" was not found.`);
  const updated: Workspace = { ...existing, ...fields, updatedAt: now() };
  await saveAll(all.map((w) => (w.workspaceId === workspaceId ? updated : w)));
  return updated;
}
