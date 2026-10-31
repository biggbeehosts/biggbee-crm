import assert from "node:assert/strict";
import test from "node:test";
import * as core from "./core.mjs";

const biz = (over = {}) => ({ businessKey: "b1", businessName: "Al Shami", email: "owner@alshami.example", driveFolderId: "", folderName: "", status: "", unsubscribedFlag: false, ...over });
const ctx = (over = {}) => ({ suppressedEmails: new Set(), eligibleStatuses: [], seenEmails: new Set(), doneKeys: new Set(), ...over });

// ── column mapping ──
test("validateColumnMap requires businessName+email and never guesses headers", () => {
  assert.equal(core.validateColumnMap({}, ["Name", "Email"]).ok, false);
  assert.equal(core.validateColumnMap({ businessName: "Name", email: "Email" }, ["Name", "Email"]).ok, true);
  const bad = core.validateColumnMap({ businessName: "Name", email: "E-mail" }, ["Name", "Email"]);
  assert.equal(bad.ok, false);
  assert.match(bad.problems.join(" "), /E-mail/);
  assert.equal(core.validateColumnMap({ businessName: "Name", email: "Email", bogus: "x" }, ["Name", "Email", "x"]).ok, false);
});

test("mapRows uses explicit businessId as key, else falls back to email", () => {
  const rows = [{ N: "A", E: "A@x.com", ID: "id-1" }, { N: "B", E: "b@x.com", ID: "" }];
  const out = core.mapRows(rows, { businessName: "N", email: "E", businessId: "ID" });
  assert.equal(out[0].businessKey, "id-1");
  assert.equal(out[1].businessKey, "b@x.com");
  assert.equal(out[1].keySource, "email");
});

test("parseBool leaves blank/unknown as null (never silently true)", () => {
  assert.equal(core.parseBool("Yes"), true);
  assert.equal(core.parseBool("no"), false);
  assert.equal(core.parseBool(""), null);
  assert.equal(core.parseBool("maybe"), null);
});

// ── eligibility ──
test("eligibility blocks invalid, suppressed, unsubscribed, duplicate and already-sent", () => {
  assert.equal(core.evaluateEligibility(biz(), ctx()).eligible, true);
  assert.equal(core.evaluateEligibility(biz({ email: "nope" }), ctx()).eligible, false);
  assert.equal(core.evaluateEligibility(biz(), ctx({ suppressedEmails: new Set(["owner@alshami.example"]) })).eligible, false);
  assert.equal(core.evaluateEligibility(biz({ unsubscribedFlag: true }), ctx()).eligible, false);
  assert.equal(core.evaluateEligibility(biz(), ctx({ doneKeys: new Set(["b1"]) })).eligible, false);
  const shared = ctx();
  assert.equal(core.evaluateEligibility(biz({ businessKey: "a" }), shared).eligible, true);
  const dup = core.evaluateEligibility(biz({ businessKey: "b" }), shared);
  assert.equal(dup.eligible, false);
  assert.match(dup.reasons.join(" "), /Duplicate/);
});

test("eligibility honours configured eligible statuses", () => {
  assert.equal(core.evaluateEligibility(biz({ status: "Ready" }), ctx({ eligibleStatuses: ["ready"] })).eligible, true);
  assert.equal(core.evaluateEligibility(biz({ status: "Done" }), ctx({ eligibleStatuses: ["ready"] })).eligible, false);
});

// ── folder matching ──
test("matchFolders: exact id, folder name, business name; no fuzzy matching", () => {
  const folders = [{ id: "f1", name: "Al Shami" }, { id: "f2", name: "Pizza Roma" }];
  const m = core.matchFolders(
    [biz({ businessKey: "1", businessName: "al-shami" }), biz({ businessKey: "2", businessName: "Pizza Rom" }), biz({ businessKey: "3", driveFolderId: "f2", businessName: "Whatever" })],
    folders
  );
  assert.equal(m["1"].status, "matched");
  assert.equal(m["1"].folderId, "f1");
  assert.equal(m["2"].status, "missing_folder"); // "Pizza Rom" is NOT fuzzily matched to "Pizza Roma"
  assert.equal(m["3"].folderId, "f2");
  assert.equal(m["3"].method, "driveFolderId");
});

