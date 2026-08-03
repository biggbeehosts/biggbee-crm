import type { LeadStatus, PipelineStage } from "@/types";

const STATUS_ALIASES: Record<string, LeadStatus> = {
  staged: "Staged",
  new: "New",
  sent: "Sent",
  contacted: "Contacted",
  interested: "Interested",
  "not interested": "Not Interested",
  "needs follow-up": "Sent",
  "needs followup": "Sent",
  "meeting booked": "Meeting Booked",
  "meeting requested": "Meeting Booked",
  customer: "Customer",
  won: "Customer",
  failed: "Failed",
  bounced: "Failed",
  unsubscribed: "Unsubscribed",
  "do not contact": "Unsubscribed",
  spam: "Spam",
  "needs review": "Needs Review",
};

/** Maps an arbitrary sheet string onto the closed LeadStatus enum, case/whitespace-insensitive. */
export function normalizeStatus(input: unknown): LeadStatus {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "New";
  return STATUS_ALIASES[s] ?? "Needs Review";
}

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  Staged: { bg: "bg-cyan-500/15", text: "text-cyan-300", dot: "bg-cyan-400" },
  New: { bg: "bg-slate-500/15", text: "text-slate-300", dot: "bg-slate-400" },
  Sent: { bg: "bg-sky-500/15", text: "text-sky-300", dot: "bg-sky-400" },
  Contacted: { bg: "bg-sky-500/15", text: "text-sky-300", dot: "bg-sky-400" },
  Interested: { bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-400" },
  "Not Interested": { bg: "bg-zinc-500/15", text: "text-zinc-400", dot: "bg-zinc-500" },
  "Meeting Booked": { bg: "bg-violet-500/15", text: "text-violet-300", dot: "bg-violet-400" },
  Customer: { bg: "bg-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400" },
  Failed: { bg: "bg-rose-500/15", text: "text-rose-300", dot: "bg-rose-400" },
  Unsubscribed: { bg: "bg-zinc-600/15", text: "text-zinc-400", dot: "bg-zinc-500" },
  Spam: { bg: "bg-rose-500/15", text: "text-rose-300", dot: "bg-rose-400" },
  "Needs Review": { bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400" },
};

const PIPELINE_MAP: Record<LeadStatus, PipelineStage> = {
  // Staged leads are pending review (see the Scraped Leads page) and not yet real pipeline
  // members -- bucketed with New for the board like "Needs Review" already is, rather than
  // adding Kanban-level filtering, which is out of scope here.
  Staged: "New",
  New: "New",
  Sent: "Contacted",
  Contacted: "Contacted",
  Interested: "Interested",
  "Not Interested": "Contacted",
  "Meeting Booked": "Meeting Booked",
  Customer: "Customer",
  Failed: "Failed",
  Unsubscribed: "Unsubscribed",
  Spam: "Unsubscribed",
  "Needs Review": "New",
};

export function toPipelineStage(status: LeadStatus): PipelineStage {
  return PIPELINE_MAP[status] ?? "New";
}
