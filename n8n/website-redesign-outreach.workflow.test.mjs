// Tests for n8n/website-redesign-outreach.workflow.json (regenerate it with
// `node scripts/build-redesign-workflow.mjs`). Run with: node --test n8n/
//
// Two layers:
//   1. structure -- the graph is wired the way the safety design requires;
//   2. behaviour -- every Code node is executed against mocked n8n inputs ($input / $('Node')),
//      so planning, screenshot gating, claim checks, live-preview matching and SMTP-error
//      handling are exercised without n8n, Google, OpenAI or a mailbox.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, "website-redesign-outreach.workflow.json"), "utf8"));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

// ───────────── helpers ─────────────
function successors(name) {
  const out = [];
  for (const arr of Object.values(wf.connections[name] ?? {})) for (const port of arr) for (const c of port) out.push(c.node);
  return out;
}
function reachable(from, without) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n) || n === without) continue;
    seen.add(n);
    for (const s of successors(n)) stack.push(s);
  }
  return seen;
}

/** Runs a Code node's jsCode with a mocked n8n context. */
function runCode(name, { input = [], nodes = {} } = {}) {
  const toItem = (j) => (j && typeof j === "object" && "json" in j ? j : { json: j });
  const lookup = (n) => (nodes[n] ?? []).map(toItem);
  const $ = (n) => ({ first: () => lookup(n)[0], all: () => lookup(n), item: lookup(n)[0] });
  const inputItems = input.map(toItem);
  const $input = { first: () => inputItems[0], all: () => inputItems, item: inputItems[0] };
  const fn = new Function("$input", "$", "$execution", byName[name].parameters.jsCode);
  return fn($input, $, { id: "exec-1" });
}

const REQ = { campaignId: "RDC-000001", workspaceId: "biggbee", runId: "11111111-2222-3333-4444-555555555555", mode: "dry", resume: false };
const WORKSPACE = { workspaceId: "biggbee", workspaceName: "Biggbee AI", senderDisplayName: "Biggbee AI", senderEmail: "office@biggbees.com", replyToEmail: "office@biggbees.com", website: "https://www.biggbees.com/", signatureName: "Biggbee AI", signatureWebsite: "https://www.biggbees.com/" };
const SETTINGS = { delaySeconds: 120, maxScreenshots: 4, maxFileBytes: 4194304, maxTotalBytes: 10485760, ignoreNonImageFiles: false, hourlyLimit: 10, dailyLimit: 40, maxPerRun: 50, bounceRateThreshold: 0.05, minSampleForBounce: 20, maxConsecutiveErrors: 3 };
const cfg = (over = {}) => ({ mode: "dry", workspace: WORKSPACE, sheet: { id: "SHEET", leadsTab: "Leads", trackingTab: "Tracking" }, driveFolderId: "ROOT", columnMap: { businessName: "Name", email: "Email", businessType: "Type", website: "Site", verifiedPreserved: "Kept", bookingFormIncluded: "Booking" }, eligibleStatuses: [], settings: SETTINGS, suppressedEmails: [], signals: {}, ...over });
const unpack = (over) => [{ json: { req: REQ, cfg: cfg(over) } }];

// ───────────── structure ─────────────
test("is a dedicated, inactive workflow with its own webhook path", () => {
  assert.equal(wf.name, "Biggbee AI — Website Redesign Outreach");
  assert.equal(wf.active, false);
  const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(hook.parameters.path, "biggbee/website-redesign/start");
  assert.notEqual(hook.parameters.path, "biggbee/run-campaign");
  assert.equal(hook.parameters.authentication, "headerAuth");
});

test("every connection points at a real node, and every node is reachable from the webhook", () => {
  for (const [from, ports] of Object.entries(wf.connections)) {
    assert.ok(byName[from], "unknown source " + from);
    for (const arr of Object.values(ports)) for (const port of arr) for (const c of port) assert.ok(byName[c.node], from + " -> unknown " + c.node);
  }
  const seen = reachable("Redesign Webhook");
  // sub-nodes (model / parser) attach to the agent via ai_* connections, not main
  const orphans = wf.nodes.map((n) => n.name).filter((n) => !seen.has(n) && !/OpenAI Chat Model|Output Parser/.test(n));
  assert.deepEqual(orphans, []);
});

