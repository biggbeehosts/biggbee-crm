/**
 * Canonical analytics event model (Stage 5, Part A). Every measurable outreach/scraper occurrence
 * -- send attempts, deliverability signals, opens, clicks, replies, bounces, demo/meeting outcomes
 * -- is recorded as one of these, append-only, in src/lib/data/analytics-events-store.ts. Nothing
 * here is ever inferred/fabricated (see AnalyticsEventType doc): an "open" event only exists
 * because the tracking pixel actually loaded; a "spam" placement only exists because a real
 * inbox-placement test said so.
 */

export type AnalyticsEventType =
  | "send_attempted"
  | "sent"
  | "delivery_confirmed"
  | "delivery_failed"
  | "hard_bounce"
  | "soft_bounce"
  | "deferred"
  | "open"
  | "click"
  | "unsubscribe"
  | "complaint"
  | "reply_received"
  | "positive_reply"
  | "negative_reply"
  | "meeting_booked"
  | "demo_attached"
  | "demo_sent"
  | "campaign_started"
  | "campaign_completed"
  | "scraper_started"
  | "scraper_completed"
  | "scraper_failed"
  | "lead_approved"
  | "lead_rejected"
  | "inbox_placement_test"
  | "inbox_placement_inbox"
  | "inbox_placement_promotions"
  | "inbox_placement_spam"
  | "inbox_placement_missing";

export const ANALYTICS_EVENT_TYPES: AnalyticsEventType[] = [
  "send_attempted",
  "sent",
  "delivery_confirmed",
  "delivery_failed",
  "hard_bounce",
  "soft_bounce",
  "deferred",
  "open",
  "click",
  "unsubscribe",
  "complaint",
  "reply_received",
  "positive_reply",
  "negative_reply",
  "meeting_booked",
  "demo_attached",
  "demo_sent",
  "campaign_started",
  "campaign_completed",
  "scraper_started",
  "scraper_completed",
  "scraper_failed",
  "lead_approved",
  "lead_rejected",
  "inbox_placement_test",
  "inbox_placement_inbox",
  "inbox_placement_promotions",
  "inbox_placement_spam",
  "inbox_placement_missing",
];

export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  leadId?: string;
  campaignId?: string;
  /** Collapsed with messageId for this stage's single opaque per-send token -- see plan Context. */
  outreachId?: string;
  messageId?: string;
  /** SHA-256 of the lowercased recipient email -- raw address is never stored on an event. */
  emailHash?: string;
  recipientDomain?: string;
  subjectVariant?: string;
  emailStyleVariant?: string;
  demoId?: string;
  n8nExecutionId?: string;
  /** Where this event was recorded from -- "tracking-pixel" | "click-redirect" | "n8n" | "admin" | "manual". */
  source: string;
  /** External id from whatever produced this (n8n execution id, provider result id) -- for
   *  dedup/audit only, never displayed as if it were verified independently. */
  providerEventId?: string;
  /** SHA-256 of the request IP, truncated -- never the raw IP (Part K). */
  ipHash?: string;
  /** Coarse bucket only -- "desktop" | "mobile" | "bot" | "proxy" | "unknown" -- never the raw UA string. */
  userAgentCategory?: string;
  /** Only ever set from a source explicitly labeled as an inference, never claimed as fact. */
  country?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  /** True only for the first occurrence of this (token, type) pair -- see tracking-index-store.ts. */
  isUnique: boolean;
  isBotOrScanner: boolean;
  isTestEvent: boolean;
  createdAt: string;
}
