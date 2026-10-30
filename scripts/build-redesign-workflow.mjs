// Generates n8n/website-redesign-outreach.workflow.json -- the importable "Biggbee AI — Website
// Redesign Outreach" workflow.
//
//   node scripts/build-redesign-workflow.mjs
//
// The workflow's decision logic is NOT re-implemented here: src/lib/redesign/core.mjs (unit
// tested) is inlined into every Code node that needs it, so the CRM page and the workflow always
// apply identical matching / screenshot / email-claim / rate-limit rules.
//
// Nothing secret or environment-specific is written into the JSON: the sheet id, tabs, Drive
// folder, column mapping and limits are all fetched at run time from the CRM ("begin" call),
// which reads them from its own server-side configuration.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_PATH = path.join(root, "src/lib/redesign/core.mjs");
const OUT_PATH = path.join(root, "n8n/website-redesign-outreach.workflow.json");

// ───────────── inline the shared core ─────────────
const coreSrc = fs.readFileSync(CORE_PATH, "utf8").replace(/\r\n/g, "\n");
const exportedNames = [...coreSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
const CORE_INLINE =
  "// ---- shared core (generated from src/lib/redesign/core.mjs -- do not edit here) ----\n" +
  "const Core = (function () {\n" +
  coreSrc.replace(/^export /gm, "") +
  "\nreturn { " +
  exportedNames.join(", ") +
  " };\n})();\n// ---- end shared core ----\n";

// ───────────── credentials (existing n8n credentials, referenced by id; no secrets here) ─────────────
const CRED = {
  crm: { httpHeaderAuth: { id: "dHOCpdzzkQDDu0mz", name: "CRM Internal API Key" } },
  webhook: { httpHeaderAuth: { id: "IO6CHk4AVPbwrDM8", name: "biggbee crm" } },
  drive: { googleDriveOAuth2Api: { id: "KlelUkftN3ATcFJr", name: "Google Drive account" } },
  sheets: { googleSheetsOAuth2Api: { id: "7aR4JY2NB9B0uvi8", name: "Google Sheets account 2" } },
  openai: { openAiApi: { id: "NlK2k3mYSXkGO4Fe", name: "Unnamed credential" } },
  // The EXISTING Biggbee SMTP credential, reached only through the workspace route switch below.
  smtpBiggbee: { smtp: { id: "vEtw2lRmEd0lQJhT", name: "SMTP account" } },
};

const CRM_URL = "https://crm.biggbees.com/api/internal/redesign";
const CFG = "$('Unpack Run Config').first().json";
const REQ = CFG + ".req";

// ───────────── tiny DSL ─────────────
const nodes = [];
const connections = {};
let col = 0;
let row = 0;
const id = (name) => {
  const h = crypto.createHash("sha1").update("website-redesign:" + name).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
function add(name, type, typeVersion, parameters, extra = {}, pos) {
  if (nodes.some((n) => n.name === name)) throw new Error("duplicate node " + name);
  const position = pos ?? [col * 260, row * 180];
  nodes.push({ parameters, id: id(name), name, type, typeVersion, position, ...extra });
  return name;
}
function at(c, r) {
  col = c;
  row = r;
}
function link(from, to, outIndex = 0, inIndex = 0, type = "main") {
  connections[from] = connections[from] || {};
  connections[from][type] = connections[from][type] || [];
  while (connections[from][type].length <= outIndex) connections[from][type].push([]);
  connections[from][type][outIndex].push({ node: to, type, index: inIndex });
}

// "Run once for all items" Code nodes have no $json global (only $input / $('Node')), so any
// $json written in a body below is rewritten to the explicit first input item.
const code = (name, body, withCore = false, pos) =>
  add(name, "n8n-nodes-base.code", 2, { mode: "runOnceForAllItems", jsCode: (withCore ? CORE_INLINE + "\n" : "") + body.replace(/\$json\b/g, "$input.first().json") }, {}, pos);

const ifNode = (name, left, op, pos) =>
  add(
    name,
    "n8n-nodes-base.if",
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: id(name + ":c"), leftValue: left, rightValue: op === "true", operator: { type: "boolean", operation: op } }],
        combinator: "and",
      },
      options: {},
    },
    {},
    pos
  );

const crmCall = (name, bodyExpr, extra = {}, pos, neverError = false) =>
  add(
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    {
      method: "POST",
      url: CRM_URL,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify(" + bodyExpr + ") }}",
      options: { timeout: 20000, response: { response: { neverError: neverError, responseFormat: "json" } } },
    },
    { credentials: CRED.crm, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, ...extra },
    pos
  );

const baseBody = (extra) => "Object.assign({ campaignId: " + REQ + ".campaignId, workspaceId: " + REQ + ".workspaceId, runId: " + REQ + ".runId }, " + extra + ")";

const sheetRef = (tabKey) => ({
  documentId: { __rl: true, value: "={{ " + CFG + ".cfg.sheet.id }}", mode: "id" },
  sheetName: { __rl: true, value: "={{ " + CFG + ".cfg." + "sheet." + tabKey + " }}", mode: "name" },
});

