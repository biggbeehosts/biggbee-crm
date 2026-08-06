import type { ErrorRecord } from "@/types";

export type ErrorSeverity = "critical" | "warning" | "info";

/** Source-string heuristic -- the Errors sheet has no dedicated Severity column, so this infers
 *  one from the node/source name. Shared by the Errors page and the dashboard's alert surfacing
 *  so the two never disagree about what counts as critical. */
export function severityOf(err: ErrorRecord): ErrorSeverity {
  const source = (err.source ?? "").toLowerCase();
  if (source.includes("validation")) return "warning";
  if (source.includes("drive") || source.includes("crawl")) return "info";
  return "critical";
}

export const SEVERITY_BADGE: Record<ErrorSeverity, "danger" | "warning" | "default"> = {
  critical: "danger",
  warning: "warning",
  info: "default",
};
