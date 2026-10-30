// Tests for n8n/error-notifier/error-notifier.workflow.json (regenerate with
// `node scripts/build-error-notifier-workflow.mjs`). Run: node --test n8n/error-notifier/error-notifier.workflow.test.mjs
//
// Structure first, then the Code nodes executed against mocked n8n globals. The CRM's answer is
// produced by the REAL decision code (decideAtomically) so the workflow<->CRM contract is tested,
// not assumed; atomicity itself is proven against the real store in src/lib/alerts/atomic.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decideAtomically, sweepAtomically } from "../../src/lib/alerts/atomic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, "error-notifier.workflow.json"), "utf8"));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const MIN = 60 * 1000;
const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const OWN = "OWwCk77riM1yUmgT";

const successors = (name) => Object.values(wf.connections[name] ?? {}).flatMap((ports) => ports.flatMap((port) => port.map((c) => c.node)));

/** Runs a Code node with mocked n8n globals; `store` stands in for the workflow's persisted static data. */
function runCode(name, { json, nodes = {}, store = {}, executionId = "5001", now = T0 + 1000, failStaticData = false } = {}) {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const input = json === undefined ? [] : [{ json }];
    const $input = { first: () => input[0], all: () => input, item: input[0] };
    const $ = (n) => ({ first: () => ({ json: nodes[n] }), all: () => [{ json: nodes[n] }] });
    const $getWorkflowStaticData = () => {
      if (failStaticData) throw new Error("static data unavailable");
      return store;
    };
    const fn = new Function("$input", "$", "$workflow", "$execution", "$getWorkflowStaticData", byName[name].parameters.jsCode);
    return fn($input, $, { id: OWN }, { id: executionId }, $getWorkflowStaticData);
  } finally {
    Date.now = realNow;
  }
}
const restart = (store) => JSON.parse(JSON.stringify(store));

const activation = (at) => ({
  trigger: { error: { message: 'There was a problem with the trigger node "Hostinger Email Trigger - Watch Replies", for that reason did the workflow had to be deactivated', timestamp: at, name: "WorkflowActivationError", context: {} }, mode: "trigger" },
  workflow: { id: "55q30dkVXZGwb8TR", name: "Biggbee AI - Outbound Cold Email System" },
});
const execFailure = (node, id = "77") => ({
  execution: { id, url: "https://n8n.example/workflow/W1/executions/" + id, mode: "trigger", lastNodeExecuted: node, error: { name: "NodeApiError", message: "550 mailbox unavailable", node: { id: "n1", name: node, type: "n8n-nodes-base.emailSend" } } },
  workflow: { id: "W1", name: "Some Workflow" },
});

/** A tiny sequential stand-in for the CRM's store, used only to get a realistic CRM response. */
function memoryStore() {
  let data;
  return async (collection, fallback, mutate) => {
    data = mutate(data === undefined ? structuredClone(fallback) : structuredClone(data));
    return data;
  };
}
async function crmAnswer(update, payload, { eventId = "OWwCk77riM1yUmgT:1", now = T0 } = {}) {
  const prepared = runCode("Prepare Request", { json: payload, executionId: eventId.split(":")[1] })[0].json.request;
  const out = await decideAtomically(update, { payload: prepared.payload, ownWorkflowId: prepared.ownWorkflowId, eventId: prepared.eventId, config: prepared.config, nowMs: now });
  return JSON.parse(JSON.stringify({ ok: true, ...out })); // what travels over HTTP
}

// ── structure ────────────────────────────────────────────────────────────────────────────────────
test("is a separate, inactive workflow that is not attached to anything and cannot notify itself", () => {
  assert.equal(wf.name, "Biggbee — Error Notifier");
  assert.equal(wf.id, OWN);
  assert.equal(wf.active, false);
  assert.equal(wf.settings.errorWorkflow, undefined, "no errorWorkflow: n8n never re-runs an error workflow for an error-mode run");
  assert.equal(wf.nodes.filter((n) => n.type === "n8n-nodes-base.errorTrigger").length, 1);
});

