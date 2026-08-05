/**
 * Deliverability / inbox-placement model (Stage 5, Part G). Placement is NEVER inferred from
 * open/click/reply absence -- a result only exists here because an admin recorded a real test
 * (manual entry today; `notes`/`rawProviderResultRef` leave room for a future provider adapter to
 * write the same shape without a schema change, see src/lib/deliverability/provider-adapter.ts).
 */

export type InboxPlacementResult = "NotTested" | "Inbox" | "Promotions" | "Spam" | "Missing" | "Unknown";

export const INBOX_PLACEMENT_RESULTS: InboxPlacementResult[] = ["NotTested", "Inbox", "Promotions", "Spam", "Missing", "Unknown"];

export interface InboxPlacementTest {
  id: string;
  campaignId: string;
  subject: string;
  sender: string;
  seedRecipient: string;
  mailboxProvider: string;
  placementResult: InboxPlacementResult;
  testedAt: string;
  rawProviderResultRef?: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
}

export interface SeedRecipient {
  id: string;
  email: string;
  mailboxProvider: string;
  label?: string;
  active: boolean;
  createdAt: string;
}

export interface DeliveryStatusResult {
  /** "Sent" (no delivery evidence either way) | "Unknown" (genuinely can't tell) -- never
   *  "Delivered" without real evidence (Part F: never claim confirmed delivery without evidence). */
  status: "Sent" | "Unknown" | "DeliveryConfirmed" | "HardBounce" | "SoftBounce";
  evidenceSource?: string;
  detail?: string;
}
