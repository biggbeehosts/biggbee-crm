/**
 * Best-effort bot/scanner classification for tracking-pixel and click-redirect hits (Stage 5,
 * Part C/D). This is a heuristic, not a certainty -- Apple Mail Privacy Protection proxies every
 * image load through Apple's own infrastructure regardless of whether a human ever opens the
 * email, corporate security scanners pre-fetch links/images, and some proxies rotate UAs. A
 * positive match here means "treat as not-a-human-open/click for unique-count purposes"; it never
 * means "we know for certain this was automated." The CRM surfaces this distinction in the UI
 * (Suspected Automated Opens / Suspected Scanner Clicks) rather than silently dropping the hit.
 */

const BOT_UA_PATTERNS: RegExp[] = [
  /googleimageproxy/i,
  /google-safebrowsing/i,
  /applemai?l ?privacy/i, // Apple's own proxy sometimes self-identifies this way
  /mailchimp/i,
  /barracuda/i,
  /proofpoint/i,
  /mimecast/i,
  /symantec/i,
  /bot|crawler|spider|scanner|preview|fetch/i,
  /curl|wget|python-requests|axios|node-fetch/i,
];

/** Known proxy/relay IP ranges are out of scope for a heuristic this simple -- UA string is the
 *  only practical signal available without a paid IP-intelligence feed. */
export function classifyUserAgent(userAgent: string | null): { category: string; isBot: boolean } {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { category: "unknown", isBot: false };
  if (BOT_UA_PATTERNS.some((p) => p.test(ua))) return { category: "bot", isBot: true };
  if (/mobile|iphone|android/i.test(ua)) return { category: "mobile", isBot: false };
  if (/mozilla|chrome|safari|firefox|edg\//i.test(ua)) return { category: "desktop", isBot: false };
  return { category: "unknown", isBot: false };
}
