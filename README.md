# Biggbee AI — Outreach CRM

Internal CRM dashboard for Biggbee AI's automated outbound email system. It sits on top of the
same Google Sheet the n8n workflow reads and writes, so the operator can run the daily workflow —
review leads, configure campaign targeting, monitor sends, watch demos, check errors — without
opening Google Sheets or n8n.

Built deliberately small and focused (think Linear / Vercel dashboard, not Salesforce): every
page maps to one step of the existing outreach workflow, and nothing else.

## Tech stack

- **Next.js (App Router) + TypeScript** — server components fetch data; client components only where there's interactivity
- **Tailwind CSS v4** — brand tokens (dark navy / electric blue) defined in `src/app/globals.css`
- **TanStack Table** — the Leads table (sorting, filtering, column visibility, pagination, selection, CSV export)
- **Recharts** — all charts
- **Radix UI primitives** — dialogs, drawers, tabs, dropdowns, switches (shadcn-style components in `src/components/ui`)
- **Zod** — server-action input validation
- **googleapis** — Google Sheets data layer (server-only)

## Quick start (mock mode — no credentials needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Google credentials configured the app runs in **mock mode**:
realistic sample data covering Biggbee's actual verticals (Instagram/Google Maps lead-gen
agencies, dental clinics, real estate, customer support, voice-agent prospects), including edge
cases — failed sends, missing websites, unscored leads, validation errors.

Mock mode is not a demo shell: every page, filter, chart and action works. Writes (add lead,
pipeline drag-and-drop, campaign edits, list management) mutate an in-process store that resets
on server restart.

## Data modes

The app runs in one of two modes, controlled by `DATA_MODE`:

- `DATA_MODE=mock` — sample data, no credentials needed
- `DATA_MODE=sheets` — live Google Sheets
- unset — auto-detect: sheets when credentials are present, mock otherwise

In sheets mode a failed read shows **empty data plus a connection error** (sidebar indicator +
Settings), never mock data — you can always trust that what you see is the live sheet.

## Connecting Google Sheets

1. Create a Google Cloud service account, enable the **Google Sheets API**, and create a JSON key.
2. Share the workflow's spreadsheet with the service account email (**Viewer** is enough — the dashboard only reads).
3. Copy `.env.example` to `.env.local` and fill in:

```
DATA_MODE=sheets
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_CLIENT_EMAIL=crm-reader@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1AbC...xyz
```

Keep the `\n` escapes in the private key exactly as they appear in the JSON key file — the app
converts them back to real newlines server-side. Credentials never reach the browser.

4. Restart the dev server. The sidebar status indicator switches from "Mock data mode" to
   "Google Sheets connected". Use **Settings → Test connection** to verify.

Reads are cached in-process for 60 seconds; the header **Refresh** button (and the Dashboard
refresh control) invalidates the cache immediately.

Supported tabs — exactly the six the n8n workflow maintains today (rename via `SHEET_TAB_*` env
vars if yours differ): `Leads`, `Lead_Memory`, `KB_Cache`, `Errors`, `Unknown_Senders`,
`Demo_Library`. Columns are mapped by **header name**, never by position, and known header
variants (e.g. `Cache Key` / `CacheKey`, `From Email` / `FromEmail`, `TimeStamp` / `Timestamp`)
are all accepted. Missing columns and malformed cells never crash a page.

## Production Setup Checklist

