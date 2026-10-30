// Manual end-to-end check of POST /api/internal/alerts against a RUNNING CRM (never production).
//
//   1. start a local server with an isolated data dir, e.g.
//        N8N_API_KEY=test-key LOCAL_DATA_DIR=$(mktemp -d) DATA_MODE=mock npx next start -p 3419
//   2. node scripts/verify-alerts-endpoint.mjs http://localhost:3419 test-key
//
// It fires real concurrent HTTP requests, so it exercises the route, auth, validation, the JSON
// store's queue and persistence together. Exits non-zero on any failed check.
import assert from "node:assert/strict";

const base = (process.argv[2] || "http://localhost:3419").replace(/\/+$/, "");
const key = process.argv[3] || "test-key";
if (/crm\.biggbees\.com/i.test(base)) throw new Error("Refusing to run against production.");
const url = base + "/api/internal/alerts";

const call = async (body, { auth = key, raw } = {}) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { "X-API-KEY": auth } : {}) }, body: raw ?? JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const T = Date.now();
const activation = (node) => ({ trigger: { error: { message: 'There was a problem with the trigger node "' + node + '", for that reason did the workflow had to be deactivated', timestamp: T, name: "WorkflowActivationError" }, mode: "trigger" }, workflow: { id: "VERIFY1", name: "Verification Workflow (synthetic)" } });
const ev = (payload, eventId, config) => ({ action: "event", payload, ownWorkflowId: "NOTIFIER", eventId, ...(config ? { config } : {}) });

const results = [];
const check = async (name, fn) => { try { await fn(); results.push("PASS " + name); } catch (e) { results.push("FAIL " + name + " :: " + String(e.message).split("\n")[0]); } };
const run = Date.now().toString(36);

await check("rejects missing / wrong key (401)", async () => {
  assert.equal((await call(ev(activation("n"), "x"), { auth: null })).status, 401);
  assert.equal((await call(ev(activation("n"), "x"), { auth: "wrong" })).status, 401);
});
await check("rejects malformed JSON (400), unknown action (400), invalid settings (400)", async () => {
  assert.equal((await call(null, { raw: "{not json" })).status, 400);
  assert.equal((await call({ action: "delete-everything" })).status, 400);
  assert.equal((await call(ev(activation("n"), "x", { maxEmailsPerHour: 0 }))).status, 400);
  assert.equal((await call(ev(activation("n"), "x", { editorBaseUrl: "http://insecure.example" }))).status, 400);
});
await check("rejects an oversized payload (413)", async () => {
  assert.equal((await call(ev({ huge: "x".repeat(150_000) }, "big"))).status, 413);
});
await check("100 simultaneous identical errors over real HTTP: one incident email + one escalation, exact count", async () => {
  const node = "Concurrent Trigger " + run;
  const rs = await Promise.all(Array.from({ length: 100 }, (_, i) => call(ev(activation(node), `verify-${run}-${i}`))));
  assert.ok(rs.every((r) => r.status === 200 && r.json.ok === true));
  const kinds = rs.filter((r) => r.json.sendEmail).map((r) => r.json.decision.kind).sort();
  assert.deepEqual(kinds, ["incident_started", "repeating"]);
  const counts = rs.map((r) => r.json.decision.incidentCount);
  assert.equal(Math.max(...counts), 100, "all 100 were counted (no lost updates)");
  assert.equal(new Set(counts).size, 100, "every event saw a distinct, ordered count");
  const mail = rs.find((r) => r.json.sendEmail).json.mail;
  assert.match(mail.subject, /^\[Biggbee alert\]\[(WARNING|CRITICAL)\] Verification Workflow \(synthetic\) \//);
  assert.match(mail.text, /Failing node: Concurrent Trigger/);
});
await check("a distinct failure amid the same flood still emails", async () => {
  const r = await call(ev(activation("Another Trigger " + run), "distinct-" + run));
  assert.equal(r.json.sendEmail, true);
  assert.equal(r.json.decision.kind, "incident_started");
});
await check("an HTTP retry (same event id) replays the SAME decision and does not count twice", async () => {
  const id = "retry-" + run, node = "Retry Trigger " + run;
  const first = await call(ev(activation(node), id));
  const retry = await call(ev(activation(node), id));
  assert.equal(first.json.sendEmail, true);
  assert.equal(retry.json.sendEmail, true);
  assert.equal(retry.json.replayed, true);
  assert.equal(retry.json.mail.subject, first.json.mail.subject);
  const next = await call(ev(activation(node), "after-" + id));
  assert.equal(next.json.decision.incidentCount, 2, "the retry did not add an occurrence");
  assert.equal(next.json.sendEmail, false);
});
await check("the notifier's own failure is logged but never emailed", async () => {
  const r = await call(ev({ execution: { id: "1", mode: "error", error: { message: "alert email failed" }, lastNodeExecuted: "Send Alert Email" }, workflow: { id: "NOTIFIER", name: "Biggbee — Error Notifier" } }, "self-" + run));
  assert.equal(r.json.sendEmail, false);
  assert.equal(r.json.log["Error Message"], "alert email failed");
});
await check("concurrent sweeps never double-report (response shape only; nothing is due yet)", async () => {
  const rs = await Promise.all([call({ action: "sweep" }), call({ action: "sweep" }), call({ action: "sweep" })]);
  assert.ok(rs.every((r) => r.status === 200 && Array.isArray(r.json.emails)));
});

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
