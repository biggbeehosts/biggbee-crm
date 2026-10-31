// Builds the PUT body for a minimal live edit of the (inactive) "Website Redesign Outreach" n8n workflow:
// take a fresh GET of the live workflow and replace ONLY the jsCode of the Code nodes whose reviewed code changed.
//
//   node scripts/build-redesign-live-edit.mjs <live-get.json> <put-body.json> [<before-artifact.json>]
//
// Refuses unless (a) each node to be replaced is, whitespace-insensitively, the previous reviewed artifact's code
// (so nothing hand-edited in n8n is overwritten) and (b) nothing else about any node, the connections or the
// settings would change. Local files only; the caller performs the PUT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [liveFile, outFile, beforeFile] = process.argv.slice(2);
if (!liveFile || !outFile || !beforeFile) throw new Error("usage: build-redesign-live-edit.mjs <live-get.json> <put-body.json> <previous-artifact.json>");
const first = (j) => (Array.isArray(j) ? j[0] : j);
const live = JSON.parse(fs.readFileSync(liveFile, "utf8"));
const next = first(JSON.parse(fs.readFileSync(path.join(root, "n8n/website-redesign-outreach.workflow.json"), "utf8")));
const prev = first(JSON.parse(fs.readFileSync(beforeFile, "utf8")));
if (live.id !== "Rf9hB2sJrRJGoalt") throw new Error("not the expected workflow id");
if (live.active) throw new Error("the redesign workflow must be inactive while it is edited");
const squash = (s) => String(s || "").replace(/\s+/g, "");

const edited = structuredClone(live);
const replaced = [];
for (const want of next.nodes) {
  const old = prev.nodes.find((n) => n.name === want.name);
  const cur = edited.nodes.find((n) => n.name === want.name);
  if (!old || !cur) throw new Error(`node "${want.name}" missing in previous artifact or live workflow`);
  if (squash(old.parameters.jsCode) === squash(want.parameters.jsCode)) continue; // unchanged
  if (squash(cur.parameters.jsCode) !== squash(old.parameters.jsCode)) throw new Error(`live "${want.name}" differs from the previously reviewed code; refusing to overwrite`);
  cur.parameters.jsCode = want.parameters.jsCode;
  replaced.push(want.name);
}
// prove nothing else moved
const changed = live.nodes.filter((o) => JSON.stringify(o) !== JSON.stringify(edited.nodes.find((n) => n.id === o.id))).map((o) => o.name).sort();
if (JSON.stringify(changed) !== JSON.stringify([...replaced].sort())) throw new Error("unexpected node changes: " + changed.join(", "));
for (const o of live.nodes) {
  const n = edited.nodes.find((x) => x.id === o.id);
  const { jsCode: _a, ...p1 } = o.parameters; const { jsCode: _b, ...p2 } = n.parameters;
  if (JSON.stringify({ ...o, parameters: p1 }) !== JSON.stringify({ ...n, parameters: p2 })) throw new Error(`non-code change in ${o.name}`);
}
if (JSON.stringify(edited.connections) !== JSON.stringify(live.connections)) throw new Error("connections changed");
fs.writeFileSync(outFile, JSON.stringify({ name: edited.name, nodes: edited.nodes, connections: edited.connections, settings: { executionOrder: (live.settings || {}).executionOrder || "v1" } }));
console.log(`OK: replaced jsCode in ${replaced.length} nodes: ${replaced.join(" | ")}`);
console.log("everything else (parameters, credentials, positions, connections) identical to live; wrote " + path.basename(outFile));
