import type { N8nWorkflowFull } from "./admin-client";

/**
 * Part F support: redacting credential details from previews, summarizing node-level changes
 * between the current workflow and a proposed replacement, and a heuristic scan that blocks a
 * secret-looking literal value from being imported as if it were workflow structure. None of this
 * is a substitute for keeping real secrets in n8n's credential store -- it's a last line of
 * defense against an admin accidentally pasting a workflow export that still has one inlined.
 */

interface WorkflowNode {
  name: string;
  type: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * n8n's own workflow export already never includes credential *values* -- a credential field is
 * always `{ id, name }` (a reference into n8n's separate, encrypted credential store), never the
 * secret itself. This function still strips those reference objects down to just the credential
 * *name* before anything reaches the browser, so a UI preview can say "uses credential: n8n API
 * Key" without rendering whatever object shape n8n happens to return.
 */
export function redactWorkflowJson(workflow: N8nWorkflowFull): N8nWorkflowFull {
  const nodes = (workflow.nodes ?? []).map((node) => {
    const n = node as WorkflowNode;
    if (!n.credentials) return n;
    const redactedCredentials: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(n.credentials)) {
      const name = value && typeof value === "object" && "name" in value ? (value as { name?: unknown }).name : undefined;
      redactedCredentials[key] = { name: typeof name === "string" ? name : "(referenced credential)" };
    }
    return { ...n, credentials: redactedCredentials };
  });
  return { ...workflow, nodes };
}

/** Keys that must never contain a literal secret-looking value inside uploaded workflow JSON --
 *  a legitimate n8n credential reference is always `{ id, name }`, never a raw string here. */
const SUSPICIOUS_PARAM_KEY_PATTERN = /(api[_-]?key|secret|token|password|private[_-]?key|authorization)/i;

/** Heuristic: a long, high-entropy-looking string (mixed case/digits, no spaces, 20+ chars) in a
 *  parameter whose key looks credential-related. Flags likely-inlined secrets without trying to
 *  be a general secret scanner -- false positives just mean "review this field," never a crash. */
function looksLikeInlinedSecret(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!SUSPICIOUS_PARAM_KEY_PATTERN.test(key)) return false;
  if (value.length < 20) return false;
  if (/\s/.test(value)) return false;
  if (/^\{\{.*\}\}$/.test(value.trim())) return false; // n8n expression, not a literal
  return true;
}

export interface SecretScanFinding {
  nodeName: string;
  parameterKey: string;
}

/** Scans every node's `parameters` (never `credentials`, which is reference-only by construction
 *  in n8n's export format) for a literal value that looks like an inlined secret. Part F: "allow
 *  secrets inside uploaded workflow JSON" must never happen -- this is the gate that blocks it. */
export function scanForInlinedSecrets(workflow: { nodes?: unknown[] }): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  for (const raw of workflow.nodes ?? []) {
    const node = raw as WorkflowNode;
    const params = node.parameters ?? {};
    for (const [key, value] of Object.entries(flattenParams(params))) {
      if (looksLikeInlinedSecret(key, value)) {
        findings.push({ nodeName: node.name ?? "(unnamed node)", parameterKey: key });
      }
    }
  }
  return findings;
}

function flattenParams(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenParams(value as Record<string, unknown>, fullKey));
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

export type NodeChangeKind = "added" | "removed" | "modified" | "unchanged";

export interface NodeChangeSummary {
  name: string;
  type: string;
  kind: NodeChangeKind;
}

export interface WorkflowCompareResult {
  added: NodeChangeSummary[];
  removed: NodeChangeSummary[];
  modified: NodeChangeSummary[];
  unchangedCount: number;
  nameChanged: boolean;
  currentName: string;
  proposedName: string;
}

/** Node-level change summary between the currently-deployed workflow and a proposed replacement
 *  (Part F: "show a node-level change summary"). Compares by node name -- a renamed-but-otherwise-
 *  identical node shows as removed+added, which is the honest reading (n8n has no stable node ID
 *  independent of name in the export format). */
export function compareWorkflows(current: N8nWorkflowFull, proposed: { name?: string; nodes?: unknown[] }): WorkflowCompareResult {
  const currentNodes = new Map((current.nodes ?? []).map((n) => [n.name, n as WorkflowNode]));
  const proposedNodes = new Map(((proposed.nodes ?? []) as WorkflowNode[]).map((n) => [n.name, n]));

  const added: NodeChangeSummary[] = [];
  const removed: NodeChangeSummary[] = [];
  const modified: NodeChangeSummary[] = [];
  let unchangedCount = 0;

  for (const [name, node] of proposedNodes) {
    if (!currentNodes.has(name)) {
      added.push({ name, type: node.type, kind: "added" });
    }
  }
  for (const [name, node] of currentNodes) {
    const proposedNode = proposedNodes.get(name);
    if (!proposedNode) {
      removed.push({ name, type: node.type, kind: "removed" });
      continue;
    }
    const currentSig = JSON.stringify({ type: node.type, parameters: node.parameters ?? {} });
    const proposedSig = JSON.stringify({ type: proposedNode.type, parameters: proposedNode.parameters ?? {} });
    if (currentSig !== proposedSig) {
      modified.push({ name, type: proposedNode.type, kind: "modified" });
    } else {
      unchangedCount += 1;
    }
  }

  return {
    added,
    removed,
    modified,
    unchangedCount,
    nameChanged: (proposed.name ?? "") !== current.name,
    currentName: current.name,
    proposedName: proposed.name ?? current.name,
  };
}

/** Structural validation for an uploaded/imported workflow JSON -- independent of the secret
 *  scan above. Rejects anything that isn't a plausible n8n workflow before it's ever offered for
 *  deploy. */
export function validateWorkflowStructure(json: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!json || typeof json !== "object") {
    return { valid: false, errors: ["Uploaded file is not valid JSON."] };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) errors.push("Workflow JSON is missing a name.");
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) errors.push("Workflow JSON has no nodes array (or it's empty).");
  if (!obj.connections || typeof obj.connections !== "object") errors.push("Workflow JSON is missing a connections object.");
  if (Array.isArray(obj.nodes)) {
    for (const [i, node] of obj.nodes.entries()) {
      if (!node || typeof node !== "object" || typeof (node as { name?: unknown }).name !== "string") {
        errors.push(`Node at index ${i} is missing a name.`);
      }
      if (!node || typeof node !== "object" || typeof (node as { type?: unknown }).type !== "string") {
        errors.push(`Node at index ${i} is missing a type.`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
