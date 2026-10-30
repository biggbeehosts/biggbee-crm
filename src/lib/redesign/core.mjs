// Website Redesign Outreach -- pure decision logic, no I/O, no imports.
//
// This ONE file is used in two places so the rules can never drift apart:
//   1. the CRM (readiness/matching preview, imported from TypeScript), and
//   2. the n8n workflow's Code nodes (scripts/build-redesign-workflow.mjs inlines this file's
//      exports into each Code node -- it strips the `export` keywords, so keep this file to plain
//      top-level `function`/`const` declarations and nothing that needs an import).
//
// Every function fails CLOSED: anything that cannot be verified produces a block with a reason,
// never a send.

// ───────────────────────── constants ─────────────────────────

/** Phrase the operator must type to launch a live run (checked server-side by the CRM). */
export const LIVE_CONFIRM_PHRASE = "SEND LIVE";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DEFAULT_LIMITS = {
  maxScreenshots: 4,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
};
/** Logical sheet fields the workflow understands. The CRM never assumes header names -- the
 *  operator maps each logical field to a real header in REDESIGN_SHEET_COLUMNS. */
export const SHEET_FIELDS = {
  required: ["businessName", "email"],
  optional: ["businessId", "businessType", "website", "driveFolderId", "folderName", "status", "verifiedPreserved", "bookingFormIncluded", "unsubscribed"],
};
export const SMTP_PERMANENT_CODES = [550, 551, 552, 553, 554, 556];
export const SMTP_RATE_LIMIT_CODES = [421, 450, 451, 452, 454];

// ───────────────────────── small helpers ─────────────────────────

