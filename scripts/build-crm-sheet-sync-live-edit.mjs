// Builds the PUT body for the minimal live edit of "Biggbee CRM Sheet Sync" from a fresh GET of the live
// workflow (never from a file in the repo), by applying ONLY the two reviewed transforms:
//   patchWorkflow   (scripts/patch-crm-sheet-sync-auth.mjs)       -> credential on "Fetch CRM Rows"
//   hardenWorkflow  (scripts/patch-crm-sheet-sync-hardening.mjs)   -> explicit workspace, batch dedupe, no cross-business merge
//
//   node scripts/build-crm-sheet-sync-live-edit.mjs <live-get.json> <put-body.json>
//
// It then proves the result differs from the live definition in exactly four nodes and that connections,
// settings, trigger nodes and every other node are identical, and refuses to write otherwise.
// It reads and writes local files only; the caller performs the PUT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { patchWorkflow } = await import(pathToFileURL(path.join(root, "scripts/patch-crm-sheet-sync-auth.mjs")).href);
const { hardenWorkflow } = await import(pathToFileURL(path.join(root, "scripts/patch-crm-sheet-sync-hardening.mjs")).href);

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) throw new Error("usage: build-crm-sheet-sync-live-edit.mjs <live-get.json> <put-body.json>");
const live = JSON.parse(fs.readFileSync(inFile, "utf8"));
if (live.id !== "ZdiauTxu6K8yF42l" || live.name !== "Biggbee CRM Sheet Sync") throw new Error("not the expected workflow");

const step1 = patchWorkflow(live);
const step2 = hardenWorkflow(step1.workflow);
if (!step1.changed || !step2.changed) throw new Error("live workflow already (partly) patched; refusing to guess");
const next = step2.workflow;

const EXPECTED = ["Append CRM Row", "Fetch CRM Rows", "Match & Decide", "Summarize & Checkpoint"];
const changed = live.nodes.filter((o) => JSON.stringify(o) !== JSON.stringify(next.nodes.find((n) => n.id === o.id))).map((o) => o.name).sort();
if (JSON.stringify(changed) !== JSON.stringify(EXPECTED)) throw new Error(`unexpected changed nodes: ${changed.join(", ")}`);
if (next.nodes.length !== live.nodes.length) throw new Error("node count changed");
if (JSON.stringify(next.connections) !== JSON.stringify(live.connections)) throw new Error("connections changed");
for (const n of live.nodes) {
  const m = next.nodes.find((x) => x.id === n.id);
  if (n.id !== m.id || n.name !== m.name || n.type !== m.type || JSON.stringify(n.position) !== JSON.stringify(m.position)) throw new Error(`identity/position of ${n.name} changed`);
}

// the public-API PUT body: definition only (static data, ids, tags, activation are not part of it)
const body = { name: next.name, nodes: next.nodes, connections: next.connections, settings: next.settings };
fs.writeFileSync(outFile, JSON.stringify(body));
console.log(`OK: only ${changed.length} nodes differ from live: ${changed.join(" | ")}`);
console.log(`schedule/webhook/Sheets nodes, connections, settings untouched; wrote ${path.basename(outFile)} (${fs.statSync(outFile).size} bytes)`);
