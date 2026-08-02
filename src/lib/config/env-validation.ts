import "server-only";
import { getDataMode } from "@/lib/data/config";
import { getWebhookUrl } from "@/lib/n8n/config";

/**
 * Server-side production-readiness check for the environment.
 *
 * Every message names a VARIABLE and describes the problem -- it never echoes a value, so this
 * output is safe to render in the operator UI. Nothing here is exposed through a public API
 * beyond a boolean summary (see getEnvStatusSummary).
 */

export type EnvIssueLevel = "error" | "warning";

export interface EnvIssue {
  variable: string;
  level: EnvIssueLevel;
  message: string;
}

export interface EnvValidation {
  /** True when there are no errors. Warnings do not invalidate the configuration. */
  valid: boolean;
  errors: EnvIssue[];
  warnings: EnvIssue[];
}

const VALID_DATA_MODES = ["mock", "sheets"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function raw(name: string): string {
  return (process.env[name] ?? "").trim();
}

function isLocalHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

export function validateEnvironment(): EnvValidation {
  const errors: EnvIssue[] = [];
  const warnings: EnvIssue[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // ── DATA_MODE ─────────────────────────────────────────────────────────────
  const dataMode = raw("DATA_MODE").toLowerCase();
  if (!dataMode) {
    warnings.push({
      variable: "DATA_MODE",
      level: "warning",
      message: 'Not set. Falling back to auto-detection (sheets when Google credentials exist, otherwise mock). Set it explicitly to "mock" or "sheets".',
    });
  } else if (!VALID_DATA_MODES.includes(dataMode)) {
    errors.push({
      variable: "DATA_MODE",
      level: "error",
      message: 'Must be either "mock" or "sheets".',
    });
  }

  // ── GOOGLE_* (required only when actually running on Sheets) ───────────────
  const usingSheets = getDataMode() === "google-sheets";
  if (usingSheets) {
    for (const v of ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"]) {
      if (!raw(v)) {
        errors.push({ variable: v, level: "error", message: "Required when DATA_MODE=sheets." });
      }
    }

    const clientEmail = raw("GOOGLE_CLIENT_EMAIL");
    if (clientEmail && !EMAIL_RE.test(clientEmail)) {
      warnings.push({
        variable: "GOOGLE_CLIENT_EMAIL",
        level: "warning",
        message: "Does not look like an email address. Use the service account's client_email.",
      });
    }

    // Checks shape only -- the key material itself is never read into a message.
    const privateKey = raw("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    if (privateKey && !privateKey.includes("BEGIN PRIVATE KEY")) {
      errors.push({
        variable: "GOOGLE_PRIVATE_KEY",
        level: "error",
        message: "Does not look like a PEM private key block. Copy the whole private_key value, keeping its \\n sequences.",
      });
    }
  }

  // ── N8N_WEBHOOK_RUN_CAMPAIGN ──────────────────────────────────────────────
  const runCampaignUrl = getWebhookUrl("runCampaign");
  if (!runCampaignUrl) {
    errors.push({
      variable: "N8N_WEBHOOK_RUN_CAMPAIGN",
      level: "error",
      message: "Not configured. Run Campaign cannot be triggered without it.",
    });
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(runCampaignUrl);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      errors.push({ variable: "N8N_WEBHOOK_RUN_CAMPAIGN", level: "error", message: "Is not a valid URL." });
    } else if (parsed.protocol !== "https:") {
      const local = isLocalHost(runCampaignUrl);
      if (local && !isProduction) {
        warnings.push({
          variable: "N8N_WEBHOOK_RUN_CAMPAIGN",
          level: "warning",
          message: "Points at a local, non-HTTPS address. Fine for testing, but production must use HTTPS.",
        });
      } else {
        errors.push({ variable: "N8N_WEBHOOK_RUN_CAMPAIGN", level: "error", message: "Must use HTTPS." });
      }
    }
  }

  // ── N8N_API_KEY ───────────────────────────────────────────────────────────
  if (!raw("N8N_API_KEY")) {
    const issue = {
      variable: "N8N_API_KEY",
      message: "Not set. The n8n webhook is unauthenticated — anyone who knows the URL could start a campaign.",
    };
    if (isProduction) errors.push({ ...issue, level: "error" });
    else warnings.push({ ...issue, level: "warning" });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * True only when the n8n webhook is both unauthenticated AND running in a context where that's
 * not acceptable (production). Shared by env-validation's own N8N_API_KEY check and by Campaign
 * Readiness, so "is the key required right now" has exactly one definition.
 */
export function isN8nApiKeyRequiredButMissing(): boolean {
  return process.env.NODE_ENV === "production" && !raw("N8N_API_KEY");
}

/** Deliberately coarse summary -- safe for a public health endpoint. Never lists variables. */
export function getEnvStatusSummary(): { configured: boolean; errorCount: number; warningCount: number } {
  const { valid, errors, warnings } = validateEnvironment();
  return { configured: valid, errorCount: errors.length, warningCount: warnings.length };
}