export function normalizeText(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEmail(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

export function isValidEmail(value) {
  const e = normalizeEmail(value);
  return /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/.test(e) && e.length <= 254;
}

export function parseBool(value) {
  const v = String(value == null ? "" : value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "x", "✓", "✔"].indexOf(v) !== -1) return true;
  if (["false", "no", "n", "0"].indexOf(v) !== -1) return false;
  return null; // blank / unrecognised = unknown, never silently true
}

// ───────────────────────── sheet row mapping ─────────────────────────

/**
 * Validates a logical-field -> header mapping against the sheet's real header row.
 * Returns { ok, problems[] }. Never guesses a header.
 */
export function validateColumnMap(columnMap, headers) {
  const problems = [];
  const map = columnMap || {};
  const present = (headers || []).map((h) => String(h));
  for (const f of SHEET_FIELDS.required) {
    if (!map[f]) problems.push("Required field \"" + f + "\" has no column mapped.");
  }
  for (const f of Object.keys(map)) {
    if (SHEET_FIELDS.required.indexOf(f) === -1 && SHEET_FIELDS.optional.indexOf(f) === -1) problems.push("Unknown mapped field \"" + f + "\".");
    else if (map[f] && present.indexOf(map[f]) === -1) problems.push("Mapped header \"" + map[f] + "\" (for " + f + ") was not found in the sheet.");
  }
  return { ok: problems.length === 0, problems: problems };
}

/** Turns raw sheet rows (objects keyed by header) into normalized business records. */
export function mapRows(rows, columnMap) {
  const map = columnMap || {};
  const get = (row, field) => (map[field] ? String(row[map[field]] == null ? "" : row[map[field]]).trim() : "");
  return (rows || []).map((row, index) => {
    const businessName = get(row, "businessName");
    const email = normalizeEmail(get(row, "email"));
    const explicitId = get(row, "businessId");
    return {
      rowIndex: index,
      // businessKey is the idempotency identity. An explicit id is the only truly stable one; the
      // fallback (email) is stable only as long as the email is, and the plan flags that.
      businessKey: explicitId || email,
      keySource: explicitId ? "businessId" : "email",
      businessName,
      email,
      businessType: get(row, "businessType"),
      website: get(row, "website"),
      driveFolderId: get(row, "driveFolderId"),
      folderName: get(row, "folderName"),
      status: get(row, "status"),
      verifiedPreserved: get(row, "verifiedPreserved"),
      bookingFormIncluded: parseBool(get(row, "bookingFormIncluded")),
      unsubscribedFlag: parseBool(get(row, "unsubscribed")) === true,
    };
  });
}

// ───────────────────────── eligibility ─────────────────────────

/**
 * @param business  one mapped row
 * @param ctx       { suppressedEmails:Set<string>, eligibleStatuses:string[], seenEmails:Set<string> (mutated),
 *                    doneKeys:Set<string> (live-mode businessKeys already sent/sending/queued for this campaign) }
 * Returns { eligible, reasons[] }. Reasons are human-readable and stored with the block.
 */
export function evaluateEligibility(business, ctx) {
  const reasons = [];
  if (!business.businessName) reasons.push("Missing business name.");
  if (!business.email) reasons.push("Missing email address.");
  else if (!isValidEmail(business.email)) reasons.push("Invalid email address.");
  if (business.unsubscribedFlag) reasons.push("Marked unsubscribed in the redesign sheet.");
  if (business.email && ctx.suppressedEmails && ctx.suppressedEmails.has(business.email)) reasons.push("Email is on the suppression/unsubscribe list.");
  if (ctx.eligibleStatuses && ctx.eligibleStatuses.length > 0) {
    const allowed = ctx.eligibleStatuses.map(normalizeText);
    if (allowed.indexOf(normalizeText(business.status)) === -1) reasons.push("Status \"" + business.status + "\" is not an eligible status.");
  }
  if (business.email && ctx.seenEmails) {
    if (ctx.seenEmails.has(business.email)) reasons.push("Duplicate email address in the sheet (already used by another business in this run).");
    else if (reasons.length === 0) ctx.seenEmails.add(business.email);
  }
  if (ctx.doneKeys && ctx.doneKeys.has(business.businessKey)) reasons.push("Already sent (or in progress) for this campaign.");
  return { eligible: reasons.length === 0, reasons: reasons };
}

// ───────────────────────── Drive folder matching ─────────────────────────

/**
 * Verified matching only -- no fuzzy matching, ever. Priority:
 *   1. the sheet row's explicit driveFolderId (must exist under the main folder),
 *   2. the sheet row's explicit folderName (exact normalized match),
 *   3. the business name (exact normalized match).
 * A folder that two businesses resolve to, or a name that matches two folders, blocks every
 * business involved. Screenshots from one folder can therefore never reach another business.
 *
 * @param businesses  mapped rows
 * @param folders     [{ id, name }] -- direct children of the main folder
 * @returns Map-like object: { [businessKey]: { status, folderId?, folderName?, method?, reason? } }
 */
export function matchFolders(businesses, folders) {
  const folderList = folders || [];
  const byId = {};
  const byName = {};
  for (const f of folderList) {
    byId[f.id] = f;
    const n = normalizeText(f.name);
    if (n) (byName[n] = byName[n] || []).push(f);
  }
  const result = {};
  const claims = {}; // folderId -> [businessKey]
  for (const b of businesses) {
    let outcome;
    if (b.driveFolderId) {
      const f = byId[b.driveFolderId];
      outcome = f
        ? { status: "matched", folderId: f.id, folderName: f.name, method: "driveFolderId" }
        : { status: "missing_folder", reason: "Drive folder id \"" + b.driveFolderId + "\" is not a direct subfolder of the configured main folder (or is not accessible)." };
    } else {
      const wanted = normalizeText(b.folderName || b.businessName);
      const method = b.folderName ? "folderName" : "businessName";
      const hits = wanted ? byName[wanted] || [] : [];
      if (hits.length === 1) outcome = { status: "matched", folderId: hits[0].id, folderName: hits[0].name, method: method };
      else if (hits.length > 1) outcome = { status: "ambiguous", reason: hits.length + " folders are named like \"" + (b.folderName || b.businessName) + "\"." };
      else outcome = { status: "missing_folder", reason: "No folder named \"" + (b.folderName || b.businessName) + "\" under the main folder." };
    }
    result[b.businessKey] = outcome;
    if (outcome.status === "matched") (claims[outcome.folderId] = claims[outcome.folderId] || []).push(b.businessKey);
  }
  for (const folderId of Object.keys(claims)) {
    if (claims[folderId].length > 1) {
      for (const key of claims[folderId]) {
        result[key] = { status: "conflict", reason: "Folder is claimed by " + claims[folderId].length + " businesses (" + claims[folderId].join(", ") + ")." };
      }
    }
  }
  return result;
}

// ───────────────────────── screenshot validation ─────────────────────────

/**
 * @param files   [{ id, name, mimeType, size }] listed inside ONE business's folder
 * @param opts    { maxScreenshots, maxFileBytes, maxTotalBytes, ignoreNonImageFiles }
 * @returns { ok, accepted[], rejected[{id,name,reason}], reason? }
 */
export function validateScreenshots(files, opts) {
  const o = Object.assign({}, DEFAULT_LIMITS, opts || {});
  const accepted = [];
  const rejected = [];
  const sorted = (files || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { numeric: true }));
  let total = 0;
  for (const f of sorted) {
    const size = Number(f.size);
    if (f.mimeType === GOOGLE_FOLDER_MIME) {
      rejected.push({ id: f.id, name: f.name, reason: "Nested folder (not a screenshot)." });
    } else if (ALLOWED_IMAGE_MIME_TYPES.indexOf(f.mimeType) === -1) {
      rejected.push({ id: f.id, name: f.name, reason: "Unsupported type " + (f.mimeType || "unknown") + ".", unsupported: true });
    } else if (!Number.isFinite(size) || size <= 0) {
      rejected.push({ id: f.id, name: f.name, reason: "File size unavailable or zero (possibly inaccessible).", inaccessible: true });
    } else if (size > o.maxFileBytes) {
      rejected.push({ id: f.id, name: f.name, reason: "File exceeds " + Math.round(o.maxFileBytes / 1024 / 1024) + " MB." });
    } else if (accepted.length >= o.maxScreenshots) {
      rejected.push({ id: f.id, name: f.name, reason: "Beyond the maximum of " + o.maxScreenshots + " screenshots.", overflow: true });
    } else if (total + size > o.maxTotalBytes) {
      rejected.push({ id: f.id, name: f.name, reason: "Would exceed the " + Math.round(o.maxTotalBytes / 1024 / 1024) + " MB attachment total.", overflow: true });
    } else {
      accepted.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: size });
      total += size;
    }
  }
  if (accepted.length === 0) {
    return { ok: false, accepted: accepted, rejected: rejected, reason: files && files.length ? "No valid screenshots in the folder." : "The business folder is empty." };
  }
  // Unsupported / inaccessible entries mean the folder is not what the operator thinks it is:
  // stop and flag rather than quietly send a subset. (Overflow beyond the cap is expected and fine.)
  const blocking = rejected.filter((r) => (r.unsupported && !o.ignoreNonImageFiles) || r.inaccessible);
  if (blocking.length > 0) {
    return { ok: false, accepted: accepted, rejected: rejected, reason: blocking.length + " file(s) are unsupported or inaccessible: " + blocking.map((r) => r.name).join(", ") + "." };
  }
  return { ok: true, accepted: accepted, rejected: rejected };
}

