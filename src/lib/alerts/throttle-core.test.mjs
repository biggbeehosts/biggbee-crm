import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as core from "./throttle-core.mjs";

const MIN = 60 * 1000;
const T0 = Date.parse("2026-10-29T00:00:00.000Z");
const OWN = "NOTIFIERID000001";

// ── payload fixtures ─────────────────────────────────────────────────────────────────────────────
// Exactly the shape n8n sent for the 24 real emails (captured from production executions).
const activationPayload = (atMs) => ({
  trigger: { error: { message: 'There was a problem with the trigger node "Hostinger Email Trigger - Watch Replies", for that reason did the workflow had to be deactivated', timestamp: atMs, name: "WorkflowActivationError", context: {} }, mode: "trigger" },
  workflow: { id: "55q30dkVXZGwb8TR", name: "Biggbee AI - Outbound Cold Email System" },
});
const executionPayload = (over = {}) => ({
  execution: {
    id: over.id ?? "31155", url: "https://n8n.example/workflow/ZdiauTxu6K8yF42l/executions/" + (over.id ?? "31155"), mode: "trigger", lastNodeExecuted: over.node ?? "Fetch CRM Rows",
    error: { name: "NodeApiError", message: over.message ?? "Authorization failed - please check your credentials", description: "Unauthorized", httpCode: over.httpCode ?? "401", node: { id: "node-123", name: over.node ?? "Fetch CRM Rows", type: "n8n-nodes-base.httpRequest", parameters: { method: "GET", url: "https://scraper.example.com/api/export/crm-sync?token=SECRET123&x=1" } } },
  },
  workflow: { id: over.workflowId ?? "ZdiauTxu6K8yF42l", name: over.workflowName ?? "Biggbee CRM Sheet Sync" },
});

const ev = (payload, nowMs = T0) => core.normalizeEvent(payload, { nowMs, ownWorkflowId: OWN });
/** feeds events through the state machine like the workflow does, round-tripping state through JSON
 *  between events to prove it survives a restart (n8n persists static data as JSON in its DB). */
function run(events, cfg = {}) {
  let state = core.emptyState();
  const log = [];
  for (const { payload, at } of events) {
    state = JSON.parse(JSON.stringify(state));
    const r = core.applyEvent(state, ev(payload, at), cfg, at);
    state = r.state;
    log.push({ at, kind: r.decision.email && r.decision.email.kind, reason: r.decision.reason, d: r.decision });
  }
  return { state, log, emails: log.filter((l) => l.kind) };
}

// ── normalisation ────────────────────────────────────────────────────────────────────────────────
test("activation payload: node, workflow and real timestamp are extracted; execution fields are 'none', not invented", () => {
  const e = ev(activationPayload(T0 + 5 * MIN));
  assert.equal(e.kind, "activation");
  assert.equal(e.workflowId, "55q30dkVXZGwb8TR");
  assert.equal(e.workflowName, "Biggbee AI - Outbound Cold Email System");
  assert.equal(e.nodeName, "Hostinger Email Trigger - Watch Replies");
  assert.equal(e.executionId, null);
  assert.equal(e.executionUrl, null);
  assert.equal(e.occurredAtMs, T0 + 5 * MIN);
  assert.equal(e.timestampIsFromPayload, true);
  assert.equal(e.selfOrigin, false);
});

test("execution payload: node id/type, http code, service and a URL with the query string stripped", () => {
  const e = ev(executionPayload());
  assert.equal(e.kind, "execution");
  assert.equal(e.nodeName, "Fetch CRM Rows");
  assert.equal(e.nodeId, "node-123");
  assert.equal(e.httpCode, "401");
  assert.equal(e.executionId, "31155");
  assert.equal(e.service, "scraper.example.com");
  assert.equal(e.operation, "GET scraper.example.com/api/export/crm-sync");
  assert.doesNotMatch(JSON.stringify(e), /SECRET123/);
});

test("malformed or empty payloads never throw and never invent facts", () => {
  for (const bad of [undefined, null, 42, "x", [], {}, { workflow: 5 }, { execution: {} }, { trigger: {} }]) {
    const e = core.normalizeEvent(bad, { nowMs: T0 });
    assert.ok(["unknown", "execution", "activation"].includes(e.kind));
    assert.equal(e.timestampIsFromPayload, false);
  }
  const e = core.normalizeEvent({}, { nowMs: T0 });
  assert.equal(e.workflowId, null);
  assert.equal(e.message, null);
});

