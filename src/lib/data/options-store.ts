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
  // Real values the scraper-hub lead-source pipeline actually assigns (confirmed directly from
  // its adapter registry + originSourceLabel() -- see @biggbee/adapters manifests and
  // apps/api/src/export.ts on the scraper-hub host -- not the higher-level planning doc, which
  // uses shorter labels than what the running code emits). Every entry here is a source that
  // scraper-hub's own CRM-eligibility rules (GOOGLE_SHEETS_MAPPING_SPEC.md Part 4/7/8) can
  // actually route into the Leads tab; sources that never reach Leads (Facebook Groups/Events/Ads
  // Library, LinkedIn Jobs, Instagram content-type adapters, Website Enrichment as a new row,
  // etc.) are deliberately not listed, since a lead could never carry one of those values.
  // "Instagram" and "Instagram Businesses" are two genuinely distinct adapters/labels -- never
  // collapsed into one, per instruction not to alias materially different sources. "LinkedIn" and
  // "Facebook" (the old short forms) are removed: no adapter ever emits those bare strings, so
  // they could never match a real lead and would only mislead. "Email"/"Cold Calling" are
  // legitimate non-scraper-hub lead-generation categories (manually added / cold-called leads),
  // kept as-is; "Other" keeps its existing unrestricted/wildcard semantics.
  leadGenerationTypes: seed([
    "Google Maps",
    "Instagram",
    "Instagram Businesses",
    "LinkedIn Companies",
    "Facebook Page Enrichment",
    "Airbnb",
    "Apontador (Brazil)",
    "Das Örtliche (Germany)",
    "FreeIndex (UK Business Reviews)",
    "Scoot (UK Business Finder)",
    "search.ch (Switzerland)",
    "Telefoonnummer.nl (Netherlands)",
    "Email",
    "Cold Calling",
    "Other",
  ]),
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