test("matchFolders: ambiguous names and shared folders block every business involved", () => {
  const amb = core.matchFolders([biz({ businessName: "Cafe Rio" })], [{ id: "a", name: "Cafe Rio" }, { id: "b", name: "cafe  rio" }]);
  assert.equal(amb["b1"].status, "ambiguous");
  const conflict = core.matchFolders([biz({ businessKey: "x", businessName: "Cafe Rio" }), biz({ businessKey: "y", businessName: "Cafe Rio", email: "y@y.com" })], [{ id: "a", name: "Cafe Rio" }]);
  assert.equal(conflict["x"].status, "conflict");
  assert.equal(conflict["y"].status, "conflict");
});

test("matchFolders: an explicit folder id outside the main folder is rejected", () => {
  const m = core.matchFolders([biz({ driveFolderId: "elsewhere" })], [{ id: "f1", name: "Al Shami" }]);
  assert.equal(m["b1"].status, "missing_folder");
});

// ── screenshots ──
const img = (id, name, size = 1000, mimeType = "image/png") => ({ id, name, size, mimeType });

test("validateScreenshots accepts several images in natural order and caps the count", () => {
  const files = [img("3", "shot-10.png"), img("1", "shot-2.png"), img("2", "shot-1.png"), img("4", "shot-3.png"), img("5", "shot-4.png"), img("6", "shot-5.png")];
  const r = core.validateScreenshots(files, { maxScreenshots: 4 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted.map((f) => f.name), ["shot-1.png", "shot-2.png", "shot-3.png", "shot-4.png"]);
  assert.equal(r.rejected.filter((x) => x.overflow).length, 2);
});

test("validateScreenshots blocks empty folders, unsupported types and zero-size/inaccessible files", () => {
  assert.equal(core.validateScreenshots([], {}).ok, false);
  const unsupported = core.validateScreenshots([img("1", "a.png"), { id: "2", name: "notes.txt", mimeType: "text/plain", size: 10 }], {});
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.reason, /notes\.txt/);
  assert.equal(core.validateScreenshots([img("1", "a.png"), { id: "2", name: "x.png", mimeType: "image/png" }], {}).ok, false);
  assert.equal(core.validateScreenshots([{ id: "9", name: "a", mimeType: "application/vnd.google-apps.shortcut", size: 1 }], {}).ok, false);
});

test("validateScreenshots can be told to ignore extra non-image files, and enforces size caps", () => {
  const r = core.validateScreenshots([img("1", "a.png"), { id: "2", name: "notes.txt", mimeType: "text/plain", size: 10 }], { ignoreNonImageFiles: true });
  assert.equal(r.ok, true);
  assert.equal(core.validateScreenshots([img("1", "big.png", 9 * 1024 * 1024)], { maxFileBytes: 4 * 1024 * 1024 }).ok, false);
});

// ── email guardrails ──
const identity = { workspaceName: "Biggbee AI", senderDisplayName: "Biggbee AI", signatureName: "Biggbee AI", signatureWebsite: "https://www.biggbees.com" };
const verifiedFacts = { businessName: "Al Shami", businessType: "Restaurant", attachmentCount: 3, preservedVerified: "menu, prices, opening hours and contact details", bookingVerified: true };
const unverifiedFacts = { ...verifiedFacts, preservedVerified: "", bookingVerified: false };

