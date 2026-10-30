// Biggbee error notifier -- pure decision logic. No I/O, no imports.
//
// Inlined into the Code nodes of "Biggbee — Error Notifier" by
// scripts/build-error-notifier-workflow.mjs (it strips the `export` keywords, so keep this file to
// plain top-level `function` / `const` declarations).
//
// WHY THIS EXISTS (verified against the production n8n 2.27.4 source and 24 real alerts):
//   * n8n calls the error workflow ONCE per trigger drop ("activation error"). The reactivation
//     retries that follow (1 s, doubling per failed attempt, capped at 24 h) are log-only and never
//     alert. So a *persistent* outage produces a single event and then silence -- silence is NOT
//     evidence of recovery, and a new event for the same trigger IS evidence the previous drop
//     recovered (a trigger can only fail "initially" if it had been re-established).
//   * Activation errors arrive as { trigger: { error, mode }, workflow } with NO `execution`
//     object; execution failures arrive as { execution: { id, url, error, lastNodeExecuted, mode },
//     workflow }. The old email template only understood neither fully, which is why it printed
//     "Unknown node / Unavailable / Unknown".
//
// Rules this module enforces:
//   * identical events (same fingerprint) are folded into ONE incident;
//   * the first event of an incident always emails (we cannot know it is harmless);
//   * repeats inside the incident are counted, not emailed, except: a flapping escalation, and a
//     periodic "still failing" summary;
//   * distinct failures (different workflow/node/error) are distinct incidents and always email;
//   * a global per-hour cap rolls overflow into a digest (nothing is silently lost);
//   * the notifier never emails about itself (no notification loops);
//   * nothing is invented: every field that the payload does not carry is labelled "unavailable".

export const UNAVAILABLE = "unavailable";