test("fingerprint ignores volatile ids/numbers/urls but separates different nodes, workflows and errors", () => {
  const a = core.fingerprint(ev(executionPayload({ id: "1", message: "Request failed with status code 502 for job 123" })));
  const b = core.fingerprint(ev(executionPayload({ id: "2", message: "Request failed with status code 502 for job 987" })));
  assert.equal(a, b);
  assert.notEqual(a, core.fingerprint(ev(executionPayload({ node: "Other Node" }))));
  assert.notEqual(a, core.fingerprint(ev(executionPayload({ workflowId: "OTHER" }))));
  assert.notEqual(a, core.fingerprint(ev(executionPayload({ message: "Timeout while connecting" }))));
});

// ── the real incident: replay the 24 production alerts ───────────────────────────────────────────
const REAL = [
  "10-16T02:19", "10-16T02:19", "10-19T14:37", "10-19T15:04", "10-19T16:42", "10-21T04:04", "10-21T05:03", "10-21T05:03", "10-21T05:03", "10-23T01:39", "10-23T01:39", "10-23T03:05",
  "10-23T04:41", "10-24T05:42", "10-26T04:46", "10-26T04:46", "10-28T02:16", "10-28T02:16", "10-29T04:22", "10-29T11:03", "10-29T11:04", "10-29T11:08", "10-29T14:31", "10-29T14:36",
].map((s) => Date.parse("2026-" + s + ":00.000Z"));

test("replaying the 24 real IMAP-drop alerts: fewer emails, every drop still recorded, and a wrap-up covers every folded cluster", () => {
  assert.equal(REAL.length, 24);
  // the notifier's 30-minute schedule runs the sweeper; replay it faithfully between events
  let state = core.emptyState();
  let starts = 0, other = 0, wraps = 0, folded = 0, logged = 0;
  const sweepTo = (to) => { for (let t = (state.lastSweepAt || REAL[0]) + 30 * MIN; t <= to; t += 30 * MIN) { const s = core.sweep(JSON.parse(JSON.stringify(state)), {}, t); state = s.state; state.lastSweepAt = t; wraps += s.emails.filter((e) => e.kind === "ended").length; } };
  for (const at of REAL) {
    sweepTo(at);
    state = JSON.parse(JSON.stringify(state));
    const r = core.applyEvent(state, ev(activationPayload(at), at), {}, at);
    state = r.state;
    logged += 1; // the workflow logs every event to the Errors sheet unconditionally (asserted in the workflow test)
    if (!r.decision.email) folded += 1;
    else if (r.decision.email.kind === "incident_started") starts += 1;
    else other += 1;
  }
  sweepTo(REAL[REAL.length - 1] + 24 * 60 * MIN);
  assert.equal(logged, 24);
  assert.equal(starts + other + folded, 24, "no event is unaccounted for");
  assert.ok(starts < 24 && starts <= 11, "incident-start emails: " + starts);
  assert.ok(folded >= 13, "folded: " + folded);
  assert.ok(starts + other + wraps < 24, "total emails including wrap-ups must still be below the 24 sent today; got " + (starts + other + wraps));
  assert.equal(Object.values(state.incidents).every((i) => i.status === "closed"), true);
  console.log("      real replay: 24 alerts -> " + starts + " incident emails + " + wraps + " wrap-ups = " + (starts + other + wraps) + " (" + folded + " drops folded into incidents; all 24 still logged)");
});

test("a burst of drops inside one hour yields ONE email, not one per drop", () => {
  const burst = [0, 1, 5].map((m) => ({ payload: activationPayload(T0 + m * MIN), at: T0 + m * MIN })); // the real 11:03/11:04/11:08 pattern
  const { emails } = run(burst);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].kind, "incident_started");
});

// ── distinct failures stay visible ───────────────────────────────────────────────────────────────
test("distinct failures are never folded together, even in the same minute", () => {
  const cases = [
    executionPayload({ node: "Node A" }),
    executionPayload({ node: "Node B" }),
    executionPayload({ node: "Node A", message: "A different error" }),
    executionPayload({ node: "Node A", workflowId: "OTHER", workflowName: "Other workflow" }),
    activationPayload(T0),
  ];
  const { emails } = run(cases.map((payload) => ({ payload, at: T0 })));
  assert.equal(emails.length, 5);
  assert.ok(emails.every((e) => e.kind === "incident_started"));
});

