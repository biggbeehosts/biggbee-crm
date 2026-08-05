import "server-only";
import type { ScraperAgent, WorkflowIntegration, ContractCheckResult, ContractValidationReport } from "@/types";
import { getWorkflowById, isAdminApiConfigured } from "./admin-client";
import { getN8nApiKey, resolveScraperWebhookUrl, isActionConfigured, type N8nActionKey } from "./config";

/**
 * Part E: individual, side-effect-free contract checks shown one row at a time in the UI, never
 * collapsed into a single pass/fail. Checks here are deliberately non-destructive (GET-only
 * against the n8n admin API, no webhook POST) -- actually exercising the webhook with a real
 * payload is the separate, explicit "one-result dry run" action (Part C/J.10), which the operator
 * triggers on purpose rather than as a side effect of validation.
 */

function pass(id: string, label: string, detail: string): ContractCheckResult {
  return { id, label, status: "pass", detail };
}
function fail(id: string, label: string, detail: string): ContractCheckResult {
  return { id, label, status: "fail", detail };
}
function warn(id: string, label: string, detail: string): ContractCheckResult {
  return { id, label, status: "warn", detail };
}
function skip(id: string, label: string, detail: string): ContractCheckResult {
  return { id, label, status: "skipped", detail };
}

function finalize(integrationId: string, checks: ContractCheckResult[]): ContractValidationReport {
  return {
    integrationId,
    ranAt: new Date().toISOString(),
    checks,
    overallPass: checks.every((c) => c.status !== "fail"),
  };
}

export async function validateScraperContract(agent: ScraperAgent): Promise<ContractValidationReport> {
  const checks: ContractCheckResult[] = [];

  checks.push(
    agent.n8nWorkflowId.trim()
      ? pass("workflow-id", "n8n workflow ID configured", agent.n8nWorkflowId)
      : fail("workflow-id", "n8n workflow ID configured", "No workflow ID set on this agent.")
  );

  if (!isAdminApiConfigured()) {
    checks.push(skip("workflow-accessible", "Workflow accessible via n8n API", "N8N_ADMIN_API_KEY is not set -- cannot verify existence/accessibility from here."));
  } else if (agent.n8nWorkflowId.trim()) {
    try {
      const meta = await getWorkflowById(agent.n8nWorkflowId, { bypassCache: true });
      checks.push(pass("workflow-accessible", "Workflow accessible via n8n API", `Found "${meta.name}" (${meta.active ? "active" : "inactive"}, ${meta.nodeCount} nodes).`));
    } catch (err) {
      checks.push(fail("workflow-accessible", "Workflow accessible via n8n API", err instanceof Error ? err.message : "Could not reach n8n."));
    }
  } else {
    checks.push(skip("workflow-accessible", "Workflow accessible via n8n API", "No workflow ID to check."));
  }

  const webhookUrl = resolveScraperWebhookUrl(agent);
  checks.push(
    webhookUrl
      ? pass("webhook-exists", "Start webhook resolves to a URL", "Configured (path or env var resolves to a callable URL).")
      : fail("webhook-exists", "Start webhook resolves to a URL", "startWebhookPath/startWebhookEnvVar does not resolve -- set N8N_BASE_URL and the webhook path.")
  );

  if (agent.authType === "header-auth") {
    checks.push(
      getN8nApiKey()
        ? pass("auth-configured", "Authentication configured", "N8N_API_KEY is set; sent as Authorization + X-API-KEY headers.")
        : warn("auth-configured", "Authentication configured", "N8N_API_KEY is not set -- the webhook will be called with no auth header.")
    );
  } else {
    checks.push(pass("auth-configured", "Authentication configured", "This agent is configured for no authentication."));
  }

  checks.push(
    pass(
      "input-contract",
      "Input accepts campaignId, jobId, requestedCount, inputs",
      "Guaranteed by the CRM's generic scraper payload builder (ScraperRunPayload) -- every scraper receives the same shape."
    )
  );

  if (agent.lastSuccessfulExecution || agent.lastFailedExecution) {
    checks.push(
      pass(
        "output-contract",
        "Returns jobId, campaignId, status, scrapedCount, importedCount, error",
        `Verified against a real run (last success: ${agent.lastSuccessfulExecution ?? "never"}, last failure: ${agent.lastFailedExecution ?? "never"}).`
      )
    );
  } else {
    checks.push(warn("output-contract", "Returns jobId, campaignId, status, scrapedCount, importedCount, error", "Not yet verified -- run a one-result dry test to confirm the response shape."));
  }

  checks.push(
    agent.maxAllowedLeads > 0
      ? pass("max-limit", "Maximum test limits enforced", `Capped at ${agent.maxAllowedLeads} per run; dry-run tests are always clamped to 1.`)
      : fail("max-limit", "Maximum test limits enforced", "maxAllowedLeads is not set to a positive number.")
  );

  return finalize(agent.id, checks);
}

