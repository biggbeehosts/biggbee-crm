// Tests for scripts/patch-crm-sheet-sync-hardening.mjs and the hardened "Match & Decide" node body.
// Run: node --test n8n/fixes/crm-sheet-sync/hardening.test.mjs
// The Code-node body is executed for real (stubbed $ / $input), the way n8n runs it. No network, no n8n.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const { hardenWorkflow, HARDENED_MATCH_AND_DECIDE, MARKER } = await import(pathToFileURL(path.join(root, "scripts/patch-crm-sheet-sync-hardening.mjs")).href);
const original = JSON.parse(fs.readFileSync(path.join(here, "original.workflow.json"), "utf8"));
const patched = JSON.parse(fs.readFileSync(path.join(here, "patched.workflow.json"), "utf8"));
const node = (wf, name) => wf.nodes.find((n) => n.name === name);

// ---- harness: run the Match & Decide body the way n8n does ----
function runMatch({ api, sheet = [], code = HARDENED_MATCH_AND_DECIDE }) {
  const $ = (name) => {
    assert.equal(name, "Fetch CRM Rows");
    return { first: () => ({ json: api }) };
  };
  const $input = { all: () => sheet.map((r) => ({ json: r })) };
  const fn = new Function("$", "$input", code);
  return fn($, $input).map((i) => i.json);
}
const rec = (id, row, workspaceId = "biggbee") => ({ entityId: id, updatedAt: "2026-10-30T00:00:00.000Z", workspaceId, row: { name: null, company: null, email: null, website: null, industry: null, businessType: null, leadGenerationType: "Das Örtliche", phone: null, country: "Germany", ...row } });
const api = (rows, workspaceId = "biggbee") => ({ workspaceId, rows, skipped: [], meta: {} });
const sheetRow = (n, o) => ({ row_number: n, Name: "", Company: "", Email: "", Website: "", Phone: "", Country: "", Industry: "", BusinessType: "", "Workspace ID": "biggbee", Status: "New", "Follow-upCount": 0, ...o });

// ---- the patch itself ----
test("hardening refuses to run before the auth fix is applied", () => {
  assert.throws(() => hardenWorkflow(original), /apply scripts\/patch-crm-sheet-sync-auth\.mjs first/);
});

test("hardening changes exactly four nodes and nothing else (schedule, webhook, Sheets targets/credentials, connections untouched)", () => {
  const { workflow, changed } = hardenWorkflow(patched);
  assert.equal(changed, true);
  const differing = patched.nodes.filter((o) => JSON.stringify(o) !== JSON.stringify(node(workflow, o.name))).map((o) => o.name).sort();
  assert.deepEqual(differing, ["Append CRM Row", "Fetch CRM Rows", "Match & Decide", "Summarize & Checkpoint"]);
  assert.equal(workflow.nodes.length, patched.nodes.length);
  assert.deepEqual(workflow.connections, patched.connections);
  assert.deepEqual(workflow.settings, patched.settings);
  for (const name of ["Read Existing CRM Rows", "Update CRM Row", "Schedule Trigger", "CRM Sync Webhook", "Start Run", "Is New?", "Merge Results"]) {
    assert.deepEqual(node(workflow, name), node(patched, name), name);
  }
  assert.deepEqual(node(workflow, "Append CRM Row").credentials, node(patched, "Append CRM Row").credentials);
});

test("Fetch CRM Rows keeps its auth and params and gains one explicit workspaceId", () => {
  const f = node(hardenWorkflow(patched).workflow, "Fetch CRM Rows");
  assert.deepEqual(f.credentials, { httpHeaderAuth: { id: "6Vem4EZTPkevbA78", name: "Scraper Hub" } });
  assert.deepEqual(f.parameters.queryParameters.parameters.map((p) => p.name), ["updatedSince", "jobId", "workspaceId"]);
  const ws = f.parameters.queryParameters.parameters.find((p) => p.name === "workspaceId");
  assert.equal(ws.value, "biggbee", "a literal, visible in the node: not computed, not derived from data");
  assert.doesNotMatch(JSON.stringify(f), /Bearer|apiKey|N8N_EXPORT_API_KEY/);
});

test("Append CRM Row takes Workspace ID from the Scraper Hub answer instead of a hard-coded literal; Update CRM Row still cannot touch it", () => {
  const wf = hardenWorkflow(patched).workflow;
  assert.equal(node(original, "Append CRM Row").parameters.columns.value["Workspace ID"], "={{ 'biggbee' }}");
  assert.equal(node(wf, "Append CRM Row").parameters.columns.value["Workspace ID"], "={{ $json.WorkspaceId }}");
  const update = node(wf, "Update CRM Row").parameters.columns.value;
  for (const forbidden of ["Workspace ID", "Status", "Follow-up Count"]) assert.ok(!(forbidden in update), `${forbidden} must stay out of updates`);
});

