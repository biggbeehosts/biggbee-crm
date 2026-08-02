import type { ErrorRecord, Lead, LeadMemory } from "@/types";
import { safeParseDate } from "@/lib/utils/date";

export interface TimelineEvent {
  id: string;
  label: string;
  description?: string;
  timestamp: string;
  tone: "default" | "success" | "danger" | "warning";
}

export function buildLeadTimeline(lead: Lead, memory: LeadMemory | undefined, errors: ErrorRecord[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (lead.lastEmailDate) {
    events.push({
      id: "last-email",
      label: lead.status === "Failed" ? "Last email attempt failed" : "Last email sent",
      description: lead.lastEmailSubject,
      timestamp: lead.lastEmailDate,
      tone: lead.status === "Failed" ? "danger" : "success",
    });
  }
  if (lead.lastContact) {
    events.push({
      id: "last-contact",
      label: "Last contact recorded",
      timestamp: lead.lastContact,
      tone: "default",
    });
  }
  if (memory?.updatedAt) {
    events.push({
      id: "memory-updated",
      label: "Lead memory updated",
      description: memory.lastSummary,
      timestamp: memory.updatedAt,
      tone: "default",
    });
  }
  if (memory?.demoSent) {
    events.push({
      id: "demo-sent",
      label: "Demo video included in outreach",
      timestamp: memory.lastContactedAt ?? lead.lastEmailDate ?? new Date().toISOString(),
      tone: "default",
    });
  }
  if (lead.status === "Meeting Booked" || memory?.meetingBooked) {
    events.push({
      id: "meeting-booked",
      label: "Meeting booked",
      timestamp: lead.lastContact ?? memory?.updatedAt ?? new Date().toISOString(),
      tone: "success",
    });
  }
  for (const err of errors) {
    if (!err.timestamp) continue;
    events.push({
      id: `error-${err.id}`,
      label: err.source || "Error",
      description: err.errorMessage,
      timestamp: err.timestamp,
      tone: "danger",
    });
  }

  return events
    .filter((e) => safeParseDate(e.timestamp))
    .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() ?? 0) - (safeParseDate(a.timestamp)?.getTime() ?? 0));
}
