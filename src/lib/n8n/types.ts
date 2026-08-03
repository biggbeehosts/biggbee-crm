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
 * business type/status alone. The remaining fields are targeting notes only (informational for
 * n8n/the operator), not a selection filter.
 *
 * Scraper jobs are not built yet, but will be triggered the same way (a webhook body keyed by
 * campaignId) -- this shape is the contract they'll reuse, so campaignId lands here now rather
 * than being bolted on later.
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
