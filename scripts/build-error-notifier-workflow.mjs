// Generates n8n/error-notifier/error-notifier.workflow.json -- "Biggbee — Error Notifier".
//
//   node scripts/build-error-notifier-workflow.mjs
//
// Design (see docs/error-notifier.md):
//   * The DECISION ("is this a new incident? a duplicate? escalate? flood cap?") is made by the CRM
//     (src/app/api/internal/alerts), inside the JSON store's per-collection queue, so simultaneous
//     identical errors are serialized and exactly one is told to email. n8n workflow static data
//     cannot do that: each execution works on a snapshot taken when it starts, last writer wins.
//   * n8n only forwards the raw alert, then logs and emails whatever the CRM decided.
//   * If the CRM is unreachable, the same tested logic (src/lib/alerts/throttle-core.mjs, inlined)
//     runs locally against static data. That path is NOT atomic and says so in the email; it can
//     only produce EXTRA emails, never swallow a first alert.
//
// Nothing here attaches or activates the workflow, or touches any other workflow.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_PATH = path.join(root, "src/lib/alerts/throttle-core.mjs");
const OUT_PATH = path.join(root, "n8n/error-notifier/error-notifier.workflow.json");

const coreSrc = fs.readFileSync(CORE_PATH, "utf8").replace(/\r\n/g, "\n");
const names = [...coreSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
const CORE_INLINE = "// ---- shared core (generated from src/lib/alerts/throttle-core.mjs -- do not edit here) ----\nconst Core = (function () {\n" + coreSrc.replace(/^export /gm, "") + "\nreturn { " + names.join(", ") + " };\n})();\n// ---- end shared core ----\n";

// Tunables: shown at the top of every Code node so they can be changed in the n8n editor. The same
// object is sent to the CRM with each request, so there is ONE place to edit (keep them identical).
const CONFIG_BLOCK = `// ---- notifier settings (edit here; sent to the CRM with every request) ----
const CONFIG = {
  incidentGapMin: 180,   // same error closer together than this = same incident
  cooldownMin: 360,      // minutes between emails for one ongoing incident (continued-failure summary)
  flapThreshold: 5,      // this many events within flapWindowMin escalates once
  flapWindowMin: 60,
  closeAfterMin: 180,    // quiet this long = incident closed (wrap-up sent if it repeated)
  maxEmailsPerHour: 10,  // global flood cap; overflow is rolled into one digest
  retentionDays: 14,
  editorBaseUrl: "https://n8n.srv1787796.hstgr.cloud"
};
`;

const WORKFLOW_ID = crypto.createHash("sha1").update("biggbee-error-notifier").digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
const uid = (s) => {
  const h = crypto.createHash("sha1").update("error-notifier:" + s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

// Existing credentials, referenced by id (no secret is stored here). Sheets + SMTP are what the
// outbound workflow's own "Log Global Error" / "Notify Admin - Critical Error" use today; the CRM
// key is what its "Record Send Event" nodes already use to call /api/internal/*.
const CRED = {
  sheets: { googleSheetsOAuth2Api: { id: "7aR4JY2NB9B0uvi8", name: "Google Sheets account 2" } },
  smtp: { smtp: { id: "vEtw2lRmEd0lQJhT", name: "SMTP account" } },
  crm: { httpHeaderAuth: { id: "dHOCpdzzkQDDu0mz", name: "CRM Internal API Key" } },
};
const CRM_ALERTS_URL = "https://crm.biggbees.com/api/internal/alerts";

const prepareRequestCode = CONFIG_BLOCK + `
// Idempotency key: an HTTP retry of this same execution must get the SAME answer from the CRM.
const payload = $input.first().json;
return [{ json: { payload: payload, request: { action: 'event', payload: payload, ownWorkflowId: $workflow.id, eventId: $workflow.id + ':' + $execution.id, config: CONFIG } } }];`;

const FALLBACK_NOTE = "Note: this alert was decided locally in n8n because the CRM alert service was unreachable. Duplicate suppression is approximate in this mode (simultaneous identical errors can each send an email).";

const resolveDecisionCode = CORE_INLINE + CONFIG_BLOCK + `
const crm = $input.first().json;
const prep = $('Prepare Request').first().json;
const payload = prep.payload;

// PRIMARY: the CRM decided atomically. Trust it only if the answer is complete and well-formed.
if (crm && crm.ok === true && typeof crm.sendEmail === 'boolean' && crm.log && typeof crm.log === 'object' && (crm.sendEmail === false || (crm.mail && crm.mail.subject))) {
  return [{ json: { sendEmail: crm.sendEmail, mail: crm.mail || null, log: crm.log, via: 'crm' } }];
}

// FALLBACK: CRM unreachable / refused / malformed. Local, NOT atomic; labelled in the email.
// A bug here must never hide an error: on any exception, email the raw alert unthrottled.
const now = Date.now();
try {
  const event = Core.normalizeEvent(payload, { nowMs: now, ownWorkflowId: $workflow.id });
  const sd = $getWorkflowStaticData('global');
  const result = Core.applyEvent(sd.notifier, event, CONFIG, now);
  sd.notifier = result.state;
  const d = result.decision;
  let mail = d.email ? Core.renderEmail(d.email.kind, d.incident, event, CONFIG, now) : null;
  if (mail) {
    const note = ${JSON.stringify(FALLBACK_NOTE)};
    mail = { subject: mail.subject, text: mail.text + '\\n\\n' + note, html: mail.html.replace(/<\\/div>$/, '<br><div>' + note + '</div></div>') };
  }
  const log = Core.buildLogRow(event, d, !!mail);
  const w = JSON.parse(log['Validation Warnings']); w.via = 'local-fallback'; w.crmUnavailable = true;
  log['Validation Warnings'] = JSON.stringify(w);
  return [{ json: { sendEmail: !!mail, mail: mail, log: log, via: 'local-fallback' } }];
} catch (e) {
  const msg = String((e && e.message) || e);
  const raw = JSON.stringify(payload).slice(0, 1500);
  return [{ json: {
    sendEmail: true, via: 'fail-open',
    mail: { subject: '[Biggbee alert][CRITICAL] error notifier fault -- original error attached', text: 'The error notifier itself failed (' + msg + '), so this alert is unthrottled.\\n\\nOriginal error payload:\\n' + raw, html: '<pre>' + raw.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>' },
    log: { Timestamp: new Date(now).toISOString(), Source: 'Global Workflow Error', 'Lead Email': '', 'Error Message': 'notifier fault: ' + msg, 'Node Name': 'Resolve Decision', Company: '', 'Validation Errors': JSON.stringify([msg]), 'Validation Warnings': JSON.stringify({ raw: raw }), 'Workspace ID': 'biggbee' }
  } }];
}`;

const prepareSweepCode = CONFIG_BLOCK + `
return [{ json: { request: { action: 'sweep', config: CONFIG } } }];`;

const resolveSweepCode = CORE_INLINE + CONFIG_BLOCK + `
const crm = $input.first().json;
// PRIMARY: the CRM swept atomically (two concurrent sweeps can never both report the same wrap-up).
if (crm && crm.ok === true && Array.isArray(crm.emails)) {
  return crm.emails.filter((e) => e && e.mail && e.mail.subject).map((e) => ({ json: { mail: e.mail } }));
}
// FALLBACK: sweep whatever the local (fallback-era) state holds. Returns no items when nothing is due.
const now = Date.now();
const sd = $getWorkflowStaticData('global');
if (!sd.notifier) return [];
const result = Core.sweep(sd.notifier, CONFIG, now);
sd.notifier = result.state;
return result.emails.map((e) => ({ json: { mail: Core.renderEmail(e.kind, e.kind === 'digest' ? e.overflow : e.incident, null, CONFIG, now) } }));`;

const SCHEMA = ["Timestamp", "Source", "Lead Email", "Error Message", "Node Name", "Company", "Validation Errors", "Validation Warnings", "Workspace ID"];

const code = (name, jsCode, position) => ({ parameters: { mode: "runOnceForAllItems", jsCode }, id: uid(name), name, type: "n8n-nodes-base.code", typeVersion: 2, position });
const crmCall = (name, position) => ({
  parameters: {
    method: "POST",
    url: CRM_ALERTS_URL,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.request) }}",
    // neverError: a 401/413/500 comes back as a body with ok:false, which the next node treats as "fall back"
    options: { timeout: 8000, response: { response: { neverError: true, responseFormat: "json" } } },
  },
  id: uid(name), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position, credentials: CRED.crm,
  // safe to retry: the event id makes the CRM return the same decision instead of counting twice
  retryOnFail: true, maxTries: 2, waitBetweenTries: 1000, onError: "continueRegularOutput",
});

