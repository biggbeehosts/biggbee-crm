import "server-only";
import type { DemoRecord, ErrorRecord, KnowledgeBaseRecord, Lead, LeadMemory, UnknownSender } from "@/types";
import { coalesceString, parseNumber, parseStringList, parseYesNo, safeTrim } from "@/lib/utils/fallback";
import { normalizeStatus } from "@/lib/utils/status";

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
    emailStyle: pick(row, "Email Style"),
    confidence,
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
    lastSummary: pick(row, "Last Summary", "LastSummary"),
    updatedAt: pick(row, "Updated At", "UpdatedAt") || null,
    lastSubject: pick(row, "Last Subject"),
    lastContactedAt: pick(row, "Last Contacted At") || null,
  };
}

export function normalizeDemoRecord(row: Row): DemoRecord {
  return {
    demoType: safeTrim(pick(row, "Demo Type")).toLowerCase(),
    publicWatchUrl: pick(row, "Public Watch URL"),
    publicDownloadUrl: pick(row, "Public Download URL"),
    fileName: pick(row, "File Name"),
    thumbnailUrl: pick(row, "Thumbnail URL"),
    duration: pick(row, "Duration"),
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

export function normalizeUnknownSender(row: Row): UnknownSender {
  return {
    timestamp: pick(row, "TimeStamp", "Timestamp") || null,
    fromEmail: safeTrim(pick(row, "From Email", "FromEmail")).toLowerCase(),
    subject: pick(row, "Subject"),
    snippet: pick(row, "Snippet"),
  };
}

/** KB_Cache is a single logical record (one row, Cache Key = "latest") -- take the freshest row. */
export function normalizeKnowledgeBase(rows: Row[]): KnowledgeBaseRecord {
  const row = rows.find((r) => pick(r, "Cache Key", "CacheKey").toLowerCase() === "latest") ?? rows[rows.length - 1];
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
    cacheKey: row ? pick(row, "Cache Key", "CacheKey") || "latest" : "latest",
    knowledgeBaseText: text,
    updatedAt: row ? pick(row, "Updated At", "UpdatedAt") || null : null,
    sourceCount: sections.length,
    sections,
  };
}