test("the reference-style email passes when every claim is verified", () => {
  const draft = {
    subject: "A fresh look for Al Shami",
    body: "Hi there,\n\nI came across the Al Shami website recently. The restaurant has such a great story, but the site didn't really do it justice, so I took a shot at redesigning it. I've attached a few screenshots.\n\nI kept your menu, prices, opening hours and contact details, and added a simple online booking form. I just wanted to show what it could look like.\n\nIf you like it, I'd be happy to set it up properly for you, and I'm glad to adjust anything. If not, no worries at all.",
  };
  assert.equal(core.validateDraft(draft, verifiedFacts).ok, true);
});

test("unverified preserved-details / booking-form / attachment claims are rejected", () => {
  const draft = {
    subject: "A fresh look for Al Shami",
    body: "Hi there,\n\nI've attached a few screenshots. I kept your menu, prices, opening hours and contact details, and added a simple online booking form.",
  };
  const v = core.validateDraft(draft, unverifiedFacts).violations.join(" ");
  assert.match(v, /preserved/);
  assert.match(v, /booking/);
  assert.match(core.validateDraft(draft, { ...verifiedFacts, attachmentCount: 0 }).violations.join(" "), /attached/);
});

test("performance/ranking/urgency claims and links in the body are rejected", () => {
  const bad = ["This will increase your bookings.", "Guaranteed to rank higher on Google.", "Only a 30% fee, act now!", "See https://example.com/preview"];
  for (const line of bad) assert.equal(core.validateDraft({ subject: "Hello", body: "Hi there,\n\n" + line }, verifiedFacts).ok, false, line);
});

test("finalizeEmail falls back to the safe template when the AI draft breaks the rules", () => {
  const lying = { subject: "Hi", body: "Hi there,\n\nI kept all your real prices and added a booking form. This will boost your sales." };
  const r = core.finalizeEmail(lying, unverifiedFacts, identity);
  assert.equal(r.ok, true);
  assert.equal(r.usedFallback, true);
  assert.doesNotMatch(r.email.text, /booking|prices|sales/i);
  assert.match(r.email.text, /redesign concept/);
  assert.match(r.email.text, /attached/);
  assert.equal(core.finalizeEmail(null, unverifiedFacts, identity).usedFallback, true);
});

test("finalizeEmail never mentions screenshots when none are attached, even in the fallback", () => {
  const r = core.finalizeEmail(null, { ...unverifiedFacts, attachmentCount: 0 }, identity);
  // The fallback itself mentions attachments, so with zero attachments it must refuse rather than send a false claim.
  assert.equal(r.ok, false);
});

test("composeEmail appends the established signature exactly once, with no logo or tracking", () => {
  const e = core.composeEmail({ subject: "S", body: "Hi there,\n\nHello.\n\nBest regards,\nSomeone Else" }, identity);
  assert.equal(e.text.match(/Best regards,/g).length, 1);
  assert.match(e.text, /Best regards,\nBiggbee AI\nwww\.biggbees\.com$/);
  assert.match(e.html, /<a href="https:\/\/www\.biggbees\.com">www\.biggbees\.com<\/a>/);
  assert.doesNotMatch(e.html, /<img|cid:|tracking/i);
});

test("composeEmail escapes HTML in AI-written text", () => {
  const e = core.composeEmail({ subject: "S", body: "Hi <script>alert(1)</script>" }, identity);
  assert.doesNotMatch(e.html, /<script>/);
});

// ── send planning ──
const limits = { hourlyLimit: 10, dailyLimit: 50, bounceRateThreshold: 0.05, minSampleForBounce: 20, maxConsecutiveErrors: 3 };
const healthy = { status: "running", sentLastHour: 0, sentLastDay: 0, externalSentLastHour: 0, externalSentLastDay: 0, bounceRate: 0, bounceSample: 0, complaints: 0, consecutiveErrors: 0 };

