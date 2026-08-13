import assert from "node:assert/strict";
import test from "node:test";
import type { Campaign, Lead } from "@/types";
import { leadMatchesCampaignTargeting } from "./campaign-match";

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

// A. Campaign Business Type = Lead Generation Agency, Lead Business Type = Lead Generation -> MATCH
test("A: businessType alias -- 'Lead Generation' matches campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Lead Generation" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// B. Campaign = Lead Generation Agency, Lead = Lead Gen Agency -> MATCH
test("B: businessType alias -- 'Lead Gen Agency' matches campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Lead Gen Agency" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// C. Campaign Industry = Healthcare, Lead Industry = HealthCare -> MATCH
test("C: industry case-insensitive match -- 'HealthCare' matches campaign 'Healthcare'", () => {
  const lead = makeLead({ industry: "HealthCare", businessType: "Dental Clinic" });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("C2: industry alias -- 'Health Care' (spacing variant) matches campaign 'Healthcare'", () => {
  const lead = makeLead({ industry: "Health Care", businessType: "Dental Clinic" });
  const campaign = makeCampaign({ industry: "Healthcare", businessType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// D. Campaign Service = Lead Generation Agents, Lead serviceOffered = Lead Generation -> MATCH
test("D: service alias -- serviceOffered 'Lead Generation' matches campaign service 'Lead Generation Agents'", () => {
  const lead = makeLead({ targetService: "", serviceOffered: "Lead Generation" });
  const campaign = makeCampaign({ service: "Lead Generation Agents" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("D2: service alias -- serviceOffered 'Lead Generation Agent' (singular) matches campaign service 'Lead Generation Agents'", () => {
  const lead = makeLead({ targetService: "", serviceOffered: "Lead Generation Agent" });
  const campaign = makeCampaign({ service: "Lead Generation Agents" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// E. Campaign Business Type = Lead Generation Agency, Lead = Dentist -> NO MATCH
test("E: unrelated businessType 'Dentist' does not match campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Dentist" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("E2: unrelated businessType 'Visa Consultation' does not match campaign 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Visa Consultation" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// F. Campaign Industry = Marketing, Lead = Immigration -> NO MATCH
test("F: unrelated industry 'Immigration' does not match campaign 'Marketing'", () => {
  const lead = makeLead({ industry: "Immigration", businessType: "Any" });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// G. Campaign Service = specific, lead targetService/serviceOffered blank -> NO MATCH
test("G: campaign requires a specific service but lead has no service data -> excluded", () => {
  const lead = makeLead({ targetService: "", serviceOffered: "" });
  const campaign = makeCampaign({ service: "Lead Generation Agents" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// H. Campaign fields = Any -> unrestricted
test("H: all campaign targeting fields = Any imposes no restriction, regardless of lead values", () => {
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

// I. Legacy value outside taxonomy -> exact-normalized behavior, not accidental fuzzy match
test("I: legacy out-of-taxonomy businessType 'Marketing Consultancy' does not accidentally match 'Lead Generation Agency'", () => {
  const lead = makeLead({ businessType: "Marketing Consultancy" });
  const campaign = makeCampaign({ businessType: "Lead Generation Agency" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("I2: legacy out-of-taxonomy businessType matches campaign only via plain exact-normalized comparison (case/whitespace only)", () => {
  const lead = makeLead({ businessType: "  Some Bespoke Type  " });
  const campaign = makeCampaign({ businessType: "some bespoke type" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

// Country must stay strict normalized-exact -- never aliased, even for a close variant.
test("Country: 'UK' does not match campaign 'United Kingdom' (no country aliasing introduced)", () => {
  const lead = makeLead({ country: "UK", businessType: "Any" });
  const campaign = makeCampaign({ country: "United Kingdom", businessType: "Any" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

// The real production scenario this fix targets.
test("Real scenario: Mayra Housing (Marketing / Lead Generation) matches TEST 1 (Marketing / Lead Generation Agency / Service Any)", () => {
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

test("Real scenario: XYZ (HealthCare / Dentist) still excluded from TEST 1 targeting", () => {
  const xyz = makeLead({ company: "XYZ", industry: "HealthCare", businessType: "Dentist" });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Lead Generation Agency", service: "Any" });
  assert.equal(leadMatchesCampaignTargeting(xyz, campaign), false);
});

test("Real scenario: EuropX (Immagration / Visa Consultation) still excluded from TEST 1 targeting", () => {
  const europX = makeLead({ company: "EuropX", industry: "Immagration", businessType: "Visa Consultation" });
  const campaign = makeCampaign({ industry: "Marketing", businessType: "Lead Generation Agency", service: "Any" });
  assert.equal(leadMatchesCampaignTargeting(europX, campaign), false);
});
