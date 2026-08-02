/**
 * Central manageable lists (countries, industries, services, business types, lead generation
 * types). These power filters, forms and campaign targeting so values are never hardcoded
 * across the UI. Backed by a mock store today; a "Settings" tab in the Google Sheet can back
 * them later without any UI changes.
 */
export interface OptionItem {
  id: string;
  label: string;
  enabled: boolean;
}

export type OptionListKey = "countries" | "industries" | "services" | "businessTypes" | "leadGenerationTypes";

export const OPTION_LIST_KEYS: OptionListKey[] = ["countries", "industries", "services", "businessTypes", "leadGenerationTypes"];

export const OPTION_LIST_LABELS: Record<OptionListKey, string> = {
  countries: "Countries",
  industries: "Industries",
  services: "Services",
  businessTypes: "Business Types",
  leadGenerationTypes: "Lead Generation Types",
};

export type OptionLists = Record<OptionListKey, OptionItem[]>;
