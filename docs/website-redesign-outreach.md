# Website Redesign Outreach

An optional side feature of the Biggbee CRM: email each business a prepared website-redesign concept with its screenshots attached. It lives in the existing CRM shell (sidebar → **Outreach System → Website Redesign**) and is **completely separate** from ordinary cold-email campaigns.

| | Regular campaigns | Website Redesign Outreach |
|---|---|---|
| n8n webhook | `N8N_WEBHOOK_RUN_CAMPAIGN` | `N8N_WEBHOOK_REDESIGN` (own path `biggbee/website-redesign/start`) |
| n8n workflow | `Biggbee AI - Outbound Cold Email System` | `Biggbee AI — Website Redesign Outreach` |
| Google Sheet | the general CRM sheet (`GOOGLE_SHEET_ID`) | `REDESIGN_SHEET_ID` (never falls back to the general sheet) |
| Drive | – | `REDESIGN_DRIVE_FOLDER_ID` |
| Campaign records | Campaigns sheet | CRM store collection `redesign-campaigns` (`RDC-######`) + the redesign tracking tab |

Nothing in the regular campaign path was modified.

## How a run works

1. **Create** a campaign (just a name) on the page.
2. **Check connections & scan** (read-only) shows sheet/Drive connectivity, how many rows are eligible, which Drive folder each business matches, and whether its screenshots are valid.
3. **Start dry run.** The CRM issues a single-use run id and calls the dedicated webhook. The workflow reads the sheet, matches folders, validates and downloads screenshots, has the model write each email, checks it against the factual-claim rules, and saves the subject + body as a **preview**. **Nothing is sent.**
4. **Review the previews** on the page.
5. **Start live run** – requires a completed dry run, a ticked confirmation box **and** typing `SEND LIVE`. The live run sends **only the previewed emails**, exactly as previewed, one at a time, with a delay between sends.
6. **Pause / Resume** at any time. Pause is checked before every single send.

## Connected resources (verified read-only, 2026-10-29)