const TRACKING_FIELDS = [
  "campaignKey",
  "workspaceId",
  "campaignId",
  "businessKey",
  "businessName",
  "email",
  "mode",
  "status",
  "reason",
  "subject",
  "bodyText",
  "attachmentNames",
  "attachmentFingerprint",
  "usedFallback",
  "failureKind",
  "executionId",
  "updatedAt",
  "sentAt",
];

const trackingWrite = (name, recExpr, pos) =>
  add(
    name,
    "n8n-nodes-base.googleSheets",
    4.5,
    {
      operation: "appendOrUpdate",
      ...sheetRef("trackingTab"),
      columns: {
        mappingMode: "defineBelow",
        value: Object.fromEntries(TRACKING_FIELDS.map((f) => [f, "={{ " + recExpr + "." + f + " }}"])),
        matchingColumns: ["campaignKey"],
        schema: TRACKING_FIELDS.map((f) => ({ id: f, displayName: f, required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true })),
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: {},
    },
    { credentials: CRED.sheets, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueErrorOutput" },
    pos
  );

// ═════════════════════════ 1. intake ═════════════════════════
at(0, 0);
add(
  "Redesign Webhook",
  "n8n-nodes-base.webhook",
  2.1,
  // Its OWN path, separate from biggbee/run-campaign. Same header-auth credential convention as the
  // existing dashboard webhooks (the CRM's N8N_API_KEY).
  { httpMethod: "POST", path: "biggbee/website-redesign/start", authentication: "headerAuth", options: { responseCode: { values: {} } } },
  { credentials: CRED.webhook, webhookId: id("webhook:redesign") }
);

at(1, 0);
code(
  "Validate Request",
  `const raw = $input.first().json;
const b = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const bad = (m) => { throw new Error('Invalid Website Redesign request: ' + m); };
if (!b || typeof b !== 'object') bad('missing body');
if (!/^RDC-\\d{6}$/.test(String(b.campaignId || ''))) bad('campaignId');
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(b.workspaceId || ''))) bad('workspaceId');
if (!/^[0-9a-fA-F-]{20,80}$/.test(String(b.runId || ''))) bad('runId');
if (['dry', 'live'].indexOf(b.mode) === -1) bad('mode');
return [{ json: { campaignId: b.campaignId, workspaceId: b.workspaceId, runId: b.runId, mode: b.mode, resume: b.resume === true } }];`
);
link("Redesign Webhook", "Validate Request");

at(2, 0);
add(
  "CRM Begin Run",
  "n8n-nodes-base.httpRequest",
  4.2,
  {
    method: "POST",
    url: CRM_URL,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ action: 'begin', campaignId: $json.campaignId, workspaceId: $json.workspaceId, runId: $json.runId }) }}",
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
  },
  // No retry on begin: the CRM burns the run id on the first successful call, so a retry would
  // (correctly) be refused as a duplicate.
  { credentials: CRED.crm }
);
link("Validate Request", "CRM Begin Run");

at(3, 0);
ifNode("Begin Accepted?", "={{ $json.ok === true }}", "true");
link("CRM Begin Run", "Begin Accepted?");
at(3, 1);
add("Stop - Run Refused", "n8n-nodes-base.noOp", 1, {}, {});
link("Begin Accepted?", "Stop - Run Refused", 1);

at(4, 0);
code(
  "Unpack Run Config",
  `const r = $input.first().json;
const req = $('Validate Request').first().json;
return [{ json: { req: req, cfg: {
  mode: r.mode, workspace: r.workspace, sheet: r.sheet, driveFolderId: r.driveFolderId,
  columnMap: r.columnMap || {}, eligibleStatuses: r.eligibleStatuses || [], settings: r.settings,
  suppressedEmails: r.suppressedEmails || [], signals: r.signals || {}
} } }];`
);
link("Begin Accepted?", "Unpack Run Config", 0);