test("hardening is idempotent, and refuses a half-hardened or unexpected workflow", () => {
  const once = hardenWorkflow(patched).workflow;
  const again = hardenWorkflow(once);
  assert.equal(again.changed, false);
  assert.deepEqual(again.workflow, once);
  const half = structuredClone(patched);
  node(half, "Fetch CRM Rows").parameters.queryParameters.parameters.push({ name: "workspaceId", value: "biggbee" });
  assert.throws(() => hardenWorkflow(half), /partly hardened/);
  const odd = structuredClone(patched);
  node(odd, "Match & Decide").parameters.jsCode = "return [];";
  assert.throws(() => hardenWorkflow(odd), /not the expected live code/);
  const odd2 = structuredClone(patched);
  node(odd2, "Append CRM Row").parameters.columns.value["Workspace ID"] = "={{ 'someone-else' }}";
  assert.throws(() => hardenWorkflow(odd2), /not the expected/);
});

test("the committed hardened.workflow.json is exactly what the script produces from patched.workflow.json", () => {
  const file = path.join(here, "hardened.workflow.json");
  assert.ok(fs.existsSync(file), "run: node scripts/patch-crm-sheet-sync-hardening.mjs");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), hardenWorkflow(patched).workflow);
});

test("the hardened body carries its marker and does not use the URL global the n8n sandbox lacks", () => {
  assert.ok(HARDENED_MATCH_AND_DECIDE.includes(MARKER));
  assert.doesNotMatch(HARDENED_MATCH_AND_DECIDE.replace(/\/\/.*$/gm, ""), /new URL\(/);
});

// ---- behaviour of the Match & Decide body ----
test("EMPTY CRM + records: appended as New with the API's workspace, nothing updated", () => {
  const out = runMatch({ api: api([rec("e1", { company: "A GmbH", email: "a@a.de", website: "https://www.a.de/x" }), rec("e2", { company: "B GmbH", email: "b@b.de" })]) });
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o._action === "append" && o.WorkspaceId === "biggbee" && o.Status === "New" && o["Follow-upCount"] === 0));
});

test("WORKSPACE: the run aborts, writing nothing, if the answer or any record is not for this workspace or names none", () => {
  const good = [rec("e1", { company: "A", email: "a@a.de" })];
  assert.throws(() => runMatch({ api: api(good, "other") }), /syncs "biggbee"/);
  assert.throws(() => runMatch({ api: { rows: good } }), /answered for workspace "undefined"/, "no workspace in the answer (old API) is never assumed to mean biggbee");
  assert.throws(() => runMatch({ api: api([rec("e1", { company: "A", email: "a@a.de" }, "other")]) }), /carried workspace "other"/);
  assert.throws(() => runMatch({ api: api([{ entityId: "e1", row: { email: "a@a.de" } }]) }), /carried workspace "undefined"/);
});

test("WORKSPACE: existing rows of another workspace, or with a blank Workspace ID, are never matched or updated", () => {
  const sheet = [
    sheetRow(2, { Email: "shared@x.de", Company: "Other WS GmbH", "Workspace ID": "workspace-b" }),
    sheetRow(3, { Email: "blank@x.de", Company: "Blank WS GmbH", "Workspace ID": "" })
  ];
  const out = runMatch({ api: api([rec("e1", { company: "Mine GmbH", email: "shared@x.de" }), rec("e2", { company: "Blank WS GmbH", email: "blank@x.de" })]), sheet });
  assert.deepEqual(out.map((o) => o._action), ["append", "append"], "appended as new leads of this workspace, neighbours untouched");
  assert.ok(out.every((o) => o.row_number === undefined));
});

test("WITHIN-BATCH: records sharing an email (any case/padding) are appended once; the sheet-read-before-run blind spot is closed", () => {
  const out = runMatch({ api: api([
    rec("e1", { company: "Bakery", email: "Shop@X.de" }),
    rec("e2", { company: "Pizza", email: " shop@x.DE " }),
    rec("e3", { company: "Cafe", email: "SHOP@x.de" })
  ]) });
  assert.equal(out.length, 1);
  assert.equal(out[0].Company, "Bakery", "the first record is kept whole; the others are not merged into it");
  assert.equal(out[0]._skippedInBatch, 2);
});

test("WITHIN-BATCH: the same website domain / phone / company+country in one batch also yields one lead", () => {
  const byDomain = runMatch({ api: api([rec("e1", { company: "A", email: "a@x.de", website: "https://x.de" }), rec("e2", { company: "B", email: "b@x.de", website: "http://www.x.de/kontakt" })]) });
  assert.equal(byDomain.length, 1);
  const byPhone = runMatch({ api: api([rec("e1", { company: "A", email: "a@a.de", phone: "+49 351 123" }), rec("e2", { company: "B", email: "b@b.de", phone: "+49-351-123" })]) });
  assert.equal(byPhone.length, 1);
  const byName = runMatch({ api: api([rec("e1", { company: "Same Name", email: "a@a.de" }), rec("e2", { company: "same  name", email: "b@b.de" })]) });
  assert.equal(byName.length, 1);
});

