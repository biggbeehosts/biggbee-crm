import "server-only";
import { getAllowlistEntries } from "@/lib/data/internal-senders-store";

/**
 * Internal sender/domain allowlist for classifying Unknown_Senders rows. Admin-managed via
 * src/lib/data/internal-senders-store.ts (Stage 5, Part N), seeded from INTERNAL_SENDER_ALLOWLIST
 * (comma-separated emails and/or @domains) the first time it's read. Defaults to the one address
 * the outbound workflow itself sends run-summary reports from/to.
 */
export function isInternalSender(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = getAllowlistEntries();
  return allowlist.some((entry) => (entry.startsWith("@") ? normalized.endsWith(entry) : normalized === entry));
}

/** Exposes the raw allowlist (Stage 5, Part E) so the internal-config webhook can hand it to n8n's
 *  reply workflow -- same source of truth the CRM itself uses in isInternalSender/normalizeUnknownSender. */
export function getInternalSenderAllowlist(): string[] {
  return getAllowlistEntries();
}

/** Pattern-based system/report sender detection -- distinct from the operator-maintained allowlist
 *  above. These are addresses/subjects that are never a prospect reply no matter what domain they
 *  come from (delivery daemons, no-reply automations, Drive share notices), so a hardcoded pattern
 *  is appropriate here rather than something an admin needs to configure. */
const SYSTEM_SENDER_PATTERNS = [/^mailer-daemon@/i, /^postmaster@/i, /^no-?reply@/i, /^bounce[s]?@/i, /^mailer@/i];
const SYSTEM_SENDER_EXACT = ["drive-shares-noreply@google.com", "drive-shares-dm-noreply@google.com"];
const SYSTEM_SUBJECT_PATTERNS = [
  /undeliverable/i,
  /undelivered mail/i,
  /delivery status notification/i,
  /delivery has failed/i,
  /mail delivery failed/i,
  /returned to sender/i,
  /out of office/i,
  /automatic reply/i,
  // Billing/security/account alerts -- always a platform notification, never a prospect reply.
  /password reset/i,
  /reset your password/i,
  /security alert/i,
  /new sign-?in/i,
  /verify your (email|account)/i,
  /your (invoice|receipt|payment)/i,
  /billing (alert|notification|statement)/i,
  /two-factor|2fa code|one-time (code|password)/i,
];

export function isSystemNotificationSender(email: string, subject?: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized && (SYSTEM_SENDER_EXACT.includes(normalized) || SYSTEM_SENDER_PATTERNS.some((p) => p.test(normalized)))) {
    return true;
  }
  if (subject && SYSTEM_SUBJECT_PATTERNS.some((p) => p.test(subject))) return true;
  return false;
}

/** Domains the CRM's own tooling (or a service it integrates with) sends automated mail from --
 *  a reply from these is a platform notification, never a prospect, no matter the exact address.
 *  Matched by domain suffix (subdomains count), never substring, to avoid false positives on
 *  lookalike prospect domains. Deliberately narrow: only platforms this CRM actually talks to. */
const KNOWN_PLATFORM_DOMAINS = [
  "telnyx.com",
  "github.com",
  "hostinger.com",
  "hpanel.hostinger.com",
  "cloudinary.com",
  "n8n.io",
  "n8n.cloud",
  "apify.com",
  "google.com",
  "accounts.google.com",
];

export function isKnownPlatformSender(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  if (!domain) return false;
  return KNOWN_PLATFORM_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}