test("no secrets or environment-specific ids are baked into the workflow", () => {
  const text = JSON.stringify(wf);
  assert.doesNotMatch(text, /1lpW8cRAQqfsZSN1XBMBO0_BMhwg_fZ13lPxyhF1LW5Q/); // the general CRM sheet
  assert.doesNotMatch(text, /sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|BEGIN PRIVATE KEY/);
  assert.doesNotMatch(text, /(^|\W)export (function|const) /); // the core was inlined, not imported
  assert.doesNotMatch(text, /run-campaign|refresh-kb/); // never the general webhooks
});

test("the only send node is reachable solely through the workspace SMTP route and the pre-send claim", () => {
  const senders = wf.nodes.filter((n) => n.type === "n8n-nodes-base.emailSend");
  assert.equal(senders.length, 1);
  const send = senders[0].name;
  assert.equal(byName[send].retryOnFail, false, "sends must never auto-retry");
  assert.equal(byName[send].onError, "continueErrorOutput");
  for (const gate of ["Route by Workspace SMTP", "Prepare Claim", "Mark Sending", "Preview Approved?", "CRM Check Control", "Is Dry Run?"]) {
    assert.ok(!reachable("Redesign Webhook", gate).has(send), `send is reachable without passing "${gate}"`);
  }
  // The dry branch loops back to the next business, so graph reachability cannot separate the
  // modes; what guarantees "dry never sends" is that the live branch is entered ONLY through the
  // false output of "Is Dry Run?" (mode === 'dry' is true), and nothing else leads into it.
  const incoming = (target) => wf.nodes.map((n) => n.name).filter((n) => successors(n).includes(target));
  assert.deepEqual(incoming("Resolve Approved Preview"), ["Is Dry Run?"]);
  const dryOut = wf.connections["Is Dry Run?"].main;
  assert.deepEqual(dryOut[0].map((c) => c.node), ["Prepare Writer Input"]);
  assert.deepEqual(dryOut[1].map((c) => c.node), ["Resolve Approved Preview"]);
  assert.match(byName["Is Dry Run?"].parameters.conditions.conditions[0].leftValue, /mode === 'dry'/);
  assert.deepEqual(incoming("Route by Workspace SMTP"), ["Preview Approved?"]);
});

test("SMTP credential is only the existing Biggbee one and only on the routed send node", () => {
  const withSmtp = wf.nodes.filter((n) => n.credentials?.smtp);
  assert.deepEqual(withSmtp.map((n) => n.name), ["Send Redesign Email - Biggbee SMTP"]);
  assert.equal(withSmtp[0].credentials.smtp.id, "vEtw2lRmEd0lQJhT");
  const sw = byName["Route by Workspace SMTP"];
  assert.equal(sw.parameters.options.fallbackOutput, "extra");
  assert.deepEqual(successors("Route by Workspace SMTP").sort(), ["No SMTP Route", "Prepare Claim"]);
});

test("the claim is written before the send, and attachments are restored only afterwards", () => {
  assert.deepEqual(successors("Prepare Claim"), ["Mark Sending"]);
  assert.ok(successors("Mark Sending").includes("Restore Attachments"));
  assert.ok(successors("Mark Sending").includes("Claim Failed"));
  assert.deepEqual(successors("Restore Attachments"), ["Send Redesign Email - Biggbee SMTP"]);
});

test("every Code node parses, and Code nodes that use the core inline it", () => {
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(() => new Function("$input", "$", "$execution", n.parameters.jsCode), n.name);
    if (/\bCore\./.test(n.parameters.jsCode)) assert.match(n.parameters.jsCode, /const Core = \(function/, n.name + " uses Core without inlining it");
  }
});

test("pacing, delay and loop: one business at a time, delay uses seconds, control checked before each business", () => {
  assert.equal(byName["Next Business"].parameters.batchSize, 1);
  assert.equal(byName["Delay Between Sends"].parameters.unit, "seconds");
  assert.deepEqual(successors("CRM Check Control"), ["Decide Continue"]);
  assert.ok(successors("Nothing To Do?").includes("CRM Check Control"));
});