export function attachmentFingerprint(accepted) {
  return (accepted || []).map((f) => f.id).sort().join("|");
}

// ───────────────────────── email guardrails ─────────────────────────

export const UNSUPPORTED_CLAIM_PATTERNS = [
  /\b(increase|boost|grow|improve|double|triple|drive)\b[^.!?]{0,40}\b(sales|bookings?|revenue|traffic|rankings?|conversions?|customers|leads|footfall|orders)\b/i,
  /\b(guarantee[sd]?|guaranteed|proven|risk[- ]free)\b/i,
  /\b(rank(ing|s)?|seo|google ranking|first page|#1|number one)\b/i,
  /\b\d+\s?%/,
  /\b(limited time|act now|urgent|last chance|don'?t miss)\b/i,
];
const PRESERVED_CLAIM = /\b(kept|keep|preserved?|retained?|maintained?|included?|used|reused?)\b[^.!?]{0,80}\b(menu|prices?|pricing|opening hours|hours|contact|details|address|phone|services|content)\b/i;
const BOOKING_CLAIM = /\b(book(ing)?|reservation|reserve|appointment|enquiry form|contact form)\b/i;
const ATTACH_CLAIM = /\b(attach(ed|ment|ments)?|screenshots?|enclosed)\b/i;

/**
 * Checks an AI draft against the VERIFIED facts. Returns { ok, violations[] }.
 * facts: { attachmentCount, preservedVerified:boolean, bookingVerified:boolean, businessName }
 */
export function validateDraft(draft, facts) {
  const violations = [];
  const subject = String((draft && draft.subject) || "").trim();
  const body = String((draft && draft.body) || "").trim();
  if (!subject) violations.push("Empty subject.");
  if (subject.length > 90) violations.push("Subject longer than 90 characters.");
  if (/[\r\n]/.test(subject)) violations.push("Subject contains a line break.");
  if (!body) violations.push("Empty body.");
  const text = subject + "\n" + body;
  for (const re of UNSUPPORTED_CLAIM_PATTERNS) if (re.test(text)) violations.push("Unsupported or promotional claim: " + re);
  if (!facts.attachmentCount && ATTACH_CLAIM.test(text)) violations.push("Mentions screenshots/attachments but none are attached.");
  if (!facts.preservedVerified && PRESERVED_CLAIM.test(body)) violations.push("Claims real details were preserved, which is not verified.");
  if (!facts.bookingVerified && BOOKING_CLAIM.test(body)) violations.push("Mentions a booking/enquiry form that is not verified as included.");
  if (/https?:\/\//i.test(body) || /\bwww\./i.test(body.replace(/\n+Best regards[\s\S]*$/i, ""))) violations.push("Body contains a link before the signature.");
  return { ok: violations.length === 0, violations: violations };
}

/** Deterministic, always-safe email used when the AI draft is missing or fails validation. */
export function buildFallbackEmail(facts) {
  const name = facts.businessName;
  const kind = facts.businessType ? String(facts.businessType).trim() : "";
  const subject = ("A redesign concept for " + name).slice(0, 90);
  const para1 = kind
    ? "I came across the " + name + " website recently and prepared a redesign concept for your " + kind.toLowerCase() + "."
    : "I came across the " + name + " website recently and prepared a redesign concept for it.";
  const lines = ["Hi there,", "", para1, "I've attached " + (facts.attachmentCount === 1 ? "a screenshot" : "a few screenshots") + " so you can see what it could look like."];
  if (facts.preservedVerified) lines.push("", "I kept your existing " + facts.preservedVerified + " in the concept.");
  if (facts.bookingVerified) lines.push("", "It also includes a simple online booking form.");
  lines.push("", "If you like it, I'd be happy to set it up properly for you, and I'm glad to adjust anything. If not, no worries at all.");
  return { subject: subject, body: lines.join("\n") };
}

/** Preserved-details sentence is only ever built from the sheet's own verified text. */
export function preservedPhrase(verifiedPreserved) {
  const v = String(verifiedPreserved || "").trim();
  if (!v) return "";
  return v.replace(/[.\s]+$/g, "").slice(0, 120);
}

/** Plain text -> simple HTML (paragraphs only; the signature's website line becomes a link).
 *  Used both when composing and when re-rendering an approved preview for the live send. */
export function textToHtml(text, siteDisplay, siteUrl) {
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const paras = String(text)
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split("\n").map((line) => (siteDisplay && line.trim() === siteDisplay ? '<a href="' + esc(siteUrl) + '">' + esc(siteDisplay) + "</a>" : esc(line)));
      return "<p>" + lines.join("<br>") + "</p>";
    });
  return "<div>" + paras.join("") + "</div>";
}

export function signatureParts(identity) {
  const name = identity.signatureName || identity.workspaceName || identity.senderDisplayName;
  const site = String(identity.signatureWebsite || identity.website || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return { name: name, site: site, url: site ? "https://" + site : "" };
}

/**
 * Adds the established signature (never produced by the AI, so it can't be altered) and builds
 * plain-text + simple HTML parts. No logo, no tracking pixel, no remote images.
 */
export function composeEmail(draft, identity) {
  const sig = signatureParts(identity);
  const bodyNoSig = String(draft.body)
    .replace(/\n+(best regards|kind regards|regards|cheers)[\s\S]*$/i, "")
    .trimEnd();
  const text = bodyNoSig + "\n\nBest regards,\n" + sig.name + (sig.site ? "\n" + sig.site : "");
  return { subject: String(draft.subject).trim(), text: text, html: textToHtml(text, sig.site, sig.url) };
}

/** One call for the workflow: validate the AI draft, fall back if it fails, compose with signature. */
export function finalizeEmail(aiDraft, facts, identity) {
  const check = aiDraft ? validateDraft(aiDraft, facts) : { ok: false, violations: ["No AI draft produced."] };
  let usedFallback = false;
  let draft = aiDraft;
  if (!check.ok) {
    usedFallback = true;
    draft = buildFallbackEmail(Object.assign({}, facts, { preservedVerified: facts.preservedVerified || "" }));
    const recheck = validateDraft(draft, facts);
    if (!recheck.ok) return { ok: false, usedFallback: true, violations: check.violations.concat(recheck.violations), email: null };
  }
  return { ok: true, usedFallback: usedFallback, violations: check.violations, email: composeEmail(draft, identity) };
}

// ───────────────────────── send planning / safety ─────────────────────────

/**
 * Decides whether the next live send may happen right now.
 * state: { status ('running'|'pausing'|'paused'|'cancelled'), sentLastHour, sentLastDay,
 *          externalSentLastHour, externalSentLastDay, bounceRate, bounceSample, complaints, consecutiveErrors }
 * limits: { hourlyLimit, dailyLimit, bounceRateThreshold, minSampleForBounce, maxConsecutiveErrors }
 * Returns { action: 'send' | 'pause' | 'stop', reason }.
 */
export function decideNextSend(state, limits) {
  if (!state || state.status === "cancelled") return { action: "stop", reason: "Campaign was cancelled." };
  if (state.status !== "running") return { action: "stop", reason: "Campaign is " + state.status + "." };
  const hourly = Number(limits.hourlyLimit);
  const daily = Number(limits.dailyLimit);
  if (!(hourly > 0) || !(daily > 0)) return { action: "pause", reason: "Hourly/daily sending limits are not configured." };
  if (Number(state.sentLastHour || 0) + Number(state.externalSentLastHour || 0) >= hourly) return { action: "pause", reason: "Hourly sending limit reached (" + hourly + "). Resume later." };
  if (Number(state.sentLastDay || 0) + Number(state.externalSentLastDay || 0) >= daily) return { action: "pause", reason: "Daily sending limit reached (" + daily + "). Resume tomorrow." };
  if (Number(state.complaints || 0) > 0) return { action: "pause", reason: "A spam complaint was recorded for this mailbox. Review before continuing." };
  if (Number(state.bounceSample || 0) >= Number(limits.minSampleForBounce || 20) && Number(state.bounceRate || 0) > Number(limits.bounceRateThreshold)) {
    return { action: "pause", reason: "Bounce rate " + (Number(state.bounceRate) * 100).toFixed(1) + "% exceeds the " + (Number(limits.bounceRateThreshold) * 100).toFixed(1) + "% threshold." };
  }
  if (Number(state.consecutiveErrors || 0) >= Number(limits.maxConsecutiveErrors)) return { action: "pause", reason: state.consecutiveErrors + " consecutive errors." };
  return { action: "send", reason: "" };
}

/** Classifies an SMTP/transport error message. Unknown => 'transient' (pause, never mark sent). */
export function classifySmtpError(message, responseCode) {
  const text = String(message || "");
  let code = Number(responseCode);
  if (!Number.isFinite(code) || code <= 0) {
    const m = text.match(/\b([45]\d\d)\b/);
    code = m ? Number(m[1]) : 0;
  }
  if (SMTP_RATE_LIMIT_CODES.indexOf(code) !== -1 || /rate limit|too many|throttl|quota|daily (user )?sending limit|try again later/i.test(text)) return { kind: "rate_limit", code: code, pauseRun: true };
  if (SMTP_PERMANENT_CODES.indexOf(code) !== -1 || /user unknown|no such user|mailbox unavailable|does not exist|invalid recipient|recipient rejected|address rejected/i.test(text)) return { kind: "permanent", code: code, pauseRun: false };
  if (/auth(entication)? (failed|required)|535|534|credentials/i.test(text)) return { kind: "auth", code: code, pauseRun: true };
  return { kind: "transient", code: code, pauseRun: true };
}

/** Idempotency identity for one business in one campaign run mode. */
export function campaignKey(workspaceId, campaignId, businessKey, mode) {
  return [workspaceId, campaignId, businessKey, mode].join("|");
}

/** Builds the set of businessKeys that must not be sent again for this campaign. */
export function buildDoneKeys(trackingRows, workspaceId, campaignId) {
  const done = new Set();
  for (const r of trackingRows || []) {
    if (r.workspaceId !== workspaceId || r.campaignId !== campaignId || r.mode !== "live") continue;
    // "failed" is deliberately NOT terminal for transient errors (see failureKind), but "sending"
    // is: a crash between claim and confirmation must never lead to a second send.
    if (["sent", "sending", "queued"].indexOf(r.status) !== -1) done.add(r.businessKey);
    if (r.status === "failed" && r.failureKind === "permanent") done.add(r.businessKey);
  }
  return done;
}

/** Finds the approved dry-run preview for one business (latest wins). */
export function findApprovedPreview(trackingRows, workspaceId, campaignId, businessKey) {
  let found = null;
  for (const r of trackingRows || []) {
    if (r.workspaceId === workspaceId && r.campaignId === campaignId && r.businessKey === businessKey && r.mode === "dry" && r.status === "previewed") {
      if (!found || String(r.updatedAt) >= String(found.updatedAt)) found = r;
    }
  }
  return found;
}
