"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMockLead, updateMockLeadStatus } from "@/lib/data/mock-store";
import { getDataMode } from "@/lib/data/config";
import type { Lead, LeadStatus } from "@/types";

export interface ActionResult {
  success: boolean;
  message: string;
}

const NewLeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  email: z.string().email("Enter a valid email address"),
  website: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
});

/**
 * Adds a lead. In mock mode this mutates the in-process mock store so the UI reflects it
 * immediately. Google Sheets write support is intentionally not implemented yet -- the service
 * account credential this app documents only requests the read-only
 * `spreadsheets.readonly` scope. Wiring up writes means: (1) widen the OAuth scope to
 * `spreadsheets`, (2) add an `appendLeadRow()` helper in `lib/data/sheets-client.ts` using
 * `spreadsheets.values.append`, (3) call it here instead of the mock store.
 */
export async function addLeadAction(formData: FormData): Promise<ActionResult> {
  const parsed = NewLeadSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    website: formData.get("website") || undefined,
    industry: formData.get("industry") || undefined,
    country: formData.get("country") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid lead data." };
  }

  if (getDataMode() === "google-sheets") {
    return {
      success: false,
      message:
        "The CRM is read-only while connected to Google Sheets. Nothing was saved — please make this change in the sheet directly.",
    };
  }

  const lead: Lead = {
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    company: parsed.data.company,
    website: parsed.data.website ?? "",
    industry: parsed.data.industry ?? "",
    businessType: "",
    leadGenerationType: "",
    phone: parsed.data.phone ?? "",
    country: parsed.data.country ?? "",
    status: "New",
    lastContact: null,
    followUpCount: 0,
    lastEmailSubject: "",
    lastEmailDate: null,
    serviceOffered: "",
    aiSummary: "",
    demoVideoAttached: false,
    demoVideoName: "",
    subjectVariant: "",
    alternativeSubject: "",
    demoRecommended: false,
    demoType: "",
    demoWatchUrl: "",
    demoDownloadUrl: "",
    emailStyle: "",
    confidence: null,
  };

  addMockLead(lead);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  return { success: true, message: `${lead.company} added to the Leads sheet.` };
}

/** Same read/write-scope caveat as addLeadAction -- see the comment there. */
export async function updateLeadStatusAction(email: string, status: LeadStatus): Promise<ActionResult> {
  if (getDataMode() === "google-sheets") {
    return {
      success: false,
      message:
        "The CRM is read-only while connected to Google Sheets. Nothing was saved — please make this change in the sheet directly.",
    };
  }
  updateMockLeadStatus(email, status);
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { success: true, message: "Status updated." };
}

export async function refreshDataAction(): Promise<ActionResult> {
  const { refreshAllData } = await import("@/lib/data/repository");
  refreshAllData();
  revalidatePath("/", "layout");
  return { success: true, message: "Data refreshed." };
}