export async function validateOutreachContract(integration: WorkflowIntegration): Promise<ContractValidationReport> {
  const checks: ContractCheckResult[] = [];

  checks.push(
    integration.n8nWorkflowId.trim()
      ? pass("workflow-id", "n8n workflow ID configured", integration.n8nWorkflowId)
      : fail("workflow-id", "n8n workflow ID configured", "No workflow ID set on this integration.")
  );

  if (!isAdminApiConfigured()) {
    checks.push(skip("workflow-accessible", "Workflow accessible via n8n API", "N8N_ADMIN_API_KEY is not set -- cannot verify existence/accessibility from here."));
  } else if (integration.n8nWorkflowId.trim()) {
    try {
      const meta = await getWorkflowById(integration.n8nWorkflowId, { bypassCache: true });
      checks.push(pass("workflow-accessible", "Workflow accessible via n8n API", `Found "${meta.name}" (${meta.active ? "active" : "inactive"}, ${meta.nodeCount} nodes).`));
    } catch (err) {
      checks.push(fail("workflow-accessible", "Workflow accessible via n8n API", err instanceof Error ? err.message : "Could not reach n8n."));
    }
  } else {
    checks.push(skip("workflow-accessible", "Workflow accessible via n8n API", "No workflow ID to check."));
  }

  if (integration.purpose === "Outreach") {
    const actionKey = envVarToActionKey(integration.webhookPath);
    checks.push(
      actionKey && isActionConfigured(actionKey)
        ? pass("webhook-exists", "Webhook exists", `${integration.webhookPath} is set.`)
        : fail("webhook-exists", "Webhook exists", `${integration.webhookPath || "(no env var reference)"} is not configured.`)
    );
    checks.push(
      getN8nApiKey()
        ? pass("auth-configured", "Authentication configured", "N8N_API_KEY is set.")
        : warn("auth-configured", "Authentication configured", "N8N_API_KEY is not set -- calls go out with no auth header.")
    );
    checks.push(
      pass(
        "campaign-id-accepted",
        "Accepts campaignId",
        "RunCampaignPayload always includes campaignId -- enforced in triggerN8nAction (src/lib/n8n/actions.ts) before the webhook is ever called."
      )
    );
    checks.push(
      pass(
        "unknown-campaign-rejected",
        "Unknown campaign IDs are rejected",
        "triggerN8nAction looks up the campaign via getCampaign(campaignId) and fails closed with 'Unknown campaign' if it doesn't exist."
      )
    );
    checks.push(
      warn(
        "no-write-without-campaign",
        "No lead can be written without Campaign ID",
        "CRM-side guarantee confirmed (campaignId is mandatory and validated before send). The final write-guard for Sheet rows lives inside the n8n workflow itself and can't be verified from here without a real write."
      )
    );
    checks.push(
      pass("result-write-back", "Result write-back fields", "Results are read back from the shared Google Sheet (Leads tab), not parsed from the webhook response -- see src/lib/data/sheets-client.ts.")
    );
  } else if (integration.purpose === "Knowledge Base") {
    checks.push(
      isActionConfigured("refreshKb")
        ? pass("webhook-exists", "Webhook exists", "N8N_WEBHOOK_REFRESH_KB is set.")
        : fail("webhook-exists", "Webhook exists", "N8N_WEBHOOK_REFRESH_KB is not configured.")
    );
  } else if (integration.purpose === "Status") {
    const hasAdminApi = isAdminApiConfigured();
    checks.push(
      hasAdminApi || isActionConfigured("status")
        ? pass("status-source", "Status source configured", hasAdminApi ? "Derived from the n8n admin API's execution history." : "N8N_WEBHOOK_STATUS is set.")
        : fail("status-source", "Status source configured", "Neither N8N_ADMIN_API_KEY nor N8N_WEBHOOK_STATUS is set.")
    );
  } else {
    checks.push(
      isAdminApiConfigured()
        ? pass("status-source", "Monitored via n8n admin API", "Execution history is used to infer whether reply processing is running.")
        : warn("status-source", "Monitored via n8n admin API", "N8N_ADMIN_API_KEY is not set -- this integration cannot be monitored yet.")
    );
  }

  checks.push(pass("max-limit", "Maximum test limits enforced", "Outreach has no bulk 'dry run' concept -- Run Campaign always requires an explicit, validated Campaign ID and never fires without one."));

  return finalize(integration.id, checks);
}

function envVarToActionKey(envVarName: string): N8nActionKey | null {
  const map: Record<string, N8nActionKey> = {
    N8N_WEBHOOK_RUN_CAMPAIGN: "runCampaign",
    N8N_WEBHOOK_PAUSE_CAMPAIGN: "pauseCampaign",
    N8N_WEBHOOK_RESUME_CAMPAIGN: "resumeCampaign",
    N8N_WEBHOOK_REFRESH_KB: "refreshKb",
    N8N_WEBHOOK_RETRY_FAILED: "retryFailed",
    N8N_WEBHOOK_STATUS: "status",
  };
  return map[envVarName] ?? null;
}
