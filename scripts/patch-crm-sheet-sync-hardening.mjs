// Prepares (does NOT apply) the batch/workspace hardening of "Biggbee CRM Sheet Sync", layered ON TOP of
// the authentication fix (scripts/patch-crm-sheet-sync-auth.mjs).
//
//   node scripts/patch-crm-sheet-sync-hardening.mjs [patched-input.json] [output.json]
//
// Order matters and is enforced: the input must already carry the "Scraper Hub" credential on
// "Fetch CRM Rows" (the auth patch), and the Scraper Hub API must already have the eligibility fix
// deployed (docs/scraper-crm-eligibility.md) -- this patch makes the workflow ask for an explicit
// workspace, which the OLD API ignores and the NEW API requires.
//
// Exactly four nodes change; the schedule, webhook, Google Sheets credentials/targets, Merge and If nodes,
// and every connection are identical. Nothing is read from or written to n8n by this script.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dir = path.join(root, "n8n/fixes/crm-sheet-sync");
const IN = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dir, "patched.workflow.json");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dir, "hardened.workflow.json");

export const WORKSPACE = "biggbee";
export const MARKER = "HARDENED 2026-10-30";
export const HARDENED_MATCH_AND_DECIDE = fs.readFileSync(path.join(dir, "match-and-decide.hardened.js"), "utf8");
const CREDENTIAL = { httpHeaderAuth: { id: "6Vem4EZTPkevbA78", name: "Scraper Hub" } };
const OLD_APPEND_WORKSPACE = "={{ 'biggbee' }}";
const NEW_APPEND_WORKSPACE = "={{ $json.WorkspaceId }}";
const OLD_SUMMARY_RETURN = "return [{ json: { inserted: appended, updated, syncedThrough: staticData.lastCrmSyncAt, jobId: startRunOutput.jobId || null } }];";
const NEW_SUMMARY_RETURN =
  "const matchItems = $('Match & Decide').all();\n" +
  "const skippedDuplicates = matchItems.length ? matchItems[0].json._skippedInBatch : 0;\n" +
  "const skippedDifferentBusiness = matchItems.length ? matchItems[0].json._skippedConflicts : 0;\n" +
  "return [{ json: { inserted: appended, updated, skippedDuplicates, skippedDifferentBusiness, syncedThrough: staticData.lastCrmSyncAt, jobId: startRunOutput.jobId || null } }];";

export function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

function one(wf, name) {
  const m = (wf.nodes || []).filter((n) => n.name === name);
  if (m.length !== 1) throw new Error(`Expected exactly one node named "${name}", found ${m.length}.`);
  return m[0];
}

export function hardenWorkflow(workflow) {
  const wf = structuredClone(workflow);
  const fetch = one(wf, "Fetch CRM Rows");
  const match = one(wf, "Match & Decide");
  const append = one(wf, "Append CRM Row");
  const summary = one(wf, "Summarize & Checkpoint");

  if (JSON.stringify(fetch.credentials) !== JSON.stringify(CREDENTIAL) || fetch.parameters.authentication !== "predefinedCredentialType") {
    throw new Error('"Fetch CRM Rows" has no Scraper Hub credential yet: apply scripts/patch-crm-sheet-sync-auth.mjs first.');
  }
  const params = fetch.parameters.queryParameters?.parameters;
  if (!Array.isArray(params)) throw new Error('"Fetch CRM Rows" has no query parameters to extend; refusing to guess.');

  const alreadyMatch = match.parameters.jsCode.includes(MARKER);
  const alreadyFetch = params.some((p) => p.name === "workspaceId");
  const alreadyAppend = append.parameters.columns?.value?.["Workspace ID"] === NEW_APPEND_WORKSPACE;
  const alreadySummary = summary.parameters.jsCode.includes("skippedDuplicates");
  if (alreadyMatch && alreadyFetch && alreadyAppend && alreadySummary) return { workflow: wf, changed: false };
  if (alreadyMatch || alreadyFetch || alreadyAppend || alreadySummary) throw new Error("Workflow is partly hardened already; refusing to guess. Start from patched.workflow.json.");

  if (!match.parameters.jsCode.includes("fill-blank-only merge") || !match.parameters.jsCode.includes("function normEmail")) {
    throw new Error('"Match & Decide" is not the expected live code; refusing to replace it.');
  }
  if (append.parameters.columns?.value?.["Workspace ID"] !== OLD_APPEND_WORKSPACE) {
    throw new Error(`"Append CRM Row" Workspace ID is not the expected ${OLD_APPEND_WORKSPACE}; refusing to change it.`);
  }
  if (!summary.parameters.jsCode.includes(OLD_SUMMARY_RETURN)) throw new Error('"Summarize & Checkpoint" is not the expected live code; refusing to change it.');

  params.push({ name: "workspaceId", value: WORKSPACE });
  match.parameters.jsCode = HARDENED_MATCH_AND_DECIDE;
  append.parameters.columns.value["Workspace ID"] = NEW_APPEND_WORKSPACE;
  summary.parameters.jsCode = summary.parameters.jsCode.replace(OLD_SUMMARY_RETURN, NEW_SUMMARY_RETURN);
  return { workflow: wf, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(fs.readFileSync(IN, "utf8"));
  const { workflow, changed } = hardenWorkflow(input);
  fs.writeFileSync(OUT, JSON.stringify(workflow, null, 2) + "\n");
  console.log(changed
    ? 'Hardened 4 nodes: Fetch CRM Rows (+workspaceId), Match & Decide, Append CRM Row (Workspace ID from API), Summarize & Checkpoint.'
    : "Already hardened; no change.");
  console.log(`Wrote ${path.relative(root, OUT)}. Nothing was applied to n8n.`);
}