// ───────────── behaviour: validation / begin ─────────────
test("Validate Request rejects malformed or forged requests", () => {
  const ok = runCode("Validate Request", { input: [{ body: REQ }] });
  assert.equal(ok[0].json.campaignId, "RDC-000001");
  for (const bad of [{ ...REQ, campaignId: "../x" }, { ...REQ, workspaceId: "Bad Id" }, { ...REQ, runId: "x" }, { ...REQ, mode: "send" }, null]) {
    assert.throws(() => runCode("Validate Request", { input: [{ body: bad }] }), /Invalid Website Redesign request/);
  }
});

// ───────────── behaviour: planning ─────────────
const leadRow = (over = {}) => ({ Name: "Al Shami", Email: "owner@alshami.example", Type: "Restaurant", Site: "https://alshami.example", Kept: "", Booking: "", ...over });
const plan = (rows, folders, extra = {}) =>
  runCode("Plan Run", {
    nodes: {
      "Unpack Run Config": unpack(extra.cfg),
      "Read Redesign Leads": rows,
      "Read Tracking": extra.tracking ?? [{}],
      "List Business Folders": [{ files: folders, nextPageToken: extra.nextPageToken }],
    },
  });

test("Plan Run matches by exact name and flags every unsafe case instead of sending", () => {
  const rows = [
    leadRow(),
    leadRow({ Name: "Pizza Rom", Email: "pizza@x.example" }), // near-miss: no fuzzy matching
    leadRow({ Name: "Cafe Rio", Email: "rio@x.example" }), // two folders with this name
    leadRow({ Name: "Gone Co", Email: "bad-email" }),
    leadRow({ Name: "Quiet Co", Email: "quiet@x.example" }), // suppressed
  ];
  const folders = [{ id: "f1", name: "Al Shami" }, { id: "f2", name: "Pizza Roma" }, { id: "f3", name: "Cafe Rio" }, { id: "f4", name: "cafe rio" }];
  const out = plan(rows, folders, { cfg: { suppressedEmails: ["quiet@x.example"] } });
  const byBiz = Object.fromEntries(out.map((i) => [i.json.businessName, i.json]));
  assert.equal(byBiz["Al Shami"].folderId, "f1");
  assert.ok(!byBiz["Al Shami"].blocked && !byBiz["Al Shami"].skipped);
  assert.equal(byBiz["Pizza Rom"].blocked, true);
  assert.equal(byBiz["Cafe Rio"].blocked, true);
  assert.match(byBiz["Cafe Rio"].blockReason, /folders are named like/);
  assert.equal(byBiz["Gone Co"].skipped, true);
  assert.match(byBiz["Quiet Co"].blockReason, /suppression/);
  assert.deepEqual(out[0].json.plan, { discovered: 5, eligible: 3, matched: 1, blocked: 2, toProcess: 5 });
});

test("Plan Run never lets two businesses share one folder", () => {
  const rows = [leadRow({ Name: "Same", Email: "a@x.example" }), leadRow({ Name: "Same", Email: "b@x.example" })];
  const out = plan(rows, [{ id: "f1", name: "Same" }]);
  assert.ok(out.every((i) => i.json.blocked || i.json.skipped));
  assert.ok(out.every((i) => !i.json.folderId));
});

test("Plan Run reports setup problems instead of guessing", () => {
  assert.match(plan([leadRow()], [], { cfg: { columnMap: { businessName: "Name", email: "E-mail" } } })[0].json.planError, /E-mail/);
  assert.match(plan([leadRow()], [], { nextPageToken: "more" })[0].json.planError, /more than 1000/);
  const resp = runCode("Plan Run", { nodes: { "Unpack Run Config": unpack(), "Read Redesign Leads": [{}], "Read Tracking": [{}], "List Business Folders": [{ error: { code: 403 } }] } });
  assert.match(resp[0].json.planError, /Drive main folder/);
  assert.equal(plan([{}], [])[0].json.noWork, true); // empty sheet = nothing to do, not an error
});

test("live planning skips businesses already sent / in progress / permanently failed, but retries transient failures", () => {
  const rows = [1, 2, 3, 4].map((n) => leadRow({ Name: "B" + n, Email: `b${n}@x.example` }));
  const folders = [1, 2, 3, 4].map((n) => ({ id: "f" + n, name: "B" + n }));
  const t = (n, status, extra = {}) => ({ campaignKey: "k" + n, workspaceId: "biggbee", campaignId: "RDC-000001", businessKey: `b${n}@x.example`, mode: "live", status, ...extra });
  const out = plan(rows, folders, { cfg: { mode: "live" }, tracking: [t(1, "sent"), t(2, "sending"), t(3, "failed", { failureKind: "permanent" }), t(4, "failed", { failureKind: "transient" })] });
  assert.deepEqual(out.map((i) => i.json.businessName), ["B4"]);
});

