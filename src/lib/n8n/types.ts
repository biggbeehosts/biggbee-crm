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

export const EMPTY_STATUS: AutomationStatus = {
  state: "unknown",
  lastRun: null,
  currentJob: null,
  currentLead: null,
  lastSuccess: null,
  averageRuntimeSeconds: null,
  queueSize: null,
};