test("an identical repeat is suppressed; the same error after a quiet period starts a NEW incident and emails again", () => {
  const events = [
    { payload: executionPayload(), at: T0 },
    { payload: executionPayload({ id: "2" }), at: T0 + 10 * MIN },
    { payload: executionPayload({ id: "3" }), at: T0 + 20 * MIN },
    { payload: executionPayload({ id: "4" }), at: T0 + 20 * MIN + 200 * MIN }, // > 180 min of quiet
  ];
  const { emails, log } = run(events);
  assert.deepEqual(log.map((l) => l.kind), ["incident_started", null, null, "incident_started"]);
  assert.equal(emails.length, 2);
});

// ── continued failures: summary, escalation ──────────────────────────────────────────────────────
test("a failure repeating every 15 minutes for a day: start + one escalation + periodic summaries instead of 96 emails", () => {
  const events = Array.from({ length: 96 }, (_, i) => ({ payload: executionPayload({ id: String(i) }), at: T0 + i * 15 * MIN }));
  const { emails, state } = run(events);
  const kinds = emails.map((e) => e.kind);
  assert.equal(kinds[0], "incident_started");
  assert.equal(kinds[1], "repeating");
  assert.ok(kinds.slice(2).every((k) => k === "continued"));
  assert.ok(emails.length >= 4 && emails.length <= 7, "got " + emails.length);
  assert.equal(Object.values(state.incidents)[0].count, 96, "every occurrence is still counted");
  console.log("      96 identical failures -> " + emails.length + " emails: " + kinds.join(", "));
});

test("flapping escalation fires once per incident and marks it critical", () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ payload: activationPayload(T0 + i * 2 * MIN), at: T0 + i * 2 * MIN }));
  const { emails } = run(events, { flapThreshold: 5 });
  assert.equal(emails.filter((e) => e.kind === "repeating").length, 1);
  const rendered = core.renderEmail("repeating", Object.values(run(events, { flapThreshold: 5 }).state.incidents)[0], ev(activationPayload(T0)), {}, T0 + 30 * MIN);
  assert.match(rendered.subject, /\[CRITICAL\]/);
});

// ── recursion / loops ────────────────────────────────────────────────────────────────────────────
test("the notifier never emails about its own failures or about failures inside an error workflow run", () => {
  const own = run([{ payload: { execution: { id: "9", mode: "error", error: { message: "SMTP down", node: { name: "Send Alert Email" } }, lastNodeExecuted: "Send Alert Email" }, workflow: { id: OWN, name: "Biggbee — Error Notifier" } }, at: T0 }]);
  assert.equal(own.emails.length, 0);
  assert.match(own.log[0].reason, /self-origin/);
  const inErrorRun = run([{ payload: { ...executionPayload(), execution: { ...executionPayload().execution, mode: "error" } }, at: T0 }]);
  assert.equal(inErrorRun.emails.length, 0);
  const sameWorkflowId = run([{ payload: { ...executionPayload(), workflow: { id: OWN, name: "x" } }, at: T0 }]);
  assert.equal(sameWorkflowId.emails.length, 0);
  assert.deepEqual(Object.keys(own.state.incidents), [], "self events leave no incident state");
});

// ── flood cap ────────────────────────────────────────────────────────────────────────────────────
test("flood cap: distinct failures beyond the hourly cap are rolled into one digest, none lost", () => {
  const events = Array.from({ length: 15 }, (_, i) => ({ payload: executionPayload({ node: "Node " + i }), at: T0 }));
  const { state, emails } = run(events, { maxEmailsPerHour: 10 });
  assert.equal(emails.length, 10);
  assert.equal(state.overflow.count, 5);
  const swept = core.sweep(JSON.parse(JSON.stringify(state)), { maxEmailsPerHour: 10 }, T0 + 5 * MIN);
  const digest = swept.emails.find((e) => e.kind === "digest");
  assert.ok(digest);
  assert.equal(digest.overflow.count, 5);
  assert.equal(digest.overflow.fingerprints.length, 5);
  assert.equal(swept.state.overflow.count, 0, "digest clears the backlog");
  assert.match(core.renderEmail("digest", digest.overflow, null, {}, T0).text, /held back/);
});

