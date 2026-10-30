// Child process for atomic.test.mjs: runs one scenario against the REAL json-store and prints JSON.
// Run via: node --conditions=react-server atomic.child.mjs <scenario>   (LOCAL_DATA_DIR = temp dir)
// `--conditions=react-server` is what lets the store's `import "server-only"` load outside Next.
import { updateCollection, readCollection } from "../store/json-store.ts";
import { decideAtomically, sweepAtomically, ALERT_COLLECTION } from "./atomic.mjs";

const T0 = Date.parse("2026-10-30T10:00:00.000Z");
const MIN = 60 * 1000;
const scenario = process.argv[2];
const arg = process.argv[3];
const cfg = process.env.ALERT_CFG ? JSON.parse(process.env.ALERT_CFG) : {};

const activation = (at = T0, node = "Hostinger Email Trigger - Watch Replies") => ({
  trigger: { error: { message: 'There was a problem with the trigger node "' + node + '", for that reason did the workflow had to be deactivated', timestamp: at, name: "WorkflowActivationError" }, mode: "trigger" },
  workflow: { id: "55q30dkVXZGwb8TR", name: "Biggbee AI - Outbound Cold Email System" },
});
const execFailure = (node, execId) => ({
  execution: { id: String(execId), url: "https://n8n.example/workflow/W1/executions/" + execId, mode: "trigger", lastNodeExecuted: node, error: { name: "NodeApiError", message: "Request failed: " + node, httpCode: "502", node: { id: "id-" + node, name: node, type: "n8n-nodes-base.httpRequest" } } },
  workflow: { id: "W1", name: "Some Workflow" },
});
const decide = (payload, eventId, nowMs = T0) => decideAtomically(updateCollection, { payload, ownWorkflowId: "NOTIFIERID", eventId, config: cfg, nowMs });
const sweep = (nowMs) => sweepAtomically(updateCollection, { config: cfg, nowMs });
const emails = (results) => results.filter((r) => r.sendEmail);
const kinds = (results) => emails(results).map((r) => r.decision.kind);
const state = () => readCollection(ALERT_COLLECTION, null);
const out = (o) => console.log(JSON.stringify(o));

if (scenario === "identical") {
  const n = Number(arg);
  const results = await Promise.all(Array.from({ length: n }, (_, i) => decide(activation(), "evt-" + process.pid + "-" + i)));
  const s = state();
  out({ emails: emails(results).length, kinds: kinds(results), incidentCounts: Object.values(s.incidents).map((i) => i.count), incidents: Object.keys(s.incidents).length, rememberedEvents: Object.keys(s.processed).length });
} else if (scenario === "distinct-cap") {
  const n = Number(arg);
  const results = await Promise.all(Array.from({ length: n }, (_, i) => decide(execFailure("Node " + i, i), "d-" + i)));
  const before = state();
  const swept = await sweep(T0 + 5 * MIN);
  const after = state();
  out({ emails: emails(results).length, overflowBeforeSweep: before.overflow.count, digests: swept.emails.filter((e) => /held back/.test(e.mail.subject)).length, digestText: swept.emails.map((e) => e.mail.subject), overflowAfterSweep: after.overflow.count, incidents: Object.keys(after.incidents).length });
} else if (scenario === "mixed") {
  const jobs = [];
  for (let i = 0; i < 20; i++) jobs.push(decide(activation(), "m-same-" + i));
  for (let i = 0; i < 5; i++) jobs.push(decide(execFailure("Distinct " + i, 100 + i), "m-dist-" + i));
  const results = await Promise.all(jobs);
  const subjects = emails(results).map((r) => r.mail.subject);
  out({ emails: emails(results).length, distinctSubjectsEmailed: subjects.filter((s) => /Distinct \d/.test(s)).length, triggerEmails: subjects.filter((s) => /Hostinger/.test(s)).length });
} else if (scenario === "escalation") {
  const n = Number(arg);
  const results = await Promise.all(Array.from({ length: n }, (_, i) => decide(activation(), "e-" + i)));
  out({ kinds: kinds(results), count: Object.values(state().incidents)[0].count });
} else if (scenario === "sweep-twice") {
  await Promise.all(Array.from({ length: 5 }, (_, i) => decide(activation(), "s-" + i)));
  const late = T0 + 250 * MIN;
  const sweeps = await Promise.all([sweep(late), sweep(late), sweep(late)]);
  const wrapups = sweeps.flatMap((s) => s.emails).filter((e) => /Quiet:/.test(e.mail.subject));
  const again = await sweep(late + 60 * MIN);
  out({ wrapupsAcrossConcurrentSweeps: wrapups.length, wrapupsOnLaterSweep: again.emails.length, status: Object.values(state().incidents)[0].status, text: wrapups[0] && wrapups[0].mail.text.split("\n").filter((l) => /Occurrences|inferred/.test(l)) });
} else if (scenario === "retry") {
  const first = await decide(activation(), "same-event");
  const retries = await Promise.all(Array.from({ length: 5 }, () => decide(activation(), "same-event")));
  const s = state();
  out({ firstSendEmail: first.sendEmail, retriesAllSameDecision: retries.every((r) => r.sendEmail === first.sendEmail && r.mail.subject === first.mail.subject && r.replayed === true), count: Object.values(s.incidents)[0].count, firstReplayed: !!first.replayed });
} else if (scenario === "self") {
  const results = await Promise.all([
    decide({ execution: { id: "1", mode: "error", error: { message: "smtp down" }, lastNodeExecuted: "Send Alert Email" }, workflow: { id: "NOTIFIERID", name: "Biggbee — Error Notifier" } }, "self-1"),
    decide({ execution: { id: "2", mode: "error", error: { message: "boom" }, lastNodeExecuted: "X" }, workflow: { id: "OTHER", name: "Other" } }, "self-2"),
  ]);
  const s = state();
  out({ emails: emails(results).length, logged: results.every((r) => r.log["Error Message"]), incidents: Object.keys(s.incidents).length });
} else if (scenario === "state") {
  out(state() ? { incidents: Object.values(state().incidents).map((i) => ({ count: i.count, emails: i.emails })), recentEmails: state().recentEmailTimes.length } : null);
} else {
  throw new Error("unknown scenario " + scenario);
}
