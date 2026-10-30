// Prepares (does NOT apply) the fix for "Biggbee CRM Sheet Sync" failing with 401 at "Fetch CRM Rows".
//
//   node scripts/patch-crm-sheet-sync-auth.mjs [input.json] [output.json]
//
// Root cause (verified read-only, see docs/crm-sheet-sync-401.md): the Scraper Hub API requires
// `Authorization: Bearer <key>` on /api/export/crm-sync AND /api/export/full-sync (one key, scoped to
// exactly those two GET routes). The 20 sibling sync workflows send it through the existing "Scraper
// Hub" header-auth credential; this node sends nothing, so every request is a 401.
//
// The transform adds exactly that credential reference to exactly that node, copying the siblings'
// parameters verbatim. It never reads or writes a secret (only the credential's id and name).
// It refuses to touch anything it does not recognise, and is idempotent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [inArg, outArg] = process.argv.slice(2);
const IN = inArg ? path.resolve(inArg) : path.join(root, "n8n/fixes/crm-sheet-sync/original.workflow.json");
const OUT = outArg ? path.resolve(outArg) : path.join(root, "n8n/fixes/crm-sheet-sync/patched.workflow.json");

const TARGET_NODE = "Fetch CRM Rows";
const TARGET_URL = "https://scraper.biggbees.com/api/export/crm-sync";
// Exactly what every sibling "Fetch Source Data" node uses for /api/export/full-sync.
const AUTH_PARAMS = { authentication: "predefinedCredentialType", nodeCredentialType: "httpHeaderAuth" };
const CREDENTIAL = { httpHeaderAuth: { id: "6Vem4EZTPkevbA78", name: "Scraper Hub" } };

export function patchWorkflow(workflow) {
  const wf = structuredClone(workflow);
  const matches = (wf.nodes || []).filter((n) => n.name === TARGET_NODE);
  if (matches.length !== 1) throw new Error(`Expected exactly one node named "${TARGET_NODE}", found ${matches.length}.`);
  const node = matches[0];
  if (node.type !== "n8n-nodes-base.httpRequest") throw new Error(`"${TARGET_NODE}" is ${node.type}, not an HTTP Request node.`);
  if (node.parameters?.url !== TARGET_URL) throw new Error(`"${TARGET_NODE}" calls ${node.parameters?.url}, not ${TARGET_URL}; refusing to guess.`);

  const already =
    node.parameters.authentication === AUTH_PARAMS.authentication &&
    node.parameters.nodeCredentialType === AUTH_PARAMS.nodeCredentialType &&
    JSON.stringify(node.credentials) === JSON.stringify(CREDENTIAL);
  if (already) return { workflow: wf, changed: false };

  const existingAuth = node.parameters.authentication && node.parameters.authentication !== "none";
  if (existingAuth || node.credentials || node.parameters.sendHeaders) {
    throw new Error(`"${TARGET_NODE}" already has some authentication/headers configured; refusing to overwrite it.`);
  }
  Object.assign(node.parameters, AUTH_PARAMS);
  node.credentials = structuredClone(CREDENTIAL);
  return { workflow: wf, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(fs.readFileSync(IN, "utf8"));
  const { workflow, changed } = patchWorkflow(input);
  fs.writeFileSync(OUT, JSON.stringify(workflow, null, 2) + "\n");
  console.log(changed ? `Patched "${TARGET_NODE}": added ${AUTH_PARAMS.authentication}/${AUTH_PARAMS.nodeCredentialType} with credential "${CREDENTIAL.httpHeaderAuth.name}".` : `"${TARGET_NODE}" already authenticated; no change.`);
  console.log(`Wrote ${path.relative(root, OUT)}. Nothing was applied to n8n.`);
}