// ═════════════════════════ 2. read sources (read-only) ═════════════════════════
at(5, 0);
add(
  "Read Redesign Leads",
  "n8n-nodes-base.googleSheets",
  4.5,
  { ...sheetRef("leadsTab"), options: {} },
  { credentials: CRED.sheets, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueErrorOutput", alwaysOutputData: true }
);
link("Unpack Run Config", "Read Redesign Leads");

at(6, 0);
add(
  "Read Tracking",
  "n8n-nodes-base.googleSheets",
  4.5,
  { ...sheetRef("trackingTab"), options: {} },
  { credentials: CRED.sheets, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueErrorOutput", alwaysOutputData: true }
);
link("Read Redesign Leads", "Read Tracking", 0);

at(7, 0);
add(
  "List Business Folders",
  "n8n-nodes-base.httpRequest",
  4.2,
  {
    method: "GET",
    url: "https://www.googleapis.com/drive/v3/files",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleDriveOAuth2Api",
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: "q", value: "={{ \"'\" + " + CFG + ".cfg.driveFolderId + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
        { name: "fields", value: "nextPageToken,files(id,name,mimeType)" },
        { name: "pageSize", value: "1000" },
        { name: "supportsAllDrives", value: "true" },
        { name: "includeItemsFromAllDrives", value: "true" },
      ],
    },
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
  },
  { credentials: CRED.drive, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueErrorOutput" }
);
link("Read Tracking", "List Business Folders", 0);

// ═════════════════════════ 3. plan ═════════════════════════
at(8, 0);
code(
  "Plan Run",
  `const { req, cfg } = $('Unpack Run Config').first().json;
const fail = (reason) => [{ json: { planError: reason } }];
const folderResp = $('List Business Folders').first().json;
if (!folderResp || folderResp.error || !Array.isArray(folderResp.files)) return fail('Could not read the Drive main folder (check the Drive credential has access to it).');
if (folderResp.nextPageToken) return fail('The Drive main folder has more than 1000 subfolders; matching would be incomplete.');
const leadRows = $('Read Redesign Leads').all().map((i) => i.json).filter((r) => r && Object.keys(r).length);
const tracking = $('Read Tracking').all().map((i) => i.json).filter((r) => r && r.campaignKey);
if (leadRows.length === 0) return [{ json: { noWork: true, plan: { discovered: 0, eligible: 0, matched: 0, blocked: 0, toProcess: 0 } } }];
const headers = Object.keys(leadRows[0]);
const mapCheck = Core.validateColumnMap(cfg.columnMap, headers);
if (!mapCheck.ok) return fail('Column mapping problem: ' + mapCheck.problems.join(' '));

const businesses = Core.mapRows(leadRows, cfg.columnMap);
const keyCounts = {};
businesses.forEach((b) => { keyCounts[b.businessKey] = (keyCounts[b.businessKey] || 0) + 1; });
const folders = folderResp.files.map((f) => ({ id: f.id, name: f.name }));
const matches = Core.matchFolders(businesses, folders);
const live = cfg.mode === 'live';
const doneKeys = live ? Core.buildDoneKeys(tracking, req.workspaceId, req.campaignId) : new Set();
const ctx = { suppressedEmails: new Set(cfg.suppressedEmails), eligibleStatuses: cfg.eligibleStatuses, seenEmails: new Set(), doneKeys: doneKeys };

let eligible = 0, matched = 0, blockedCount = 0;
const ready = [], recorded = [];
for (const b of businesses) {
  const base = { businessKey: b.businessKey, businessName: b.businessName, email: b.email, businessType: b.businessType, website: b.website, verifiedPreserved: b.verifiedPreserved, bookingFormIncluded: b.bookingFormIncluded, mode: cfg.mode, campaignId: req.campaignId, workspaceId: req.workspaceId, runId: req.runId };
  const alreadyDone = doneKeys.has(b.businessKey);
  const e = Core.evaluateEligibility(b, ctx);
  if (!b.businessKey) { recorded.push({ ...base, skipped: true, blockReason: 'Row has no usable business key.' }); continue; }
  if (keyCounts[b.businessKey] > 1) { blockedCount++; recorded.push({ ...base, blocked: true, blockReason: 'Business key "' + b.businessKey + '" appears on more than one row; add a unique Business ID column.' }); continue; }
  if (alreadyDone && live) continue; // already sent / in progress: nothing to do and nothing to record
  if (!e.eligible) { recorded.push({ ...base, skipped: true, blockReason: e.reasons.join(' ') }); continue; }
  eligible++;
  const m = matches[b.businessKey];
  if (m.status !== 'matched') { blockedCount++; recorded.push({ ...base, blocked: true, blockReason: 'Drive folder: ' + (m.reason || m.status) }); continue; }
  matched++;
  ready.push({ ...base, folderId: m.folderId, folderName: m.folderName, matchMethod: m.method });
}
const cap = Math.max(1, Number(cfg.settings.maxPerRun) || 50);
const toRun = ready.slice(0, cap);
const out = recorded.slice(0, 300).concat(toRun);
const plan = { discovered: businesses.length, eligible: eligible, matched: matched, blocked: blockedCount, toProcess: out.length };
if (out.length === 0) return [{ json: { noWork: true, plan: plan } }];
return out.map((w, i) => ({ json: Object.assign({ plan: i === 0 ? plan : undefined }, w) }));`,
  true
);
link("List Business Folders", "Plan Run", 0);

at(9, 0);
ifNode("Plan Failed?", "={{ !!$json.planError }}", "true");
link("Plan Run", "Plan Failed?");

// failure exits (all converge on one CRM pause report)
at(9, 6);
code("Pause - Read Failed", "return [{ json: { report: { type: 'pause', reason: 'Could not read the redesign sheet, tracking tab or Drive folder. Check the n8n credentials have access.' } } }];");
link("Read Redesign Leads", "Pause - Read Failed", 1);
link("Read Tracking", "Pause - Read Failed", 1);
link("List Business Folders", "Pause - Read Failed", 1);
at(10, 1);
code("Pause - Plan Failed", "return [{ json: { report: { type: 'pause', reason: String($json.planError || 'Planning failed.').slice(0, 580) } } }];");
link("Plan Failed?", "Pause - Plan Failed", 0);

at(10, 0);
code("Plan Report Payload", "const j = $('Plan Run').first().json; return [{ json: { plan: j.plan } }];");
link("Plan Failed?", "Plan Report Payload", 1);
at(11, 0);
crmCall("CRM Report Plan", baseBody("{ action: 'report', event: { type: 'plan', discovered: $json.plan.discovered, eligible: $json.plan.eligible, matched: $json.plan.matched, blocked: $json.plan.blocked, toProcess: $json.plan.toProcess } }"), { onError: "continueRegularOutput" });
link("Plan Report Payload", "CRM Report Plan");

// ═════════════════════════ 4. one business at a time ═════════════════════════
at(11, 1);
add("Next Business", "n8n-nodes-base.splitInBatches", 3, { batchSize: 1, options: {} });
link("Plan Failed?", "Next Business", 1);

// done -> complete
at(12, 0);
crmCall("CRM Report Complete", baseBody("{ action: 'report', event: { type: 'complete' } }"), { onError: "continueRegularOutput" });
link("Next Business", "CRM Report Complete", 0);

at(12, 1);
ifNode("Nothing To Do?", "={{ $json.noWork === true }}", "true");
link("Next Business", "Nothing To Do?", 1);
link("Nothing To Do?", "Next Business", 0);

at(13, 1);
crmCall("CRM Check Control", baseBody("{ action: 'check' }"), { onError: "continueRegularOutput" });
link("Nothing To Do?", "CRM Check Control", 1);

at(14, 1);
code(
  "Decide Continue",
  `const w = $('Next Business').first().json;
const cfg = ${CFG}.cfg;
const resp = $input.first().json;
let decision;
if (!resp || resp.ok !== true) {
  decision = { action: 'pause', reason: 'Could not reach the CRM control check; pausing to be safe.' };
} else if (resp.status !== 'running') {
  decision = { action: 'stop', reason: 'Campaign is ' + resp.status + '.' };
} else if (cfg.mode === 'live' && !w.skipped && !w.blocked) {
  const s = cfg.settings;
  decision = Core.decideNextSend(
    { status: resp.status, sentLastHour: resp.sentLastHour, sentLastDay: resp.sentLastDay, externalSentLastHour: resp.externalSentLastHour, externalSentLastDay: resp.externalSentLastDay, bounceRate: resp.bounceRate, bounceSample: resp.bounceSample, complaints: resp.complaints, consecutiveErrors: resp.consecutiveErrors },
    { hourlyLimit: s.hourlyLimit, dailyLimit: s.dailyLimit, bounceRateThreshold: s.bounceRateThreshold, minSampleForBounce: s.minSampleForBounce, maxConsecutiveErrors: s.maxConsecutiveErrors }
  );
} else {
  decision = { action: 'send', reason: '' };
}
return [{ json: { w: w, decision: decision } }];`,
  true
);
link("CRM Check Control", "Decide Continue");

at(15, 1);
ifNode("Allowed To Continue?", "={{ $json.decision.action === 'send' }}", "true");
link("Decide Continue", "Allowed To Continue?");

at(15, 6);
code(
  "Pause - Run Stopped",
  `const d = $('Decide Continue').first().json.decision;
if (d && d.action === 'pause') return [{ json: { report: { type: 'pause', reason: String(d.reason).slice(0, 580) } } }];
return [{ json: { report: { type: 'complete' } } }];`
);
link("Allowed To Continue?", "Pause - Run Stopped", 1);

at(16, 1);
ifNode("Plan Blocked Or Skipped?", "={{ $json.w.blocked === true || $json.w.skipped === true }}", "true");
link("Allowed To Continue?", "Plan Blocked Or Skipped?", 0);

at(17, 5);
code("Plan Outcome", "const w = $json.w; return [{ json: { w: w, outcome: { status: w.skipped ? 'skipped' : 'blocked', reason: w.blockReason || '' } } }];");
link("Plan Blocked Or Skipped?", "Plan Outcome", 0);

// ═════════════════════════ 5. screenshots ═════════════════════════
at(17, 1);
add(
  "List Screenshots",
  "n8n-nodes-base.httpRequest",
  4.2,
  {
    method: "GET",
    url: "https://www.googleapis.com/drive/v3/files",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleDriveOAuth2Api",
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: "q", value: "={{ \"'\" + $json.w.folderId + \"' in parents and trashed = false\" }}" },
        { name: "fields", value: "nextPageToken,files(id,name,mimeType,size)" },
        { name: "pageSize", value: "100" },
        { name: "supportsAllDrives", value: "true" },
        { name: "includeItemsFromAllDrives", value: "true" },
      ],
    },
    options: { timeout: 30000, response: { response: { neverError: true, responseFormat: "json" } } },
  },
  { credentials: CRED.drive, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput" }
);
link("Plan Blocked Or Skipped?", "List Screenshots", 1);