test("decideNextSend sends when healthy and pauses at every threshold", () => {
  assert.equal(core.decideNextSend(healthy, limits).action, "send");
  assert.equal(core.decideNextSend({ ...healthy, sentLastHour: 10 }, limits).action, "pause");
  assert.equal(core.decideNextSend({ ...healthy, sentLastHour: 4, externalSentLastHour: 6 }, limits).action, "pause"); // general campaign sends count too
  assert.equal(core.decideNextSend({ ...healthy, sentLastDay: 50 }, limits).action, "pause");
  assert.equal(core.decideNextSend({ ...healthy, complaints: 1 }, limits).action, "pause");
  assert.equal(core.decideNextSend({ ...healthy, bounceRate: 0.1, bounceSample: 30 }, limits).action, "pause");
  assert.equal(core.decideNextSend({ ...healthy, bounceRate: 0.1, bounceSample: 5 }, limits).action, "send"); // too few samples to judge
  assert.equal(core.decideNextSend({ ...healthy, consecutiveErrors: 3 }, limits).action, "pause");
});

test("decideNextSend stops when paused/cancelled and refuses to run without configured limits", () => {
  assert.equal(core.decideNextSend({ ...healthy, status: "paused" }, limits).action, "stop");
  assert.equal(core.decideNextSend({ ...healthy, status: "pausing" }, limits).action, "stop");
  assert.equal(core.decideNextSend({ ...healthy, status: "cancelled" }, limits).action, "stop");
  assert.equal(core.decideNextSend(healthy, { ...limits, hourlyLimit: 0 }).action, "pause");
  assert.equal(core.decideNextSend(null, limits).action, "stop");
});

test("classifySmtpError: permanent failures aren't retried; rate limits and unknowns pause the run", () => {
  assert.equal(core.classifySmtpError("550 5.1.1 User unknown").kind, "permanent");
  assert.equal(core.classifySmtpError("550 5.1.1 User unknown").pauseRun, false);
  assert.equal(core.classifySmtpError("421 4.7.0 Try again later").kind, "rate_limit");
  assert.equal(core.classifySmtpError("Daily user sending limit exceeded").kind, "rate_limit");
  assert.equal(core.classifySmtpError("535 Authentication failed").kind, "auth");
  const unknown = core.classifySmtpError("socket hang up");
  assert.equal(unknown.kind, "transient");
  assert.equal(unknown.pauseRun, true);
});

// ── idempotency ──
test("buildDoneKeys treats sent/sending/queued and permanent failures as done, live mode only", () => {
  const rows = [
    { workspaceId: "w", campaignId: "c", businessKey: "a", mode: "live", status: "sent" },
    { workspaceId: "w", campaignId: "c", businessKey: "b", mode: "live", status: "sending" },
    { workspaceId: "w", campaignId: "c", businessKey: "c", mode: "live", status: "failed", failureKind: "permanent" },
    { workspaceId: "w", campaignId: "c", businessKey: "d", mode: "live", status: "failed", failureKind: "transient" },
    { workspaceId: "w", campaignId: "c", businessKey: "e", mode: "dry", status: "previewed" },
    { workspaceId: "other", campaignId: "c", businessKey: "f", mode: "live", status: "sent" },
    { workspaceId: "w", campaignId: "other", businessKey: "g", mode: "live", status: "sent" },
  ];
  const done = core.buildDoneKeys(rows, "w", "c");
  assert.deepEqual([...done].sort(), ["a", "b", "c"]);
});

test("findApprovedPreview only returns this workspace/campaign/business's dry-run preview (latest wins)", () => {
  const rows = [
    { workspaceId: "w", campaignId: "c", businessKey: "a", mode: "dry", status: "previewed", subject: "old", updatedAt: "2026-01-01" },
    { workspaceId: "w", campaignId: "c", businessKey: "a", mode: "dry", status: "previewed", subject: "new", updatedAt: "2026-02-01" },
    { workspaceId: "x", campaignId: "c", businessKey: "a", mode: "dry", status: "previewed", subject: "other-workspace", updatedAt: "2026-03-01" },
  ];
  assert.equal(core.findApprovedPreview(rows, "w", "c", "a").subject, "new");
  assert.equal(core.findApprovedPreview(rows, "w", "c", "zzz"), null);
});

