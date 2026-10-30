// Concurrency tests for the alert decision service, run against the REAL json-store (same code the
// CRM route uses) in child processes. Requires Node >= 22.18 (built-in TypeScript type stripping),
// because the store is a .ts file. Each test gets its own empty data directory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const child = path.join(here, "atomic.child.mjs");

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "alerts-test-"));
}
function run(dir, scenario, arg = "", cfg = undefined) {
  const r = spawnSync(process.execPath, ["--conditions=react-server", "--no-warnings", child, scenario, arg], {
    env: { ...process.env, LOCAL_DATA_DIR: dir, ...(cfg ? { ALERT_CFG: JSON.stringify(cfg) } : {}) },
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(r.status, 0, "child failed: " + (r.stderr || "").slice(0, 800));
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

test("100 simultaneous identical errors produce exactly one incident email and one escalation (not 100), with an exact count", () => {
  const dir = freshDir();
  const r = run(dir, "identical", "100");
  assert.equal(r.emails, 2);
  assert.deepEqual(r.kinds, ["incident_started", "repeating"], "one start + the single flapping escalation; never one email per event");
  assert.equal(r.incidents, 1);
  assert.deepEqual(r.incidentCounts, [100], "no lost updates: every one of the 100 is counted");
  assert.ok(r.rememberedEvents <= 50, "idempotency memory is bounded");
});

test("a restart in the middle (new process, same data) keeps de-duplicating", () => {
  const dir = freshDir();
  assert.equal(run(dir, "identical", "50").emails, 2); // start + escalation
  const afterRestart = run(dir, "identical", "50");
  assert.equal(afterRestart.emails, 0, "the incident AND its escalation state survived the restart, so nothing is re-announced");
  assert.deepEqual(afterRestart.incidentCounts, [100]);
});

test("the flood cap holds under a simultaneous burst of DIFFERENT failures, and nothing is lost", () => {
  const dir = freshDir();
  const r = run(dir, "distinct-cap", "40", { maxEmailsPerHour: 10 });
  assert.equal(r.emails, 10, "exactly the cap, not 40");
  assert.equal(r.overflowBeforeSweep, 30);
  assert.equal(r.digests, 1, "one digest accounts for the held-back alerts");
  assert.equal(r.overflowAfterSweep, 0);
  assert.equal(r.incidents, 40, "all 40 distinct failures are tracked");
});

test("distinct failures are never suppressed by a flood of identical ones", () => {
  const dir = freshDir();
  const r = run(dir, "mixed");
  assert.equal(r.triggerEmails, 2, "the identical flood: one start + one escalation");
  assert.equal(r.distinctSubjectsEmailed, 5, "each distinct failure still gets its own email");
  assert.equal(r.emails, 7);
});

test("escalation fires exactly once when many identical errors arrive together", () => {
  const dir = freshDir();
  const r = run(dir, "escalation", "12", { flapThreshold: 5 });
  assert.deepEqual(r.kinds, ["incident_started", "repeating"]);
  assert.equal(r.count, 12);
});

test("quiet-period wrap-up is sent exactly once even if several sweeps run at the same moment", () => {
  const dir = freshDir();
  const r = run(dir, "sweep-twice");
  assert.equal(r.wrapupsAcrossConcurrentSweeps, 1);
  assert.equal(r.wrapupsOnLaterSweep, 0);
  assert.equal(r.status, "closed");
  assert.ok(r.text.some((l) => /Occurrences: 5/.test(l)));
  assert.ok(r.text.some((l) => /inferred from silence/.test(l)), "never claims a confirmed recovery");
});

test("a retried HTTP call (same event id) returns the original decision and counts once, so a lost response can never lose or double an alert", () => {
  const dir = freshDir();
  const r = run(dir, "retry");
  assert.equal(r.firstSendEmail, true);
  assert.equal(r.firstReplayed, false);
  assert.equal(r.retriesAllSameDecision, true);
  assert.equal(r.count, 1);
});

test("loop prevention: the notifier's own failures and failures inside error runs are logged, never emailed, never tracked", () => {
  const dir = freshDir();
  const r = run(dir, "self");
  assert.equal(r.emails, 0);
  assert.equal(r.logged, true);
  assert.equal(r.incidents, 0);
});

test("the state file on disk is valid JSON after a burst (no torn writes)", () => {
  const dir = freshDir();
  run(dir, "identical", "200");
  const file = path.join(dir, "alert-incidents.json");
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), [], "no leftover temp files");
});
