# The "190 records" in Scraper Hub: read-only investigation

Date: 2026-10-30. Read-only throughout (database session forced to `default_transaction_read_only=on`, which the database enforced: it refused a `CREATE TEMP VIEW`; GET-only API calls; no credential, workflow, sheet or CRM change; no sync, scrape, campaign or email). Aggregates and a masked sample only.

## The three systems, and the real data path

| System | What it is |
|---|---|
| **Scraper Hub** (`scraper.biggbees.com`, Postgres `entities`, `scrape_jobs`, `campaigns`) | Source of scraped records. No workspace concept: `org_id` is NULL on every entity. |
| **"Biggbee Full Lead Data"** spreadsheet | Staging/archive. 20 tabs: one per source plus "Unified Businesses". Filled by the per-source Sync workflows (webhook-triggered). |
| **"Bigggbee Email Marketing"** spreadsheet, tab **Leads** | The cold-email CRM. This *is* "CRM Leads": the CRM app and the outbound workflow read this file. There is **no separate intermediate "emailing sheet"**. |
| Website Redesign Prospects spreadsheet (+ Drive folder) | Separate. Fed by the active "Website Prospecting + Redesign Agent (Worker)" workflow from the Full Lead Data tab **"Google Maps"** (which has no email column). |
| "Biggbee AI CRM" spreadsheet | A fourth, unrelated system: the voice-calling pipeline (00–06 workflows). |

```
scrape job (Scraper Hub, destination = sheet_only | crm_only | both)
   ├─ sheet_only (default) ─► per-source Sync workflow ─► Full Lead Data / <source tab> + Unified Businesses     [stops here]
   ├─ crm_only / both ───────► + webhook crm-sync-ondemand {jobId}  ─► CRM Sheet Sync ─► Bigggbee Email Marketing / Leads
   └─ (independently, every 15 min) CRM Sheet Sync schedule ─► GET /api/export/crm-sync?updatedSince=<checkpoint> ─► Leads
```

Per the schema's own comment: `'sheet_only'` = *only the source's own Sheet tab*; `'crm_only'` = straight to the CRM sheet; `'both'` = both. The CRM Sheet Sync workflow writes **directly into CRM Leads**; it does not populate anything in between.

## What the 190 are