at(18, 1);
code(
  "Validate Screenshots",
  `const w = $('Decide Continue').first().json.w;
const resp = $input.first().json;
const s = ${CFG}.cfg.settings;
let outcome = null;
let accepted = [], rejected = [];
if (!resp || resp.error || !Array.isArray(resp.files)) {
  outcome = { status: 'blocked', reason: 'Could not list the business folder (missing or inaccessible).' };
} else if (resp.nextPageToken) {
  outcome = { status: 'blocked', reason: 'The business folder holds more files than expected; refusing to guess which are screenshots.' };
} else {
  const v = Core.validateScreenshots(resp.files, { maxScreenshots: s.maxScreenshots, maxFileBytes: s.maxFileBytes, maxTotalBytes: s.maxTotalBytes, ignoreNonImageFiles: s.ignoreNonImageFiles });
  accepted = v.accepted; rejected = v.rejected;
  if (!v.ok) outcome = { status: 'blocked', reason: v.reason };
}
return [{ json: { w: Object.assign({}, w, { screenshots: accepted, rejected: rejected }), outcome: outcome } }];`,
  true
);
link("List Screenshots", "Validate Screenshots");

at(19, 1);
ifNode("Screenshots Valid?", "={{ !$json.outcome }}", "true");
link("Validate Screenshots", "Screenshots Valid?");

