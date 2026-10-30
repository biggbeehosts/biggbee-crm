# "Biggbee CRM Sheet Sync": 401 at "Fetch CRM Rows"

Diagnosed 2026-10-30, read-only. Nothing in the live workflow, its credentials, or its schedule was changed.

## Root cause (conclusive)

**The `Fetch CRM Rows` node sends no authentication.** It has no `authentication` setting, no credential and no headers (`"options": {}`).

Evidence:

| Check | Result |
|---|---|
| Scraper Hub API (`apps/api/src/server.ts`) | `/api/export/crm-sync` and `/api/export/full-sync` are the only two routes open to n8n, both guarded by `Authorization: Bearer <N8N_EXPORT_API_KEY>`, "scoped to exactly these two GET routes". Everything else needs an admin session cookie. |
| Unauthenticated request | HTTP 401 on `crm-sync`, `full-sync` and even `/api/health` |
| Sibling workflows | 20 sync workflows call `/api/export/full-sync` with `predefinedCredentialType` → `httpHeaderAuth` → credential **"Scraper Hub"** (`6Vem4EZTPkevbA78`). This is the only scraper-host node without it. |
| API log (48 h) | 192 `crm-sync` requests (4/h), **192 × 401**; every one with `updatedSince=1970-01-01…`, i.e. the checkpoint has never advanced |
| History | n8n retains no successful run of this workflow; both Aug-27 backups on the VPS (`/root/crm-sync-backup-…json`, `crm-sync-patched.json`) already have the unauthenticated node. It has not been shown to work with this configuration. |
| Same request, with vs without the credential (throw-away manual run, future `updatedSince`, counts only) | without: **401**; with "Scraper Hub": **200**, 0 rows, 9 columns |
| The patched node object itself, run verbatim from the patched file | **200**; the original node from the same export: **401** |

Ruled out: expired/invalid credential (it returns 200), wrong endpoint (the route exists and answers), malformed request (an empty `jobId=` is ignored by the API: `if (query.jobId)`), permission/scope (the key is scoped to exactly this route).

## The fix (prepared locally, NOT applied)

Add the existing credential to the one node, copying the siblings' settings:

* Authentication: **Predefined Credential Type**; Credential type: **Header Auth**; credential: **Scraper Hub**.

Artifacts: `scripts/patch-crm-sheet-sync-auth.mjs` (transform; refuses anything unexpected; idempotent), `n8n/fixes/crm-sheet-sync/original.workflow.json` (reference export, no static data), `.../patched.workflow.json`, and `.../patch.test.mjs` (9 tests: exactly one node changes and only its auth fields; schedule, webhook, Sheets nodes and credentials are identical; only the existing Scraper Hub credential is referenced; no secret is written).

Apply it in the n8n editor (edit the one node and Save). **Do not import the patched JSON over the live workflow**, as that would replace the live definition and its static data.

> **Update 2026-10-30:** the source-side fix (only `crm_only`/`both` jobs exportable, one row per email, explicit workspace) is implemented and tested locally but not released. The credential fix above must be applied **after** that release, together with the hardening in `docs/scraper-crm-eligibility.md`. Order and steps are in its "Release steps".

## ⚠ DO NOT APPLY YET: what fixing it would do

Superseded by the full investigation in `docs/scraper-190-records.md`. Short version: the 190 records the endpoint returns are **old, already-staged Das Örtliche (German directory) test-style scrapes that were deliberately routed `sheet_only`**, they contain only 81 distinct email addresses, and the 15-minute schedule ignores the `sheet_only` routing. Applying the credential would append all 190 rows (repeats included) to the CRM Leads tab, hard-labelled as the Biggbee workspace, and would keep importing any future email-bearing scrape every 15 minutes whatever its destination.

(An earlier version of this note said the CRM held 4 leads. It currently holds none: the Leads, Lead_Memory, Unknown_Senders and Campaigns tabs are header-only.)

## Approvals needed (nothing has been applied)

1. Decide whether any of these records should reach the CRM at all (see `docs/scraper-190-records.md`).
2. Only then: attach the "Scraper Hub" credential to `Fetch CRM Rows`, ideally together with the safeguards listed there (destination-aware import and within-batch de-duplication).

## Verify after applying

Run the node once with *Execute step* (expect HTTP 200 and a `rows` array), then watch the next scheduled execution succeed and the API log show 200s: `docker logs scraper-hub-api-1 | grep crm-sync`.

## Rollback

Open the node and set Authentication back to **None** (the node returns to 401s), or deactivate the workflow. Rows already appended stay in the sheet and must be removed manually.

## Separate issue worth knowing

Because this workflow has no error handling, its 96 failures/day have been silent. Attach the error notifier to it only after deciding whether you want alerts from it (see `docs/error-notifier.md`).