test("Plan Run caps the run size", () => {
  const rows = Array.from({ length: 5 }, (_, n) => leadRow({ Name: "B" + n, Email: `b${n}@x.example` }));
  const folders = rows.map((r) => ({ id: "f" + r.Name, name: r.Name }));
  const out = plan(rows, folders, { cfg: { settings: { ...SETTINGS, maxPerRun: 2 } } });
  assert.equal(out.length, 2);
});

// ───────────── behaviour: control / rate decision ─────────────
const w0 = { businessKey: "a", businessName: "A", email: "a@x.example", mode: "dry" };
const decide = (resp, over = {}, w = w0) => runCode("Decide Continue", { input: [resp], nodes: { "Next Business": [w], "Unpack Run Config": unpack(over) } })[0].json.decision;

test("Decide Continue fails closed when the CRM is unreachable or the campaign isn't running", () => {
  assert.equal(decide({ error: "x" }).action, "pause");
  assert.equal(decide({ ok: true, status: "pausing" }).action, "stop");
  assert.equal(decide({ ok: true, status: "cancelled" }).action, "stop");
  assert.equal(decide({ ok: true, status: "running" }).action, "send");
});

test("Decide Continue enforces hourly/daily limits (including the general campaigns' sends), bounces and errors in live mode", () => {
  const live = { mode: "live" };
  const w = { ...w0, mode: "live" };
  const healthy = { ok: true, status: "running", sentLastHour: 0, sentLastDay: 0, externalSentLastHour: 0, externalSentLastDay: 0, bounceRate: 0, bounceSample: 0, complaints: 0, consecutiveErrors: 0 };
  assert.equal(decide(healthy, live, w).action, "send");
  assert.equal(decide({ ...healthy, sentLastHour: 4, externalSentLastHour: 6 }, live, w).action, "pause");
  assert.equal(decide({ ...healthy, sentLastDay: 40 }, live, w).action, "pause");
  assert.equal(decide({ ...healthy, bounceRate: 0.2, bounceSample: 50 }, live, w).action, "pause");
  assert.equal(decide({ ...healthy, complaints: 1 }, live, w).action, "pause");
  assert.equal(decide({ ...healthy, consecutiveErrors: 3 }, live, w).action, "pause");
  // dry runs send nothing, so rate limits don't apply
  assert.equal(decide({ ...healthy, sentLastHour: 99 }, {}, w0).action, "send");
});

// ───────────── behaviour: screenshots ─────────────
const biz = { ...w0, businessName: "Al Shami", folderId: "f1" };
const validate = (resp, over) => runCode("Validate Screenshots", { input: [resp], nodes: { "Decide Continue": [{ w: biz, decision: { action: "send" } }], "Unpack Run Config": unpack(over) } })[0].json;
const png = (id, name, size = 1000) => ({ id, name, mimeType: "image/png", size: String(size) });

test("Validate Screenshots accepts several images and blocks anything doubtful", () => {
  const ok = validate({ files: [png("1", "b.png"), png("2", "a.png")] });
  assert.equal(ok.outcome, null);
  assert.deepEqual(ok.w.screenshots.map((f) => f.name), ["a.png", "b.png"]);
  assert.match(validate({ files: [] }).outcome.reason, /empty/);
  assert.match(validate({ files: [png("1", "a.png"), { id: "2", name: "n.txt", mimeType: "text/plain", size: "5" }] }).outcome.reason, /n\.txt/);
  assert.equal(validate({ error: { code: 404 } }).outcome.status, "blocked");
  assert.match(validate({ files: [png("1", "a.png")], nextPageToken: "t" }).outcome.reason, /more files/);
});

