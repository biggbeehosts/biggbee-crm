import "server-only";
import type { Campaign } from "@/types";

const now = () => new Date().toISOString();

/**
 * In-process campaign store (mock mode). Campaigns are a thin configuration layer, so a future
 * "Campaigns" tab in the Google Sheet (one row per campaign) can replace this without touching
 * the UI -- everything reads through getCampaigns()/getCampaign().
 */
let campaigns: Campaign[] = [
  {
    id: "camp-us-instagram",
    name: "US Instagram Agencies",
    status: "Active",
    country: "United States",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    service: "Lead Generation Agents",
    leadGenerationType: "Instagram",
    minConfidence: 70,
    maxLeadsPerRun: 50,
    dailySendLimit: 200,
    notes: "Target agencies running Instagram lead generation campaigns.",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "camp-uk-instagram",
    name: "UK Instagram Agencies",
    status: "Draft",
    country: "United Kingdom",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    service: "Lead Generation Agents",
    leadGenerationType: "Instagram",
    minConfidence: 70,
    maxLeadsPerRun: 50,
    dailySendLimit: 200,
    notes: "Same targeting as the US campaign, pending UK lead sourcing.",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "camp-us-dental",
    name: "US Dental Clinics",
    status: "Paused",
    country: "United States",
    industry: "Healthcare",
    businessType: "Dental Clinic",
    service: "AI Receptionists",
    leadGenerationType: "",
    minConfidence: 60,
    maxLeadsPerRun: 30,
    dailySendLimit: 100,
    notes: "Clinics with a booking line but no phone automation.",
    createdAt: now(),
    updatedAt: now(),
  },
];

export function getCampaignsSync(): Campaign[] {
  return campaigns;
}

export function getCampaignSync(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id);
}

export function upsertCampaign(campaign: Campaign) {
  const exists = campaigns.some((c) => c.id === campaign.id);
  campaigns = exists ? campaigns.map((c) => (c.id === campaign.id ? campaign : c)) : [campaign, ...campaigns];
}

export function deleteCampaignById(id: string) {
  campaigns = campaigns.filter((c) => c.id !== id);
}
