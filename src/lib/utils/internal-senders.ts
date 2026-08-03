/**
 * Internal sender/domain allowlist for classifying Unknown_Senders rows. Configurable via
 * INTERNAL_SENDER_ALLOWLIST (comma-separated emails and/or @domains) so it can be widened
 * without a code change or n8n workflow edit. Defaults to the one address the outbound workflow
 * itself sends run-summary reports from/to.
 */
function getAllowlist(): string[] {
  const raw = process.env.INTERNAL_SENDER_ALLOWLIST ?? "office@biggbees.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalSender(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = getAllowlist();
  return allowlist.some((entry) => (entry.startsWith("@") ? normalized.endsWith(entry) : normalized === entry));
}
