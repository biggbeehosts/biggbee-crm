import "server-only";
import type { ScraperAgent } from "@/types";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Scraper agent registry -- CRM-owned configuration, explicitly scoped to the local JSON store
 * (never the Sheet: this is what makes "adding a scraper" a config action rather than a schema
 * migration). No secrets live here -- see ScraperAgent's doc comment in src/types/scraper.ts.
 */

const COLLECTION = "scraper-agents";
const now = () => new Date().toISOString();

/**
 * Seeded from the actual n8n workflows discovered during Change 2's inspection
 * (xY88FLKziuAcHEmI / XsrhokyTGbYVHnGN) -- form fields match the real Apify actor inputs each
 * workflow now accepts after being rebuilt onto an authenticated, campaign-aware webhook (see the
 * n8n workflow backups in /root/backups/n8n-workflows/ for the pre-Change-2 state).
 */
const SEED_AGENTS: ScraperAgent[] = [
  {
    id: "scraper-google-maps",
    name: "Google Maps Lead Scraper",
    slug: "google-maps",
    description: "Finds local businesses on Google Maps by category and location via the Apify Google Maps actor.",
    icon: "MapPin",
    status: "Active",
    n8nWorkflowId: "xY88FLKziuAcHEmI",
    startWebhookPath: "webhook/biggbee/scrape-google-maps",
    statusMethod: "sync-response",
    resultMethod: "sheet",
    authType: "header-auth",
    defaultMaxLeads: 20,
    maxAllowedLeads: 200,
    sourceLabel: "Google Maps",
    supportedFields: ["company", "email", "phone", "website", "country", "location", "industry", "businessType"],
    formSchema: [
      { key: "campaignId", label: "Campaign", type: "campaign-selector", required: true, helpText: "Every scraped lead is tagged with this Campaign ID." },
      { key: "category", label: "Business category / service", type: "text", required: true, placeholder: "Dental clinics" },
      { key: "location", label: "Location", type: "location", required: true, placeholder: "Austin, TX" },
      { key: "country", label: "Country", type: "country", required: false },
      { key: "requestedCount", label: "Number of leads", type: "number", required: true, defaultValue: 20, min: 1, max: 200 },
      { key: "requireEmail", label: "Require email", type: "checkbox", required: false, defaultValue: false },
      { key: "requirePhone", label: "Require phone", type: "checkbox", required: false, defaultValue: false },
      { key: "requireWebsite", label: "Require website", type: "checkbox", required: false, defaultValue: false },
    ],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "scraper-instagram",
    name: "Instagram Lead Scraper",
    slug: "instagram",
    description: "Discovers Instagram business profiles by niche and location, then enriches each via the Apify Instagram profile actor.",
    icon: "Camera",
    status: "Active",
    n8nWorkflowId: "XsrhokyTGbYVHnGN",
    startWebhookPath: "webhook/biggbee/scrape-instagram",
    statusMethod: "sync-response",
    resultMethod: "sheet",
    authType: "header-auth",
    defaultMaxLeads: 20,
    maxAllowedLeads: 100,
    sourceLabel: "Instagram",
    supportedFields: ["name", "email", "phone", "website", "location", "country"],
    formSchema: [
      { key: "campaignId", label: "Campaign", type: "campaign-selector", required: true, helpText: "Every scraped lead is tagged with this Campaign ID." },
      { key: "niche", label: "Niche / service", type: "text", required: true, placeholder: "Lead generation agencies" },
      { key: "location", label: "Location", type: "location", required: true, placeholder: "Toronto" },
      { key: "country", label: "Country", type: "country", required: false },
      { key: "requestedCount", label: "Number of profiles", type: "number", required: true, defaultValue: 20, min: 1, max: 100 },
      { key: "minFollowers", label: "Minimum followers", type: "number", required: false, min: 0 },
      { key: "maxFollowers", label: "Maximum followers", type: "number", required: false, min: 0 },
      { key: "businessOnly", label: "Business accounts only", type: "checkbox", required: false, defaultValue: false },
      { key: "requireEmail", label: "Require email", type: "checkbox", required: false, defaultValue: false },
      { key: "requireWebsite", label: "Require website", type: "checkbox", required: false, defaultValue: false },
    ],
    createdAt: now(),
    updatedAt: now(),
  },
];

async function getAll(): Promise<ScraperAgent[]> {
  return readCollection<ScraperAgent[]>(COLLECTION, SEED_AGENTS);
}

async function saveAll(agents: ScraperAgent[]): Promise<void> {
  await writeCollection(COLLECTION, agents);
}

export async function getScraperAgents(): Promise<ScraperAgent[]> {
  return getAll();
}

export async function getScraperAgent(id: string): Promise<ScraperAgent | undefined> {
  const all = await getAll();
  return all.find((a) => a.id === id);
}

export async function getScraperAgentBySlug(slug: string): Promise<ScraperAgent | undefined> {
  const all = await getAll();
  return all.find((a) => a.slug === slug);
}

function generateAgentId(existing: Iterable<string>): string {
  const idSet = existing instanceof Set ? existing : new Set(existing);
  let candidate: string;
  do {
    candidate = `scraper-${Math.random().toString(36).slice(2, 10)}`;
  } while (idSet.has(candidate));
  return candidate;
}

/** Creates a new agent. Caller (the server action) is responsible for validating the webhook
 *  URL/path against N8N_BASE_URL and for the requireAdmin() gate -- this module is pure storage. */
export async function createScraperAgent(agent: Omit<ScraperAgent, "id" | "createdAt" | "updatedAt">): Promise<ScraperAgent> {
  const all = await getAll();
  const id = generateAgentId(all.map((a) => a.id));
  const full: ScraperAgent = { ...agent, id, createdAt: now(), updatedAt: now() };
  await saveAll([full, ...all]);
  return full;
}

export async function updateScraperAgent(id: string, fields: Partial<Omit<ScraperAgent, "id" | "createdAt">>): Promise<ScraperAgent> {
  const all = await getAll();
  const existing = all.find((a) => a.id === id);
  if (!existing) throw new Error(`Scraper agent "${id}" was not found.`);
  const updated: ScraperAgent = { ...existing, ...fields, updatedAt: now() };
  await saveAll(all.map((a) => (a.id === id ? updated : a)));
  return updated;
}

export async function deleteScraperAgent(id: string): Promise<void> {
  const all = await getAll();
  await saveAll(all.filter((a) => a.id !== id));
}
