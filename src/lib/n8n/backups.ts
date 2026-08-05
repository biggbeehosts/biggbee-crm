import "server-only";
import fs from "node:fs";
import path from "node:path";
import { exportWorkflowJson, type N8nWorkflowFull } from "./admin-client";
import { redactWorkflowJson } from "./workflow-diff";

/**
 * Timestamped workflow backups for Part F/J.1 ("back up all workflows that will be touched" /
 * "save a timestamped backup outside Git/public files"). Lives under the same Docker volume as
 * the rest of the CRM's local state (LOCAL_DATA_DIR, see src/lib/store/json-store.ts) --
 * never under public/ and never tracked by Git (the volume mount isn't part of the repo at all).
 */

const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const BACKUP_DIR = path.join(DATA_DIR, "n8n-backups");

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  }
}

function safeName(workflowId: string, workflowName: string): string {
  const slug = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${slug || "workflow"}-${workflowId}-${stamp}.json`;
}

export interface BackupResult {
  fileName: string;
  filePath: string;
  workflowId: string;
  createdAt: string;
}

/** Exports the live workflow and writes it verbatim (full fidelity, for real rollback use) to a
 *  0600 file outside Git/public. Credential VALUES were never present in n8n's export in the
 *  first place (n8n only ever returns a credential reference: {id, name} -- never the secret),
 *  but the file is still kept out of any served/public directory as defense in depth. */
export async function backupWorkflow(workflowId: string): Promise<BackupResult> {
  ensureDir();
  const workflow = await exportWorkflowJson(workflowId);
  const fileName = safeName(workflowId, workflow.name || workflowId);
  const filePath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), { mode: 0o600 });
  return { fileName, filePath, workflowId, createdAt: new Date().toISOString() };
}

export function listBackups(workflowId?: string): { fileName: string; createdAt: string; workflowId: string }[] {
  ensureDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".json") && (!workflowId || f.includes(`-${workflowId}-`)))
    .map((fileName) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, fileName));
      const match = fileName.match(/-([a-zA-Z0-9]+)-\d{4}-\d{2}-\d{2}T/);
      return { fileName, createdAt: stat.mtime.toISOString(), workflowId: match?.[1] ?? workflowId ?? "" };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Returns a redacted copy safe to send to the browser for a download/preview -- the raw file on
 *  disk keeps the full (already-credential-value-free) export for real rollback use. */
export function readBackupRedacted(fileName: string): N8nWorkflowFull {
  ensureDir();
  const safe = path.basename(fileName);
  const filePath = path.join(BACKUP_DIR, safe);
  if (!filePath.startsWith(BACKUP_DIR)) throw new Error("Invalid backup file name.");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as N8nWorkflowFull;
  return redactWorkflowJson(raw);
}

export function readBackupFull(fileName: string): N8nWorkflowFull {
  ensureDir();
  const safe = path.basename(fileName);
  const filePath = path.join(BACKUP_DIR, safe);
  if (!filePath.startsWith(BACKUP_DIR)) throw new Error("Invalid backup file name.");
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as N8nWorkflowFull;
}