const nodes = [
  { parameters: {}, id: uid("error-trigger"), name: "Error Trigger", type: "n8n-nodes-base.errorTrigger", typeVersion: 1, position: [0, 0] },
  code("Prepare Request", prepareRequestCode, [240, 0]),
  crmCall("CRM Decide", [480, 0]),
  code("Resolve Decision", resolveDecisionCode, [720, 0]),
  {
    // Logs EVERY event, whether or not it is emailed -- nothing is hidden from the Errors sheet / CRM.
    parameters: {
      operation: "append",
      documentId: { __rl: true, value: "1lpW8cRAQqfsZSN1XBMBO0_BMhwg_fZ13lPxyhF1LW5Q", mode: "list", cachedResultName: "Bigggbee Email Marketing" },
      sheetName: { __rl: true, value: 2140289479, mode: "list", cachedResultName: "Errors" },
      columns: {
        mappingMode: "defineBelow",
        value: Object.fromEntries(SCHEMA.map((c) => [c, "={{ $json.log[" + JSON.stringify(c) + "] }}"])),
        matchingColumns: [],
        schema: SCHEMA.map((c) => ({ id: c, displayName: c, required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true })),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    },
    id: uid("log"), name: "Log Error", type: "n8n-nodes-base.googleSheets", typeVersion: 4.5, position: [980, -120], credentials: CRED.sheets, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput",
  },
  {
    parameters: {
      conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: uid("if-c"), leftValue: "={{ $json.sendEmail === true }}", rightValue: true, operator: { type: "boolean", operation: "true" } }], combinator: "and" },
      options: {},
    },
    id: uid("if"), name: "Send Email?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [980, 120],
  },
  {
    // Same sender, recipient and SMTP credential as the outbound workflow's existing alert node.
    parameters: {
      fromEmail: "Biggbee AI <office@biggbees.com>",
      toEmail: "office@biggbees.com",
      subject: "={{ $json.mail.subject }}",
      html: "={{ $json.mail.html }}",
      text: "={{ $json.mail.text }}",
      options: { appendAttribution: false },
    },
    id: uid("send"), name: "Send Alert Email", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [1240, 120], credentials: CRED.smtp, webhookId: uid("send:webhook"), retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    // a failed alert email must NEVER fail the run: that would raise an alert about the alert
    onError: "continueRegularOutput",
  },
  { parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 30 }] } }, id: uid("schedule"), name: "Sweeper Schedule", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 360] },
  code("Prepare Sweep Request", prepareSweepCode, [240, 360]),
  crmCall("CRM Sweep", [480, 360]),
  code("Resolve Sweep", resolveSweepCode, [720, 360]),
];

