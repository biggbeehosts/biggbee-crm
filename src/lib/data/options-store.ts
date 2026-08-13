import "server-only";
import type { OptionItem, OptionListKey, OptionLists, LeadTaxonomyOptions } from "@/types";

/**
 * Static seed lists feeding the campaign form and Add Lead selects, so those values live in one
 * place instead of being hardcoded per component. Read-only by design -- the current spreadsheet
 * has no Settings tab, and the CRM stays a thin interface over what exists today.
 */
const seed = (labels: string[]): OptionItem[] =>
  labels.map((label, i) => ({ id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`, label, enabled: true }));

const lists: OptionLists = {
  countries: seed(["United Kingdom", "United States", "Canada", "UAE", "Australia", "Pakistan"]),
  industries: seed([
    "Marketing",
    "Healthcare",
    "Real Estate",
    "Legal Services",
    "Hospitality",
    "Logistics",
    "SaaS",
    "E-commerce",
    "Education",
  ]),
  services: seed([
    "AI Voice Agents",
    "AI Receptionists",
    "Lead Generation Agents",
    "Real Estate AI Agents",
    "Customer Support Agents",
    "Custom AI Agents",
  ]),
  businessTypes: seed([
    "Marketing Agency",
    "Lead Generation Agency",
    "Dental Clinic",
    "Real Estate Agency",
    "E-commerce Store",
    "SaaS Company",
    "Law Firm",
    "Medical Practice",
    "Other",
  ]),
  leadGenerationTypes: seed(["Instagram", "Google Maps", "LinkedIn", "Facebook", "Email", "Cold Calling", "Other"]),
};

export function getOptionListsSync(): OptionLists {
  return lists;
}

export function getEnabledOptions(key: OptionListKey): string[] {
  return lists[key].filter((o) => o.enabled).map((o) => o.label);
}

/** All five lists at once, for the Add/Edit Lead forms -- the same shared taxonomy the Campaign
 *  form's targeting fields already use (see campaign-form-dialog.tsx's `enabled(...)` calls). */
export function getLeadTaxonomyOptions(): LeadTaxonomyOptions {
  return {
    countries: getEnabledOptions("countries"),
    industries: getEnabledOptions("industries"),
    businessTypes: getEnabledOptions("businessTypes"),
    services: getEnabledOptions("services"),
    leadGenerationTypes: getEnabledOptions("leadGenerationTypes"),
  };
}
