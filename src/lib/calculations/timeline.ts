import type { AnalyticsEvent, AnalyticsEventType, Campaign, ErrorRecord, Lead, LeadMemory } from "@/types";
import { safeParseDate } from "@/lib/utils/date";

export interface TimelineEvent {
  id: string;
  label: string;
  description?: string;
  timestamp: string;
  tone: "default" | "success" | "danger" | "warning";
  /** Present only for entries sourced from an AnalyticsEvent -- lets an admin inspect the
   *  underlying event (source/provider id/metadata) without exposing any secret data, since
   *  AnalyticsEvent never carries one (Part J: "inspect the underlying event source"). */
  raw?: AnalyticsEvent;
}

/** Stage 5, Part J -- label/tone for every AnalyticsEventType that can appear on a lead's timeline.
 *  Types that never apply to a single lead (campaign_started/completed, scraper_*) are omitted;
 *  a lead-scoped `getEvents({leadId})` call never returns those anyway. */
const EVENT_LABELS: Partial<Record<AnalyticsEventType, { label: string; tone: TimelineEvent["tone"] }>> = {
  send_attempted: { label: "Send attempted", tone: "default" },
  sent: { label: "Email sent", tone: "success" },
  delivery_confirmed: { label: "Delivery confirmed", tone: "success" },
  delivery_failed: { label: "Delivery failed", tone: "danger" },
  hard_bounce: { label: "Hard bounce", tone: "danger" },
  soft_bounce: { label: "Soft bounce", tone: "warning" },
  open: { label: "Email opened (estimated)", tone: "default" },
  click: { label: "Link clicked", tone: "default" },
  unsubscribe: { label: "Unsubscribed", tone: "warning" },
  complaint: { label: "Spam complaint", tone: "danger" },
  reply_received: { label: "Reply received", tone: "default" },
  positive_reply: { label: "Positive reply", tone: "success" },
  negative_reply: { label: "Negative reply", tone: "warning" },
  meeting_booked: { label: "Meeting booked", tone: "success" },
  demo_attached: { label: "Demo attached to email", tone: "default" },
  demo_sent: { label: "Demo sent", tone: "success" },
  lead_approved: { label: "Lead approved", tone: "success" },
  lead_rejected: { label: "Lead rejected", tone: "warning" },
};

function eventDescription(event: AnalyticsEvent): string | undefined {
  if (event.type === "open" || event.type === "click") {
    return event.isBotOrScanner ? "Flagged as a suspected bot/scanner hit" : undefined;
  }
  if (event.metadata && typeof event.metadata.message === "string") return event.metadata.message;
  return undefined;
}

function analyticsEventsToTimeline(events: AnalyticsEvent[]): TimelineEvent[] {
  return events
    .map((e) => {
      const meta = EVENT_LABELS[e.type];
      if (!meta) return null;
      const entry: TimelineEvent = {
        id: `evt-${e.id}`,
        label: meta.label,
        description: eventDescription(e),
        timestamp: e.timestamp,
        tone: meta.tone,
        raw: e,
      };
      return entry;
    })
    .filter((e): e is TimelineEvent => e !== null);
}

