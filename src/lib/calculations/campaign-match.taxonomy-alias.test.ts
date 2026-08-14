import assert from "node:assert/strict";
import test from "node:test";
import type { Campaign, Lead } from "@/types";
import { leadEligibleForCampaignRun, leadMatchesCampaignTargeting } from "./campaign-match";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "CMP-000001",
    name: "TEST 1",
    status: "Active",
    isTest: false,
    country: "United Kingdom",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    service: "Any",
    leadGenerationType: null,
    minConfidence: null,
    ...overrides,
  } as Campaign;
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    email: "lead@example.com",
    company: "Acme",
    status: "New",
    country: "United Kingdom",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    campaignId: "",
    isTest: false,
    confidence: null,
    ...overrides,
  } as Lead;
}

// A. Healthcare/Dentist lead vs Healthcare/Dental Clinic/AI Receptionists campaign -> MATCH
test("A: Healthcare/Dentist lead matches Healthcare/Dental Clinic/AI Receptionists campaign", () => {
  const lead = makeLead({ industry: "HealthCare", businessType: "Dentist", serviceOffered: "" });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), true);
});

// B. Blank lead service must never disqualify a targeting match.
test("B: blank lead service does not disqualify -- service is never a targeting filter", () => {
  const lead = makeLead({
    industry: "Healthcare",
    businessType: "Dental Clinic",
    targetService: undefined,
    serviceOffered: "",
  });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  // Even a lead whose service fields actively disagree with the campaign's offer still matches --
  // service is what Biggbee is pitching, never a property the lead must already have.
  const leadWithUnrelatedService = makeLead({
    industry: "Healthcare",
    businessType: "Dental Clinic",
    targetService: "Something Completely Different",
    serviceOffered: "Also Unrelated",
  });
  assert.equal(leadMatchesCampaignTargeting(leadWithUnrelatedService, campaign), true);
});