test("graph: error -> request -> CRM decision -> resolve; every event is logged unconditionally and only the email is conditional", () => {
  assert.deepEqual(successors("Error Trigger"), ["Prepare Request"]);
  assert.deepEqual(successors("Prepare Request"), ["CRM Decide"]);
  assert.deepEqual(successors("CRM Decide"), ["Resolve Decision"]);
  assert.deepEqual(successors("Resolve Decision").sort(), ["Log Error", "Send Email?"]);
  assert.deepEqual(successors("Send Email?"), ["Send Alert Email"]);
  assert.equal(wf.connections["Send Email?"].main[1].length, 0, "the 'no email' branch is intentionally empty");
  assert.equal(byName["Send Email?"].parameters.conditions.conditions[0].leftValue, "={{ $json.sendEmail === true }}");
  assert.deepEqual(successors("Sweeper Schedule"), ["Prepare Sweep Request"]);
  assert.deepEqual(successors("Prepare Sweep Request"), ["CRM Sweep"]);
  assert.deepEqual(successors("CRM Sweep"), ["Resolve Sweep"]);
  assert.deepEqual(successors("Resolve Sweep"), ["Send Alert Email"]);
});

test("the CRM calls: dedicated endpoint, existing CRM credential, bounded time, safe retry, and a failure falls through (never stops the alert)", () => {
  for (const name of ["CRM Decide", "CRM Sweep"]) {
    const n = byName[name];
    assert.equal(n.parameters.url, "https://crm.biggbees.com/api/internal/alerts");
    assert.equal(n.parameters.method, "POST");
    assert.equal(n.parameters.jsonBody, "={{ JSON.stringify($json.request) }}");
    assert.deepEqual(n.credentials, { httpHeaderAuth: { id: "dHOCpdzzkQDDu0mz", name: "CRM Internal API Key" } });
    assert.equal(n.onError, "continueRegularOutput", name + " failure must fall through to the local fallback");
    assert.equal(n.parameters.options.timeout, 8000);
    assert.equal(n.parameters.options.response.response.neverError, true, "4xx/5xx come back as bodies the resolver rejects");
    assert.ok(n.maxTries <= 2, "bounded retry");
  }
  assert.doesNotMatch(JSON.stringify(byName["CRM Decide"].parameters), /\}\}.*\{\{/s, "no nested expression braces that could break n8n's parser");
});

test("no loops: the alert email and the log are dead ends, and a failed send never fails the run", () => {
  assert.deepEqual(successors("Send Alert Email"), []);
  assert.deepEqual(successors("Log Error"), []);
  assert.equal(byName["Send Alert Email"].onError, "continueRegularOutput");
  assert.equal(byName["Log Error"].onError, "continueRegularOutput");
  const seen = new Set(), stack = new Set();
  const dfs = (n) => { if (stack.has(n)) throw new Error("cycle at " + n); if (seen.has(n)) return; seen.add(n); stack.add(n); successors(n).forEach(dfs); stack.delete(n); };
  assert.doesNotThrow(() => wf.nodes.forEach((n) => dfs(n.name)));
});

test("sender, recipient and credentials are the existing ones; no secret is embedded", () => {
  const send = byName["Send Alert Email"];
  assert.equal(send.parameters.fromEmail, "Biggbee AI <office@biggbees.com>");
  assert.equal(send.parameters.toEmail, "office@biggbees.com");
  assert.deepEqual(send.credentials, { smtp: { id: "vEtw2lRmEd0lQJhT", name: "SMTP account" } });
  assert.equal(byName["Log Error"].credentials.googleSheetsOAuth2Api.id, "7aR4JY2NB9B0uvi8");
  assert.deepEqual(byName["Log Error"].parameters.columns.schema.map((s) => s.id), ["Timestamp", "Source", "Lead Email", "Error Message", "Node Name", "Company", "Validation Errors", "Validation Warnings", "Workspace ID"]);
  assert.doesNotMatch(JSON.stringify(wf), /sk-[A-Za-z0-9]{20,}|BEGIN PRIVATE KEY|password/i);
  assert.doesNotMatch(JSON.stringify(wf), /(^|\W)export (function|const) /);
  assert.equal(byName["Sweeper Schedule"].parameters.rule.interval[0].minutesInterval, 30);
});

test("every Code node parses, and the ones that use the core inline it", () => {
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(() => new Function("$input", "$", "$workflow", "$execution", "$getWorkflowStaticData", n.parameters.jsCode), n.name);
    if (/\bCore\./.test(n.parameters.jsCode)) assert.match(n.parameters.jsCode, /const Core = \(function/, n.name);
  }
});