// ── sweeper: closing and wrap-ups ────────────────────────────────────────────────────────────────
test("sweeper closes quiet incidents; only incidents that repeated get a wrap-up, and only once", () => {
  const events = [
    { payload: executionPayload({ node: "Repeats" }), at: T0 },
    { payload: executionPayload({ node: "Repeats" }), at: T0 + 5 * MIN },
    { payload: executionPayload({ node: "Repeats" }), at: T0 + 10 * MIN },
    { payload: executionPayload({ node: "Once only" }), at: T0 },
  ];
  const { state } = run(events);
  const early = core.sweep(JSON.parse(JSON.stringify(state)), {}, T0 + 60 * MIN);
  assert.equal(early.emails.length, 0, "still inside the quiet window");
  const late = core.sweep(JSON.parse(JSON.stringify(early.state)), {}, T0 + 10 * MIN + 181 * MIN);
  assert.deepEqual(late.emails.map((e) => e.kind), ["ended"]);
  assert.equal(late.emails[0].incident.node, "Repeats");
  assert.equal(late.emails[0].incident.count, 3);
  assert.ok(Object.values(late.state.incidents).every((i) => i.status === "closed"));
  const again = core.sweep(JSON.parse(JSON.stringify(late.state)), {}, T0 + 24 * 60 * MIN);
  assert.equal(again.emails.length, 0, "no repeat wrap-ups");
});

test("recovery: after an incident closes, the same error becomes a fresh incident and emails again", () => {
  const first = run([{ payload: executionPayload(), at: T0 }, { payload: executionPayload(), at: T0 + 5 * MIN }]);
  const swept = core.sweep(JSON.parse(JSON.stringify(first.state)), {}, T0 + 400 * MIN);
  const again = core.applyEvent(swept.state, ev(executionPayload(), T0 + 500 * MIN), {}, T0 + 500 * MIN);
  assert.equal(again.decision.email.kind, "incident_started");
  assert.equal(again.decision.incident.count, 1);
});

test("old closed incidents are pruned after the retention period", () => {
  const { state } = run([{ payload: executionPayload(), at: T0 }]);
  const closed = core.sweep(JSON.parse(JSON.stringify(state)), { retentionDays: 14 }, T0 + 4 * 60 * MIN);
  assert.equal(Object.keys(closed.state.incidents).length, 1);
  const pruned = core.sweep(JSON.parse(JSON.stringify(closed.state)), { retentionDays: 14 }, T0 + 20 * 24 * 60 * MIN);
  assert.equal(Object.keys(pruned.state.incidents).length, 0);
});

test("persistence: state survives JSON round-trips (a restart) and a corrupted/old state is reset safely", () => {
  const events = [0, 3, 6].map((m) => ({ payload: executionPayload(), at: T0 + m * MIN }));
  const { emails } = run(events); // run() round-trips state through JSON before every event
  assert.equal(emails.length, 1);
  for (const broken of [undefined, null, {}, { version: 99 }, "garbage"]) {
    const r = core.applyEvent(broken, ev(executionPayload()), {}, T0);
    assert.equal(r.decision.email.kind, "incident_started", "fails open: a bad state means the alert is sent");
  }
});

// ── what the emails say (and refuse to say) ──────────────────────────────────────────────────────
const render = (payload, kind = "incident_started", count = 1, over = {}) => {
  const e = ev(payload);
  const inc = Object.assign({ count, firstAt: T0, lastAt: T0, countSinceEmail: 0, escalated: false, workflowName: e.workflowName, node: e.nodeName }, over);
  return core.renderEmail(kind, inc, e, {}, T0 + MIN);
};

test("activation email: names the workflow, id, node and real time; says what is NOT known instead of claiming an outage", () => {
  const m = render(activationPayload(Date.parse("2026-10-29T14:36:22.454Z")));
  assert.match(m.subject, /^\[Biggbee alert\]\[WARNING\] Biggbee AI - Outbound Cold Email System \/ Hostinger Email Trigger - Watch Replies$/);
  for (const needle of [
    "Workflow: Biggbee AI - Outbound Cold Email System (id 55q30dkVXZGwb8TR)",
    "Failing node: Hostinger Email Trigger - Watch Replies (id unavailable)",
    "Execution: none -- activation errors occur outside an execution; workflow: https://n8n.srv1787796.hstgr.cloud/workflow/55q30dkVXZGwb8TR",
    "Time: 2026-10-29T14:36:22.454Z",
    "There was a problem with the trigger node",
    "Underlying cause: unavailable in the error payload",
    "Retries: automatic reactivation scheduled by n8n",
    "Next action: If no further alerts follow",
  ]) assert.ok(m.text.includes(needle), "missing: " + needle);
  assert.doesNotMatch(m.text, /Unknown node|everything|all services|down\b/i);
});

