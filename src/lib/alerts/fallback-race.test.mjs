// Model of n8n's execution/static-data behaviour, used to characterise the LOCAL FALLBACK path
// (the path that runs only when the CRM alert service is unreachable).
//
// n8n loads a workflow's static data when an execution STARTS and saves it when the execution
// ENDS, last writer wins. So executions that overlap in time all decide from the same snapshot,
// and all but one of their updates are lost. This file models exactly that ("waves" of overlapping
// executions) and proves two things:
//   1. the weakness is real (and is why the decision lives in the CRM now);
//   2. in that worst case the fallback still fails OPEN: it can send EXTRA emails but can never
//      leave a failure with no email at all.
import assert from "node:assert/strict";
import test from "node:test";
import * as core from "./throttle-core.mjs";

const MIN = 60 * 1000;
const T0 = Date.parse("2026-10-30T10:00:00.000Z");
const BIG_CAP = { maxEmailsPerHour: 100000 };

const failure = (node) => ({ execution: { id: "1", mode: "trigger", lastNodeExecuted: node, error: { name: "NodeApiError", message: "boom " + node, node: { id: node, name: node, type: "n8n-nodes-base.httpRequest" } } }, workflow: { id: "W1", name: "W" } });

/** Overlapping executions in one wave share a snapshot; afterwards ONE of their states survives. */
function runWaves(waves, cfg, pickWinner) {
  let persisted = core.emptyState();
  const emails = [];
  waves.forEach((wave, w) => {
    const at = T0 + w * MIN;
    const results = wave.map((node) => {
      const snapshot = JSON.parse(JSON.stringify(persisted));
      const r = core.applyEvent(snapshot, core.normalizeEvent(failure(node), { nowMs: at }), cfg, at);
      if (r.decision.email) emails.push({ wave: w, node, kind: r.decision.email.kind });
      return r.state;
    });
    persisted = results[pickWinner(results.length)];
  });
  return emails;
}
/** The reference: the same events decided strictly one after another (what the CRM guarantees). */
function runSerial(waves, cfg) {
  let state = core.emptyState();
  const emails = [];
  waves.forEach((wave, w) => {
    const at = T0 + w * MIN;
    for (const node of wave) {
      const r = core.applyEvent(state, core.normalizeEvent(failure(node), { nowMs: at }), cfg, at);
      state = r.state;
      if (r.decision.email) emails.push({ wave: w, node, kind: r.decision.email.kind });
    }
  });
  return emails;
}

// small deterministic PRNG so failures are reproducible
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test("THE WEAKNESS (why the decision moved to the CRM): 100 simultaneous identical errors on static data send 100 emails", () => {
  const emails = runWaves([Array(100).fill("Same Node")], {}, () => 0);
  assert.equal(emails.length, 100);
  assert.ok(emails.every((e) => e.kind === "incident_started"));
  // the same 100 decided serially (the CRM's guarantee) send 2: one start + one escalation
  assert.equal(runSerial([Array(100).fill("Same Node")], {}).length, 2);
});

test("the flood cap is also bypassed on static data: a simultaneous burst of distinct failures all email", () => {
  const nodes = Array.from({ length: 40 }, (_, i) => "Node " + i);
  const raced = runWaves([nodes], { maxEmailsPerHour: 10 }, () => 0);
  assert.equal(raced.length, 40, "every overlapping execution sees an empty snapshot");
  assert.equal(runSerial([nodes], { maxEmailsPerHour: 10 }).length, 10, "serial (CRM) enforces the cap");
});

test("PROPERTY: under arbitrary overlap and lost updates, the fallback only ever ADDS emails; no failure is left without one", () => {
  const pool = ["A", "B", "C", "D", "E", "F"];
  let extraEmails = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const waves = Array.from({ length: 1 + Math.floor(r() * 8) }, () => Array.from({ length: 1 + Math.floor(r() * 6) }, () => pool[Math.floor(r() * pool.length)]));
    const raced = runWaves(waves, BIG_CAP, (n) => Math.floor(r() * n)); // random last-writer
    const serial = runSerial(waves, BIG_CAP);

    // (1) every distinct failure that the serial run emailed about is emailed about in the raced run
    const racedNodes = new Set(raced.map((e) => e.node));
    for (const e of serial) assert.ok(racedNodes.has(e.node), `seed ${seed}: "${e.node}" was emailed serially but silenced under races`);
    // (2) the first appearance of every failure always emails at least once (first wave it shows up in)
    const firstWave = {};
    waves.forEach((wave, w) => wave.forEach((n) => { if (!(n in firstWave)) firstWave[n] = w; }));
    for (const [n, w] of Object.entries(firstWave)) assert.ok(raced.some((e) => e.node === n && e.wave === w), `seed ${seed}: first "${n}" alert in wave ${w} was never emailed`);
    // (3) incident-start emails are never fewer than serial (losing state can only make an error look "new" again)
    const starts = (list) => list.filter((e) => e.kind === "incident_started").length;
    assert.ok(starts(raced) >= starts(serial), `seed ${seed}: fewer incident-start emails than serial`);
    extraEmails += raced.length - serial.length;
  }
  assert.ok(extraEmails > 0, "the model does exercise races (extra emails do occur)");
  console.log("      300 random overlap schedules: fallback never silenced a failure; sent " + extraEmails + " extra emails in total versus the atomic path");
});

test("what the fallback can lose: escalation/summary timing, because lost updates under-count occurrences (documented limitation, not a silenced first alert)", () => {
  // 12 identical errors, each in its own wave, but every wave's updates are overwritten by an older snapshot
  const waves = Array.from({ length: 12 }, () => ["X", "Y"]);
  const serial = runSerial(waves, { flapThreshold: 5 });
  const lossy = runWaves(waves, { flapThreshold: 5 }, () => 0); // always keep the first execution's state
  assert.ok(serial.some((e) => e.kind === "repeating"));
  // the point: both runs email about both failures at least once
  for (const node of ["X", "Y"]) assert.ok(lossy.some((e) => e.node === node));
});