test("CONFLICT: an email that already belongs to a DIFFERENT business is not merged into that lead", () => {
  const sheet = [sheetRow(2, { Email: "info@shared.de", Company: "Original Bakery", Website: "", Phone: "" })];
  const out = runMatch({ api: api([rec("e1", { company: "Other Pizzeria", email: "info@shared.de", website: "https://pizza.de", phone: "123" })]), sheet });
  assert.equal(out.length, 0, "neither an update (would copy the pizzeria's website/phone into the bakery) nor an append (would duplicate the email)");
});

test("SAME business, same email: still a fill-blank update that never overwrites a populated value or touches Status/Follow-up/Workspace", () => {
  const sheet = [sheetRow(5, { Email: "a@a.de", Company: "A GmbH", Phone: "111", Website: "", Status: "Contacted", "Follow-upCount": 2 })];
  const out = runMatch({ api: api([rec("e1", { company: "A GmbH", email: "a@a.de", phone: "999", website: "https://a.de" })]), sheet });
  assert.equal(out.length, 1);
  const u = out[0];
  assert.equal(u._action, "update");
  assert.equal(u.row_number, 5);
  assert.equal(u.Phone, "111", "populated value kept");
  assert.equal(u.Website, "https://a.de", "blank filled");
  for (const k of ["Status", "Follow-upCount", "Workspace ID", "WorkspaceId"]) assert.ok(!(k in u), `${k} is not part of an update`);
});

test("EXISTING behaviour kept: a domain/phone match with a different email still fill-blank-updates (only an EMAIL clash between different businesses is a conflict)", () => {
  const sheet = [sheetRow(7, { Email: "old@a.de", Company: "A GmbH", Website: "https://a.de" })];
  const out = runMatch({ api: api([rec("e1", { company: "A Gruppe", email: "new@a.de", website: "https://www.a.de" })]), sheet });
  assert.equal(out.length, 1);
  assert.equal(out[0]._action, "update");
  assert.equal(out[0].row_number, 7);
});

test("the 190-record scenario: 190 records on 81 addresses against an empty CRM can append at most 81 leads even if the API de-duplication were bypassed", () => {
  const rows = Array.from({ length: 190 }, (_, i) => rec(`e${i}`, { company: `Verzeichnis ${i}`, email: `kontakt${i % 81}@beispiel.de` }));
  const out = runMatch({ api: api(rows) });
  assert.equal(out.length, 81);
  assert.equal(new Set(out.map((o) => o.Email.toLowerCase())).size, 81);
  assert.equal(out[0]._skippedInBatch, 109);
});

test("CONTRACT: a real Scraper Hub crm-sync answer (generated by the API code on a disposable Postgres, synthetic data) flows through the hardened node", () => {
  const response = JSON.parse(fs.readFileSync(path.join(here, "fixtures/crm-sync-response.sample.json"), "utf8"));
  assert.equal(response.workspaceId, "biggbee");
  assert.ok(response.rows.every((r) => r.workspaceId === "biggbee" && r.entityId && r.updatedAt && r.row));
  assert.equal(response.skipped.length, 1, "the API reported the email duplicate it left out");
  assert.equal(response.skipped[0].reason, "duplicate_email");
  const out = runMatch({ api: response });
  assert.deepEqual(out.map((o) => o.Company), ["Alpha Bakery", "Gamma Cafe"]);
  assert.ok(out.every((o) => o._action === "append" && o.WorkspaceId === "biggbee" && o.Status === "New"));
  assert.ok(!out.some((o) => /Delta Sheet Only/.test(o.Company)), "a sheet_only record is not in the answer, so it cannot be written");
  assert.deepEqual(Object.keys(response.rows[0].row), ["name", "company", "email", "website", "industry", "businessType", "leadGenerationType", "phone", "country"], "workspace and ids ride beside `row`, never inside it");
});

test("Summarize & Checkpoint reports the skip counts and keeps the checkpoint rules of the live node", () => {
  const code = node(hardenWorkflow(patched).workflow, "Summarize & Checkpoint").parameters.jsCode;
  assert.match(code, /skippedDuplicates/);
  assert.match(code, /if \(!startRunOutput\.jobId\)/, "on-demand runs still never advance the periodic checkpoint");
  assert.match(code, /staticData\.lastCrmSyncAt = staticData\._pendingCrmSyncAt/);
});
