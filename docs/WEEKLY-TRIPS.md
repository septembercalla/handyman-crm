# NOVAfix workspace redesign and weekly trips

Prepared locally on 2 November 2026. No push, deployment, production data edits or migrations were performed for this redesign.

## Review

The existing website now uses the field app's warm canvas, forest-green accent, dark text, soft status pills and consistent controls. Navigation has visible labels on desktop and collapses to an icon rail on smaller screens. Overview is reduced to four primary metrics and an office follow-up row. The Jobs table has six columns; secondary filters are behind one disclosure. Team has search, active/inactive filters, contact details and direct weekly-trip links. Existing customer, scheduling, task-edit and lead workflows remain in place.

- [Weekly trip preview](previews/weekly-trip.png)
- [Team preview](previews/team.png)
- [Jobs preview](previews/jobs.png)
- [Overview preview](previews/overview.png)
- [Tablet trip preview](previews/trip-tablet.png)

All screenshots use synthetic fixtures in an isolated in-memory SQLite process. They do not show production customers or represent actual earnings.

## Weekly trip

`/trips` is available to administrators, matching the existing payroll permission boundary. Choose a worker from the actual worker list, then a week. Direct links preserve worker/week in URL parameters. Inactive workers remain selectable for history. A complete Monday–Sunday table includes empty days, multiple jobs per day, planned jobs, completed work, customer/service address, time/status, job value and labor share. Jobs open their existing detail pages. A full-week CSV export is available, with UTF-8 BOM, quoted fields and spreadsheet formula escaping.

Week totals remain full-week totals when searching or filtering rows. Export also contains the whole week. Known subtotal earnings are flagged when any completed job lacks a payout percentage; unknown shares are never silently replaced with the worker's current default. Pending/cancelled work is excluded from earned totals. Customer collections and worker payment transactions are not implemented by the current backend and are not represented as paid amounts.

## API and calculations

New read-only endpoint: `GET /api/v1/trips/{handyman_id}?week_start=YYYY-MM-DD`, authenticated with existing office cookies and restricted to administrators. It returns worker metadata, business timezone, normalized Monday/Sunday range, seven day groups, jobs and server-calculated totals. Unknown worker returns 404; invalid UUID/date returns 422; unauthenticated/non-admin access returns 401/403.

It reuses the existing Task/Handyman/Customer models and `app.services.financials` functions used by payroll and the mobile projection. No schema migration or package dependency was added. Completed jobs are selected and grouped by completion time in `BUSINESS_TIMEZONE`; planned jobs use scheduled dates. UTC boundaries are built from local midnights independently so DST weeks work correctly. Job value includes labor/materials, labor share excludes materials, and eligible materials reimbursement is added separately to calculated payout. Calculated payout is not a payment confirmation.

The mobile API and field application are unchanged. Active office task, schedule, payroll and trip queries refresh every 20 seconds and on window focus; mutations invalidate related report caches. This keeps mobile status updates visible without opening extra background services. The existing web status transitions remain unchanged.

## Verification

- Full existing backend suite plus trip tests: **263 passed**.
- Additional end-to-end test: **1 passed**, mobile assignment → in-progress → done → office trip, with matching server earnings.
- New API lint/format checks passed.
- Frontend TypeScript and scoped ESLint passed; complete `next build` passed, including `/trips`.
- Browser checked real synthetic API login, worker switching, empty week, completed filter, search, expanded secondary job filters, CSV download and responsive layout at 768 px.
- At tablet width, the table scrolls inside its container; the page itself does not overflow horizontally.
- No new runtime dependencies, production migration or native mobile build.

The full suite used a disposable test signing key and emitted key-length warnings; these are test-environment warnings, not a change to production credentials. The additional end-to-end test used a key over 32 characters.

## Rollout after visual approval

Publish the backend route and its registration along with the frontend changes. Deploy backend before opening the report on the production frontend. No Alembic action is needed for this feature. Existing environment URLs and explicit CORS origins remain in effect. Do not include `.env.local`, preview build folders, local test fixtures, database backups, or unrelated uncommitted lead edits in a release commit.

The new route's deployment is still pending. A local frontend talking to the old production backend will show a clear API error until the updated backend is published. It will not invent demo rows in company mode.

## Reproduce the synthetic preview

From the existing backend folder, run its virtualenv Python on `D:\videos on youtube\study\mobile_ap\integration\preview_server.py`. This process creates SQLite tables only in memory and serves port 8011. In another terminal, from the frontend folder, set `NEXT_PUBLIC_API_URL=http://localhost:8011/api/v1` for that shell only, then run `npm run dev -- --port 3011`. Do not edit the saved production API URL just to view fixtures. Sign in with the disposable local preview account `preview@example.com` / `synthetic-preview`, and open `/trips?week_start=2026-10-26`. Stop both processes when finished. These credentials have no production account.

Interaction references reviewed: [Housecall Pro's scheduling and field-service organization](https://www.housecallpro.com/Features/) and [Super Dispatch's trip workflow](https://support.superdispatch.com/hc/en-us/articles/41840115977491-How-To-Manage-Trips-in-the-Driver-App). The implemented financial rules are those of this CRM; reference-product workflows were not imported as business rules.