test("Collect Attachments blocks the email when ANY screenshot failed to download", () => {
  const w = { ...biz, screenshots: [{ id: "1", name: "a.png", mimeType: "image/png" }, { id: "2", name: "b.png", mimeType: "image/png" }] };
  const files = w.screenshots.map((f) => ({ json: f }));
  const good = (n) => ({ json: {}, binary: { data: { data: "x", fileName: n } } });
  const nodes = { "Validate Screenshots": [{ w }], "Expand Files": files };
  const ok = runCode("Collect Attachments", { input: [good("1"), good("2")], nodes })[0];
  assert.equal(ok.json.outcome, null);
  assert.deepEqual(Object.keys(ok.binary), ["screenshot_0", "screenshot_1"]);
  assert.deepEqual(ok.json.w.attachmentNames, ["a.png", "b.png"]);
  const bad = runCode("Collect Attachments", { input: [good("1"), { json: { error: "403" } }], nodes })[0];
  assert.equal(bad.json.outcome.status, "blocked");
  assert.match(bad.json.outcome.reason, /Could not download "b\.png"/);
});

// ───────────── behaviour: email generation guardrails ─────────────
const writerW = (over = {}) => ({ ...biz, businessType: "Restaurant", website: "https://www.alshami.example", attachmentNames: ["a.png", "b.png"], attachmentFingerprint: "1|2", verifiedPreserved: "", bookingFormIncluded: null, ...over });
const compose = (agentOutput, wOver) => runCode("Compose Email", { input: [{ output: agentOutput }], nodes: { "Prepare Writer Input": [{ w: writerW(wOver) }], "Unpack Run Config": unpack() } })[0].json;
const REFERENCE = "Hi there,\n\nI came across the Al Shami website recently. The restaurant has such a great story, but the site didn't really do it justice, so I took a shot at redesigning it. I've attached a few screenshots.\n\nI kept your menu, prices, opening hours and contact details, and added a simple online booking form. I just wanted to show what it could look like.\n\nIf you like it, I'd be happy to set it up properly for you, and I'm glad to adjust anything. If not, no worries at all.";

test("Prepare Writer Input tells the model exactly what is and isn't verified", () => {
  const none = runCode("Prepare Writer Input", { input: [{ w: writerW() }] })[0].json.writerInput;
  assert.match(none, /Business name: Al Shami/);
  assert.match(none, /Screenshots attached: 2/);
  assert.match(none, /Verified details kept from the real site: NONE/);
  assert.match(none, /booking form verified as included: no/);
  const all = runCode("Prepare Writer Input", { input: [{ w: writerW({ verifiedPreserved: "menu, prices and opening hours", bookingFormIncluded: true }) }] })[0].json.writerInput;
  assert.match(all, /kept from the real site: menu, prices and opening hours/);
  assert.match(all, /included: yes/);
});

test("Compose Email: the reference-style claims are allowed only when verified", () => {
  const verified = compose({ subject: "A fresh look for Al Shami", body: REFERENCE }, { verifiedPreserved: "menu, prices, opening hours and contact details", bookingFormIncluded: true });
  assert.equal(verified.outcome.status, "previewed");
  assert.equal(verified.outcome.usedFallback, false);
  assert.match(verified.w.mail.text, /Best regards,\nBiggbee AI\nwww\.biggbees\.com$/);

  const unverified = compose({ subject: "A fresh look for Al Shami", body: REFERENCE });
  assert.equal(unverified.outcome.status, "previewed");
  assert.equal(unverified.outcome.usedFallback, true, "unverified preserved-details/booking claims must trigger the safe wording");
  assert.doesNotMatch(unverified.w.mail.text, /booking|prices|opening hours/i);
  assert.match(unverified.w.mail.text, /redesign concept/);
  assert.match(unverified.w.mail.text, /attached/);
});

test("Compose Email falls back to safe wording when the model fails, and forbids outcome claims", () => {
  assert.equal(compose(undefined).outcome.usedFallback, true);
  const salesy = compose({ subject: "More bookings for Al Shami", body: "Hi there,\n\nThis redesign will boost your sales. Screenshots attached." });
  assert.equal(salesy.outcome.usedFallback, true);
  assert.doesNotMatch(salesy.w.mail.text, /boost|sales/i);
});

test("Compose Email refuses to produce an email that claims attachments when none exist", () => {
  const r = compose({ subject: "Hi", body: "Hi there,\n\nSee attached." }, { attachmentNames: [] });
  assert.equal(r.outcome.status, "blocked");
});

