// HARDENED 2026-10-30 -- body of the "Match & Decide" Code node (run once for all items).
// Changes versus the live node (everything else is deliberately identical):
//  1. WORKSPACE is explicit. The workflow asks Scraper Hub for this workspace (Fetch CRM Rows sends
//     workspaceId), Scraper Hub must echo it, and every row must carry it; anything else aborts the run
//     before a single row is written. New rows get that value in "Workspace ID". Nothing is inferred.
//  2. Existing rows are matched only within THIS workspace ("Workspace ID" equal, blank never matches),
//     so another workspace's lead with the same email can never be updated by this sync.
//  3. One lead per person/address per batch: an incoming record that matches a record already
//     appended earlier in the same batch is skipped, never appended twice (the old code compared only
//     with the sheet as it was read before the run). Scraper Hub already de-duplicates by email; this
//     covers the other identifiers (website domain, phone, company+country).
//  4. A different business that happens to share an email with an existing lead is NOT merged into it:
//     email matched but the company names differ -> skipped (the old code fill-blank-merged its
//     website/phone/etc. into the other business's row). Same company -> fill-blank update as before.
// Skips are counted on the emitted items (_skippedInBatch/_skippedConflicts) and reported by
// "Summarize & Checkpoint"; Scraper Hub additionally lists its own email-duplicate skips in the response.
const WORKSPACE = 'biggbee';

function normEmail(v) { return (v || '').toString().trim().toLowerCase() || null; }
function normDomain(v) {
  if (!v) return null;
  const s = v.toString().trim().toLowerCase();
  if (!s) return null;
  // regex instead of `new URL`: the Code-node sandbox has no URL global
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[\/?#]/)[0].replace(/^.*@/, '').replace(/:\d+$/, '').replace(/^www\./, '');
  return host || null;
}
function normPhone(v) { return (v || '').toString().replace(/[^\d+]/g, '') || null; }
function normText(v) { return (v || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }

const apiResponse = $('Fetch CRM Rows').first().json;
if (apiResponse.workspaceId !== WORKSPACE) {
  throw new Error('Scraper Hub answered for workspace "' + apiResponse.workspaceId + '" but this workflow syncs "' + WORKSPACE + '"; nothing was written.');
}
const incoming = apiResponse.rows || [];
for (const rec of incoming) {
  if (rec.workspaceId !== WORKSPACE) {
    throw new Error('A record carried workspace "' + rec.workspaceId + '" instead of "' + WORKSPACE + '"; nothing was written.');
  }
}

const toEntry = (item) => ({
  rowNumber: item.json.row_number,
  email: normEmail(item.json.Email),
  domain: normDomain(item.json.Website),
  phone: normPhone(item.json.Phone),
  company: normText(item.json.Company),
  country: normText(item.json.Country),
  raw: item.json
});

// Only this workspace's rows are candidates for a match; a row with a blank/other Workspace ID is never touched.
const existing = $input.all()
  .filter((item) => normText(item.json['Workspace ID']) === WORKSPACE)
  .map(toEntry);

// Priority order per GOOGLE_SHEETS_MAPPING_SPEC.md / build guide §6: strongest identifier first,
// never weak name-only matching when a stronger identifier is available.
const fieldMap = { name: 'Name', company: 'Company', email: 'Email', website: 'Website', industry: 'Industry', businessType: 'BusinessType', leadGenerationType: 'LeadGenerationType', phone: 'Phone', country: 'Country' };

function findMatch(list, id) {
  let hit = null; let by = null;
  if (id.email) { hit = list.find((e) => e.email && e.email === id.email); if (hit) by = 'email'; }
  if (!hit && id.domain) { hit = list.find((e) => e.domain && e.domain === id.domain); if (hit) by = 'domain'; }
  if (!hit && id.phone) { hit = list.find((e) => e.phone && e.phone === id.phone); if (hit) by = 'phone'; }
  if (!hit && id.company && id.country) { hit = list.find((e) => e.company === id.company && e.country === id.country); if (hit) by = 'company+country'; }
  return { hit, by };
}

const out = [];
const appendedThisBatch = []; // virtual rows: appended in this run, not yet in `existing`
let skippedInBatch = 0;
let skippedConflicts = 0;

for (const rec of incoming) {
  const r = rec.row;
  const id = {
    email: normEmail(r.email), domain: normDomain(r.website), phone: normPhone(r.phone),
    company: normText(r.company), country: normText(r.country)
  };

  const real = findMatch(existing, id);
  if (real.hit) {
    // Same email, different business: keep the existing lead exactly as it is.
    if (real.by === 'email' && real.hit.company && id.company && real.hit.company !== id.company) { skippedConflicts++; continue; }
    // fill-blank-only merge -- never overwrite a populated existing value (spec §7/§12).
    // Status, Follow-upCount and Workspace ID are deliberately absent from fieldMap/this object entirely --
    // structurally impossible to touch on an update, matching §12's "n8n must never overwrite
    // user-controlled CRM fields after the row has been created."
    const merged = { row_number: real.hit.rowNumber };
    for (const [key, header] of Object.entries(fieldMap)) {
      const existingVal = real.hit.raw[header];
      merged[header] = (existingVal !== undefined && existingVal !== null && existingVal.toString().trim() !== '') ? existingVal : r[key];
    }
    out.push({ json: { _action: 'update', entityId: rec.entityId, ...merged } });
    continue;
  }

  if (findMatch(appendedThisBatch, id).hit) { skippedInBatch++; continue; }

  appendedThisBatch.push({ email: id.email, domain: id.domain, phone: id.phone, company: id.company, country: id.country });
  out.push({ json: {
    _action: 'append', entityId: rec.entityId, WorkspaceId: apiResponse.workspaceId,
    Name: r.name, Company: r.company, Email: r.email, Website: r.website,
    Industry: r.industry, BusinessType: r.businessType, LeadGenerationType: r.leadGenerationType,
    Phone: r.phone, Country: r.country, Status: 'New', 'Follow-upCount': 0
  } });
}

for (const item of out) { item.json._skippedInBatch = skippedInBatch; item.json._skippedConflicts = skippedConflicts; }
return out;