test("execution email: node id, http code, service, operation, execution id AND link, and a specific next action", () => {
  const m = render(executionPayload());
  assert.match(m.subject, /\[CRITICAL\] Biggbee CRM Sheet Sync \/ Fetch CRM Rows/);
  for (const needle of ["Failing node: Fetch CRM Rows (id node-123)", "Execution: 31155 -- https://n8n.example/workflow/ZdiauTxu6K8yF42l/executions/31155", "(HTTP 401)", "Affected service: scraper.example.com", "Operation: GET scraper.example.com/api/export/crm-sync", "Authorization failed: check or reconnect the credential"])
    assert.ok(m.text.includes(needle), "missing: " + needle);
  assert.doesNotMatch(m.text, /SECRET123/);
});

test("fields that the payload cannot supply are labelled 'unavailable', never guessed", () => {
  const m = core.renderEmail("incident_started", { count: 1, firstAt: T0, lastAt: T0, countSinceEmail: 0 }, core.normalizeEvent({}, { nowMs: T0 }), {}, T0);
  assert.match(m.text, /Workflow: unavailable \(id unavailable\)/);
  assert.match(m.text, /Failing node: unavailable/);
  assert.match(m.text, /Affected service: unavailable/);
  assert.match(m.text, /Operation: unavailable/);
  assert.match(m.text, /payload carried no timestamp/);
});

test("repeat and wrap-up emails state counts and that recovery is inferred, not confirmed", () => {
  const repeat = render(activationPayload(T0), "continued", 9, { countSinceEmail: 6, firstAt: T0 - 600 * MIN });
  assert.match(repeat.text, /9 occurrence\(s\)/);
  assert.match(repeat.text, /6 since the last email/);
  assert.match(repeat.text, /transient so far -- 8 earlier drop\(s\)/);
  const ended = core.renderEmail("ended", { workflowName: "W", workflowId: "id1", node: "N", message: "m", count: 4, firstAt: T0, lastAt: T0 + 30 * MIN, kind: "activation" }, null, {}, T0 + 300 * MIN);
  assert.match(ended.text, /inferred from silence/);
  assert.match(ended.text, /cannot confirm that the trigger is currently active/);
  assert.doesNotMatch(ended.text, /recovered/i);
});

test("HTML parts escape content and carry no logos, images or links beyond the text", () => {
  const e = ev(executionPayload({ message: "<script>alert(1)</script> & more" }));
  const m = core.renderEmail("incident_started", { count: 1, firstAt: T0, lastAt: T0, countSinceEmail: 0, workflowName: "W", node: "N" }, e, {}, T0);
  assert.doesNotMatch(m.html, /<script>|<img|<a /i);
  assert.match(m.html, /&lt;script&gt;/);
});

test("sandbox compatibility: the core uses no globals missing from n8n's Code-node runner (found by a real n8n run: URL)", () => {
  const src = fs.readFileSync(new URL("./throttle-core.mjs", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /new URL\(|URLSearchParams|require\(|import\(|process\.|fetch\(/);
});

test("safeUrl keeps host+path and drops query strings, fragments and expressions", () => {
  assert.equal(core.safeUrl("https://scraper.example.com/api/export/crm-sync?token=SECRET#x"), "scraper.example.com/api/export/crm-sync");
  assert.equal(core.safeUrl("http://host:8080/a/b"), "host:8080/a/b");
  assert.equal(core.safeUrl("={{ $json.url }}"), null);
  assert.equal(core.safeUrl("not a url"), null);
  assert.equal(core.safeUrl(undefined), null);
});

test("an execution id without a URL is not dressed up with the workflow link as if it were the execution link", () => {
  const p = executionPayload();
  delete p.execution.url;
  const m = render(p);
  assert.match(m.text, /Execution: 31155 -- execution link unavailable; workflow: https:\/\/n8n\.srv1787796\.hstgr\.cloud\/workflow\/ZdiauTxu6K8yF42l/);
});
