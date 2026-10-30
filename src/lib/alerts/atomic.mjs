// Atomic alert decisions. Plain .mjs with the store injected, so the CRM route uses the real
// json-store `updateCollection` and the tests can drive the SAME function against the SAME store
// code, without Next.js.
//
// Why this exists: n8n workflow static data is NOT a safe place to decide "have I already emailed
// about this?". Each error-workflow execution works on a snapshot loaded when it starts and the
// last writer wins, so simultaneous identical errors all see "new incident" (and a burst also
// bypasses the flood cap). `updateCollection` runs read -> decide -> write as one synchronous step
// inside a per-collection promise queue, so every decision sees every earlier decision.
//
// Guarantee, and its boundary: atomic across all callers in ONE Node process (the CRM is a single
// container/process). It is not a cross-process lock; running two CRM processes against one data
// directory would need a real database.

import * as core from "./throttle-core.mjs";

export const ALERT_COLLECTION = "alert-incidents";

function summarize(event, decision, mail) {
  return {
    sendEmail: !!mail,
    mail: mail,
    log: core.buildLogRow(event, decision, !!mail),
    decision: {
      reason: decision.reason,
      kind: decision.email ? decision.email.kind : null,
      isNewIncident: !!decision.isNewIncident,
      suppressed: !!decision.suppressed,
      overflow: !!decision.overflow,
      incidentCount: decision.incident ? decision.incident.count : null,
    },
  };
}

/**
 * @typedef {(collection: string, fallback: any, mutate: (current: any) => any) => Promise<any>} UpdateCollection
 */

/**
 * Folds one alert into the persisted state and returns what to do with it.
 * `eventId` makes the call idempotent: a retry of an event whose response was lost returns the
 * original decision (including the email) and changes nothing.
 * @param {UpdateCollection} updateCollection
 * @param {{ payload: unknown, ownWorkflowId?: string, eventId?: string, config?: Record<string, unknown>, nowMs?: number }} args
 * @returns {Promise<{ sendEmail: boolean, mail: any, log: Record<string, string>, decision: Record<string, any>, replayed?: boolean }>}
 */
export async function decideAtomically(updateCollection, { payload, ownWorkflowId, eventId, config, nowMs }) {
  const now = nowMs == null ? Date.now() : nowMs;
  const event = core.normalizeEvent(payload, { nowMs: now, ownWorkflowId: ownWorkflowId });
  let out;
  await updateCollection(ALERT_COLLECTION, core.emptyState(), (current) => {
    const state = current && current.version === 1 ? current : core.emptyState();
    const remembered = core.recallDecision(state, eventId);
    if (remembered) {
      out = Object.assign({}, remembered, { replayed: true });
      return state; // unchanged
    }
    const r = core.applyEvent(state, event, config, now);
    // render inside the transaction so the text reflects exactly this decision's counts
    const mail = r.decision.email ? core.renderEmail(r.decision.email.kind, r.decision.incident, event, config, now) : null;
    out = summarize(event, r.decision, mail);
    core.rememberDecision(r.state, eventId, out);
    return r.state;
  });
  return out;
}

/**
 * Closes quiet incidents and flushes the overflow digest, atomically (two sweeps never both report).
 * @param {UpdateCollection} updateCollection
 * @param {{ config?: Record<string, unknown>, nowMs?: number }} args
 * @returns {Promise<{ emails: { mail: any }[] }>}
 */
export async function sweepAtomically(updateCollection, { config, nowMs }) {
  const now = nowMs == null ? Date.now() : nowMs;
  let mails = [];
  await updateCollection(ALERT_COLLECTION, core.emptyState(), (current) => {
    const state = current && current.version === 1 ? current : core.emptyState();
    const r = core.sweep(state, config, now);
    mails = r.emails.map((e) => core.renderEmail(e.kind, e.kind === "digest" ? e.overflow : e.incident, null, config, now));
    return r.state;
  });
  return { emails: mails.map((mail) => ({ mail: mail })) };
}