at(20, 1);
code("Expand Files", "const w = $json.w; return w.screenshots.map((f) => ({ json: { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size } }));");
link("Screenshots Valid?", "Expand Files", 0);

at(21, 1);
add(
  "Download Screenshot",
  "n8n-nodes-base.httpRequest",
  4.2,
  {
    method: "GET",
    url: "={{ 'https://www.googleapis.com/drive/v3/files/' + $json.id }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleDriveOAuth2Api",
    sendQuery: true,
    queryParameters: { parameters: [{ name: "alt", value: "media" }, { name: "supportsAllDrives", value: "true" }] },
    options: { timeout: 60000, response: { response: { responseFormat: "file", outputPropertyName: "data" } } },
  },
  { credentials: CRED.drive, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput" }
);
link("Expand Files", "Download Screenshot");

at(22, 1);
code(
  "Collect Attachments",
  `const w = $('Validate Screenshots').first().json.w;
const expected = $('Expand Files').all().map((i) => i.json);
const got = $input.all();
const problems = [];
const binary = {};
const names = [];
if (got.length !== expected.length) problems.push('Expected ' + expected.length + ' downloads but received ' + got.length + '.');
expected.forEach((f, i) => {
  const it = got[i];
  if (!it || !it.binary || !it.binary.data) { problems.push('Could not download "' + f.name + '".'); return; }
  const b = it.binary.data;
  b.fileName = f.name;
  b.mimeType = f.mimeType;
  binary['screenshot_' + names.length] = b;
  names.push(f.name);
});
const outcome = problems.length ? { status: 'blocked', reason: problems.join(' ').slice(0, 500) } : null;
const nw = Object.assign({}, w, { attachmentNames: names, attachmentFingerprint: Core.attachmentFingerprint(w.screenshots) });
return [{ json: { w: nw, outcome: outcome }, binary: binary }];`,
  true
);
link("Download Screenshot", "Collect Attachments");

at(23, 1);
ifNode("Attachments Ready?", "={{ !$json.outcome }}", "true");
link("Collect Attachments", "Attachments Ready?");

at(24, 1);
ifNode("Is Dry Run?", "={{ $json.w.mode === 'dry' }}", "true");
link("Attachments Ready?", "Is Dry Run?", 0);

// ═════════════════════════ 6a. dry run: generate + validate the email ═════════════════════════
at(25, 0);
code(
  "Prepare Writer Input",
  `const w = $json.w;
const phrase = Core.preservedPhrase(w.verifiedPreserved);
let domain = '';
try { domain = new URL(/^https?:/i.test(w.website) ? w.website : 'https://' + w.website).hostname.replace(/^www\\./, ''); } catch (e) { domain = ''; }
const lines = [
  'Business name: ' + w.businessName,
  'Business type: ' + (w.businessType || 'unknown'),
  'Website: ' + (domain || 'unknown'),
  'Screenshots attached: ' + w.attachmentNames.length,
  'Verified details kept from the real site: ' + (phrase || 'NONE (do not claim anything was kept)'),
  'Online booking form verified as included: ' + (w.bookingFormIncluded === true ? 'yes' : 'no')
];
return [{ json: { w: w, writerInput: lines.join('\\n') } }];`,
  true
);
link("Is Dry Run?", "Prepare Writer Input", 0);

const WRITER_SYSTEM = `You write one short, friendly cold email for Biggbee AI, a small studio that designs websites.

Context: Biggbee AI prepared a redesign concept for a business's website and is sharing screenshots of it. Write ONLY the subject and the email body.

Reference email (match its friendly, concise, professional, low-pressure tone and structure; do NOT copy its business-specific facts):
"""
Hi there,

I came across the Al Shami website recently. The restaurant has such a great story, but the site didn't really do it justice, so I took a shot at redesigning it. I've attached a few screenshots.

I kept all your real menu and prices, opening hours and contact details, and added a simple online booking form. I just wanted to show what it could look like.

If you like it, I'd be happy to set it up properly for you, and I'm glad to adjust anything. If not, no worries at all.
"""

Rules (strict):
- Use ONLY the facts in the user message. Never invent facts about the business, its story, its menu, prices, hours, location, customers or reviews.
- Mention the business by name and refer to its type naturally (for example "restaurant", "dental clinic"). If the type is "unknown", just say "business".
- Say screenshots are attached only if "Screenshots attached" is greater than 0, and then say "attached" - never say you will send them later.
- Only say that real details (menu, prices, opening hours, contact details, etc.) were kept if the "Verified details kept" line lists them, and then mention only what is listed. If it says NONE, do not mention keeping, preserving or reusing any details at all.
- Only mention an online booking form if "Online booking form verified as included" is yes. Otherwise do not mention bookings, reservations or forms.
- Never claim or imply more sales, bookings, traffic, rankings, SEO results or any other outcome. No guarantees, no urgency, no discounts, no percentages, no links.
- If you are unsure a claim is verified, use the safe wording: you prepared a redesign concept and have attached screenshots.
- Start with "Hi there," and end the body with the sentence about being happy to set it up or adjust anything and that it is fine if not interested. Do NOT write a sign-off, name or signature; it is added automatically.
- Subject: specific to this business, under 70 characters, no emojis, no ALL CAPS, no clickbait.
- Plain text only. Short paragraphs separated by a blank line.`;

at(26, 0);
add(
  "Redesign Email Writer",
  "@n8n/n8n-nodes-langchain.agent",
  1.9,
  { promptType: "define", text: "={{ $json.writerInput }}", hasOutputParser: true, options: { systemMessage: WRITER_SYSTEM } },
  // A failed/blank AI call is not fatal: Compose Email falls back to the deterministic safe wording.
  { retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput" }
);
link("Prepare Writer Input", "Redesign Email Writer");

at(26, 1);
add(
  "OpenAI Chat Model - Email Writer",
  "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  1.2,
  { model: { __rl: true, value: "gpt-4.1-mini", mode: "list", cachedResultName: "gpt-4.1-mini" }, options: { temperature: 0.3 } },
  { credentials: CRED.openai }
);
link("OpenAI Chat Model - Email Writer", "Redesign Email Writer", 0, 0, "ai_languageModel");

at(26, 2);
add(
  "Email Writer Output Parser",
  "@n8n/n8n-nodes-langchain.outputParserStructured",
  1.3,
  {
    schemaType: "manual",
    inputSchema: JSON.stringify(
      { type: "object", additionalProperties: false, properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] },
      null,
      2
    ),
  },
  {}
);
link("Email Writer Output Parser", "Redesign Email Writer", 0, 0, "ai_outputParser");

at(27, 0);
code(
  "Compose Email",
  `const w = $('Prepare Writer Input').first().json.w;
const out = $input.first().json.output;
const facts = { businessName: w.businessName, businessType: w.businessType, attachmentCount: w.attachmentNames.length, preservedVerified: Core.preservedPhrase(w.verifiedPreserved), bookingVerified: w.bookingFormIncluded === true };
const draft = out && typeof out.subject === 'string' && typeof out.body === 'string' ? { subject: out.subject, body: out.body } : null;
const r = Core.finalizeEmail(draft, facts, ${CFG}.cfg.workspace);
if (!r.ok) return [{ json: { w: w, outcome: { status: 'blocked', reason: 'Email failed the factual-claim checks: ' + r.violations.join(' ').slice(0, 450) } } }];
return [{ json: { w: Object.assign({}, w, { mail: r.email }), outcome: { status: 'previewed', usedFallback: r.usedFallback } } }];`,
  true
);
link("Redesign Email Writer", "Compose Email");

// ═════════════════════════ 6b. live run: send ONLY the approved dry-run preview ═════════════════════════
at(25, 3);
code(
  "Resolve Approved Preview",
  `const w = $json.w;
const req = ${REQ};
const tracking = $('Read Tracking').all().map((i) => i.json).filter((r) => r && r.campaignKey);
const p = Core.findApprovedPreview(tracking, req.workspaceId, req.campaignId, w.businessKey);
let outcome = null, mail = null;
if (!p) outcome = { status: 'blocked', reason: 'No reviewed dry-run preview exists for this business; run a dry run first.' };
else if (String(p.email).trim().toLowerCase() !== w.email) outcome = { status: 'blocked', reason: 'The recipient changed since the preview; run a new dry run.' };
else if (String(p.attachmentFingerprint || '') !== w.attachmentFingerprint) outcome = { status: 'blocked', reason: 'The screenshots changed since the preview; run a new dry run.' };
else if (!p.subject || !p.bodyText) outcome = { status: 'blocked', reason: 'The stored preview is incomplete.' };
else {
  const sig = Core.signatureParts(${CFG}.cfg.workspace);
  mail = { subject: String(p.subject), text: String(p.bodyText), html: Core.textToHtml(String(p.bodyText), sig.site, sig.url) };
}
return [{ json: { w: Object.assign({}, w, mail ? { mail: mail, usedFallback: String(p.usedFallback).toUpperCase() === 'TRUE' } : {}), outcome: outcome } }];`,
  true
);
link("Is Dry Run?", "Resolve Approved Preview", 1);
// (Resolve forwards the attachment binary data implicitly? No -- binaries are restored from Collect Attachments before sending.)

at(26, 3);
ifNode("Preview Approved?", "={{ !$json.outcome }}", "true");
link("Resolve Approved Preview", "Preview Approved?");

// workspace SMTP route -- mirrors the Phase D switch in the general workflow; unknown workspace => no send
at(27, 3);
add(
  "Route by Workspace SMTP",
  "n8n-nodes-base.switch",
  3.2,
  {
    rules: {
      values: [
        {
          conditions: {
            options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
            conditions: [{ id: id("route:biggbee"), leftValue: "={{ $json.w.workspaceId }}", rightValue: "biggbee", operator: { type: "string", operation: "equals" } }],
            combinator: "and",
          },
          renameOutput: true,
          outputKey: "biggbee",
        },
      ],
    },
    options: { fallbackOutput: "extra" },
  },
  {}
);
link("Preview Approved?", "Route by Workspace SMTP", 0);

at(28, 5);
code("No SMTP Route", "const w = $json.w; return [{ json: { w: w, outcome: { status: 'failed', failureKind: 'no_route', reason: 'No SMTP route is configured for workspace \"' + w.workspaceId + '\"; nothing was sent.', stopRun: true, stopReason: 'No SMTP route for this workspace.' } } }];");
link("Route by Workspace SMTP", "No SMTP Route", 1);

at(28, 3);
code(
  "Prepare Claim",
  `const w = $json.w;
const now = new Date().toISOString();
const rec = { campaignKey: Core.campaignKey(w.workspaceId, w.campaignId, w.businessKey, 'live'), workspaceId: w.workspaceId, campaignId: w.campaignId, businessKey: w.businessKey, businessName: w.businessName, email: w.email, mode: 'live', status: 'sending', reason: '', subject: w.mail.subject, bodyText: w.mail.text, attachmentNames: w.attachmentNames.join('; '), attachmentFingerprint: w.attachmentFingerprint, usedFallback: '', failureKind: '', executionId: String($execution.id), updatedAt: now, sentAt: '' };
return [{ json: { w: w, rec: rec } }];`,
  true
);
link("Route by Workspace SMTP", "Prepare Claim", 0);

// the claim is written BEFORE the send: a crash after this point can never lead to a second send
at(29, 3);
trackingWrite("Mark Sending", "$json.rec");
link("Prepare Claim", "Mark Sending");

at(29, 5);
code("Claim Failed", "const w = $('Prepare Claim').first().json.w; return [{ json: { w: w, outcome: { status: 'failed', failureKind: 'claim', reason: 'Could not record the send claim in the tracking sheet; nothing was sent.', stopRun: true, stopReason: 'Tracking sheet is not writable.' } } }];");
link("Mark Sending", "Claim Failed", 1);

at(30, 3);
code("Restore Attachments", "const w = $('Prepare Claim').first().json.w; return [{ json: { w: w }, binary: $('Collect Attachments').first().binary }];");
link("Mark Sending", "Restore Attachments", 0);

at(31, 3);
add(
  "Send Redesign Email - Biggbee SMTP",
  "n8n-nodes-base.emailSend",
  2.1,
  {
    fromEmail: "={{ " + CFG + ".cfg.workspace.senderDisplayName + ' <' + " + CFG + ".cfg.workspace.senderEmail + '>' }}",
    toEmail: "={{ $json.w.email }}",
    subject: "={{ $json.w.mail.subject }}",
    html: "={{ $json.w.mail.html }}",
    text: "={{ $json.w.mail.text }}",
    options: {
      appendAttribution: false,
      replyTo: "={{ " + CFG + ".cfg.workspace.replyToEmail }}",
      fileAttachments: "={{ $json.w.attachmentNames.map((n, i) => 'screenshot_' + i).join(',') }}",
    },
  },
  // One attempt only: a send is never auto-retried (a retry after a partial failure could double-send).
  // Transient failures pause the run; a permanent failure is recorded and never retried.
  { credentials: CRED.smtpBiggbee, webhookId: id("email:biggbee"), onError: "continueErrorOutput", retryOnFail: false }
);
link("Restore Attachments", "Send Redesign Email - Biggbee SMTP");

at(32, 3);
code("Sent Result", "const w = $('Restore Attachments').first().json.w; return [{ json: { w: w, outcome: { status: 'sent' } } }];");
link("Send Redesign Email - Biggbee SMTP", "Sent Result", 0);

at(32, 4);
code(
  "Send Error Result",
  `const w = $('Restore Attachments').first().json.w;
const e = $json.error || $json;
const msg = String((e && (e.message || e.description)) || JSON.stringify(e)).slice(0, 400);
const c = Core.classifySmtpError(msg, e && (e.responseCode || e.code));
return [{ json: { w: w, outcome: { status: 'failed', failureKind: c.kind, reason: 'SMTP ' + c.kind + ' error' + (c.code ? ' ' + c.code : '') + ': ' + msg, stopRun: c.pauseRun, stopReason: 'Send error (' + c.kind + '): ' + msg } } }];`,
  true
);
link("Send Redesign Email - Biggbee SMTP", "Send Error Result", 1);

// ═════════════════════════ 7. finalize, record, report, pace ═════════════════════════
at(33, 1);
code(
  "Finalize Record",
  `const { w, outcome } = $input.first().json;
const cfg = ${CFG}.cfg;
const now = new Date().toISOString();
const mail = w.mail && typeof w.mail === 'object' ? w.mail : null;
const usedFallback = outcome.usedFallback === true || w.usedFallback === true;
const rec = {
  campaignKey: Core.campaignKey(w.workspaceId, w.campaignId, w.businessKey, w.mode),
  workspaceId: w.workspaceId, campaignId: w.campaignId, businessKey: w.businessKey, businessName: w.businessName, email: w.email || '',
  mode: w.mode, status: outcome.status, reason: String(outcome.reason || '').slice(0, 600),
  subject: mail ? mail.subject : '', bodyText: mail ? mail.text : '',
  attachmentNames: (w.attachmentNames || []).join('; '), attachmentFingerprint: w.attachmentFingerprint || '',
  usedFallback: usedFallback ? 'TRUE' : '', failureKind: outcome.failureKind || '',
  executionId: String($execution.id), updatedAt: now, sentAt: outcome.status === 'sent' ? now : ''
};
const crm = {
  businessKey: rec.businessKey, businessName: String(rec.businessName || '').slice(0, 200), email: String(rec.email || '').slice(0, 254), status: outcome.status,
  reason: rec.reason || undefined, subject: rec.subject ? rec.subject.slice(0, 200) : undefined, bodyText: rec.bodyText ? rec.bodyText.slice(0, 5900) : undefined,
  attachmentNames: (w.attachmentNames || []).slice(0, 20), attachmentFingerprint: rec.attachmentFingerprint ? rec.attachmentFingerprint.slice(0, 1900) : undefined,
  usedFallback: usedFallback || undefined, failureKind: rec.failureKind || undefined
};
return [{ json: { rec: rec, crm: crm, stopRun: outcome.stopRun === true, stopReason: String(outcome.stopReason || outcome.reason || 'Run stopped.').slice(0, 580), delaySeconds: outcome.status === 'sent' ? Number(cfg.settings.delaySeconds) || 120 : 0 } }];`,
  true
);
// every terminal outcome funnels here
link("Plan Outcome", "Finalize Record");
link("Screenshots Valid?", "Finalize Record", 1);
link("Attachments Ready?", "Finalize Record", 1);
link("Compose Email", "Finalize Record");
link("Preview Approved?", "Finalize Record", 1);
link("No SMTP Route", "Finalize Record");
link("Claim Failed", "Finalize Record");
link("Sent Result", "Finalize Record");
link("Send Error Result", "Finalize Record");

at(34, 1);
crmCall(
  "Report Business",
  baseBody("{ action: 'report', event: { type: 'business', result: $json.crm } }"),
  { onError: "continueErrorOutput" }
);
link("Finalize Record", "Report Business");

at(35, 1);
trackingWrite("Record Status", "$('Finalize Record').first().json.rec");
link("Report Business", "Record Status", 0);

at(35, 6);
code("Pause - Write Failed", "return [{ json: { report: { type: 'pause', reason: 'Could not record a result in the CRM or the tracking sheet; pausing so nothing is sent without a record.' } } }];");
link("Report Business", "Pause - Write Failed", 1);
link("Record Status", "Pause - Write Failed", 1);

at(36, 1);
ifNode("Should Stop?", "={{ $('Finalize Record').first().json.stopRun === true }}", "true");
link("Record Status", "Should Stop?", 0);

at(37, 6);
code("Pause - Safety Stop", "return [{ json: { report: { type: 'pause', reason: $('Finalize Record').first().json.stopReason } } }];");
link("Should Stop?", "Pause - Safety Stop", 0);

at(37, 1);
ifNode("Needs Delay?", "={{ $('Finalize Record').first().json.delaySeconds > 0 }}", "true");
link("Should Stop?", "Needs Delay?", 1);

at(38, 1);
add("Delay Between Sends", "n8n-nodes-base.wait", 1.1, { amount: "={{ $('Finalize Record').first().json.delaySeconds }}", unit: "seconds" }, {});
link("Needs Delay?", "Delay Between Sends", 0);
link("Delay Between Sends", "Next Business");
link("Needs Delay?", "Next Business", 1);

// shared pause/stop report (all failure exits converge here)
at(38, 6);
crmCall("CRM Report Stop", baseBody("{ action: 'report', event: $json.report.type === 'pause' ? { type: 'pause', reason: String($json.report.reason || 'Paused.').slice(0, 580) } : { type: 'complete' } }"), { onError: "continueRegularOutput" });
for (const n of ["Pause - Read Failed", "Pause - Plan Failed", "Pause - Run Stopped", "Pause - Write Failed", "Pause - Safety Stop"]) link(n, "CRM Report Stop");

// ═════════════════════════ output ═════════════════════════
// n8n's CLI import needs an id; derive a stable 16-char one so re-imports update, not duplicate.
const WORKFLOW_ID = crypto.createHash("sha1").update("biggbee-website-redesign-outreach").digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

const workflow = {
  id: WORKFLOW_ID,
  name: "Biggbee AI — Website Redesign Outreach",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1", binaryMode: "separate" },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, OUT_PATH)} (${nodes.length} nodes).`);
