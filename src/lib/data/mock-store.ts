import "server-only";
import { MOCK_LEADS } from "@/lib/mock";
import type { Lead, LeadStatus } from "@/types";

/**
 * A mutable, server-process-scoped copy of the mock leads so "Add Lead" and pipeline
 * drag-and-drop feel real in mock mode without a database. Resets on server restart -- this is a
 * demo convenience, not a persistence layer. Swap for the Google Sheets write path once the
 * service account has write scope (see lib/actions/leads.ts).
 *
 * Phase A: every mutation here is keyed by workspaceId + email, mirroring
 * leads-mutations.ts's real (Sheets) implementation exactly, so mock mode exercises the same
 * cross-workspace-safety contract as production.
 */
let store: Lead[] = MOCK_LEADS.map((l) => ({ ...l }));

export function getMockLeads(workspaceId: string): Lead[] {
  return store.filter((l) => l.workspaceId === workspaceId);
}

/** The one legitimate cross-workspace read -- see repository.ts's findLeadByTrackingToken, whose
 *  mock-mode counterpart this backs. Never exported for general "list every lead" use. */
export function getAllMockLeadsUnfiltered(): Lead[] {
  return store;
}

export function addMockLead(lead: Lead) {
  store = [lead, ...store];
}

export function updateMockLeadStatus(workspaceId: string, email: string, status: LeadStatus) {
  store = store.map((l) => (l.workspaceId === workspaceId && l.email === email ? { ...l, status } : l));
}

export function updateMockLead(workspaceId: string, email: string, fields: Partial<Lead>) {
  store = store.map((l) => (l.workspaceId === workspaceId && l.email === email ? { ...l, ...fields } : l));
}

export function deleteMockLead(workspaceId: string, email: string) {
  store = store.filter((l) => !(l.workspaceId === workspaceId && l.email === email));
}

export function resetMockLeads() {
  store = MOCK_LEADS.map((l) => ({ ...l }));
}