* **Endpoint:** `GET https://scraper.biggbees.com/api/export/crm-sync?updatedSince=1970-01-01…&jobId=` (what the 15-minute schedule sends). It returns every entity that is not merged/failed/quarantined, of type business / property_listing / social_profile, **with a canonical email**. There is no filter on job, source, destination, date, country, approval or workspace.
* **Funnel (reproduced in SQL, exactly 190):** 3,023 entities → 3,012 (valid status) → 3,005 (right type) → **190 (has an email)**. 2,815 qualifying businesses have no email.
* **Nature:** real scraped directory records (no test markers in names or domains), but **historical, exploratory scrapes**: 11 jobs (of that source's 12) on **2026-09-10 and 2026-09-11** (105 and 85 records), none updated since. All from a single source, **`das-oertliche-de`** (Das Örtliche, a German directory), via two Scraper Hub campaigns: **Dresden bakeries** (105) and **Berlin restaurants** (85). It is the only source that has ever produced emails (190 of its 1,162 entities).
* **Their routing:** every one of those jobs has `destination = sheet_only`, `sheet_sync_status = synced`, **`crm_sync_status = not_applicable`**. In the whole database, 100% of the 225 jobs are `sheet_only`; **none was ever routed to the CRM**.
* **Already exported:** yes, to Full Lead Data. All **81 of 81** distinct emails are present in the "Das Örtliche" tab (2,304 rows; 363 with an email) and in "Unified Businesses". Overlap with the CRM Leads tab (currently empty), the Website Redesign Prospects sheet (11 data rows, 10 emails) and the "Biggbee AI CRM" calling sheet: **0**.
* **Intended for Biggbee marketing?** **Not established.** Nothing records approval; the routing says the opposite (`sheet_only`); the searches look like adapter test runs (one city/category each, seven weeks old). Biggbee's own targeting cannot be compared because the CRM Campaigns tab is empty. Treat them as unapproved.
* **Workspace:** Scraper Hub has none (`org_id` NULL for all 190; one org in the database). The CRM Sheet Sync **hard-codes `Workspace ID = 'biggbee'`** on every appended row, so provenance would be overwritten by assertion, not verified.

## Quality of the 190

| Check | Result |
|---|---|
| Rows / **distinct emails** | 190 / **81** (55 emails used once; 26 shared by 2–33 records; one email on 33 records, one on 25) |
| Shared-email groups with *different* business names | 19 of 26 (directory/chain/aggregator addresses) |
| Basic email format valid | 190 / 190 |
| Domains able to receive mail (public MX lookup, no recipient contacted) | 71 of 73 have MX, 2 have only an A record, 0 unresolvable |
| Role-style addresses (info@, kontakt@, office@ …) | 123 of 190 rows |
| Free-mail domains | 13 rows |
| Email domain matches the business's own website | 84 rows |
| Test/example/invalid domains or test-like names | 0 |
| Contact name present | **0 of 190** (blank for all) |
| Industry | blank for all 190 |
| Business type (what the sync would write) | Bäckereien 101, Restaurants sonstige 79, others 10 |
| Country (what the sync would write) | Germany ×190 |
| Website blank | 4 |
| Phone | present on all 190 |

"Valid format" is **not** "approved and usable": 109 of the 190 rows repeat an address that another row already uses.

Anonymised sample (first letter only):

| Name | Type | Status | Created | Email | Records on this email | Website / phone |
|---|---|---|---|---|---|---|
| S***** | Bäckereien | validated | 2026-09-10 | i***@\<business domain\> | 1 | yes / yes |
| C***** | Restaurants, sonstige | validated | 2026-09-11 | s***@\<business domain\> | **25** | yes / yes |
| D***** | Pizzaservice | incomplete | 2026-09-11 | i***@\<business domain\> | **33** | yes / yes |
| F***** | Restaurants, sonstige | incomplete | 2026-09-11 | r***@\<business domain\> | 1 | no / yes |

## What happens if the authentication fix is applied

1. The very next 15-minute tick runs with `updatedSince=1970` and receives the 190 rows.
2. `Match & Decide` compares each row only with the Leads tab **as read at the start of the run**, never with rows appended in the same run. The Leads tab is empty, so **all 190 are appended** as new rows (`Status = New`, `Workspace ID = 'biggbee'`), including the 109 repeats; one address would appear on 33 rows. (The CRM identifies a lead by workspace + email, so duplicate-email rows are not representable and updates would hit only the first one.)
3. The `sheet_only` routing is **bypassed**: `crm-sync` ignores `destination`.
4. It would not stop there: every 15 minutes it would import **any future email-bearing entity from any job or source**, whatever its destination.
5. Nothing would be emailed by the sync itself, but the rows would become CRM leads that a campaign's targeting could claim (note all would carry Country = Germany and German food-business types, blank contact name).

> **Update 2026-10-30:** items 2 and 3 below are now implemented and tested locally (not released): see `docs/scraper-crm-eligibility.md`. Verified read-only against production: under the new rule the eligible count is **0** (the old rule returns these 190); 0 of 225 jobs are routed `crm_only`/`both`.

## Recommendation (not applied)

Do not apply the authentication fix yet. Before any CRM import:

1. **Decide** whether German bakery/restaurant records are a Biggbee target at all. If not, nothing needs importing.
2. Make the import **destination-aware**: the Scraper Hub's `crm-sync` should only return entities from jobs with `destination IN ('crm_only','both')` (or the schedule should be removed in favour of the job-scoped `crm-sync-ondemand` the worker already triggers). With that filter, today's import set is **0** (no job has ever been routed to the CRM).
3. Make `Match & Decide` **de-duplicate within the batch** (by email) so one address cannot become many rows.
4. Then apply the credential fix (`docs/crm-sheet-sync-401.md`), and test with one explicitly routed job.

Untouched and unaffected: the Website Redesign Prospects sheet, its Drive folder and its workflow.
