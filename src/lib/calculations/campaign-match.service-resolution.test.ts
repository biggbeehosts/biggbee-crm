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
    businessType: "Marketing Agency",
    service: "Lead Generation Agents",
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
    businessType: "Marketing Agency",
    campaignId: "",
    isTest: false,
    confidence: null,
    ...overrides,
  } as Lead;
}

test("targetService populated and matches campaign service -> targeting matches", () => {
  const lead = makeLead({ targetService: "Lead Generation Agents", serviceOffered: "" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("targetService blank, serviceOffered matches campaign service -> targeting matches (fallback used)", () => {
  const lead = makeLead({ targetService: "", serviceOffered: "Lead Generation Agents" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("targetService populated but different, serviceOffered matches -> targetService wins, excluded", () => {
  const lead = makeLead({ targetService: "Web Design", serviceOffered: "Lead Generation Agents" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("both targetService and serviceOffered blank, campaign service set -> excluded", () => {
  const lead = makeLead({ targetService: undefined, serviceOffered: "" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("campaign service = Any -> service fields do not matter", () => {
  const campaign = makeCampaign({ service: "Any" });
  const withNeither = makeLead({ targetService: undefined, serviceOffered: "" });
  const withMismatch = makeLead({ targetService: "Unrelated Service", serviceOffered: "Also Unrelated" });
  assert.equal(leadMatchesCampaignTargeting(withNeither, campaign), true);
  assert.equal(leadMatchesCampaignTargeting(withMismatch, campaign), true);
});

test("campaign service blank/null -> service fields do not matter", () => {
  const campaign = makeCampaign({ service: undefined });
  const lead = makeLead({ targetService: undefined, serviceOffered: "" });
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("case-insensitive + trimmed exact match still applies via resolved service", () => {
  const lead = makeLead({ targetService: "  lead generation agents  ", serviceOffered: "" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), true);
});

test("no fuzzy matching: partial/substring service value does not match (and has no curated alias)", () => {
  const lead = makeLead({ targetService: "", serviceOffered: "Agents" });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});

test("other targeting fields (industry, businessType, country) are untouched by service resolution", () => {
  const lead = makeLead({
    targetService: "Lead Generation Agents",
    serviceOffered: "",
    industry: "HealthCare",
  });
  const campaign = makeCampaign();
  assert.equal(leadMatchesCampaignTargeting(lead, campaign), false);
});
