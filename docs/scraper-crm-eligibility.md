# Scraper Hub → CRM: eligibility fix (implemented locally, NOT released)

Date: 2026-10-30. Everything here was built and tested locally. Nothing was committed, pushed, deployed, restarted or applied to n8n, Google Sheets or the VPS. The only production contact was read-only: one SELECT-only session (write guard on, aggregate counts out) to verify the rules against the real data.

## Where Scraper Hub lives and how it is deployed

| | |
|---|---|
| Not in the Biggbee CRM repo | It is a separate project: `C:\Users\Dell Gaming Laptop\Downloads\Projects\Biggbee Scrapper Hub` (npm workspaces: `apps/api`, `apps/worker`, `apps/web`, `packages/*`, `infra/postgres`). |
| Production | VPS `/docker/scraper-hub`, compose project `scraper-hub` (`docker-compose.prod.yml`, `.env.production`). Services `api`, `worker`, `web` are **built on the VPS from the source in that folder** (`apps/*/Dockerfile`, build context `.`, `COPY . .`, `tsc` over all of `src/` including tests). Plus postgres, redis, minio, traefik. |
| Version control | None on the VPS. Locally a baseline git repo was created at 16:54 today by someone else (see "Another person's work in this tree"). |
| Parity before my change | `export.ts`, `server.ts`, `sheet-sync.ts`, `worker.ts`, `init.sql` were byte-identical to the VPS (SHA-1, whole `apps/ packages/ infra/` tree compared). |

## Verified export eligibility rules (`/api/export/crm-sync`)

A record is returned only if **all** hold. Each rule has a test (see "Tests"), and the first one was mutation-checked (removing/relaxing it makes tests fail).