const link = (from, to) => ({ main: [[{ node: to, type: "main", index: 0 }]] });
const connections = {
  "Error Trigger": link("Error Trigger", "Prepare Request"),
  "Prepare Request": link("Prepare Request", "CRM Decide"),
  "CRM Decide": link("CRM Decide", "Resolve Decision"),
  "Resolve Decision": { main: [[{ node: "Log Error", type: "main", index: 0 }, { node: "Send Email?", type: "main", index: 0 }]] },
  "Send Email?": { main: [[{ node: "Send Alert Email", type: "main", index: 0 }], []] },
  "Sweeper Schedule": link("Sweeper Schedule", "Prepare Sweep Request"),
  "Prepare Sweep Request": link("Prepare Sweep Request", "CRM Sweep"),
  "CRM Sweep": link("CRM Sweep", "Resolve Sweep"),
  "Resolve Sweep": link("Resolve Sweep", "Send Alert Email"),
};

const workflow = {
  id: WORKFLOW_ID,
  name: "Biggbee — Error Notifier",
  nodes,
  connections,
  active: false,
  // Deliberately NO errorWorkflow here: n8n never re-runs an error workflow for an error-mode run
  // of a workflow with no errorWorkflow set, so the notifier cannot notify itself.
  settings: { executionOrder: "v1" },
  pinData: {},
  tags: [],
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, OUT_PATH)} (${nodes.length} nodes, id ${WORKFLOW_ID}).`);
