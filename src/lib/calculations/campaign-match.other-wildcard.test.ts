import assert from "node:assert/strict";
import test from "node:test";
import type { Campaign, Lead } from "@/types";
import { leadEligibleForCampaignRun, leadMatchesCampaignTargeting } from "./campaign-match";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "CMP-000001",
    name: "Test 3",
    status: "Active",
    isTest: false,
    country: "United Kingdom",
    industry: undefined,
    businessType: "Other",
    service: undefined,
    leadGenerationType: null,
    minConfidence: null,
    ...overrides,
  } as Campaign;
}

function makeEuropX(overrides: Partial<Lead> = {}): Lead {
  return {
    email: "lead@example.com",
    company: "EuropX",
    status: "New",
    country: "United Kingdom",
    industry: "Immigration",
    businessType: "Visa Consultation",
    campaignId: "",
    isTest: false,
    confidence: null,
    serviceOffered: "",
    ...overrides,
  } as Lead;
}

// 1. Campaign: UK + Other industry. Lead: UK + Immigration. => MATCH
test("1: campaign industry='Other' does not restrict -- UK/Immigration lead matches UK/Other-industry campaign", () => {
  const campaign = makeCampaign({ country: "United Kingdom", industry: "Other", businessType: undefined });
  const lead = makeEuropX({ country: "United Kingdom", industry: "Immigration" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 2. Campaign: Other industry + Custom AI Agents service. Lead: Immigration + Visa Consultation. => MATCH
test("2: campaign industry='Other' + service offer does not restrict -- Immigration/Visa Consultation lead matches", () => {
  const campaign = makeCampaign({ industry: "Other", businessType: undefined, service: "Custom AI Agents" });
  const lead = makeEuropX({ industry: "Immigration", businessType: "Visa Consultation" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 3. Campaign: Healthcare. Lead: Immigration. => NO MATCH -- specific values remain strict.
test("3: a genuinely specific campaign value (Healthcare) still excludes an unrelated industry", () => {
  const campaign = makeCampaign({ industry: "Healthcare", businessType: undefined });
  const lead = makeEuropX({ industry: "Immigration" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// 4. Campaign: Other business type. Lead: Visa Consultation. => MATCH
test("4: campaign businessType='Other' does not restrict -- Visa Consultation lead matches", () => {
  const campaign = makeCampaign({ businessType: "Other" });
  const lead = makeEuropX({ businessType: "Visa Consultation" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// 5. Campaign: Any / blank / null targeting value => unrestricted for that field.
test("5: Any, blank, and null campaign targeting values are all unrestricted", () => {
  const lead = makeEuropX();
  for (const value of ["Any", "", undefined, null] as (string | undefined | null)[]) {
    const campaign = makeCampaign({ industry: value ?? undefined, businessType: value ?? undefined });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected ${JSON.stringify(value)} to be unrestricted`);
  }
});

// 6. Service to Offer = Custom AI Agents, lead Service Offered blank => service does NOT affect eligibility.
test("6: Service to Offer never affects eligibility, blank or otherwise", () => {
  const campaign = makeCampaign({ businessType: "Other", service: "Custom AI Agents" });
  const lead = makeEuropX({ serviceOffered: "", targetService: undefined });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), true);
});

// 7. Unsubscribed EuropX => NO MATCH (eligibility).
test("7: unsubscribed EuropX is never eligible even though targeting matches", () => {
  const campaign = makeCampaign({ businessType: "Other" });
  const lead = makeEuropX({ status: "Unsubscribed" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), false);
});

// 8. Already contacted EuropX => NO MATCH (eligibility).
test("8: already-contacted EuropX is never eligible even though targeting matches", () => {
  const campaign = makeCampaign({ businessType: "Other" });
  const lead = makeEuropX({ lastEmailDate: "2026-01-01T00:00:00.000Z" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), false);
});

// 9. EuropX claimed by another campaign => NO MATCH (eligibility).
test("9: EuropX claimed by a different campaign is excluded even though targeting matches", () => {
  const campaign = makeCampaign({ id: "CMP-000001", businessType: "Other" });
  const lead = makeEuropX({ campaignId: "CMP-999999" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), false);
});

// 10. Real production Test 3 + EuropX => eligible true.
test("10: real production case -- Test 3 (UK / businessType=Other) + EuropX is eligible", () => {
  const test3 = makeCampaign({
    id: "CMP-000001",
    name: "Test 3",
    country: "United Kingdom",
    industry: undefined,
    businessType: "Other",
    service: undefined,
  });
  const europx = makeEuropX({
    country: "United Kingdom",
    industry: "Immagration", // real production spelling, proves this is not an alias/spelling fix
    businessType: "Visa Consultation",
    status: "New",
    campaignId: "",
  });
  assert.equal(leadMatchesCampaignTargeting(europx, test3), true);
  assert.equal(leadEligibleForCampaignRun(europx, test3), true);
});

// 11. Real production Test 4 + EuropX => eligible true.
test("11: real production case -- Test 4 (businessType=Other / service=Custom AI Agents) + EuropX is eligible", () => {
  const test4 = makeCampaign({
    id: "CMP-000002",
    name: "Test 4",
    country: undefined,
    industry: undefined,
    businessType: "Other",
    service: "Custom AI Agents",
  });
  const europx = makeEuropX({
    country: "United Kingdom",
    industry: "Immagration",
    businessType: "Visa Consultation",
    status: "New",
    campaignId: "",
  });
  assert.equal(leadMatchesCampaignTargeting(europx, test4), true);
  assert.equal(leadEligibleForCampaignRun(europx, test4), true);
});

// Extra: "Other" must never make an ACTUAL lead value of "Other" special -- still a strict,
// aliased comparison like any other taxonomy value when the CAMPAIGN value is specific.
test("extra: a lead whose real businessType happens to be 'Other' is not specially matched by an unrelated specific campaign value", () => {
  const campaign = makeCampaign({ businessType: "Dental Clinic" });
  const lead = makeEuropX({ businessType: "Other" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// Extra: "All" is treated the same as "Other"/"Any" for a taxonomy-driven field.
test("extra: campaign businessType='All' is unrestricted", () => {
  const campaign = makeCampaign({ businessType: "All" });
  const lead = makeEuropX({ businessType: "Visa Consultation" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// Extra: Country never gets "Other" wildcard treatment (it isn't a taxonomy-aliased field and
// "Other" isn't even a real country option) -- a literal "Other" in Country stays a strict,
// almost-certainly-unmatchable value, exactly like any other unrecognized string would.
test("extra: Country is not given Other/All wildcard treatment", () => {
  const campaign = makeCampaign({ country: "Other", businessType: undefined });
  const lead = makeEuropX({ country: "United Kingdom" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});
