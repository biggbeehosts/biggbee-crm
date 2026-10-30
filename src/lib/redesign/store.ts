import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";

/**
 * Website Redesign campaign + execution tracking owned by the CRM (file-backed JSON store, same
 * pattern as the Website Registry / workspace store). This is deliberately NOT the general
 * Campaigns sheet: redesign campaigns have their own collection, their own ids (RDC-######), and
 * every read/write is scoped by workspaceId -- the same compound-ownership rule as every other
 * workspace-scoped record (getRedesignCampaign(id, workspaceId) returns undefined for a campaign
 * owned by a different workspace, indistinguishable from nonexistent).
 */

const COLLECTION = "redesign-campaigns";

export type RedesignCampaignStatus = "draft" | "running" | "pausing" | "paused" | "completed" | "failed" | "cancelled";
export type RedesignRunMode = "dry" | "live";
export type RedesignBusinessStatus = "previewed" | "blocked" | "queued" | "sending" | "sent" | "failed" | "skipped";

export interface RedesignBusinessResult {
  businessKey: string;
  businessName: string;
  email: string;
  status: RedesignBusinessStatus;
  reason?: string;
  subject?: string;
  bodyText?: string;
  attachmentNames?: string[];
  attachmentFingerprint?: string;
  usedFallback?: boolean;
  failureKind?: string;
  updatedAt: string;
}

export interface RedesignScanSummary {
  at: string;
  discovered: number;
  eligible: number;
  matched: number;
  blocked: number;
  ineligibleSamples: { businessName: string; reasons: string[] }[];
  unmatchedSamples: { businessName: string; status: string; reason?: string }[];
}

export interface RedesignCampaign {
  id: string;
  workspaceId: string;
  name: string;
  status: RedesignCampaignStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  /** Opaque id the CRM issues for each start/resume; n8n must present it, and it is single-use
   *  (see beganAt) -- a replayed or duplicated webhook cannot start a second run. */
  currentRunId?: string;
  currentMode?: RedesignRunMode;
  runRequestedAt?: string;
  beganAt?: string;
  heartbeatAt?: string;
  pauseReason?: string;
  lastError?: string;
  consecutiveErrors: number;
  plan?: { discovered: number; eligible: number; matched: number; blocked: number; toProcess: number };
  dry: Record<string, RedesignBusinessResult>;
  live: Record<string, RedesignBusinessResult>;
  /** Set when a dry run finished; a live run is refused without it. Cleared if settings change. */
  dryRunCompletedAt?: string;
  lastScan?: RedesignScanSummary;
  /** Timestamps (ISO) of confirmed live sends -- the CRM's own record, used for hourly/daily limits. */
  liveSendLog: string[];
}

/** What may be sent to the browser: the single-use run id stays server-side. */
export type PublicRedesignCampaign = Omit<RedesignCampaign, "currentRunId"> & {
  /** True when a run is active but its workflow hasn't reported in for over STALE_RUN_MS. Computed
   *  here (server side) rather than in the component so rendering stays pure. */
  stale: boolean;
};

/** A run that was requested but never reported in (e.g. the webhook was lost) is considered stale. */
export const STALE_RUN_MS = 10 * 60 * 1000;

export function toPublicCampaign(c: RedesignCampaign, nowMs = Date.now()): PublicRedesignCampaign {
  const { currentRunId, ...rest } = c;
  void currentRunId;
  const active = c.status === "running" || c.status === "pausing";
  const lastBeat = c.heartbeatAt ?? c.runRequestedAt;
  return { ...rest, stale: active && !!lastBeat && nowMs - new Date(lastBeat).getTime() > STALE_RUN_MS };
}

async function getAll(): Promise<RedesignCampaign[]> {
  return readCollection<RedesignCampaign[]>(COLLECTION, []);
}

export async function listRedesignCampaigns(workspaceId: string): Promise<RedesignCampaign[]> {
  return (await getAll()).filter((c) => c.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRedesignCampaign(id: string, workspaceId: string): Promise<RedesignCampaign | undefined> {
  return (await getAll()).find((c) => c.id === id && c.workspaceId === workspaceId);
}

export async function createRedesignCampaign(workspaceId: string, name: string, createdBy: string): Promise<RedesignCampaign> {
  const now = new Date().toISOString();
  let created!: RedesignCampaign;
  await updateCollection<RedesignCampaign[]>(COLLECTION, [], (current) => {
    const max = current.reduce((m, c) => Math.max(m, Number(c.id.replace(/^RDC-/, "")) || 0), 0);
    created = {
      id: `RDC-${String(max + 1).padStart(6, "0")}`,
      workspaceId,
      name,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy,
      consecutiveErrors: 0,
      dry: {},
      live: {},
      liveSendLog: [],
    };
    return [...current, created];
  });
  return created;
}

/**
 * Atomic read-modify-write scoped to one workspace's campaign. The mutator may throw to abort
 * (nothing is written); returns the updated campaign. Throws if the campaign isn't found in this
 * workspace.
 */
export async function mutateRedesignCampaign(id: string, workspaceId: string, mutate: (c: RedesignCampaign) => RedesignCampaign): Promise<RedesignCampaign> {
  let result: RedesignCampaign | undefined;
  await updateCollection<RedesignCampaign[]>(COLLECTION, [], (current) => {
    const idx = current.findIndex((c) => c.id === id && c.workspaceId === workspaceId);
    if (idx === -1) throw new Error(`Redesign campaign "${id}" was not found.`);
    const next = mutate(structuredClone(current[idx]));
    next.updatedAt = new Date().toISOString();
    result = next;
    const copy = current.slice();
    copy[idx] = next;
    return copy;
  });
  return result as RedesignCampaign;
}

export function countLiveSends(campaign: RedesignCampaign, withinMs: number, nowMs = Date.now()): number {
  return campaign.liveSendLog.filter((t) => nowMs - new Date(t).getTime() <= withinMs).length;
}

/** All live sends across every redesign campaign of this workspace (the mailbox limit is shared). */
export async function countWorkspaceLiveSends(workspaceId: string, withinMs: number): Promise<number> {
  const now = Date.now();
  return (await listRedesignCampaigns(workspaceId)).reduce((sum, c) => sum + countLiveSends(c, withinMs, now), 0);
}