1. **Routing.** It has at least one non-error claim (`entity_claims.field_key <> '__error'`) made by a job whose `destination` is **exactly** `crm_only` or `both`, and whose `crm_sync_status` is not `not_applicable` (the job actually entered the CRM pipeline; `pending`, `synced`, `failed` count, so failed syncs are retried).
   - `sheet_only` never qualifies, whatever the other columns say.
   - Unknown / legacy / differently-cased / padded / empty destinations never qualify (exact match; tested with 12 junk values on a database with the CHECK constraint lifted inside a rolled-back transaction).
   - A claim with no job (`job_id` null, or its job deleted, which sets it null) never qualifies.
   - A `jobId` request (what the worker's on-demand sync sends) requires **that job itself** to be routed. Another routed job sharing an entity does not make a `sheet_only` job exportable.
   - An entity found by a `sheet_only` job and later by a routed job is exportable through the routed one (routing is per job, not per entity).
2. **Standard qualification, unchanged:** not merged, status not `merged/failed/quarantined`, type `business/property_listing/social_profile`, plus the caller's `requireEmail` (route default true) / `requirePhone` / `requireWebsite` / `country`.
3. **Workspace stated by the caller** (`workspaceId`, 400 if missing/unknown). Allowed today: `biggbee` only.
4. Eligibility is decided **inside the candidate query**. (The old code took the 5,000 newest entities of *any* job first and qualified them afterwards, so a routing filter added afterwards would have starved older routed records; there is a test with 5,200 newer non-routed records.)

`org_id` plays no part in eligibility, in either direction. It is NULL on every entity and job in production (0 non-null of each, verified). An empty `org_id` is never read as "Biggbee".

### The 190 historical records, and the current eligible count (verified)

| Check | Result |
|---|---|
| Production, read-only, exact SQL the new code runs, `updatedSince=1970` (what the 15-minute schedule sends) | **eligible = 0** (all sources); **0** for `das-oertliche-de` |
| Same data, the OLD rule | 190 (all Das Örtliche) |
| Jobs in production | 225, all `sheet_only` / `not_applicable`; **0** routed `crm_only`/`both`; 0 claims without a job |
| Local replica (11 `sheet_only` jobs, 190 emailing entities on 81 addresses) | old resolver returns 190; new code returns **0** by schedule query, by `jobId`, by `entityIds`, by `sourceId` |

The count becomes non-zero only when someone deliberately creates a job with destination "CRM Only" or "Source Sheet + CRM".

## Duplicate emails in one batch (decision, documented)

One row per normalised email (trim + lower-case; plus-addressing is **not** collapsed) per batch. Among records sharing an address, the **oldest** (`created_at`, then `id`) is kept exactly as it is. The others are dropped from that batch and listed in the response (`skipped: [{entityId, keptEntityId, reason: "duplicate_email"}]`, exact count in `meta.duplicateEmailSkipped`) and logged as a warning by the API.

* Different businesses are **never merged**: nothing is copied into the kept record, so a bakery and a pizzeria on one shared address do not become one lead; one is kept whole, the other is reported.
* Deterministic: independent of insertion/update/arrival order.
* The CRM identifies a lead by workspace + email, so a second row for an address is not representable anyway.
* The n8n node adds defence in depth (below): in-batch matching on domain/phone/company+country, and refusal to merge a different business into an existing lead that has the same email.
* Limitation: dedupe is per batch. If a duplicate arrives in a later batch, the n8n node (not the API) catches it against the sheet.

## Pagination / batches

Stable order `(updated_at, id)` ascending. `limit` (1..5000) and `cursor` (opaque `meta.page.nextCursor`, microsecond-exact keyset) page without gaps or repeats, including when thousands of rows share one `updated_at`. **Without `limit`, a result larger than 5,000 is refused (HTTP 422), never cut**; today's n8n workflow does not page and does not advance its checkpoint on error, so it fails loudly instead of losing records. If a selected record cannot be loaded (it vanished mid-request) the whole page fails with 503 rather than returning a short page.

## Response (additive)

`{ columns, workspaceId, rows: [{ entityId, updatedAt, workspaceId, row }], skipped, meta }`. `row` still holds exactly the 9 approved CRM columns; ids and workspace ride beside it.

## Workspace

Scraper Hub has no workspace model, so ownership is stated by the caller and validated: the workflow sends `workspaceId=biggbee` as a visible literal, the API checks it against an allow-list (`biggbee`), echoes it, and the n8n node aborts the run (nothing written) if the answer or any row names a different or missing workspace. New CRM rows take "Workspace ID" from the API's answer. Existing sheet rows are matched only within the same workspace; rows with a blank or other Workspace ID are never matched or updated. **Limitation:** until jobs carry an explicit workspace column, this endpoint can serve exactly one workspace. Onboarding a second one needs a job-level workspace (a schema change) and is deliberately not done here.

## Files changed

Scraper Hub (`C:\Users\Dell Gaming Laptop\Downloads\Projects\Biggbee Scrapper Hub`):

| File | Change |
|---|---|
| `apps/api/src/crm-sync.ts` | **new**: eligibility query, dedupe, workspace, paging, `runCrmSync` |
| `apps/api/src/server.ts` | `/api/export/crm-sync` handler now calls `runCrmSync` (+ import, doc comment, 400/422/503 mapping). 26 lines differ from production; `buildCrmSyncRows` import dropped (unused). |
| `apps/worker/src/crm-routing.ts` | **new**: `routesToCrm()` exact allow-list |
| `apps/worker/src/worker.ts` | 2 lines: CRM sync attempted only if `routesToCrm(destination)` (was `destination !== "sheet_only"`, which sent any unknown value to the CRM) |
| `apps/api/src/crm-sync.test.ts`, `apps/api/src/crm-sync.integration.test.ts`, `apps/worker/src/crm-routing.test.ts` | **new** tests |

Unchanged on purpose: `export.ts` (the Full Data sync and `/api/export/crm`, `/crm.csv` keep ignoring routing), `init.sql` (no migration), the web app, all adapters.

Biggbee CRM repo (`biggbee-crm`): `n8n/fixes/crm-sheet-sync/match-and-decide.hardened.js`, `scripts/patch-crm-sheet-sync-hardening.mjs`, `n8n/fixes/crm-sheet-sync/hardening.test.mjs`, `n8n/fixes/crm-sheet-sync/hardened.workflow.json` (generated), `n8n/fixes/crm-sheet-sync/fixtures/crm-sync-response.sample.json` (synthetic, generated by the real API code), and these docs. The earlier auth artifacts (`patch-crm-sheet-sync-auth.mjs`, `patched.workflow.json`) are unchanged.

The hardened workflow changes four nodes of "Biggbee CRM Sheet Sync" (Fetch CRM Rows: + `workspaceId=biggbee`; Match & Decide; Append CRM Row: Workspace ID from the API's answer; Summarize & Checkpoint: reports skip counts) on top of the auth fix (credential "Scraper Hub", `6Vem4EZTPkevbA78`, existing, unchanged). Schedule, webhook, Sheets targets/credentials and all connections are identical (tested).

## Tests

| Suite | Result |
|---|---|
| Scraper Hub `npm run typecheck` (all 6 workspaces) | clean |
| Scraper Hub `npm test` (no DB, as the repo runs it) | 132 + 636 pass, 0 fail, 57 skipped (all real-DB tests skip cleanly) |
| New unit tests (`crm-sync.test.ts`, `crm-routing.test.ts`) | 17/17 |
| All 6 real-DB suites, serial, on **real PostgreSQL 18.4** (local, throwaway `test_db`, `init.sql` + 12 migrations) | 58/58 (24 new + 34 existing); the new file passed 9 consecutive runs |
| Mutation check: 12 deliberate breakages of `crm-sync.ts` (sheet_only allowed, status rule removed, jobId pin removed, error claims counted, dedupe off, newest-wins dedupe, no email normalisation, silent truncation, cursor without id tiebreak, workspace defaulting to biggbee, descending order, inner→left join) | 11 caught by at least one test; the 12th (`left join`) is an equivalent mutant (a null job fails the destination test either way) |
| Biggbee CRM repo | n8n patch tests 27/27 (9 auth + 18 hardening incl. a contract test feeding real API output through the node); the rest pass (3 `campaign-match` files need `tsx`; 46/46 under it) |

Harness note: an in-memory Postgres (PGlite) I tried first intermittently returned an empty page from the existing three-way parallel load (my trace showed the selection was right and the load came back empty). It never happened on real PostgreSQL, but it motivated the 503 guard above. All numbers above are from the real PostgreSQL run. I did **not** use the other person's `scratch-pg` container on the VPS.

## Another person's work in this tree (not touched)

While I worked, someone else created the baseline git repo (16:54), added `test-db-guard.ts` (+ tests, `scripts/run-db-tests.sh`, `scripts/reset-test-db.sh`, a `test:db` script in `package.json`), wired the guard into four existing integration tests, and edited `packages/adapters/facebook-events/extract.ts`. I did not modify any of those files. My new DB test imports `test-db-guard.ts` (refuses any database not named `test_*`/`*_test`); if that file is removed, the import in `crm-sync.integration.test.ts` must go with it. `scripts/run-db-tests.sh` will pick up my integration file automatically.

**Release consequence:** local ≠ production in files that are not mine (`apps/worker/src/concurrency.ts` + test, `facebook-events/extract.ts` + test, `quota.test.ts`, `testing/harness.ts`). **Do not copy the whole local tree to the VPS.** Overlay only the files listed under "Release steps".

## Release steps (nothing below has been done)

Prerequisites: decide the open questions at the end; nobody else has an unreleased edit in the files below.

1. **Back up on the VPS** (their convention): `cp apps/api/src/server.ts apps/api/src/server.ts.bak-pre-crm-eligibility-20261030` (and `worker.ts` if the worker is released).
2. **Copy exactly** `apps/api/src/crm-sync.ts` (new) and `apps/api/src/server.ts` to `/docker/scraper-hub/apps/api/src/`. Optionally `apps/worker/src/crm-routing.ts` (new) and `worker.ts`. No test files are needed on the VPS (the build compiles everything under `src/`; the integration test would also need `test-db-guard.ts`).
3. **Build and restart only what changed**, when no scrape job is running (a worker restart interrupts running jobs; the API restart briefly interrupts n8n's `full-sync` webhooks): `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api` (add `worker` only if released). A failed build aborts before the running container is replaced.
4. **Verify read-only from inside the API container** (key stays in the container, never printed): GET `/api/export/crm-sync?workspaceId=biggbee&updatedSince=1970-01-01T00:00:00.000Z` with the container's own `N8N_EXPORT_API_KEY`; expect HTTP 200, `rows: []`, `meta.returned: 0`. Also expect 400 `workspace_required` without the parameter. `full-sync` must still answer 200.
5. **Only then touch n8n** (editor, on the live workflow `ZdiauTxu6K8yF42l`; **do not import the JSON over it**, that would replace its definition and static data): (a) auth on "Fetch CRM Rows" (`docs/crm-sheet-sync-401.md`); (b) the four hardening changes; paste "Match & Decide" from `match-and-decide.hardened.js`, add query parameter `workspaceId` = `biggbee`, set Append "Workspace ID" to `{{ $json.WorkspaceId }}`, update the Summarize return. `hardened.workflow.json` shows the target state. Expect: the next 15-minute run is HTTP 200 with 0 rows and writes nothing.
6. **First real import = a deliberate small test**, which needs your approval: create one tiny job (limit 3) with destination "CRM Only", let the worker's on-demand sync run it, check the three rows in CRM Leads (Workspace ID `biggbee`, Status `New`).
7. **Rollback:** API: restore the `.bak` file(s) and rebuild. That brings back the old behaviour (every email-bearing entity exportable), so if the n8n auth fix is already applied, deactivate "Biggbee CRM Sheet Sync" first or the 190 records would import. n8n: set the changed nodes back, or deactivate the workflow. No data migration was made, so there is nothing to undo in Postgres.

## Open decisions for you

* Whether any German directory records should ever reach the CRM. This change makes the answer "no, unless a job is explicitly routed"; the 190 stay in Full Lead Data untouched.
* Whether to release the worker change now or with the next worker deploy (it is hardening only; the API already refuses unrouted jobs).
* Workspace model: one allow-listed workspace today; a second workspace needs a job-level workspace column first.
* `requireEmail=false` is still honoured (legacy escape hatch, unused by n8n); such rows have no email and cannot be deduplicated.
* The routing rule requires `crm_sync_status <> 'not_applicable'`. A routed job whose on-demand webhook never ran stays `not_applicable` and is not rescued by the 15-minute schedule until it is re-triggered. Say if you want the schedule to rescue those too.

The Website Redesign Prospects sheet, its prospecting worker and all redesign assets were not touched.