| | Value |
|---|---|
| Spreadsheet | "Website Redesign Prospects" (`1VsTcaZBHp-diiEDYCWmBPmwMSJDzmVZkac28JC9KJM4`), a single tab |
| Leads tab | **`Prospects`** (GID `2090997235`; the GID is not the tab name), 1009×26 grid, 21 data rows |
| Headers actually present | `Name`, `Website URL`, `Email`, `Reason` |
| Column mapping | `{"businessName":"Name","email":"Email","website":"Website URL"}` |
| Not mapped | `Reason` (free text; it is not a verified-facts column, so it is deliberately **not** used for the preserved-details or booking-form claims). There is no ID, status, business-type or unsubscribed column, so the email address is the business key, every row with a valid address is eligible, and emails say "business" rather than a type |
| Drive main folder | "Website Redesign" (`1owdseo2l65Vd3LTHBcQxduRKzOZGwR8v`): 21 subfolders, nothing else, no second page |
| Matching result | 21 of 21 rows matched exactly to one folder each; 0 orphan folders, 0 duplicate keys |
| Screenshots | every folder holds exactly 4 valid `image/png` files; one was downloaded to confirm retrieval (its type and size matched Drive's metadata) |
| Tracking tab | **does not exist yet**; creating it needs approval. Header row to use: see "Tracking tab" below |
| Access | n8n credentials **Google Sheets account 2** and **Google Drive account** can read both. The CRM's own service account (`biggbee-crm@red-splice-501718-g1.iam.gserviceaccount.com`) can **not** (sheet 403, folder 404), so the CRM page's "Check connections & scan" fails until both are shared with it (Viewer). The older credential "Google Sheets account" is dead ("The OAuth client was deleted") and must not be used |

Notes on the workflow's name: the imported workflow `Rf9hB2sJrRJGoalt` was renamed in n8n to "CRM website Redesign Marketing" and re-saved (n8n drops default-valued parameters when saving); its logic is identical to `n8n/website-redesign-outreach.workflow.json`, and it is still inactive.

## Configuration (all server-side; the page shows only names + set/not set)

| Variable | Required | Meaning |
|---|---|---|
| `N8N_WEBHOOK_REDESIGN` | yes | Webhook path (joined onto `N8N_BASE_URL`) or full URL. For the imported workflow: `webhook/biggbee/website-redesign/start` |
| `REDESIGN_SHEET_ID` | yes | Spreadsheet id of the **dedicated** redesign sheet |
| `REDESIGN_SHEET_LEADS_TAB` | yes | Tab with one row per business |
| `REDESIGN_SHEET_TRACKING_TAB` | yes | Tab the workflow writes status rows to (see headers below) |
| `REDESIGN_DRIVE_FOLDER_ID` | yes | Drive main folder; each business has a subfolder directly inside |
| `REDESIGN_SHEET_COLUMNS` | yes | JSON mapping of logical fields → the sheet's real header names |
| `REDESIGN_PROVIDER_HOURLY_LIMIT`, `REDESIGN_PROVIDER_DAILY_LIMIT` | for live | Your email provider's **verified** limits. No default; live sending is blocked until set. Campaign limits are clamped below them |
| `REDESIGN_WORKSPACE_ID` | no (`biggbee`) | The one workspace this configuration belongs to; other workspaces see "not set up" |
| `REDESIGN_ELIGIBLE_STATUSES` | no | Comma-separated values of the mapped `status` column that make a row eligible (unset = every row with a valid email) |
| `REDESIGN_GOOGLE_CLIENT_EMAIL` / `REDESIGN_GOOGLE_PRIVATE_KEY` | no | Dedicated **read-only** service account for the page's scan; defaults to the CRM's existing one |
| tuning | no | `REDESIGN_DELAY_SECONDS` (120), `REDESIGN_HOURLY_LIMIT`, `REDESIGN_DAILY_LIMIT`, `REDESIGN_MAX_PER_RUN` (50), `REDESIGN_MAX_SCREENSHOTS` (4), `REDESIGN_MAX_FILE_BYTES` (4 MB), `REDESIGN_MAX_TOTAL_BYTES` (10 MB), `REDESIGN_IGNORE_NON_IMAGE_FILES` (false), `REDESIGN_BOUNCE_RATE_THRESHOLD` (0.05), `REDESIGN_MIN_BOUNCE_SAMPLE` (20), `REDESIGN_MAX_CONSECUTIVE_ERRORS` (3) |

The existing `N8N_API_KEY` authenticates CRM ⇄ n8n in both directions, exactly as for the regular webhooks.

## Redesign leads sheet: column mapping

The sheet's schema was **not supplied**, so no header names are assumed. You map each logical field to a real header in `REDESIGN_SHEET_COLUMNS`, for example:

```json
{"businessName":"Business","email":"Email","businessType":"Type","website":"Website","businessId":"ID","verifiedPreserved":"Kept details","bookingFormIncluded":"Booking form"}
```

| Logical field | Required | Used for |
|---|---|---|
| `businessName` | **yes** | Greeting, subject, and folder matching |
| `email` | **yes** | Recipient (validated; duplicates blocked) |
| `businessId` | recommended | Stable identity for duplicate protection. Without it the email address is the identity |
| `businessType` | no | Personalising the email (e.g. "restaurant") |
| `website` | no | Referenced only by domain |
| `driveFolderId` | no | Explicit, most reliable folder match (must be a direct child of the main folder) |
| `folderName` | no | Explicit folder name when it differs from the business name |
| `status` | no | Eligibility when `REDESIGN_ELIGIBLE_STATUSES` is set |
| `verifiedPreserved` | no | Text such as `menu, prices and opening hours`. **The email may claim details were kept only if this is filled in** |
| `bookingFormIncluded` | no | `TRUE`/`FALSE`. **The email may mention a booking form only if this is TRUE** |
| `unsubscribed` | no | `TRUE` blocks the row |

The workflow only **reads** this tab; it never edits your existing columns.

## Tracking tab: required header row

Create the tracking tab with exactly this header row (the workflow appends/updates rows keyed on `campaignKey`):

`campaignKey, workspaceId, campaignId, businessKey, businessName, email, mode, status, reason, subject, bodyText, attachmentNames, attachmentFingerprint, usedFallback, failureKind, executionId, updatedAt, sentAt`

`campaignKey = workspaceId|campaignId|businessKey|mode` is the idempotency key. Statuses: `previewed`, `blocked`, `skipped`, `sending`, `sent`, `failed`.

## Drive folder layout and matching

```
Main folder  (REDESIGN_DRIVE_FOLDER_ID)
├── Al Shami/        screenshot1.png, screenshot2.png, …
├── Pizza Roma/      …
```

A business matches a folder by, in priority order: its `driveFolderId`; its `folderName`; its `businessName` — each an **exact** match after normalising case, accents and punctuation. There is **no fuzzy matching**. Ambiguous names, a name matching no folder, or a folder claimed by two businesses block every business involved, so one business's screenshots can never reach another. Files must be PNG/JPEG/WebP within the size caps; an empty folder, an unsupported or unreadable file, a failed download, or a listing that cannot be trusted blocks that business. Files are fetched through the n8n Google Drive OAuth credential — nothing is made public.

## Email generation and claim rules

A dedicated AI step writes a subject and body in the reference style. The signature (`Best regards, Biggbee AI, www.biggbees.com`, no logo) is appended by code, not the model. Every draft then passes deterministic checks (`validateDraft` in `src/lib/redesign/core.mjs`); a draft that fails — or any model error — is replaced by a plain, always-safe wording ("a redesign concept was prepared and screenshots are attached"). Specifically: screenshots are mentioned only if attached; "kept your menu/prices/hours/contact details" only if `verifiedPreserved` is filled; a booking form only if `bookingFormIncluded` is TRUE; never sales/ranking/booking outcomes, guarantees, urgency, percentages or links. Sender identity comes from the workspace record (`office@biggbees.com` for Biggbee).

## Sending safeguards

* Dry run is the default; live needs a prior completed dry run + checkbox + typed phrase.
* Strictly sequential (`splitInBatches` size 1) with a configurable delay. Delay is pacing, **not** a spam-protection guarantee.
* Hourly/daily limits are clamped to your verified provider limits and also count sends made by the regular campaigns from the same mailbox.
* The workflow asks the CRM before **every** business; the CRM is the source of truth for pause/cancel and safety signals. If the CRM can't be reached the run pauses.
* Auto-pause: limit reached, a spam complaint, bounce rate above threshold (after a minimum sample), consecutive errors, SMTP rate-limit/auth/unknown errors, an unwritable tracking sheet or CRM report.
* A permanent SMTP failure (e.g. 550) is recorded and never retried. Sends are **never auto-retried**; a transient failure pauses the run.
* A business is marked `sending` in the tracking sheet **before** the SMTP call and `sent` only after SMTP succeeds. A crash in between leaves `sending`, which blocks any re-send; review those rows by hand.
* Suppression: general-CRM leads with status Unsubscribed/Spam/Bounced/Not Interested plus unsubscribe, complaint and hard-bounce events for the workspace, plus the sheet's own `unsubscribed` column.
* Duplicate webhook delivery: the CRM burns the run id on the first `begin`; the second is refused.
* Routing: a `Route by Workspace SMTP` switch (same pattern as the regular workflow) sends only for `biggbee`, using the existing SMTP credential; any other workspace is blocked, never falling back.

## Importing the workflow

`n8n/website-redesign-outreach.workflow.json` is generated by `node scripts/build-redesign-workflow.mjs` from `src/lib/redesign/core.mjs` (so the CRM and n8n apply identical rules). It imports **inactive**. Before activating, in n8n: confirm the Google Drive / Google Sheets / OpenAI / SMTP credentials on the nodes (existing credential ids are referenced; the Drive and Sheets accounts must have access to the redesign folder and sheet), then activate and set `N8N_WEBHOOK_REDESIGN`.

## Known limits

* Bounce rate is an estimate from the workspace's recorded hard-bounce vs sent events; this workflow does not read the inbox. Replies/bounces continue to be handled by the regular IMAP workflow.
* The scan checks screenshots for the first 25 matched businesses; the run checks all of them.
* A Drive main folder with more than 1000 subfolders is refused rather than partially matched.
* Execution time grows with the delay (e.g. 50 emails × 120 s ≈ 100 min); make sure the n8n instance's execution timeout allows it, and use Pause/Resume for long lists.
