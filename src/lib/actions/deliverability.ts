"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import { sha256Hex } from "@/lib/auth/crypto";
import {
  addSeedRecipient,
  recordInboxPlacementTest,
  removeSeedRecipient,
  setSeedRecipientActive,
  deleteInboxPlacementTest,
} from "@/lib/data/deliverability-store";
import { getCampaign } from "@/lib/data/campaigns-store";
import { recordEvent } from "@/lib/data/analytics-events-store";
import { INBOX_PLACEMENT_RESULTS } from "@/types";
import type { AnalyticsEventType } from "@/types";
import { DEFAULT_WORKSPACE_ID } from "@/types";
import type { ActionResult } from "./leads";

/** Only these four placement results have a dedicated event type -- "NotTested"/"Unknown" are the
 *  absence of a signal, not an event of their own (Part A: nothing here is ever inferred). */
const PLACEMENT_EVENT_TYPE: Partial<Record<string, AnalyticsEventType>> = {
  Inbox: "inbox_placement_inbox",
  Promotions: "inbox_placement_promotions",
  Spam: "inbox_placement_spam",
  Missing: "inbox_placement_missing",
};

const MailboxProviderSchema = z.string().min(1, "Mailbox provider is required");

const PlacementResultSchema = z.object({
  campaignId: z.string().min(1, "Select a campaign"),
  subject: z.string().min(1, "Subject is required"),
  sender: z.string().min(1, "Sender is required"),
  seedRecipient: z.string().email("Enter a valid seed recipient email"),
  mailboxProvider: MailboxProviderSchema,
  placementResult: z.enum(INBOX_PLACEMENT_RESULTS as [string, ...string[]]),
  notes: z.string().optional(),
});

/** Manual test-result entry -- Stage 5, Part G/N: "a safe initial version may support manual
 *  test-result entry if no placement provider is connected." This is the only way a placement
 *  result is ever recorded today; see src/lib/deliverability/provider-adapter.ts for why. */
export async function recordManualPlacementResultAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  const parsed = PlacementResultSchema.safeParse({
    campaignId: formData.get("campaignId"),
    subject: formData.get("subject"),
    sender: formData.get("sender"),
    seedRecipient: formData.get("seedRecipient"),
    mailboxProvider: formData.get("mailboxProvider"),
    placementResult: formData.get("placementResult"),
    notes: String(formData.get("notes") || "") || undefined,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid placement result." };
  }

  const campaign = await getCampaign(parsed.data.campaignId, DEFAULT_WORKSPACE_ID);
  if (!campaign) {
    return { success: false, message: `Unknown campaign "${parsed.data.campaignId}".` };
  }

  const test = await recordInboxPlacementTest({
    campaignId: parsed.data.campaignId,
    subject: parsed.data.subject,
    sender: parsed.data.sender,
    seedRecipient: parsed.data.seedRecipient,
    mailboxProvider: parsed.data.mailboxProvider,
    placementResult: parsed.data.placementResult as (typeof INBOX_PLACEMENT_RESULTS)[number],
    testedAt: new Date().toISOString(),
    notes: parsed.data.notes,
    recordedBy: actor,
  });

  await logAudit({
    actor,
    action: "deliverability.placement_recorded",
    target: test.id,
    success: true,
    details: { campaignId: test.campaignId, mailboxProvider: test.mailboxProvider, result: test.placementResult },
  });

  const seedHash = sha256Hex(test.seedRecipient.trim().toLowerCase());
  const commonEventFields = {
    campaignId: test.campaignId,
    emailHash: seedHash,
    recipientDomain: test.seedRecipient.split("@")[1],
    source: "admin",
    providerEventId: test.id,
    timestamp: test.testedAt,
    isUnique: true,
    isBotOrScanner: false,
    isTestEvent: false,
    metadata: { mailboxProvider: test.mailboxProvider, placementResult: test.placementResult },
  };
  recordEvent({ type: "inbox_placement_test", ...commonEventFields }).catch(() => {});
  const resultType = PLACEMENT_EVENT_TYPE[test.placementResult];
  if (resultType) {
    recordEvent({ type: resultType, ...commonEventFields }).catch(() => {});
  }

  revalidatePath("/system/deliverability");
  revalidatePath("/analytics");
  return { success: true, message: "Placement result recorded." };
}

export async function deletePlacementResultAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const removed = await deleteInboxPlacementTest(id);
  await logAudit({ actor, action: "deliverability.placement_deleted", target: id, success: removed });
  revalidatePath("/system/deliverability");
  revalidatePath("/analytics");
  return removed ? { success: true, message: "Placement result deleted." } : { success: false, message: "Not found." };
}

const SeedSchema = z.object({
  email: z.string().email("Enter a valid seed email"),
  mailboxProvider: MailboxProviderSchema,
  label: z.string().optional(),
});

export async function addSeedRecipientAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = SeedSchema.safeParse({
    email: formData.get("email"),
    mailboxProvider: formData.get("mailboxProvider"),
    label: String(formData.get("label") || "") || undefined,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid seed recipient." };
  }

  const seed = await addSeedRecipient({ ...parsed.data, active: true });
  await logAudit({ actor, action: "deliverability.seed_added", target: seed.id, success: true, details: { email: seed.email } });
  revalidatePath("/system/deliverability");
  return { success: true, message: "Seed recipient added." };
}

export async function removeSeedRecipientAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const removed = await removeSeedRecipient(id);
  await logAudit({ actor, action: "deliverability.seed_removed", target: id, success: removed });
  revalidatePath("/system/deliverability");
  return removed ? { success: true, message: "Seed recipient removed." } : { success: false, message: "Not found." };
}

export async function setSeedRecipientActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireAdmin();
  const changed = await setSeedRecipientActive(id, active);
  await logAudit({ actor, action: "deliverability.seed_toggled", target: id, success: changed, details: { active } });
  revalidatePath("/system/deliverability");
  return { success: true, message: changed ? "Updated." : "No change." };
}