// ───────────── behaviour: live preview matching ─────────────
const approved = (over = {}) => ({ campaignKey: "k", workspaceId: "biggbee", campaignId: "RDC-000001", businessKey: "a", businessName: "Al Shami", email: "a@x.example", mode: "dry", status: "previewed", subject: "Subj", bodyText: "Hi there,\n\nBody.\n\nBest regards,\nBiggbee AI\nwww.biggbees.com", attachmentFingerprint: "1|2", usedFallback: "", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const resolve = (preview, wOver) =>
  runCode("Resolve Approved Preview", { input: [{ w: { ...w0, mode: "live", attachmentFingerprint: "1|2", ...wOver }, outcome: null }], nodes: { "Read Tracking": [preview ?? {}], "Unpack Run Config": unpack({ mode: "live" }) } })[0].json;

test("live send uses only the approved preview, byte for byte, and re-checks recipient and screenshots", () => {
  const ok = resolve(approved());
  assert.equal(ok.outcome, null);
  assert.equal(ok.w.mail.subject, "Subj");
  assert.match(ok.w.mail.html, /<a href="https:\/\/www\.biggbees\.com">www\.biggbees\.com<\/a>/);
  assert.match(resolve(undefined).outcome.reason, /No reviewed dry-run preview/);
  assert.match(resolve(approved({ email: "other@x.example" })).outcome.reason, /recipient changed/);
  assert.match(resolve(approved({ attachmentFingerprint: "1|3" })).outcome.reason, /screenshots changed/);
  assert.match(resolve(approved({ workspaceId: "other" })).outcome.reason, /No reviewed/); // another workspace's preview is invisible
});

// ───────────── behaviour: send results ─────────────
const sendW = { ...w0, mode: "live", mail: { subject: "S", text: "T", html: "<p>T</p>" }, attachmentNames: ["a.png"], attachmentFingerprint: "1" };
const sendErr = (message, code) => runCode("Send Error Result", { input: [{ error: { message, responseCode: code } }], nodes: { "Restore Attachments": [{ w: sendW }] } })[0].json;

test("SMTP errors: permanent isn't retried or paused; rate limits, auth and unknown errors pause the run; nothing is 'sent'", () => {
  const permanent = sendErr("550 5.1.1 User unknown", 550);
  assert.equal(permanent.outcome.status, "failed");
  assert.equal(permanent.outcome.failureKind, "permanent");
  assert.equal(permanent.outcome.stopRun, false);
  for (const [msg, code, kind] of [["421 Try again later", 421, "rate_limit"], ["535 Authentication failed", 535, "auth"], ["socket hang up", undefined, "transient"]]) {
    const r = sendErr(msg, code);
    assert.equal(r.outcome.status, "failed");
    assert.equal(r.outcome.failureKind, kind);
    assert.equal(r.outcome.stopRun, true);
  }
});

test("Finalize Record: only a real send result becomes 'sent', and records carry the idempotency key", () => {
  const fin = (outcome, w = sendW) => runCode("Finalize Record", { input: [{ w, outcome }], nodes: { "Unpack Run Config": unpack({ mode: "live" }) } })[0].json;
  const sent = fin({ status: "sent" }, { ...sendW, workspaceId: "biggbee", campaignId: "RDC-000001" });
  assert.equal(sent.rec.status, "sent");
  assert.equal(sent.rec.campaignKey, "biggbee|RDC-000001|a|live");
  assert.equal(sent.delaySeconds, 120);
  assert.ok(sent.rec.sentAt);
  const failed = fin({ status: "failed", failureKind: "transient", reason: "x", stopRun: true });
  assert.equal(failed.rec.sentAt, "");
  assert.equal(failed.delaySeconds, 0);
  assert.equal(failed.stopRun, true);
  const blocked = fin({ status: "blocked", reason: "no folder" }, { ...w0 });
  assert.equal(blocked.rec.status, "blocked");
  assert.equal(blocked.crm.email, "a@x.example");
});

test("Pause - Run Stopped reports pause for limits and a plain completion for operator pauses", () => {
  const stop = (decision) => runCode("Pause - Run Stopped", { nodes: { "Decide Continue": [{ w: w0, decision }] } })[0].json.report;
  assert.deepEqual(stop({ action: "pause", reason: "Hourly sending limit reached" }), { type: "pause", reason: "Hourly sending limit reached" });
  assert.deepEqual(stop({ action: "stop", reason: "Campaign is pausing." }), { type: "complete" });
});
