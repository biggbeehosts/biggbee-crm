import type { InboxPlacementResult, InboxPlacementTest, SeedRecipient } from "@/types";

/**
 * Adapter seam for a future real inbox-placement provider (GlockApps, Litmus/InboxAssured,
 * GlockApps-style seed-list checkers, etc.) -- Stage 5, Part G. Normal SMTP sending has no way to
 * know which folder a message landed in; the only honest source of that signal is a provider like
 * this, or an admin manually checking a seed inbox. `manualEntryProvider` below is the only
 * implementation today -- it does not run anything, it simply documents the "no provider
 * connected" state so callers can render that fact instead of guessing.
 *
 * Wiring a real provider later is: implement this interface against their API, swap the export in
 * getActiveProvider() -- no changes needed anywhere else (deliverability-store.ts's shape already
 * matches InboxPlacementTest, which is what a real adapter would write).
 */

export interface DeliverabilityTestInput {
  campaignId: string;
  subject: string;
  sender: string;
  seedRecipients: SeedRecipient[];
}

export interface DeliverabilityProvider {
  /** Human-readable id shown in the UI, e.g. "manual", "glockapps". */
  id: string;
  isConnected: boolean;
  /** Runs (or, for the manual provider, explains how to record) a placement test. A real provider
   *  would send to each seed and poll/webhook for the result; the manual provider always returns
   *  an empty array -- there is nothing to run without a connected service. */
  runTest(input: DeliverabilityTestInput): Promise<Omit<InboxPlacementTest, "id" | "createdAt">[]>;
}

export const manualEntryProvider: DeliverabilityProvider = {
  id: "manual",
  isConnected: false,
  async runTest() {
    return [];
  },
};

/** Always the manual provider today -- no real inbox-placement service is connected. Returns the
 *  single seam a future integration would replace. */
export function getActiveProvider(): DeliverabilityProvider {
  return manualEntryProvider;
}

export const NOT_CONNECTED_MESSAGE =
  "Spam placement tracking is not connected. Normal SMTP delivery does not reveal inbox-folder placement.";

export function isRealPlacementResult(result: InboxPlacementResult): boolean {
  return result !== "NotTested" && result !== "Unknown";
}