// ── the request n8n sends ────────────────────────────────────────────────────────────────────────
test("Prepare Request: raw payload, this workflow's id, an idempotency key from the execution id, and the settings", () => {
  const out = runCode("Prepare Request", { json: activation(T0), executionId: "9001" })[0].json;
  assert.equal(out.request.action, "event");
  assert.equal(out.request.eventId, OWN + ":9001");
  assert.equal(out.request.ownWorkflowId, OWN);
  assert.deepEqual(out.request.payload, activation(T0));
  for (const [k, v] of Object.entries(out.request.config)) assert.ok(k === "editorBaseUrl" ? /^https:\/\//.test(v) : Number.isInteger(v) && v > 0, "setting " + k);
  assert.deepEqual(out.payload, activation(T0));
});

// ── primary path: trust the CRM's atomic answer ──────────────────────────────────────────────────
test("CRM decided 'email': passed through untouched, the local static data is never consulted", async () => {
  const update = memoryStore();
  const answer = await crmAnswer(update, activation(T0));
  assert.equal(answer.sendEmail, true);
  const store = {};
  const out = runCode("Resolve Decision", { json: answer, nodes: { "Prepare Request": { payload: activation(T0) } }, store })[0].json;
  assert.equal(out.via, "crm");
  assert.equal(out.sendEmail, true);
  assert.deepEqual(out.mail, answer.mail);
  assert.deepEqual(store, {}, "no local state is touched when the CRM answers");
  assert.match(out.mail.subject, /\[WARNING\] Biggbee AI - Outbound Cold Email System \/ Hostinger Email Trigger - Watch Replies/);
  assert.equal(out.log["Node Name"], "Hostinger Email Trigger - Watch Replies");
});

test("CRM decided 'duplicate': no email, but the event is still logged", async () => {
  const update = memoryStore();
  await crmAnswer(update, activation(T0), { eventId: "OWwCk77riM1yUmgT:1" });
  const dup = await crmAnswer(update, activation(T0 + 4 * MIN), { eventId: "OWwCk77riM1yUmgT:2", now: T0 + 4 * MIN });
  const out = runCode("Resolve Decision", { json: dup, nodes: { "Prepare Request": { payload: activation(T0) } } })[0].json;
  assert.equal(out.sendEmail, false);
  assert.equal(out.mail, null);
  assert.equal(JSON.parse(out.log["Validation Warnings"]).emailed, false);
  assert.equal(JSON.parse(out.log["Validation Warnings"]).incidentCount, 2);
});

// ── fallback: CRM unavailable ────────────────────────────────────────────────────────────────────
const crmFailures = {
  "HTTP error item (timeout / network)": { error: { message: "timeout of 8000ms exceeded" } },
  "401 body": { ok: false, error: "Unauthorized" },
  "500 body": { ok: false, error: "Alert service error" },
  "413 body": { ok: false, error: "Payload too large" },
  "HTML error page": { data: "<html>502 Bad Gateway</html>" },
  "empty": {},
  "ok but incomplete": { ok: true, sendEmail: true },
  "ok, says email, but no mail": { ok: true, sendEmail: true, log: { "Error Message": "x" } },
};
for (const [label, crm] of Object.entries(crmFailures)) {
  test(`fallback when the CRM answer is unusable (${label}): the alert is still decided and emailed, and says it was decided locally`, () => {
    const store = {};
    const out = runCode("Resolve Decision", { json: crm, nodes: { "Prepare Request": { payload: activation(T0) } }, store })[0].json;
    assert.equal(out.via, "local-fallback");
    assert.equal(out.sendEmail, true);
    assert.match(out.mail.text, /decided locally in n8n because the CRM alert service was unreachable/);
    assert.match(out.mail.html, /decided locally/);
    assert.equal(JSON.parse(out.log["Validation Warnings"]).via, "local-fallback");
    assert.ok(store.notifier, "state was written locally");
  });
}

test("fallback still de-duplicates sequential repeats (across a restart) and never merges distinct failures", () => {
  let store = {};
  const down = { error: { message: "down" } };
  const run1 = (payload, at) => runCode("Resolve Decision", { json: down, nodes: { "Prepare Request": { payload } }, store, now: at })[0].json;
  const a = run1(activation(T0), T0);
  store = restart(store);
  const b = run1(activation(T0 + 3 * MIN), T0 + 3 * MIN);
  store = restart(store);
  const c = run1(execFailure("Send Email"), T0 + 4 * MIN);
  assert.deepEqual([a.sendEmail, b.sendEmail, c.sendEmail], [true, false, true]);
  assert.equal(b.mail, null);
  assert.match(c.mail.subject, /\[CRITICAL\].*Send Email/);
});

test("fallback loop prevention: the notifier's own failures are logged, never emailed", () => {
  const own = { execution: { id: "1", mode: "error", error: { message: "smtp down" }, lastNodeExecuted: "Send Alert Email" }, workflow: { id: OWN, name: "Biggbee — Error Notifier" } };
  const out = runCode("Resolve Decision", { json: { error: { message: "down" } }, nodes: { "Prepare Request": { payload: own } } })[0].json;
  assert.equal(out.sendEmail, false);
  assert.equal(out.log["Error Message"], "smtp down");
  assert.equal(JSON.parse(out.log["Validation Warnings"]).selfOrigin, true);
});

test("fails OPEN: if even the local logic breaks, the original error is emailed unthrottled", () => {
  const out = runCode("Resolve Decision", { json: { error: { message: "down" } }, nodes: { "Prepare Request": { payload: activation(T0) } }, failStaticData: true })[0].json;
  assert.equal(out.via, "fail-open");
  assert.equal(out.sendEmail, true);
  assert.match(out.mail.subject, /CRITICAL.*error notifier fault/);
  assert.match(out.mail.text, /static data unavailable/);
  assert.match(out.mail.text, /Hostinger Email Trigger/);
});

test("garbled payloads are emailed with 'unavailable' labels on both paths, never dropped or guessed", async () => {
  for (const payload of [{}, { workflow: {} }, { weird: true }]) {
    const viaFallback = runCode("Resolve Decision", { json: { error: {} }, nodes: { "Prepare Request": { payload } } })[0].json;
    assert.equal(viaFallback.sendEmail, true);
    assert.match(viaFallback.mail.text, /Failing node: unavailable/);
    const answer = await crmAnswer(memoryStore(), payload);
    assert.equal(answer.sendEmail, true);
    assert.match(answer.mail.text, /Failing node: unavailable/);
  }
});

// ── sweeper ──────────────────────────────────────────────────────────────────────────────────────
test("Resolve Sweep: nothing due -> no items; a CRM wrap-up -> one email item; CRM down -> local sweep", async () => {
  assert.deepEqual(runCode("Resolve Sweep", { json: { ok: true, emails: [] } }), []);
  const update = memoryStore();
  for (let i = 0; i < 3; i++) await crmAnswer(update, activation(T0 + i * MIN), { eventId: "OWwCk77riM1yUmgT:" + (10 + i), now: T0 + i * MIN });
  const swept = JSON.parse(JSON.stringify({ ok: true, ...(await sweepAtomically(update, { config: runCode("Prepare Sweep Request", {})[0].json.request.config, nowMs: T0 + 300 * MIN })) }));
  const items = runCode("Resolve Sweep", { json: swept });
  assert.equal(items.length, 1);
  assert.match(items[0].json.mail.subject, /Quiet:/);
  assert.match(items[0].json.mail.text, /inferred from silence/);
  // CRM down: nothing locally -> nothing; with fallback-era state -> the local wrap-up
  assert.deepEqual(runCode("Resolve Sweep", { json: { error: { message: "down" } }, store: {} }), []);
  const store = {};
  runCode("Resolve Decision", { json: { error: {} }, nodes: { "Prepare Request": { payload: activation(T0) } }, store, now: T0 });
  runCode("Resolve Decision", { json: { error: {} }, nodes: { "Prepare Request": { payload: activation(T0 + MIN) } }, store, now: T0 + MIN });
  const local = runCode("Resolve Sweep", { json: { error: { message: "down" } }, store, now: T0 + 300 * MIN });
  assert.equal(local.length, 1);
  assert.match(local[0].json.mail.subject, /Quiet:/);
});