export const DEFAULT_CONFIG = {
  /** Events for one fingerprint closer together than this belong to the same incident. Kept equal to
   *  closeAfterMin so an incident that goes quiet is wrapped up (see sweep) before a new one starts. */
  incidentGapMin: 180,
  /** Minimum minutes between two emails for the same ongoing incident (continued-failure summary). */
  cooldownMin: 360,
  /** This many events inside flapWindowMin escalates the incident once. */
  flapThreshold: 5,
  flapWindowMin: 60,
  /** An incident with no new event for this long is closed by the sweeper. */
  closeAfterMin: 180,
  /** Global flood cap; anything over it is rolled into the next digest. */
  maxEmailsPerHour: 10,
  retentionDays: 14,
  maxTrackedIncidents: 200,
  editorBaseUrl: "https://n8n.srv1787796.hstgr.cloud",
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ───────────────────────── normalisation ─────────────────────────

/** Strips volatile parts (ids, numbers, urls, emails) so the same error always fingerprints the same. */
export function normalizeMessage(message) {
  return String(message == null ? "" : message)
    .toLowerCase()
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g, "<email>")
    .replace(/https?:\/\/[^\s"')]+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/g, "<id>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function str(v) {
  return v == null || v === "" ? null : String(v).slice(0, 1000);
}

/** host + path only, never the query string (it can carry tokens). */
export function safeUrl(raw) {
  const s = String(raw == null ? "" : raw);
  if (!s || s.charAt(0) === "=") return null;
  // Deliberately NOT `new URL(...)`: the URL global is not available inside n8n's Code-node sandbox
  // (found by running this in the real runner), so parse with a regex that drops query and fragment.
  const m = s.match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#\s]+)([^?#\s]*)/i);
  return m ? m[1] + m[2] : null;
}

const NODE_SERVICES = [
  [/emailreadimap/i, "IMAP mailbox"],
  [/emailsend|smtp/i, "SMTP (outgoing mail)"],
  [/googlesheets/i, "Google Sheets API"],
  [/googledrive/i, "Google Drive API"],
  [/gmail/i, "Gmail API"],
  [/openai|langchain.*lmchat|lmchatopenai/i, "OpenAI API"],
  [/airtable/i, "Airtable API"],
  [/postgres|mysql|mongo|redis/i, "database"],
];

/**
 * Turns whichever payload shape n8n sent into one flat event. Never throws; unknown fields stay null.
 *   execution failure : { execution: { id, url, error, lastNodeExecuted, mode, retryOf }, workflow }
 *   activation failure: { trigger:   { error, mode }, workflow }
 */
export function normalizeEvent(payload, ctx) {
  const nowMs = (ctx && ctx.nowMs) || Date.now();
  const ownWorkflowId = (ctx && ctx.ownWorkflowId) || null;
  const p = payload && typeof payload === "object" ? payload : {};
  const wf = p.workflow && typeof p.workflow === "object" ? p.workflow : {};
  const ex = p.execution && typeof p.execution === "object" ? p.execution : null;
  const tr = p.trigger && typeof p.trigger === "object" ? p.trigger : null;
  const err = (ex && ex.error) || (tr && tr.error) || (p.error && typeof p.error === "object" ? p.error : {}) || {};
  const nodeObj = err.node && typeof err.node === "object" ? err.node : null;
  const message = str(err.message) || str(p.message);
  const kind = ex ? "execution" : tr ? "activation" : "unknown";

  let nodeName = (nodeObj && str(nodeObj.name)) || (ex && str(ex.lastNodeExecuted)) || null;
  if (!nodeName && message) {
    const m = message.match(/trigger node "([^"]+)"/i);
    if (m) nodeName = m[1];
  }

  const params = (nodeObj && nodeObj.parameters) || {};
  const operationParts = [];
  if (str(params.resource)) operationParts.push(String(params.resource));
  if (str(params.operation)) operationParts.push(String(params.operation));
  const url = safeUrl(params.url);
  if (str(params.method) && url) operationParts.push(String(params.method).toUpperCase() + " " + url);
  else if (url) operationParts.push(url);

  const nodeType = (nodeObj && str(nodeObj.type)) || null;
  let service = null;
  if (nodeType) {
    for (const pair of NODE_SERVICES) if (pair[0].test(nodeType)) { service = pair[1]; break; }
    if (!service && /httprequest/i.test(nodeType) && url) service = url.split("/")[0];
  }

  const ts = Number(err.timestamp);
  return {
    kind: kind,
    workflowId: str(wf.id) || (ex && ex.workflowData && str(ex.workflowData.id)) || null,
    workflowName: str(wf.name) || null,
    nodeName: nodeName,
    nodeId: (nodeObj && str(nodeObj.id)) || null,
    nodeType: nodeType,
    operation: operationParts.length ? operationParts.join(" ") : null,
    service: service,
    errorName: str(err.name),
    message: message,
    description: str(err.description),
    httpCode: str(err.httpCode) || (err.cause && str(err.cause.httpCode)) || null,
    mode: (ex && str(ex.mode)) || (tr && str(tr.mode)) || null,
    executionId: ex ? str(ex.id) : null,
    executionUrl: ex ? str(ex.url) : null,
    retryOf: ex ? str(ex.retryOf) : null,
    occurredAtMs: Number.isFinite(ts) && ts > 1e12 ? ts : nowMs,
    timestampIsFromPayload: Number.isFinite(ts) && ts > 1e12,
    // an error raised while an error workflow itself was running, or by this notifier: never email it
    selfOrigin: (!!ownWorkflowId && str(wf.id) === ownWorkflowId) || (!!ex && ex.mode === "error"),
  };
}

export function fingerprint(event) {
  return [event.workflowId || "?", event.nodeName || (event.kind === "activation" ? "trigger" : "?"), event.errorName || "?", normalizeMessage(event.message)].join("|");
}

// ───────────────────────── classification ─────────────────────────

export function severityOf(event, incident) {
  if (event.kind === "activation") return incident && incident.escalated ? "critical" : "warning";
  return "critical";
}

/** What can honestly be said about transient vs persistent, from evidence only. */
export function durabilityOf(event, incident) {
  const count = incident ? incident.count : 1;
  if (event.kind === "activation") {
    if (incident && incident.escalated) return "repeating -- " + count + " drops in the last " + DEFAULT_CONFIG.flapWindowMin + " minutes";
    if (count <= 1) return "unknown (first occurrence); n8n is retrying activation automatically, retry outcomes are not reported to alerts";
    return "transient so far -- " + (count - 1) + " earlier drop(s) were each followed by a working activation (a trigger can only drop again after it was re-established)";
  }
  if (count <= 1) return "unknown (first occurrence)";
  return "recurring -- the same node and error " + count + " times";
}

export function impactOf(event) {
  if (event.kind === "activation") return "blocking while deactivated: the trigger is removed until n8n reactivates it (first retry after ~1 s, doubling on each failed retry up to 24 h)";
  if (event.kind === "execution") return "blocking for that execution: it stopped at the failing node";
  return UNAVAILABLE;
}

export function retriesOf(event) {
  if (event.kind === "activation") return "automatic reactivation scheduled by n8n; its outcome is not part of the alert";
  if (event.retryOf) return "this execution is itself a retry of execution " + event.retryOf;
  return UNAVAILABLE + " (node retry settings and outcomes are not included in the error payload)";
}

export function nextActionOf(event) {
  const code = Number(event.httpCode);
  if (code === 401 || code === 403) return "Authorization failed: check or reconnect the credential used by this node.";
  if (code === 429) return "Rate limited by the service: reduce the frequency or wait, then re-run.";
  if (code >= 500 && code < 600) return "The remote service returned a server error: check its status; this may clear by itself.";
  if (event.kind === "activation") return "If no further alerts follow, no action is needed. If replies/events stop being processed, check the trigger's credential or mailbox and the workflow's activation state in n8n.";
  if (event.kind === "execution") return "Open the execution link, inspect the failing node's input and output, fix the cause, then re-run.";
  return UNAVAILABLE;
}

export function causeNote(event) {
  if (event.kind === "activation") return "unavailable in the error payload (n8n logs it on the server: look for \"failed with the error\" in the n8n log)";
  return event.description || UNAVAILABLE;
}

// ───────────────────────── incident state machine ─────────────────────────

export const MAX_REMEMBERED_EVENTS = 50;

export function emptyState() {
  return { version: 1, incidents: {}, recentEmailTimes: [], overflow: { count: 0, fingerprints: [] }, lastSweepAt: 0, processed: {} };
}

/**
 * Idempotency. n8n retries an HTTP call whose response it never saw; without this a retry would be
 * counted as a duplicate occurrence and the email decided on the first (lost) response would never
 * be sent. The decision for an event id is remembered, so a retry gets the SAME answer and does not
 * change any count.
 */
export function recallDecision(state, eventId) {
  if (!eventId || !state || !state.processed) return null;
  return Object.prototype.hasOwnProperty.call(state.processed, eventId) ? state.processed[eventId] : null;
}

export function rememberDecision(state, eventId, result) {
  if (!eventId) return;
  state.processed = state.processed || {};
  state.processed[eventId] = result;
  const ids = Object.keys(state.processed);
  if (ids.length > MAX_REMEMBERED_EVENTS) for (const id of ids.slice(0, ids.length - MAX_REMEMBERED_EVENTS)) delete state.processed[id];
}

/** The Errors-sheet row for one event. Every event is logged whether or not it is emailed. */
export function buildLogRow(event, decision, emailed) {
  const U = UNAVAILABLE;
  return {
    Timestamp: new Date(event.occurredAtMs).toISOString(),
    Source: "Global Workflow Error",
    "Lead Email": event.executionId ? "Execution ID: " + event.executionId : "",
    "Error Message": event.message || U,
    "Node Name": event.nodeName || U,
    Company: "",
    "Validation Errors": JSON.stringify([event.message || U]),
    "Validation Warnings": JSON.stringify({
      workflowName: event.workflowName || U, workflowId: event.workflowId || U, kind: event.kind,
      executionId: event.executionId || "", executionUrl: event.executionUrl || "", mode: event.mode || "",
      incidentCount: decision && decision.incident ? decision.incident.count : 1, emailed: !!emailed,
      decision: decision ? decision.reason : "", selfOrigin: event.selfOrigin,
    }),
    "Workspace ID": "biggbee",
  };
}

function cfgOf(cfg) {
  return Object.assign({}, DEFAULT_CONFIG, cfg || {});
}

function emailsInLastHour(state, nowMs) {
  return (state.recentEmailTimes || []).filter((t) => nowMs - t < HOUR).length;
}

function recordEmail(state, nowMs) {
  state.recentEmailTimes = (state.recentEmailTimes || []).filter((t) => nowMs - t < HOUR).concat([nowMs]);
}

function prune(state, c, nowMs) {
  const keepAfter = nowMs - c.retentionDays * 24 * HOUR;
  for (const fp of Object.keys(state.incidents)) {
    const i = state.incidents[fp];
    if (i.status === "closed" && i.lastAt < keepAfter) delete state.incidents[fp];
  }
  const fps = Object.keys(state.incidents);
  if (fps.length > c.maxTrackedIncidents) {
    fps
      .filter((fp) => state.incidents[fp].status === "closed")
      .sort((a, b) => state.incidents[a].lastAt - state.incidents[b].lastAt)
      .slice(0, fps.length - c.maxTrackedIncidents)
      .forEach((fp) => delete state.incidents[fp]);
  }
}

/**
 * Folds one event into the persistent state and decides whether it deserves an email.
 * Returns { state, decision: { email: null | { kind }, reason, incident, isNewIncident, suppressed } }.
 * `state` is mutated and returned (it is the workflow's static data).
 */
export function applyEvent(state, event, cfg, nowMs) {
  const c = cfgOf(cfg);
  if (!state || state.version !== 1) state = emptyState();
  if (!state.processed) state.processed = {};

  if (event.selfOrigin) {
    return { state: state, decision: { email: null, reason: "self-origin: logged only, never emailed (prevents notification loops)", incident: null, isNewIncident: false, suppressed: false } };
  }

  const fp = fingerprint(event);
  let inc = state.incidents[fp];
  const t = event.occurredAtMs;
  let isNew = false;

  if (!inc || inc.status === "closed" || t - inc.lastAt > c.incidentGapMin * MIN) {
    isNew = true;
    // remember what the previous incident for this same fingerprint looked like, so it is reported
    // in the new alert instead of being silently forgotten
    const previous = inc ? { count: inc.count, firstAt: inc.firstAt, lastAt: inc.lastAt } : null;
    inc = {
      previous: previous,
      fp: fp, workflowId: event.workflowId, workflowName: event.workflowName, node: event.nodeName, kind: event.kind, errorName: event.errorName, message: event.message ? String(event.message).slice(0, 300) : null,
      firstAt: t, lastAt: t, count: 1, countSinceEmail: 0, lastEmailAt: 0, emails: 0, escalated: false, status: "open", recentTimes: [t],
      lastExecutionId: event.executionId, lastExecutionUrl: event.executionUrl,
    };
  } else {
    inc.count += 1;
    inc.countSinceEmail += 1;
    inc.lastAt = Math.max(inc.lastAt, t);
    inc.recentTimes = (inc.recentTimes || []).concat([t]).slice(-100);
    inc.lastExecutionId = event.executionId || inc.lastExecutionId;
    inc.lastExecutionUrl = event.executionUrl || inc.lastExecutionUrl;
  }
  state.incidents[fp] = inc;

  let kind = null;
  let reason;
  if (isNew) {
    kind = "incident_started";
    reason = "new incident";
  } else {
    const inWindow = inc.recentTimes.filter((x) => t - x <= c.flapWindowMin * MIN).length;
    if (!inc.escalated && inWindow >= c.flapThreshold) {
      inc.escalated = true;
      kind = "repeating";
      reason = inWindow + " events within " + c.flapWindowMin + " min";
    } else if (t - inc.lastEmailAt >= c.cooldownMin * MIN) {
      kind = "continued";
      reason = "cooldown elapsed; continued-failure summary";
    } else {
      reason = "duplicate within incident (cooldown)";
    }
  }

  if (kind) {
    if (emailsInLastHour(state, nowMs) >= c.maxEmailsPerHour) {
      state.overflow.count += 1;
      if (state.overflow.fingerprints.indexOf(fp) === -1 && state.overflow.fingerprints.length < 50) state.overflow.fingerprints.push(fp);
      prune(state, c, nowMs);
      return { state: state, decision: { email: null, reason: "flood cap reached (" + c.maxEmailsPerHour + "/h); rolled into the next digest", incident: inc, isNewIncident: isNew, suppressed: true, overflow: true } };
    }
    recordEmail(state, nowMs);
    inc.lastEmailAt = nowMs;
    inc.emails += 1;
    inc.countSinceEmail = 0;
    prune(state, c, nowMs);
    return { state: state, decision: { email: { kind: kind }, reason: reason, incident: inc, isNewIncident: isNew, suppressed: false } };
  }
  prune(state, c, nowMs);
  return { state: state, decision: { email: null, reason: reason, incident: inc, isNewIncident: false, suppressed: true } };
}

/**
 * Periodic housekeeping (run by the notifier's schedule): closes quiet incidents, reports ones that
 * had repeated, and flushes the overflow digest. Returns { state, emails: [{ kind, incident? }] }.
 */
export function sweep(state, cfg, nowMs) {
  const c = cfgOf(cfg);
  if (!state || state.version !== 1) state = emptyState();
  const emails = [];
  for (const fp of Object.keys(state.incidents)) {
    const inc = state.incidents[fp];
    if (inc.status !== "open") continue;
    if (nowMs - inc.lastAt < c.closeAfterMin * MIN) continue;
    inc.status = "closed";
    inc.closedAt = nowMs;
    // single-occurrence incidents were already announced; only incidents that repeated get a wrap-up
    if (inc.count > 1 || inc.escalated) emails.push({ kind: "ended", incident: inc });
  }
  if (state.overflow.count > 0) emails.push({ kind: "digest", overflow: { count: state.overflow.count, fingerprints: state.overflow.fingerprints.map((fp) => (state.incidents[fp] ? { fp: fp, workflowName: state.incidents[fp].workflowName, node: state.incidents[fp].node } : { fp: fp }) ) } });
  // honour the global cap for what the sweep itself sends (keep at least the digest visible)
  let budget = Math.max(c.maxEmailsPerHour - emailsInLastHour(state, nowMs), 1);
  const out = [];
  for (const e of emails) {
    if (e.kind === "digest" || budget > 0) {
      out.push(e);
      if (e.kind !== "digest") budget -= 1;
      recordEmail(state, nowMs);
    }
    // else: over the hourly cap. "ended" notes are informational (the original alert and every
    // occurrence are already recorded), so they are dropped rather than queued.
  }
  if (out.some((e) => e.kind === "digest")) state.overflow = { count: 0, fingerprints: [] };
  state.lastSweepAt = nowMs;
  prune(state, c, nowMs);
  return { state: state, emails: out };
}

// ───────────────────────── rendering ─────────────────────────

function iso(ms) {
  return new Date(ms).toISOString();
}

function mins(ms) {
  return Math.max(1, Math.round(ms / MIN));
}

function link(event, cfg) {
  if (event.executionUrl) return event.executionUrl;
  if (event.workflowId) return String(cfg.editorBaseUrl || DEFAULT_CONFIG.editorBaseUrl).replace(/\/+$/, "") + "/workflow/" + event.workflowId;
  return UNAVAILABLE;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtml(lines) {
  return "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#172033;line-height:1.5\">" + lines.map((l) => (l === "" ? "<br>" : "<div>" + esc(l) + "</div>")).join("") + "</div>";
}

const TITLES = {
  incident_started: { critical: "Critical error", warning: "Warning" },
  repeating: { critical: "Critical: repeating failure", warning: "Repeating failure" },
  continued: { critical: "Still failing", warning: "Still failing" },
};

/**
 * Renders the alert for an incident. `event` is the latest normalised event (used for detail
 * fields); `incident` carries counts/times. Every unknown field is labelled "unavailable".
 */
export function renderEmail(kind, incident, event, cfg, nowMs) {
  const c = cfgOf(cfg);
  if (kind === "ended") {
    const where = (incident.workflowName || UNAVAILABLE) + " / " + (incident.node || UNAVAILABLE);
    const lines = [
      "No further occurrences reported.",
      "",
      "Workflow: " + (incident.workflowName || UNAVAILABLE) + " (" + (incident.workflowId || UNAVAILABLE) + ")",
      "Failing node: " + (incident.node || UNAVAILABLE),
      "Error: " + (incident.message || UNAVAILABLE),
      "Occurrences: " + incident.count + " between " + iso(incident.firstAt) + " and " + iso(incident.lastAt),
      "Quiet for: " + mins(nowMs - incident.lastAt) + " minutes",
      "",
      incident.kind === "activation"
        ? "Note: this is inferred from silence. n8n's reactivation retries do not raise alerts, so this cannot confirm that the trigger is currently active. If replies/events are not being processed, check the workflow in n8n."
        : "Note: this is inferred from the absence of new errors, not from a confirmed successful run.",
    ];
    return { subject: "[Biggbee alert] Quiet: " + where, text: lines.join("\n"), html: toHtml(lines) };
  }
  if (kind === "digest") {
    const items = (incident && incident.fingerprints) || [];
    const lines = [
      "The alert flood cap (" + c.maxEmailsPerHour + " emails/hour) was reached and " + incident.count + " alert(s) were held back. Nothing was discarded: every error is also in the Errors sheet.",
      "",
      "Affected (up to 50 shown):",
    ].concat(items.map((i) => "- " + (i.workflowName || UNAVAILABLE) + " / " + (i.node || UNAVAILABLE)));
    return { subject: "[Biggbee alert] " + incident.count + " alert(s) held back by the flood cap", text: lines.join("\n"), html: toHtml(lines) };
  }

  const severity = severityOf(event, incident);
  const title = (TITLES[kind] || TITLES.incident_started)[severity] || "Error";
  const where = (event.workflowName || incident.workflowName || UNAVAILABLE) + " / " + (event.nodeName || UNAVAILABLE);
  const lines = [
    title + ": " + where,
    "",
    "Workflow: " + (event.workflowName || UNAVAILABLE) + " (id " + (event.workflowId || UNAVAILABLE) + ")",
    "Failing node: " + (event.nodeName || UNAVAILABLE) + " (id " + (event.nodeId || UNAVAILABLE) + ")",
    "Execution: " + (event.executionId
      ? event.executionId + " -- " + (event.executionUrl ? event.executionUrl : "execution link unavailable; workflow: " + link(event, c))
      : "none -- " + (event.kind === "activation" ? "activation errors occur outside an execution; workflow: " + link(event, c) : UNAVAILABLE)),
    "Time: " + iso(event.occurredAtMs) + (event.timestampIsFromPayload ? "" : " (alert time; the payload carried no timestamp)"),
    "Error: " + (event.message || UNAVAILABLE) + (event.httpCode ? " (HTTP " + event.httpCode + ")" : ""),
    "Operation: " + (event.operation || UNAVAILABLE),
    "Affected service: " + (event.service || UNAVAILABLE),
    "Underlying cause: " + causeNote(event),
    "Type: " + severity + " | " + durabilityOf(event, incident),
    "Impact: " + impactOf(event),
    "Retries: " + retriesOf(event),
    "Next action: " + nextActionOf(event),
    "",
    "Incident: " + incident.count + " occurrence(s) since " + iso(incident.firstAt) + (kind === "continued" ? "; " + incident.countSinceEmail + " since the last email" : "") +
      ". Repeats of this exact error are counted, not emailed; you will get a summary every " + mins(c.cooldownMin * MIN) + " minutes while it continues, and a wrap-up once it has been quiet for " + mins(c.closeAfterMin * MIN) + " minutes.",
  ];
  if (incident.previous && kind === "incident_started") {
    lines.push("Previous incident of this same error: " + incident.previous.count + " occurrence(s), last at " + iso(incident.previous.lastAt) + ".");
  }
  const subjectBits = { incident_started: "", repeating: " (repeating)", continued: " (continued)" };
  return { subject: "[Biggbee alert][" + severity.toUpperCase() + "] " + where + (subjectBits[kind] || ""), text: lines.join("\n"), html: toHtml(lines) };
}
