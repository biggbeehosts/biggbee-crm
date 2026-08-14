/**
 * Known equivalent spellings for campaign targeting fields, proven from real production data (see
 * the campaign-targeting production diagnostic). Each alias maps a normalized (trimmed,
 * lowercased) legacy/short spelling to the CRM's own canonical taxonomy label (see
 * src/lib/data/options-store.ts), normalized the same way. This is a closed, curated list --
 * deliberately not fuzzy/similarity matching and not speculative: every entry here was added
 * because it was observed as a real, equivalent value in production data or is a direct short form
 * of an existing taxonomy label. Country is never aliased (see leadMatchesCampaignTargeting in
 * campaign-match.ts) -- only Industry, Business Type, and Service go through this table.
 */
export type AliasField = "industry" | "businessType" | "service" | "leadGenerationType";

const INDUSTRY_ALIASES: Record<string, string> = {
  "health care": "healthcare",
};

const BUSINESS_TYPE_ALIASES: Record<string, string> = {
  "lead generation": "lead generation agency",
  "lead gen agency": "lead generation agency",
  // A lead's real-world business type ("Dentist") and a campaign's taxonomy-picked target
  // ("Dental Clinic" -- see src/lib/data/options-store.ts) describe the same category of
  // business from two different angles; both must resolve to one canonical value.
  dentist: "dental clinic",
  "dentist practice": "dental clinic",
  "dental practice": "dental clinic",
  dentistry: "dental clinic",
};

const SERVICE_ALIASES: Record<string, string> = {
  "lead generation": "lead generation agents",
  "lead generation agent": "lead generation agents",
};

/** No known aliases yet -- kept as its own table (rather than skipping canonicalization for this
 *  field) so Lead Generation Type goes through the same canonical matching path as the other
 *  targeting fields and picks up future aliases without another code change. */
const LEAD_GENERATION_TYPE_ALIASES: Record<string, string> = {};

const ALIAS_TABLES: Record<AliasField, Record<string, string>> = {
  industry: INDUSTRY_ALIASES,
  businessType: BUSINESS_TYPE_ALIASES,
  service: SERVICE_ALIASES,
  leadGenerationType: LEAD_GENERATION_TYPE_ALIASES,
};

/** Trim + lowercase, then resolve a known alias to its canonical spelling. A value with no known
 *  alias falls back to its own trimmed/lowercased form, so comparing two canonicalized values is
 *  equivalent to plain exact-normalized comparison whenever no alias applies. */
export function canonicalizeTaxonomyValue(field: AliasField, value: string | undefined | null): string {
  const normalized = (value ?? "").trim().toLowerCase();
  return ALIAS_TABLES[field][normalized] ?? normalized;
}
