import type { ActivityRecord, ErrorRecord, Lead, LeadMemory } from "@/types";
import { safeParseDate } from "@/lib/utils/date";

export function buildActivityFeed(leads: Lead[], memory: LeadMemory[], errors: ErrorRecord[], limit = 20): ActivityRecord[] {
  const events: ActivityRecord[] = [];

  for (const lead of leads) {
    if (lead.lastEmailDate) {
      events.push({
        id: `send-${lead.email}`,
        type: lead.status === "Failed" ? "email_failed" : "email_sent",
        title: lead.status === "Failed" ? `Email failed to ${lead.company}` : `Email sent to ${lead.company}`,
        description: lead.lastEmailSubject,
        leadEmail: lead.email,
        company: lead.company,
        timestamp: lead.lastEmailDate,
      });
    }
    if (lead.status === "Meeting Booked" && lead.lastContact) {
      events.push({
        id: `meeting-${lead.email}`,
        type: "meeting_booked",
        title: `Meeting booked with ${lead.company}`,
        leadEmail: lead.email,
        company: lead.company,
        timestamp: lead.lastContact,
      });
    }
    if (lead.demoRecommended && lead.demoType) {
      events.push({
        id: `demo-${lead.email}`,
        type: "demo_assigned",
        title: `${lead.demoType} demo matched for ${lead.company}`,
        leadEmail: lead.email,
        company: lead.company,
        timestamp: lead.lastContact ?? lead.lastEmailDate ?? new Date().toISOString(),
      });
    }
  }

  for (const m of memory) {
    if (m.updatedAt) {
      events.push({
        id: `memory-${m.email}`,
        type: "memory_updated",
        title: `Lead memory updated for ${m.email}`,
        description: m.lastSummary,
        leadEmail: m.email,
        timestamp: m.updatedAt,
      });
    }
  }

  for (const e of errors) {
    if (!e.timestamp) continue;
    events.push({
      id: `error-${e.id}`,
      type: e.source === "AI Output Validation" || e.source === "Lead Validation" ? "validation_failed" : "email_failed",
      title: e.source === "AI Output Validation" || e.source === "Lead Validation" ? `Validation failed${e.company ? ` for ${e.company}` : ""}` : `Send error${e.company ? ` for ${e.company}` : ""}`,
      description: e.errorMessage,
      leadEmail: e.leadEmail,
      company: e.company,
      timestamp: e.timestamp,
    });
  }

  return events
    .filter((e) => safeParseDate(e.timestamp))
    .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() ?? 0) - (safeParseDate(a.timestamp)?.getTime() ?? 0))
    .slice(0, limit);
}

export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  leadEmail?: string;
  company?: string;
  severity: "high" | "medium";
}

export function buildNeedsAttention(leads: Lead[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const lead of leads) {
    if (lead.status === "Failed") {
      items.push({
        id: `failed-${lead.email}`,
        title: `Send failed: ${lead.company}`,
        description: lead.aiSummary || "The last outbound attempt failed and needs a retry.",
        leadEmail: lead.email,
        company: lead.company,
        severity: "high",
      });
    }
    if (lead.confidence !== null && lead.confidence < 45 && lead.status !== "Failed") {
      items.push({
        id: `lowconf-${lead.email}`,
        title: `Low AI confidence: ${lead.company}`,
        description: `Confidence scored at ${lead.confidence}% -- review before the next follow-up.`,
        leadEmail: lead.email,
        company: lead.company,
        severity: "medium",
      });
    }
    if (!lead.website) {
      items.push({
        id: `nowebsite-${lead.email}`,
        title: `Missing website: ${lead.company}`,
        description: "No website on file -- the AI Strategist had to work from CRM fields only.",
        leadEmail: lead.email,
        company: lead.company,
        severity: "medium",
      });
    }
    if (lead.demoRecommended && !lead.demoVideoAttached) {
      items.push({
        id: `nodemo-${lead.email}`,
        title: `Demo recommended but unavailable: ${lead.company}`,
        description: `A "${lead.demoType || "matching"}" demo was recommended but no file was found in the Demo Library.`,
        leadEmail: lead.email,
        company: lead.company,
        severity: "medium",
      });
    }
    if (lead.status !== "New" && !lead.serviceOffered) {
      items.push({
        id: `noservice-${lead.email}`,
        title: `Missing service on record: ${lead.company}`,
        description: "This lead has been contacted but has no Service Offered value recorded.",
        leadEmail: lead.email,
        company: lead.company,
        severity: "medium",
      });
    }
  }

  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