export function buildLeadTimeline(lead: Lead, memory: LeadMemory | undefined, errors: ErrorRecord[], events: AnalyticsEvent[] = []): TimelineEvent[] {
  const timelineEvents: TimelineEvent[] = [];

  if (lead.lastEmailDate) {
    timelineEvents.push({
      id: "last-email",
      label: lead.status === "Failed" ? "Last email attempt failed" : "Last email sent",
      description: lead.lastEmailSubject,
      timestamp: lead.lastEmailDate,
      tone: lead.status === "Failed" ? "danger" : "success",
    });
  }
  if (lead.lastContact) {
    timelineEvents.push({
      id: "last-contact",
      label: "Last contact recorded",
      timestamp: lead.lastContact,
      tone: "default",
    });
  }
  if (memory?.updatedAt) {
    timelineEvents.push({
      id: "memory-updated",
      label: "Lead memory updated",
      description: memory.lastSummary,
      timestamp: memory.updatedAt,
      tone: "default",
    });
  }
  if (memory?.demoSent) {
    timelineEvents.push({
      id: "demo-sent",
      label: "Demo video included in outreach",
      timestamp: memory.lastContactedAt ?? lead.lastEmailDate ?? new Date().toISOString(),
      tone: "default",
    });
  }
  if (lead.status === "Meeting Booked" || memory?.meetingBooked) {
    timelineEvents.push({
      id: "meeting-booked",
      label: "Meeting booked",
      timestamp: lead.lastContact ?? memory?.updatedAt ?? new Date().toISOString(),
      tone: "success",
    });
  }
  if (lead.suppressedReason) {
    timelineEvents.push({
      id: "suppressed",
      label: "Suppressed from future outreach",
      description: lead.suppressedReason,
      timestamp: lead.bouncedAt ?? lead.complaintAt ?? lead.lastContact ?? new Date().toISOString(),
      tone: "danger",
    });
  }
  for (const err of errors) {
    if (!err.timestamp) continue;
    timelineEvents.push({
      id: `error-${err.id}`,
      label: err.source || "Error",
      description: err.errorMessage,
      timestamp: err.timestamp,
      tone: "danger",
    });
  }

  timelineEvents.push(...analyticsEventsToTimeline(events));

  return timelineEvents
    .filter((e) => safeParseDate(e.timestamp))
    .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() ?? 0) - (safeParseDate(a.timestamp)?.getTime() ?? 0));
}

/** Stage 5, Part I -- "a timeline of important campaign events." Campaign scope would make a
 *  full per-open/per-click dump unreadable at any real sending volume, so this deliberately shows
 *  only discrete, campaign-significant occurrences (lifecycle + bounces/complaints/conversions),
 *  not every engagement hit -- those are already aggregated in CampaignAnalyticsCard. */
const CAMPAIGN_EVENT_LABELS: Partial<Record<AnalyticsEventType, { label: string; tone: TimelineEvent["tone"] }>> = {
  campaign_started: { label: "Campaign run started", tone: "default" },
  campaign_completed: { label: "Campaign run completed", tone: "success" },
  lead_approved: { label: "Lead approved", tone: "success" },
  lead_rejected: { label: "Lead rejected", tone: "warning" },
  hard_bounce: { label: "Hard bounce", tone: "danger" },
  complaint: { label: "Spam complaint", tone: "danger" },
  unsubscribe: { label: "Unsubscribe", tone: "warning" },
  positive_reply: { label: "Positive reply", tone: "success" },
  meeting_booked: { label: "Meeting booked", tone: "success" },
  demo_sent: { label: "Demo sent", tone: "default" },
  inbox_placement_test: { label: "Inbox-placement test recorded", tone: "default" },
  inbox_placement_spam: { label: "Inbox-placement test: landed in spam", tone: "danger" },
};

const CAMPAIGN_TIMELINE_LIMIT = 100;

export function buildCampaignTimeline(campaign: Campaign, events: AnalyticsEvent[]): { events: TimelineEvent[]; truncatedFrom: number | null } {
  const scoped = events.filter((e) => e.campaignId === campaign.id && CAMPAIGN_EVENT_LABELS[e.type]);
  const mapped = scoped
    .map((e) => {
      const meta = CAMPAIGN_EVENT_LABELS[e.type]!;
      const entry: TimelineEvent = {
        id: `evt-${e.id}`,
        label: meta.label,
        description: eventDescription(e),
        timestamp: e.timestamp,
        tone: meta.tone,
        raw: e,
      };
      return entry;
    })
    .filter((e) => safeParseDate(e.timestamp))
    .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() ?? 0) - (safeParseDate(a.timestamp)?.getTime() ?? 0));

  return {
    events: mapped.slice(0, CAMPAIGN_TIMELINE_LIMIT),
    truncatedFrom: mapped.length > CAMPAIGN_TIMELINE_LIMIT ? mapped.length : null,
  };
}
