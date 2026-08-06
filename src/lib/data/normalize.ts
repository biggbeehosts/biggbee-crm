import "server-only";
import type { DemoRecord, ErrorRecord, KnowledgeBaseRecord, Lead, LeadMemory, UnknownSender } from "@/types";
import { coalesceString, parseNumber, parseStringList, parseYesNo, safeTrim } from "@/lib/utils/fallback";
import { normalizeStatus } from "@/lib/utils/status";
import { isInternalSender, isKnownPlatformSender, isSystemNotificationSender } from "@/lib/utils/internal-senders";
import type { UnknownSenderClassification } from "@/types";

type Row = Record<string, string>;

/** Reads the first matching column, trying several header spellings so older sheets keep working. */
function pick(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

export function normalizeLead(row: Row, index: number): Lead {
  const confidence = parseNumber(pick(row, "Confidence"));
  return {
    email: safeTrim(pick(row, "Email")).toLowerCase(),
    name: coalesceString("Unknown", pick(row, "Name")),
    company: coalesceString("Unknown Company", pick(row, "Company")),
    website: pick(row, "Website"),
    industry: pick(row, "Industry"),
    businessType: pick(row, "Business Type", "BusinessType"),
    leadGenerationType: pick(row, "Lead Generation Type", "LeadGenerationType"),
    phone: pick(row, "Phone"),
    country: pick(row, "Country"),
    status: normalizeStatus(pick(row, "Status")),
    lastContact: pick(row, "Last Contact") || null,
    followUpCount: parseNumber(pick(row, "Follow-up Count", "Follow up Count"), 0) ?? 0,
    lastEmailSubject: pick(row, "Last Email Subject"),
    lastEmailDate: pick(row, "Last Email Date") || null,
    serviceOffered: pick(row, "Service Offered"),
    aiSummary: pick(row, "AI Summary"),
    demoVideoAttached: parseYesNo(pick(row, "Demo Video Attached")),
    demoVideoName: pick(row, "Demo Video Name"),
    subjectVariant: pick(row, "Subject Variant"),
    alternativeSubject: pick(row, "Alternative Subject"),
    demoRecommended: parseYesNo(pick(row, "Demo Recommended")),
    demoType: pick(row, "Demo Type"),
    demoWatchUrl: pick(row, "Demo Watch URL"),
    demoDownloadUrl: pick(row, "Demo Download URL"),
    demoId: pick(row, "Demo ID", "DemoID") || undefined,
    demoSent: pick(row, "Demo Sent") ? parseYesNo(pick(row, "Demo Sent")) : undefined,
    demoSentAt: pick(row, "Demo Sent At") || null,
    demoMatchReason: pick(row, "Demo Match Reason") || undefined,
    emailStyle: pick(row, "Email Style"),
    confidence,
    campaignId: pick(row, "Campaign ID", "CampaignID"),
    campaignName: pick(row, "Campaign Name", "CampaignName") || undefined,
    leadId: pick(row, "Lead ID", "LeadID") || undefined,
    location: pick(row, "Location") || undefined,
    targetService: pick(row, "Target Service", "TargetService") || undefined,
    source: pick(row, "Source") || undefined,
    scraperJobId: pick(row, "Scraper Job ID", "ScraperJobID") || undefined,
    createdAt: pick(row, "Created At", "CreatedAt") || undefined,
    messageId: pick(row, "Message ID") || undefined,
    trackingToken: pick(row, "Tracking Token") || undefined,
    openCount: parseNumber(pick(row, "Open Count"), 0) ?? 0,
    firstOpenedAt: pick(row, "First Opened At") || null,
    lastOpenedAt: pick(row, "Last Opened At") || null,
    clickCount: parseNumber(pick(row, "Click Count"), 0) ?? 0,
    firstClickedAt: pick(row, "First Clicked At") || null,
    lastClickedAt: pick(row, "Last Clicked At") || null,
    bounceType: pick(row, "Bounce Type") || undefined,
    bouncedAt: pick(row, "Bounced At") || null,
    complaintAt: pick(row, "Complaint At") || null,
    suppressedReason: pick(row, "Suppressed Reason") || undefined,
    rowNumber: index + 2, // +1 for header row, +1 for 1-based sheet rows
  };
}

export function normalizeLeadMemory(row: Row): LeadMemory {
  return {
    email: safeTrim(pick(row, "Email")).toLowerCase(),
    servicesDiscussed: pick(row, "Services Discussed", "ServicesDiscussed"),
    painPoints: pick(row, "PainPoints", "Pain Points"),
    interestLevel: pick(row, "Interest Level", "InterestLevel"),
    meetingBooked: parseYesNo(pick(row, "Meeting Booked", "MeetingBooked")),
    demoSent: parseYesNo(pick(row, "Demo Sent", "DemoSent")),
    demoId: pick(row, "Demo ID", "DemoID") || undefined,
    demoSentAt: pick(row, "Demo Sent At") || null,
    demoMatchReason: pick(row, "Demo Match Reason") || undefined,
    lastSummary: pick(row, "Last Summary", "LastSummary"),
    updatedAt: pick(row, "Updated At", "UpdatedAt") || null,
    lastSubject: pick(row, "Last Subject"),
    lastContactedAt: pick(row, "Last Contacted At") || null,
  };
}

export function normalizeDemoRecord(row: Row, index: number): DemoRecord {
  return {
    // Left blank (never a row-position guess) when the ID column is empty -- see
    // migrateMissingDemoIds in demo-library-mutations.ts, which assigns and persists a real id.
    demoId: pick(row, "Demo ID", "DemoID"),
    name: pick(row, "Demo Name", "DemoName") || undefined,
    demoType: safeTrim(pick(row, "Demo Type")).toLowerCase(),
    service: pick(row, "Service") || undefined,
    businessType: pick(row, "Business Type", "BusinessType") || undefined,
    industry: pick(row, "Industry") || undefined,
    leadGenerationType: pick(row, "Lead Generation Type", "LeadGenerationType") || undefined,
    language: pick(row, "Language") || undefined,
    country: pick(row, "Country") || undefined,
    publicWatchUrl: pick(row, "Public Watch URL"),
    publicDownloadUrl: pick(row, "Public Download URL"),
    fileName: pick(row, "File Name"),
    mimeType: pick(row, "MIME Type", "MimeType") || undefined,
    thumbnailUrl: pick(row, "Thumbnail URL"),
    duration: pick(row, "Duration"),
    // Blank/legacy rows (written before this column existed) default to active, so nothing that
    // worked yesterday silently disappears from matching today.
    active: parseYesNo(pick(row, "Active"), true),
    priority: parseNumber(pick(row, "Priority"), 0) ?? 0,
    isFallback: parseYesNo(pick(row, "Fallback Demo"), false),
    version: parseNumber(pick(row, "Version"), 1) ?? 1,
    archived: parseYesNo(pick(row, "Archived"), false),
    previousVersionId: pick(row, "Previous Version ID") || undefined,
    storageProvider: pick(row, "Storage Provider") || undefined,
    storagePublicId: pick(row, "Storage Public ID") || undefined,
    notes: pick(row, "Notes") || undefined,
    createdAt: pick(row, "Created At", "CreatedAt") || undefined,
    updatedAt: pick(row, "Updated At", "UpdatedAt") || undefined,
    rowNumber: index + 2,
  };
}

export function normalizeErrorRecord(row: Row, index: number): ErrorRecord {
  return {
    id: `sheet-${index}`,
    timestamp: pick(row, "Timestamp") || null,
    source: pick(row, "Source"),
    leadEmail: pick(row, "Lead Email", "LeadEmail"),
    company: pick(row, "Company"),
    errorMessage: pick(row, "Error Message", "ErrorMessage"),
    nodeName: pick(row, "Node Name", "NodeName"),
    validationErrors: parseStringList(pick(row, "Validation Errors")),
    validationWarnings: parseStringList(pick(row, "Validation Warnings")),
  };
}

export function normalizeUnknownSender(row: Row, index: number): UnknownSender {
  const fromEmail = safeTrim(pick(row, "From Email", "FromEmail")).toLowerCase();
  const subject = pick(row, "Subject");
  const storedClassification = pick(row, "Classification").trim();
  // "Internal" and "Lead Reply" are sticky -- a human (or n8n) made that call explicitly, so it's
  // never recomputed. Everything else (blank, legacy "Unknown", or a stale "System Notification")
  // is re-evaluated on every read against the current allowlist/pattern list, so classification
  // quality improves retroactively for old rows too, not just new ones.
  const classification: UnknownSenderClassification =
    storedClassification === "Internal" || storedClassification === "Lead Reply"
      ? (storedClassification as UnknownSenderClassification)
      : isInternalSender(fromEmail)
        ? "Internal"
        : isSystemNotificationSender(fromEmail, subject) || isKnownPlatformSender(fromEmail)
          ? "System Notification"
          : "Needs Review";
  return {
    timestamp: pick(row, "TimeStamp", "Timestamp") || null,
    fromEmail,
    subject,
    snippet: pick(row, "Snippet"),
    classification,
    reviewed: parseYesNo(pick(row, "Reviewed")) || classification === "Internal",
    rowNumber: index + 2,
  };
}

/** KB_Cache is a single logical record (one row, Cache Key = "latest") -- take the freshest row. */
/**
 * Stage 6, Part 8: the KB_Cache tab can hold one row per website, distinguished by Cache Key --
 * `cacheKey` defaults to "latest" (today's single default site) so every existing caller is
 * unaffected. Falls back to the tab's last row only when no row matches "latest" at all (legacy
 * tabs written before Cache Key existed), never for any other requested key -- a genuinely
 * missing/not-yet-synced site must show as empty, not silently show a different site's content.
 */
export function normalizeKnowledgeBase(rows: Row[], cacheKey: string = "latest"): KnowledgeBaseRecord {
  const row =
    rows.find((r) => pick(r, "Cache Key", "CacheKey").toLowerCase() === cacheKey.toLowerCase()) ??
    (cacheKey === "latest" ? rows[rows.length - 1] : undefined);
  const text = row ? pick(row, "KnowledgeBase Text", "KnowledgeBaseText") : "";
  const sections = text
    .split(/\n{2,}(?=### )/)
    .map((block) => {
      const match = block.match(/^###\s*(.+?)\s*[—-]\s*(.+)$/m);
      const title = match ? match[2] ?? match[1] : "Section";
      const content = block.replace(/^###.*\n?/, "").trim();
      return { title: title.trim(), content };
    })
    .filter((s) => s.content);
  return {
    cacheKey: row ? pick(row, "Cache Key", "CacheKey") || cacheKey : cacheKey,
    knowledgeBaseText: text,
    updatedAt: row ? pick(row, "Updated At", "UpdatedAt") || null : null,
    sourceCount: sections.length,
    sections,
  };
}
