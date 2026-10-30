// Tests for scripts/patch-crm-sheet-sync-auth.mjs against the reference export of the live
// "Biggbee CRM Sheet Sync" workflow. Run: node --test n8n/fixes/crm-sheet-sync/patch.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const script = path.join(root, "scripts/patch-crm-sheet-sync-auth.mjs");
const { patchWorkflow } = await import(pathToFileURL(script).href);
const original = JSON.parse(fs.readFileSync(path.join(here, "original.workflow.json"), "utf8"));
const patchedFile = JSON.parse(fs.readFileSync(path.join(here, "patched.workflow.json"), "utf8"));
const node = (wf, name) => wf.nodes.find((n) => n.name === name);

// What the 20 sibling sync workflows use for /api/export/full-sync (read from the live instance).
const SIBLING = { authentication: "predefinedCredentialType", nodeCredentialType: "httpHeaderAuth", credentials: { httpHeaderAuth: { id: "6Vem4EZTPkevbA78", name: "Scraper Hub" } } };

test("the reference export reproduces the bug: Fetch CRM Rows sends no authentication at all", () => {
  const n = node(original, "Fetch CRM Rows");
  assert.equal(n.parameters.url, "https://scraper.biggbees.com/api/export/crm-sync");
  assert.equal(n.parameters.authentication, undefined);
  assert.equal(n.credentials, undefined);
  assert.equal(n.parameters.sendHeaders, undefined);
});

test("the patch changes exactly one node, and only its authentication fields", () => {
  const { workflow, changed } = patchWorkflow(original);
  assert.equal(changed, true);
  assert.equal(workflow.nodes.length, original.nodes.length);
  const differing = original.nodes.filter((o) => JSON.stringify(o) !== JSON.stringify(node(workflow, o.name))).map((o) => o.name);
  assert.deepEqual(differing, ["Fetch CRM Rows"]);
  const before = node(original, "Fetch CRM Rows"), after = node(workflow, "Fetch CRM Rows");
  const { authentication, nodeCredentialType, ...paramsRest } = after.parameters;
  assert.deepEqual(paramsRest, before.parameters, "URL, query parameters and options are untouched");
  assert.equal(authentication, SIBLING.authentication);
  assert.equal(nodeCredentialType, SIBLING.nodeCredentialType);
  assert.deepEqual(after.credentials, SIBLING.credentials);
  for (const key of ["id", "name", "type", "typeVersion", "position"]) assert.deepEqual(after[key], before[key]);
});

test("everything else is byte-identical: connections, settings, schedule, webhook, the Google Sheets nodes and their credentials", () => {
  const { workflow } = patchWorkflow(original);
  assert.deepEqual(workflow.connections, original.connections);
  assert.deepEqual(workflow.settings, original.settings);
  assert.deepEqual(workflow.name, original.name);
  assert.deepEqual(node(workflow, "Schedule Trigger").parameters, { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } });
  assert.equal(node(workflow, "CRM Sync Webhook").parameters.path, "crm-sync-ondemand");
  for (const name of ["Read Existing CRM Rows", "Append CRM Row", "Update CRM Row"]) {
    assert.deepEqual(node(workflow, name), node(original, name), name);
    assert.equal(node(workflow, name).credentials.googleSheetsOAuth2Api.name, "Google Sheets account 2");
  }
});

test("only the existing Scraper Hub credential is referenced: no other credential is introduced, no secret is written", () => {
  const { workflow } = patchWorkflow(original);
  const creds = (wf) => JSON.stringify(wf.nodes.flatMap((n) => Object.entries(n.credentials || {}).map(([t, c]) => `${t}:${c.id}`)).sort());
  const added = JSON.parse(creds(workflow)).filter((c) => !JSON.parse(creds(original)).includes(c));
  assert.deepEqual(added, ["httpHeaderAuth:6Vem4EZTPkevbA78"]);
  assert.doesNotMatch(JSON.stringify(workflow), /Bearer\s+[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}|api[-_]?key"\s*:\s*"[^"]{8,}/i);
});

test("neither file carries workflow static data, so importing it could never reset the schedule/checkpoint state", () => {
  for (const wf of [original, patchedFile]) {
    assert.equal(wf.staticData, undefined);
    assert.equal(wf.active, undefined, "the file does not state an activation: it is a reference, apply it through the UI");
  }
});

test("the committed patched file is exactly what the script produces", () => {
  assert.deepEqual(patchedFile, patchWorkflow(original).workflow);
});

test("idempotent: patching an already-patched workflow changes nothing", () => {
  const { workflow, changed } = patchWorkflow(patchedFile);
  assert.equal(changed, false);
  assert.deepEqual(workflow, patchedFile);
});

test("refuses anything it does not recognise instead of guessing", () => {
  const wrongUrl = structuredClone(original);
  node(wrongUrl, "Fetch CRM Rows").parameters.url = "https://scraper.biggbees.com/api/export/full-sync";
  assert.throws(() => patchWorkflow(wrongUrl), /refusing to guess/);

  const hasHeaders = structuredClone(original);
  node(hasHeaders, "Fetch CRM Rows").parameters.sendHeaders = true;
  assert.throws(() => patchWorkflow(hasHeaders), /refusing to overwrite/);

  const otherAuth = structuredClone(original);
  node(otherAuth, "Fetch CRM Rows").parameters.authentication = "genericCredentialType";
  assert.throws(() => patchWorkflow(otherAuth), /refusing to overwrite/);

  const missing = structuredClone(original);
  missing.nodes = missing.nodes.filter((n) => n.name !== "Fetch CRM Rows");
  assert.throws(() => patchWorkflow(missing), /exactly one node/);

  const wrongType = structuredClone(original);
  node(wrongType, "Fetch CRM Rows").type = "n8n-nodes-base.code";
  assert.throws(() => patchWorkflow(wrongType), /not an HTTP Request node/);
});

test("the command-line script writes only to the path it is given and reports that nothing was applied", () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sync-patch-")), "out.json");
  const r = spawnSync(process.execPath, [script, path.join(here, "original.workflow.json"), out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Nothing was applied to n8n/);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), patchedFile);
});
