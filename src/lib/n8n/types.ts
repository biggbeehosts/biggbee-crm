export type WorkflowState = "running" | "idle" | "failed" | "unknown";

/**
 * Status snapshot the CRM displays. Produced by an n8n status workflow (N8N_WEBHOOK_STATUS)
 * that returns JSON in roughly this shape -- unknown/missing fields degrade to null and render
 * as em-dashes, never as invented values.
 */
export interface AutomationStatus {
  state: WorkflowState;
  lastRun: string | null;
  currentJob: string | null;
  currentLead: string | null;
  lastSuccess: string | null;
  averageRuntimeSeconds: number | null;
  queueSize: number | null;
}

export interface AutomationStatusResult {
  configured: boolean;
  status: AutomationStatus | null;
  error?: string;
}

/** Result of triggering a webhook. `message` is always operator-readable, never a stack trace. */
export interface TriggerResult {
  success: boolean;
  message: string;
}

/**
 * Body sent to the Run Campaign webhook. campaignId is mandatory and validated server-side
 * against real campaigns before this is ever built (see triggerN8nAction) -- n8n selects leads by
 * Campaign ID = campaignId AND Status = New AND not previously contacted, never by industry/
 * business type/status alone. The remaining targeting fields are notes only (informational for
 * n8n/the operator), not a selection filter.
 *
 * Phase C: the workspace/sender identity fields below are resolved server-side from the
 * authenticated session's activeWorkspaceId (never accepted from the browser -- see
 * triggerN8nAction) and let n8n's outbound workflow know which brand it's processing, instead of
 * assuming Biggbee AI everywhere. Deliberately excludes smtpCredentialRef/imapCredentialRef and
 * every other secret -- those are never sent over the webhook, only referenced by n8n's own
 * credential store.
 *
 * Phase D (SMTP credential routing): still deliberately excludes smtpCredentialRef, and always
 * will -- n8n credentials cannot be dynamically selected via workflow/webhook data on a Send
 * Email node (a real n8n platform limitation, not a choice made here), so transmitting the
 * credential ID would carry real risk (unnecessary credential metadata on the wire) for zero
 * routing benefit. Instead, n8n's "Route by Workspace SMTP" switch node routes purely on
 * `workspaceId` (already present below) to a fixed, design-time-assigned Send Email node/
 * credential per workspace; triggerN8nAction only reads workspace.smtpCredentialRef server-side
 * to fail the run fast if a workspace has none configured -- it's never forwarded from there.
 */
export interface RunCampaignPayload {
  campaignId: string;
  campaignName: string;
  country?: string;
  industry?: string;
  businessType?: string;
  leadGenerationType?: string;
  service?: string;
  minConfidence?: number;
  maxLeadsPerRun?: number;
  dailySendLimit?: number;
  workspaceId: string;
  workspaceName: string;
  senderDisplayName: string;
  senderEmail: string;
  replyToEmail: string;
  reportEmail: string;
  website: string;
  signatureName: string;
  signatureWebsite: string;
  websiteRegistryId: string;
}

export const EMPTY_STATUS: AutomationStatus = {
  state: "unknown",
  lastRun: null,
  currentJob: null,
  currentLead: null,
  lastSuccess: null,
  averageRuntimeSeconds: null,
  queueSize: null,
};