A step-by-step run order for going from a fresh clone to a verified, live dashboard. See
[Connecting Google Sheets](#connecting-google-sheets) above for the detail behind steps 1–6, and
[n8n automation integration](#n8n-automation-integration) below for step 11.

1. Create a Google Cloud project.
2. Enable the **Google Sheets API** for that project.
3. Create a service account inside it.
4. Create and download a JSON key for the service account.
5. Share the **Bigggbee Email Marketing** spreadsheet with the service account's email address
   (**Viewer** access is sufficient — see the note below).
6. Populate `.env.local` with `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
   and `GOOGLE_SHEET_ID` from that key file.
7. Set `DATA_MODE=sheets`.
8. Restart the app — environment variables are only read at startup.
9. Open **Settings** and check the **Configuration** card. Every `GOOGLE_*` variable should show
   no errors; use **Test connection** in the Google Sheets card to confirm the sheet is reachable.
10. Compare **Dashboard → Total Leads** and the **Campaign Readiness** counts against the sheet
    itself, to confirm the CRM is reading the row count you expect.
11. Secure the n8n webhook: add Header Auth in n8n (`X-API-KEY`) and set `N8N_API_KEY` here to
    the same value.
12. Run a safe first test: set exactly **one** row in the Leads tab to `Status = New` with an
    address you control, everything else `New`/`Contacted`/etc., then trigger **Run Campaign**
    from the dashboard and confirm only that lead is processed.
13. Only after that single-lead test succeeds, restore the real lead set to `Status = New` as
    appropriate and resume normal use.

Notes:

- **Viewer** access is enough for now — the CRM is read-only against Sheets (see
  [What still requires credentials / follow-up work](#what-still-requires-credentials--follow-up-work)).
  It never requests write/edit access.
- Never commit the service account JSON key or its private key value anywhere in the repo.
- `.env.local` is already gitignored — keep it that way, and don't paste its contents into chat,
  issues, or commit messages.
- Next.js reads environment variables once at process start; **restart after every change** to
  `.env.local`.
- The n8n workflow behind `N8N_WEBHOOK_RUN_CAMPAIGN` must be **Active** — a production webhook
  URL 404s while its workflow is inactive.
- That webhook's node must be set to **Respond Immediately**. The CRM waits at most 30 seconds
  for a response; the actual campaign (crawling, AI, sending) continues in n8n after that.

## n8n automation integration

The CRM is the **control panel**; n8n stays the automation engine. The CRM never crawls
websites, writes emails, or touches AI — it only POSTs webhook triggers, shows status, and
refreshes from the sheet afterwards.

```
CRM → webhook → n8n workflow → Google Sheets update → CRM refresh
```

Configure in `.env.local` (see `.env.example` for details):

```
N8N_BASE_URL=https://your-n8n-instance.com
N8N_API_KEY=optional-header-auth-key
N8N_WEBHOOK_RUN_CAMPAIGN=webhook/run-campaign
N8N_WEBHOOK_PAUSE_CAMPAIGN=webhook/pause-campaign
N8N_WEBHOOK_RESUME_CAMPAIGN=webhook/resume-campaign
N8N_WEBHOOK_REFRESH_KB=webhook/refresh-kb
N8N_WEBHOOK_RETRY_FAILED=webhook/retry-failed
N8N_WEBHOOK_STATUS=webhook/status
```

The **Automation card** on the Dashboard shows workflow status (running / idle / failed, last
run, current job/lead, last success, average runtime, queue size — polled every 30s from the
optional status webhook) and the action buttons: Run Campaign, Pause, Resume, Refresh Knowledge
Base, Retry Failed Leads, and Sync CRM (local cache invalidation + reload, no webhook).

Unconfigured buttons report "Webhook not configured" — nothing is ever faked. Webhook failures
surface as readable toasts, never stack traces. All calls run server-side (`src/lib/n8n/`):
URLs and the API key never reach the browser. Adding another workflow later is one env var plus
one entry in `src/lib/n8n/config.ts`.

## Pages

| Page | Purpose |
| --- | --- |
| **Dashboard** | KPIs, outreach volume, status/service/country/confidence charts, recent activity, needs-attention list, pipeline overview |
| **Leads** | Full CRM table: search, filters (status/industry/country/service/confidence/demo/date), column visibility, CSV export, add lead |
| **Lead detail** (`/leads/[email]`) | Header actions + tabs: Overview, Timeline, Email History, Lead Memory, Errors, Notes |
| **Pipeline** | Kanban board with drag-and-drop stage changes (optimistic UI) |
| **Campaigns** | Campaign targeting: define what the current run targets, see the include/exclude funnel, preview matching leads. Configuration only — never sends |
| **Outreach** | Send log with filters, summary cards, validation failures, email preview drawer |
| **Lead Memory** | AI memory table with interest/meeting/demo/staleness filters and a detail drawer |
| **Demo Library** | Cloudinary demo videos: grid/list, modal player, watch/download/copy-link, URL health warnings |
| **Analytics** | Everything measurable from real sheet data; unavailable metrics are labeled "Tracking not connected", never invented |
| **Errors** | Operations log: severity, filters, expandable JSON, copy; summary panel with top failing nodes |
| **Knowledge Base** | The cached biggbees.com content the AI uses: sections, search with highlighting, copy, download TXT |
| **Settings** | Connection status/test, reusable lists manager (countries, industries, services, business types, lead-gen types), appearance |

## Architecture

```
src/
  types/                 One file per domain type (Lead, LeadMemory, Campaign, OptionLists, …)
  lib/
    data/                Data access: config (env), sheets-client (server-only), normalize,
                         cache (60s TTL), repository (mock/sheets switch), in-process stores
    actions/             Server actions (Zod-validated): leads, campaigns, option lists
    calculations/        Pure functions: dashboard metrics, activity feed, campaign matching, timeline
    utils/               Safe date parsing, status normalization, confidence bands,
                         Cloudinary URL derivation, CSV export, formatting
    mock/                Realistic mock data per sheet
  components/
    ui/                  Design-system primitives (button, card, dialog, drawer, table pieces, …)
    layout/              Sidebar, header, mobile nav, theme/UI state provider
    <feature>/           One folder per page's components
  app/                   Routes (server components) + /api/health
```

Design decisions worth knowing:

- **The Google Sheet stays the single source of truth.** The dashboard reads it; the n8n
  workflow writes it. That's why v1 is read-only against Sheets — no write races with the workflow.
- **Campaigns and option lists are configuration layers**, stored in-process in mock mode. Each
  store is a small module with a documented swap path to a Sheets tab (`Campaigns`, `Settings`)
  — no UI changes needed when that lands.
- **No invented metrics.** Opens/clicks/replies aren't tracked by the current workflow, so the
  UI says "Tracking not connected" instead of showing fake numbers.
- **Extensibility without bloat**: future modules (Gmail, Calendar, WhatsApp, voice) slot in as
  a new `components/<feature>` folder + route + repository functions. Nothing to refactor.

## What still requires credentials / follow-up work

- **Google Sheets live mode** — needs the four `GOOGLE_*` env vars (read scope).
- **Writes to Sheets** (add lead, status changes from the pipeline board): the service account
  needs the full `spreadsheets` scope, plus an `appendLeadRow` / `updateLeadRow` helper in
  `src/lib/data/sheets-client.ts`. The server actions in `src/lib/actions/leads.ts` are already
  structured for this — they currently return a clear "not wired up" message in Sheets mode.
- **Campaigns / Lists persistence** — add `Campaigns` and `Settings` tabs to the sheet and
  mirror the store functions in `campaigns-store.ts` / `options-store.ts`.
- **Reply/open/click tracking** — the analytics placeholders light up once the workflow logs
  these to countable columns.
- **Notes persistence** — needs a `Notes` tab; the `LeadNote` type and UI are ready.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build (includes type checking)
npm run lint    # eslint
npm start       # serve the production build
```

Health check: `GET /api/health` → `{ ok, mode, dataSourceConnected, timestamp }`.
