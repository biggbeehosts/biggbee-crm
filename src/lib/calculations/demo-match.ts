import type { Campaign, DemoRecord } from "@/types";

/**
 * Strict priority demo selection (Part D). This is ported 1:1 into the n8n outreach workflow's
 * "Resolve Campaign Demo" Code node so the CRM (Campaign Readiness / the campaign form's live
 * preview) and n8n's actual send-time decision can never drift apart -- one rule, two runtimes.
 * Never falls back to "the first row": every branch either returns a specific matched demo via an
 * explicit rule or returns null with a reason.
 */

export type DemoMatchReason =
  | "none"
  | "exact-id"
  | "exact-id-missing"
  | "exact-id-inactive-or-invalid"
  | "auto-service-industry-language"
  | "auto-service-industry"
  | "auto-service-language"
  | "auto-service"
  | "auto-industry"
  | "auto-language"
  | "fallback-demo"
  | "no-match";

export interface DemoMatchResult {
  demo: DemoRecord | null;
  reason: DemoMatchReason;
  /** True when this outcome should block outreach entirely (Part C/H) -- an invalid Exact-mode
   *  Demo ID is always blocking; an Automatic-mode miss is blocking only if the campaign requires
   *  a match (campaign.requireDemoMatch). */
  blocking: boolean;
}

function isWellFormedUrl(url: string | undefined): boolean {
  if (!url || !url.trim()) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** A demo is only eligible for selection (Exact or Automatic) if it's active, not archived
 *  (Stage 6 versioning -- a superseded version is never chosen even if still marked active), and
 *  has a working watch URL. Matches Part C's "if a selected Demo ID becomes inactive or missing:
 *  block outreach" and Automatic mode's "at least one valid match" requirement. */
function isSelectable(demo: DemoRecord): boolean {
  return demo.active && !demo.archived && isWellFormedUrl(demo.publicWatchUrl);
}

/** Highest priority wins; ties broken by newest active demo (updatedAt, falling back to
 *  createdAt) -- never array/row order. */
function pickBest(candidates: DemoRecord[]): DemoRecord {
  return [...candidates].sort((a, b) => {
    const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
    if (byPriority !== 0) return byPriority;
    const aTime = a.updatedAt || a.createdAt || "";
    const bTime = b.updatedAt || b.createdAt || "";
    return bTime.localeCompare(aTime);
  })[0];
}

type CampaignDemoFields = Pick<Campaign, "attachDemo" | "demoSelectionMode" | "demoId" | "requireDemoMatch" | "service" | "industry" | "language">;

/**
 * Stage 6, Part 7 priority chain: Campaign (exact pin) -> Service -> Industry -> Language ->
 * Priority -> Fallback Demo. Automatic mode tries each AND-combination below in most-specific-
 * first order (mirrors the original tier design 1:1, just with the new dimension set) -- the
 * first tier with at least one match wins; Priority (pickBest) breaks ties within that tier.
 * If literally nothing matches on service/industry/language, the last resort is a demo explicitly
 * flagged isFallback -- never "whatever has the highest priority number," since that could send a
 * highly specific demo to a completely unrelated lead just because of its priority value.
 */
export function resolveCampaignDemo(campaign: CampaignDemoFields, demos: DemoRecord[]): DemoMatchResult {
  if (!campaign.attachDemo || campaign.demoSelectionMode === "None") {
    return { demo: null, reason: "none", blocking: false };
  }

  if (campaign.demoSelectionMode === "Exact") {
    const demoId = (campaign.demoId ?? "").trim();
    const match = demoId ? demos.find((d) => d.demoId === demoId) : undefined;
    if (!match) return { demo: null, reason: "exact-id-missing", blocking: true };
    if (!isSelectable(match)) return { demo: null, reason: "exact-id-inactive-or-invalid", blocking: true };
    return { demo: match, reason: "exact-id", blocking: false };
  }

  // Automatic mode. Uses the campaign's own Service/Industry/Language -- never a per-lead AI
  // guess (see README note in the n8n workflow: demoRecommended stays informational-only).
  const selectable = demos.filter(isSelectable);
  const service = (campaign.service ?? "").trim();
  const industry = (campaign.industry ?? "").trim();
  const language = (campaign.language ?? "").trim();

  const tiers: [DemoMatchReason, DemoRecord[]][] = [
    ["auto-service-industry-language", service && industry && language ? selectable.filter((d) => d.service === service && d.industry === industry && d.language === language) : []],
    ["auto-service-industry", service && industry ? selectable.filter((d) => d.service === service && d.industry === industry) : []],
    ["auto-service-language", service && language ? selectable.filter((d) => d.service === service && d.language === language) : []],
    ["auto-service", service ? selectable.filter((d) => d.service === service) : []],
    ["auto-industry", industry ? selectable.filter((d) => d.industry === industry) : []],
    ["auto-language", language ? selectable.filter((d) => d.language === language) : []],
  ];
  for (const [reason, candidates] of tiers) {
    if (candidates.length > 0) return { demo: pickBest(candidates), reason, blocking: false };
  }

  const fallback = selectable.filter((d) => d.isFallback);
  if (fallback.length > 0) return { demo: pickBest(fallback), reason: "fallback-demo", blocking: false };

  return { demo: null, reason: "no-match", blocking: campaign.requireDemoMatch };
}

/** How many campaigns are directly assigned to each Demo ID (Part G "campaign usage count").
 *  Only Exact-mode assignment counts as usage -- an Automatic-mode campaign that *could* match a
 *  demo hasn't actually chosen it, so counting that would overstate real reliance on this demo. */
export function countCampaignDemoUsage(campaigns: Pick<Campaign, "attachDemo" | "demoSelectionMode" | "demoId">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of campaigns) {
    if (!c.attachDemo || c.demoSelectionMode !== "Exact" || !c.demoId) continue;
    counts.set(c.demoId, (counts.get(c.demoId) ?? 0) + 1);
  }
  return counts;
}
