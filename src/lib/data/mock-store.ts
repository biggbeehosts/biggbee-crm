import "server-only";
import { MOCK_LEADS } from "@/lib/mock";
import type { Lead, LeadStatus } from "@/types";

/**
 * A mutable, server-process-scoped copy of the mock leads so "Add Lead" and pipeline
 * drag-and-drop feel real in mock mode without a database. Resets on server restart -- this is a
 * demo convenience, not a persistence layer. Swap for the Google Sheets write path once the
 * service account has write scope (see lib/actions/leads.ts).
 */
let store: Lead[] = MOCK_LEADS.map((l) => ({ ...l }));

export function getMockLeads(): Lead[] {
  return store;
}

export function addMockLead(lead: Lead) {
  store = [lead, ...store];
}

export function updateMockLeadStatus(email: string, status: LeadStatus) {
  store = store.map((l) => (l.email === email ? { ...l, status } : l));
}

export function updateMockLead(email: string, fields: Partial<Lead>) {
  store = store.map((l) => (l.email === email ? { ...l, ...fields } : l));
}

export function deleteMockLead(email: string) {
  store = store.filter((l) => l.email !== email);
}

export function resetMockLeads() {
  store = MOCK_LEADS.map((l) => ({ ...l }));
}
