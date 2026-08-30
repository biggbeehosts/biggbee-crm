import assert from "node:assert/strict";
import test from "node:test";
import type { Campaign, Lead } from "@/types";
import { leadEligibleForCampaignRun, leadMatchesCampaignTargeting } from "./campaign-match";

/**
 * Lead Generation Type as a real, exact-match campaign targeting filter (not fuzzy, not aliased
 * across materially different sources) -- see the Phase C+ audit for the confirmed real source
 * vocabulary. "Facebook Page Enrichment" is used here (not "Facebook Pages") because it's the
 * label the scraper-hub adapter registry actually assigns for the source that can reach the Leads
 * tab -- "Facebook Pages" is a different, Full-Data-only adapter's label and could never appear on
 * a real lead; see options-store.ts's comment on the same distinction.
 */

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "CMP-000001",
    name: "LGT Test Campaign",
    status: "Active",
    isTest: false,
    country: "Any",
    industry: "Any",
    businessType: "Any",
    service: undefined,
    leadGenerationType: undefined,
    minConfidence: null,
    ...overrides,
  } as Campaign;
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    email: "lead@example.com",
    company: "Test Co",
    status: "New",
    country: "United Kingdom",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    campaignId: "",
    isTest: false,
    confidence: null,
    serviceOffered: "",
    leadGenerationType: undefined,
    ...overrides,
  } as Lead;
}

