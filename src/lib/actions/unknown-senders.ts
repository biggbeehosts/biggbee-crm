"use server";

import { revalidatePath } from "next/cache";
import type { UnknownSenderClassification } from "@/types";
import { deleteSenderRecord, markSenderReviewed, reclassifySender } from "@/lib/data/unknown-senders-mutations";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import type { ActionResult } from "./leads";

export async function markReviewedAction(fromEmail: string, timestamp: string | null, reviewed: boolean): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    await markSenderReviewed(fromEmail, timestamp, reviewed);
    revalidatePath("/unknown-senders");
    await logAudit({ actor, action: "unknown_sender.mark_reviewed", target: fromEmail, success: true, details: { reviewed, timestamp } });
    return { success: true, message: reviewed ? "Marked reviewed." : "Marked unreviewed." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update.";
    return { success: false, message };
  }
}

export async function reclassifySenderAction(
  fromEmail: string,
  timestamp: string | null,
  classification: UnknownSenderClassification
): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    await reclassifySender(fromEmail, timestamp, classification);
    revalidatePath("/unknown-senders");
    await logAudit({
      actor,
      action: "unknown_sender.reclassify",
      target: fromEmail,
      success: true,
      details: { classification, timestamp },
    });
    return { success: true, message: `Reclassified as ${classification}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reclassify.";
    return { success: false, message };
  }
}

export async function deleteSenderRecordAction(fromEmail: string, timestamp: string | null): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    await deleteSenderRecord(fromEmail, timestamp);
    revalidatePath("/unknown-senders");
    await logAudit({ actor, action: "unknown_sender.delete", target: fromEmail, success: true, details: { timestamp } });
    return { success: true, message: "Record deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete.";
    return { success: false, message };
  }
}
