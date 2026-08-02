#!/usr/bin/env node
/**
 * Imports GOOGLE_PROJECT_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY from a fresh Google
 * service-account JSON key into a local, gitignored env file -- without ever printing the key.
 *
 * Usage:
 *   node scripts/import-google-service-account.mjs <path-to-service-account.json> [target-env-file]
 *   npm run credentials:import -- <path-to-service-account.json> [target-env-file]
 *
 * [target-env-file] defaults to .env.production. Pure Node.js (fs/path/child_process from the
 * standard library only) -- works identically in PowerShell, cmd, and any POSIX shell.
 *
 * What it does:
 *   1. Reads and validates the JSON key file.
 *   2. Refuses to touch a target whose name looks like a tracked example file.
 *   3. Updates only the three GOOGLE_* lines in the target, preserving every other line
 *      byte-for-byte (creates the file from its matching .example template if it doesn't
 *      exist yet, or from nothing if no template is found).
 *   4. Writes the private key double-quoted with \n escapes, matching the format this project's
 *      parser (src/lib/data/config.ts) expects.
 *   5. Verifies the target file is actually gitignored, refusing to leave a working tree where
 *      `git add .` could pick up real credentials.
 *   6. Prints only a success line and the service account's email -- the key value is never
 *      logged, not even on error.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const MANAGED_KEYS = ["GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"];
const DEFAULT_TARGET = ".env.production";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function isExampleFile(targetPath) {
  return /\.example$/i.test(basename(targetPath));
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail(
      "Missing the path to a service-account JSON file.\n\n" +
        "  Usage: node scripts/import-google-service-account.mjs <path-to-service-account.json> [target-env-file]"
    );
  }
  const jsonPath = resolve(process.cwd(), args[0]);
  const targetArg = args[1] ?? DEFAULT_TARGET;
  const targetPath = resolve(repoRoot, targetArg);
  return { jsonPath, targetPath };
}

function loadServiceAccount(jsonPath) {
  if (!existsSync(jsonPath)) {
    fail(`File not found: ${jsonPath}`);
  }

  let raw;
  try {
    raw = readFileSync(jsonPath, "utf8");
  } catch (err) {
    fail(`Could not read ${jsonPath}: ${err.message}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    fail(`${jsonPath} is not valid JSON. Make sure you downloaded the actual service-account key file, not something else.`);
  }

  const projectId = typeof json.project_id === "string" ? json.project_id.trim() : "";
  const clientEmail = typeof json.client_email === "string" ? json.client_email.trim() : "";
  const privateKey = typeof json.private_key === "string" ? json.private_key : "";

  const missing = [];
  if (!projectId) missing.push("project_id");
  if (!clientEmail) missing.push("client_email");
  if (!privateKey) missing.push("private_key");
  if (missing.length > 0) {
    fail(
      `${jsonPath} is missing required field(s): ${missing.join(", ")}.\n` +
        `This doesn't look like a Google service-account JSON key. Re-download it from Google Cloud Console.`
    );
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/;
  if (!emailRe.test(clientEmail)) {
    fail("client_email in the JSON file doesn't look like a service-account address (expected it to end in .iam.gserviceaccount.com).");
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY") && !privateKey.includes("BEGIN RSA PRIVATE KEY")) {
    // Deliberately does not print any part of privateKey here.
    fail("private_key in the JSON file does not look like a PEM private key block.");
  }

  return { projectId, clientEmail, privateKey };
}

/** Real newlines -> literal \n, wrapped in double quotes -- the format config.ts expects. */
function encodePrivateKeyForEnvFile(pem) {
  const escaped = pem.replace(/\r\n/g, "\n").split("\n").join("\\n");
  return `"${escaped}"`;
}

function loadTargetLines(targetPath) {
  if (existsSync(targetPath)) {
    return readFileSync(targetPath, "utf8").split(/\r?\n/);
  }
  // No file yet: seed from its matching .example template if one exists, so comments and
  // unrelated documented variables aren't lost. Otherwise start from a minimal header.
  const templatePath = `${targetPath}.example`;
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, "utf8").split(/\r?\n/);
  }
  return [`# Created by scripts/import-google-service-account.mjs on ${new Date().toISOString()}`, ""];
}

/** Sets KEY=value for each managed key, preserving every other line untouched. Appends any
 *  managed key that isn't already present as a line. */
function applyValues(lines, values) {
  const remaining = new Set(MANAGED_KEYS);
  const out = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    remaining.delete(key);
    return `${key}=${values[key]}`;
  });

  if (remaining.size > 0) {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    out.push("# Added by scripts/import-google-service-account.mjs");
    for (const key of MANAGED_KEYS) {
      if (remaining.has(key)) out.push(`${key}=${values[key]}`);
    }
  }

  return out;
}

/** Refuses to proceed if the target would NOT be excluded from `git add`. Non-fatal (warns only)
 *  when git itself isn't available or this isn't a git repo -- the file-name and .gitignore
 *  checks already provide real protection in that case. */
function verifyGitIgnored(targetPath) {
  let gitAvailable = true;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot, stdio: "ignore" });
  } catch {
    gitAvailable = false;
  }
  if (!gitAvailable) {
    console.warn("⚠ git was not found (or this isn't a git repository) -- skipped the gitignore verification. Double-check .gitignore manually before committing.");
    return;
  }

  try {
    execFileSync("git", ["check-ignore", "-q", targetPath], { cwd: repoRoot, stdio: "ignore" });
    // Exit code 0 -- the file IS ignored. Good.
  } catch (err) {
    if (err.status === 1) {
      fail(
        `${targetPath} is NOT covered by .gitignore. Refusing to leave real credentials in a file ` +
          `\`git add\` could pick up. Check .gitignore's "env files" section before re-running this script.`
      );
    }
    // Any other exit status is a git-side error unrelated to ignore status -- don't block on it.
    console.warn("⚠ Could not verify gitignore status via git check-ignore -- double-check .gitignore manually before committing.");
  }
}

function main() {
  const { jsonPath, targetPath } = parseArgs();

  if (isExampleFile(targetPath)) {
    fail(`Refusing to write into ${targetPath} -- it looks like a tracked .example template, not a real env file. Pass a different target as the second argument.`);
  }

  const account = loadServiceAccount(jsonPath);

  const lines = loadTargetLines(targetPath);
  const updated = applyValues(lines, {
    GOOGLE_PROJECT_ID: account.projectId,
    GOOGLE_CLIENT_EMAIL: account.clientEmail,
    GOOGLE_PRIVATE_KEY: encodePrivateKeyForEnvFile(account.privateKey),
  });

  writeFileSync(targetPath, updated.join("\n"), "utf8");

  verifyGitIgnored(targetPath);

  console.log(`\n✔ Imported Google service-account credentials into ${targetPath}`);
  console.log(`  Service account: ${account.clientEmail}\n`);
  console.log("  Still required: GOOGLE_SHEET_ID and the N8N_* variables (see README → Production Setup Checklist).");
}

main();