// C. Marketing/Lead Generation Agency lead vs Marketing/Lead Generation Agency/Lead Generation
// Agents campaign -> MATCH
test("C: Marketing/Lead Generation Agency matches campaign of the same targeting regardless of its service offer", () => {
  const lead = makeLead({ industry: "Marketing", businessType: "Lead Generation Agency" });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Lead Generation Agency", service: "Lead Generation Agents" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// D. Immigration/Visa Consultation lead vs Healthcare/Dental Clinic campaign -> NO MATCH
test("D: unrelated Immigration/Visa Consultation lead does not match Healthcare/Dental Clinic campaign", () => {
  const lead = makeLead({ industry: "Immigration", businessType: "Visa Consultation" });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// E. Healthcare/Dentist lead that's already Interested/Sent/contacted -> targeting matches but
// existing safety rules still block eligibility.
test("E: targeting matches but existing contacted-status lead remains ineligible", () => {
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  const interested = makeLead({ industry: "Healthcare", businessType: "Dentist", status: "Interested" });
  assert.equal(leadMatchesCampaignTargeting(interested, campaign), true);
  assert.equal(leadEligibleForCampaignRun(interested, campaign), false);

  const sent = makeLead({ industry: "Healthcare", businessType: "Dentist", status: "Sent" });
  assert.equal(leadEligibleForCampaignRun(sent, campaign), false);

  const alreadyContacted = makeLead({ industry: "Healthcare", businessType: "Dentist", status: "New", lastEmailDate: "2026-01-01T00:00:00.000Z" });
  assert.equal(leadEligibleForCampaignRun(alreadyContacted, campaign), false);
});

// F. Unsubscribed lead -> NO MATCH (eligibility)
test("F: unsubscribed lead is never eligible even with a perfect targeting match", () => {
  const lead = makeLead({ industry: "Healthcare", businessType: "Dentist", status: "Unsubscribed" });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), false);
});

// G. Lead claimed by another campaign -> NO MATCH (eligibility)
test("G: lead claimed by a different campaign is excluded even with a perfect targeting match", () => {
  const lead = makeLead({ industry: "Healthcare", businessType: "Dentist", campaignId: "CMP-999999" });
  const campaign = makeCampaign({ id: "CMP-000001", industry: "Healthcare", businessType: "Dental Clinic", service: "AI Receptionists" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
  assert.equal(leadEligibleForCampaignRun(lead, campaign), false);
});

// H. Equivalent casing normalizes consistently.
test("H: HealthCare / Healthcare / health care all normalize to the same industry", () => {
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Any" });
  for (const industry of ["HealthCare", "Healthcare", "health care", "HEALTHCARE"]) {
    const lead = makeLead({ industry, businessType: "Dental Clinic" });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected "${industry}" to match`);
  }
});

// I. Equivalent dental aliases resolve consistently for targeting.
test("I: Dentist / Dental Clinic / Dental Practice / Dentistry / Dentist Practice all resolve to the same category", () => {
  const campaign = makeCampaign({ industry: "Any", businessType: "Dental Clinic" });
  for (const businessType of ["Dentist", "Dental Clinic", "Dental Practice", "Dentistry", "Dentist Practice"]) {
    const lead = makeLead({ businessType });
    assert.equal(leadMatchesCampaignTargeting(lead, campaign), true, `expected "${businessType}" to match "Dental Clinic"`);
  }
  // And the reverse direction: a campaign targeting "Dentist" should match a lead labeled "Dental Clinic".
  const reverseCampaign = makeCampaign({ industry: "Any", businessType: "Dentist" });
  const clinicLead = makeLead({ businessType: "Dental Clinic" });
  assert.equal(leadMatchesCampaignTargeting(clinicLead, reverseCampaign), true);
});

// Prior-round regressions, still valid under the new architecture.
test("businessType alias -- 'Lead Generation' matches campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Lead Generation" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("businessType alias -- 'Lead Gen Agency' matches campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Lead Gen Agency" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("unrelated businessType 'Visa Consultation' does not match campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Visa Consultation" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("all campaign targeting fields = Any imposes no restriction, regardless of lead values", () => {
  const lead = makeLead({
    country: "Canada",
    industry: "Legal Services",
    businessType: "Anything Goes",
    leadGenerationType: "Cold Calling",
    targetService: "",
    serviceOffered: "Completely Unrelated Service",
  });
  const campaign = makeCampaign({ country: "Any", industry: "Any", businessType: "Any", service: "Any", leadGenerationType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("legacy out-of-taxonomy businessType 'Marketing Consultancy' does not accidentally match 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Marketing Consultancy" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("legacy out-of-taxonomy businessType matches campaign only via plain exact-normalized comparison (case/whitespace only)", () => {
  const lead = makeLead({ businessType: "  Some Bespoke Type  " });
  const campaign = makeCampaign({ businessType: "some bespoke type" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("Country stays strict normalized-exact -- 'UK' does not match campaign 'United Kingdom'", () => {
  const lead = makeLead({ country: "UK", businessType: "Any" });
  const campaign = makeCampaign({ country: "United Kingdom", businessType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("Mayra Housing (Marketing / Lead Generation) matches TEST 1 (Marketing / Lead Generation Agency)", () => {
  const mayraHousing = makeLead({
    company: "Mayra Housing",
    industry: "Marketing",
    businessType: "Lead Generation",
    targetService: "",
    serviceOffered: "",
  });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Lead Generation Agency", service: "Any" });
  assert.equal(leadMatchesCampaignTargeting(mayraHousing, campaign), true);
});

test("EuropX (Immagration / Visa Consultation) still excluded from Marketing/Lead Generation Agency targeting", () => {
  const europX = makeLead({ company: "EuropX", industry: "Immagration", businessType: "Visa Consultation" });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Lead Generation Agency", service: "Any" });
  assert.equal(leadMatchesCampaignTargeting(europX, campaign), false);
});

// The exact real production case this fix targets.
test("Real production case: XYZ (United Kingdom / HealthCare / Dentist / New / Unassigned) is eligible for Test 2 (United Kingdom / Healthcare / Dental Clinic / AI Receptionists)", () => {
  const xyz = makeLead({
    company: "XYZ",
    country: "United Kingdom",
    industry: "HealthCare",
    businessType: "Dentist",
    status: "New",
    campaignId: "",
    serviceOffered: "",
    targetService: undefined,
    confidence: null,
  });
  const test2 = makeCampaign({
    id: "CMP-TEST2",
    name: "Test 2",
    status: "Active",
    country: "United Kingdom",
    industry: "Healthcare",
    businessType: "Dental Clinic",
    service: "AI Receptionists",
    minConfidence: null,
  });
  assert.equal(leadMatchesCampaignTargeting(xyz, test2), true);
  assert.equal(leadEligibleForCampaignRun(xyz, test2), true);
});