// 1. Instagram campaign + Instagram lead -> match
test("1: Instagram campaign + Instagram lead matches", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram" });
  const lead = makeLead({ leadGenerationType: "Instagram" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 2. Instagram campaign + Facebook Page Enrichment lead -> no match
test("2: Instagram campaign + Facebook Page Enrichment lead does NOT match", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram" });
  const lead = makeLead({ leadGenerationType: "Facebook Page Enrichment" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// 3. Facebook Page Enrichment campaign + Facebook Page Enrichment lead -> match
test("3: Facebook Page Enrichment campaign + Facebook Page Enrichment lead matches", () => {
  const campaign = makeCampaign({ leadGenerationType: "Facebook Page Enrichment" });
  const lead = makeLead({ leadGenerationType: "Facebook Page Enrichment" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 4. LinkedIn Companies campaign + LinkedIn Companies lead -> match
test("4: LinkedIn Companies campaign + LinkedIn Companies lead matches", () => {
  const campaign = makeCampaign({ leadGenerationType: "LinkedIn Companies" });
  const lead = makeLead({ leadGenerationType: "LinkedIn Companies" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 5. Google Maps campaign + Google Maps lead -> match
test("5: Google Maps campaign + Google Maps lead matches", () => {
  const campaign = makeCampaign({ leadGenerationType: "Google Maps" });
  const lead = makeLead({ leadGenerationType: "Google Maps" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 6. Specific source campaign + blank lead source -> no match
test("6: a specific-source campaign excludes a lead with a blank/null Lead Generation Type", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram" });
  for (const blank of ["", undefined, null] as (string | undefined | null)[]) {
    const lead = makeLead({ leadGenerationType: blank ?? undefined });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), false, `expected blank/null lead source ${JSON.stringify(blank)} to be excluded`);
  }
});

// 7. Campaign leadGenerationType = Any -> source does not restrict, regardless of lead value
test("7: campaign leadGenerationType='Any' does not restrict, for any lead source (including blank)", () => {
  for (const leadValue of ["Instagram", "Google Maps", "LinkedIn Companies", "", undefined] as (string | undefined)[]) {
    const campaign = makeCampaign({ leadGenerationType: "Any" });
    const lead = makeLead({ leadGenerationType: leadValue });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected Any campaign to be unrestricted for lead source ${JSON.stringify(leadValue)}`);
  }
});

// 8. "Other" wildcard semantics on Lead Generation Type remain unchanged (same as Industry/Business Type)
test("8: campaign leadGenerationType='Other'/'All'/blank/undefined are all unrestricted (existing wildcard semantics)", () => {
  const lead = makeLead({ leadGenerationType: "Google Maps" });
  for (const wildcard of ["Other", "All", "", undefined] as (string | undefined)[]) {
    const campaign = makeCampaign({ leadGenerationType: wildcard });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected ${JSON.stringify(wildcard)} to be unrestricted`);
  }
});

// 9. Service value never affects targeting, regardless of Lead Generation Type
test("9: Campaign.service ('Service to Offer') never affects Lead Generation Type targeting", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram", service: "Custom AI Agents" });
  const matchingLead = makeLead({ leadGenerationType: "Instagram", serviceOffered: "" });
  const nonMatchingLead = makeLead({ leadGenerationType: "Google Maps", serviceOffered: "Custom AI Agents" });
  assert.equal(leadMatchesCampaignTargeting(matchingLead, campaign), true);
  assert.equal(leadMatchesCampaignTargeting(nonMatchingLead, campaign), false, "a matching serviceOffered must never substitute for a matching Lead Generation Type");
});

// 10. Country / Industry / Business Type semantics are unaffected by Lead Generation Type targeting
test("10: Country/Industry/Business Type still gate eligibility independently of a matching Lead Generation Type", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram", country: "United Kingdom", industry: "Healthcare", businessType: "Dental Clinic" });
  const lead = makeLead({ leadGenerationType: "Instagram", country: "United States", industry: "Healthcare", businessType: "Dental Clinic" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false, "a matching Lead Generation Type must never override a mismatched Country");
});

// 11. Same-email leads in different workspaces stay isolated regardless of Lead Generation Type
// targeting -- leadMatchesCampaignTargeting has no workspace concept at all (it's a pure
// same-workspace-already-resolved predicate); this proves adding Lead Generation Type matching
// introduced no path that could cross workspaces.
test("11: Lead Generation Type matching has no workspace awareness of its own -- workspace isolation stays the store layer's job (leads-mutations.ts/repository.ts), unaffected here", () => {
  const campaign = makeCampaign({ leadGenerationType: "Google Maps" });
  const leadA = makeLead({ email: "same@example.com", leadGenerationType: "Google Maps" });
  const leadB = { ...leadA, workspaceId: "workspace-b" } as Lead;
  // Same targeting fields -> same targeting result regardless of workspaceId, because targeting
  // is evaluated after the workspace-scoped read already happened -- this function takes no
  // workspaceId parameter at all.
  assert.equal(leadMatchesCampaignTargeting(leadA, campaign), leadMatchesCampaignTargeting(leadB, campaign));
});

// 12. Existing named-service behavior (Service to Offer / SERVICE-MAPPING) remains unchanged --
// still governed entirely by Campaign.service and never by Lead Generation Type.
test("12: named-service (Service to Offer) selection is untouched by Lead Generation Type -- same lead matches identically across services", () => {
  const lead = makeLead({ leadGenerationType: "Google Maps", businessType: "Dental Clinic" });
  for (const service of ["AI Receptionists", "AI Voice Agents", "Custom AI Agents", undefined]) {
    const campaign = makeCampaign({ leadGenerationType: "Google Maps", businessType: "Dental Clinic", service });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected service=${JSON.stringify(service)} to have no effect on targeting`);
  }
});

// 13. Custom AI Agents campaigns still target purely on Country/Industry/BusinessType/LGT, exactly
// like any other service -- Custom AI Agents mode is a strategist-prompt/content concern
// (Phase C), never a targeting concern.
test("13: Custom AI Agents service behaves like any other service for targeting -- Lead Generation Type still gates eligibility normally", () => {
  const campaign = makeCampaign({ leadGenerationType: "Instagram", service: "Custom AI Agents" });
  const matchingLead = makeLead({ leadGenerationType: "Instagram" });
  const nonMatchingLead = makeLead({ leadGenerationType: "LinkedIn Companies" });
  assert.equal(leadEligibleForCampaignRun(matchingLead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(nonMatchingLead, campaign), false);
});