test("campaignKey and attachmentFingerprint are stable", () => {
  assert.equal(core.campaignKey("w", "c", "b", "live"), "w|c|b|live");
  assert.equal(core.attachmentFingerprint([{ id: "b" }, { id: "a" }]), core.attachmentFingerprint([{ id: "a" }, { id: "b" }]));
});

test("an approved preview re-renders to exactly the HTML that was composed (live sends what was previewed)", () => {
  const composed = core.composeEmail({ subject: "S", body: "Hi there,\n\nLine one.\nLine two.\n\nBye." }, identity);
  const sig = core.signatureParts(identity);
  assert.equal(core.textToHtml(composed.text, sig.site, sig.url), composed.html);
});

test("signatureParts normalises the website for display and link", () => {
  assert.deepEqual(core.signatureParts({ signatureName: "Biggbee AI", signatureWebsite: "https://www.biggbees.com/" }), { name: "Biggbee AI", site: "www.biggbees.com", url: "https://www.biggbees.com" });
});

// ── fallback wording: business names that start with an article ──
const fallbackText = (businessName, over = {}) => core.finalizeEmail(null, { ...unverifiedFacts, businessName, businessType: "", ...over }, identity).email.text;

test("REGRESSION: a name starting with \"The\" does not produce \"the The ...\" in the fallback email", () => {
  const text = fallbackText("The Property Manager UK");
  assert.doesNotMatch(text, /the The\b/i);
  assert.match(text, /I came across the Property Manager UK website recently and prepared a redesign concept for it\./);
  // the subject keeps the name exactly as the sheet has it
  assert.equal(core.finalizeEmail(null, { ...unverifiedFacts, businessName: "The Property Manager UK", businessType: "" }, identity).email.subject, "A redesign concept for The Property Manager UK");
});

test("a name that does NOT start with \"The\" is worded exactly as before", () => {
  const text = fallbackText("Lloyds Property Services");
  assert.match(text, /I came across the Lloyds Property Services website recently and prepared a redesign concept for it\./);
  assert.match(fallbackText("Al Shami"), /I came across the Al Shami website recently/);
});

test("websiteReference: only a whole leading article is treated specially; everything else is left exactly alone", () => {
  const w = core.websiteReference;
  assert.equal(w("The Property Manager UK"), "the Property Manager UK website");
  assert.equal(w("  the   Hair Lounge "), "the Hair Lounge website", "case-insensitive, trimmed, extra spaces after the article collapse");
  assert.equal(w("THE Dental Studio"), "the Dental Studio website");
  assert.equal(w("Al Shami"), "the Al Shami website");
  assert.equal(w("Theatre Royal"), "the Theatre Royal website", "'The' inside a longer word is not an article");
  assert.equal(w("Thebes Cafe"), "the Thebes Cafe website");
  assert.equal(w("Elite Accountancy"), "the Elite Accountancy website");
  assert.equal(w("Smith & The Sons"), "the Smith & The Sons website", "an inner 'The' is untouched");
  assert.equal(w("The"), "the The website", "a name that is only the article is not mangled into an empty name");
  assert.equal(w("A Taste of Italy"), "the website for A Taste of Italy");
  assert.equal(w("An Lanna Thai"), "the website for An Lanna Thai");
  assert.equal(w("A1 Plumbing"), "the A1 Plumbing website");
  assert.equal(w("Anchor Inn"), "the Anchor Inn website");
  assert.equal(w(""), "the  website");
  assert.equal(w(null), "the  website");
});

test("the fallback email for a \"The ...\" business with a business type, and its claim checks, stay valid", () => {
  const facts = { ...unverifiedFacts, businessName: "The Dental Studio", businessType: "Dental Practice" };
  const draft = core.buildFallbackEmail(facts);
  assert.match(draft.body, /I came across the Dental Studio website recently and prepared a redesign concept for your dental practice\./);
  assert.equal(core.validateDraft(draft, facts).ok, true);
});
