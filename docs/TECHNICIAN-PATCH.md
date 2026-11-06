# Technician patch — 6 November 2026

## Included
- Reset the root navigator at the account boundary, remove the role-dependent tab navigator remount, and disable the signed-out screen transition. Clear sync state and lock sign-out until credential cleanup completes.
- Materials total and payer on active assigned jobs. This is a replacement total, not an increment.
- Explicit customer price input: labor plus materials, or a total already including materials. The latter subtracts materials to produce labor before saving. A preview shows both components and the total.
- Existing CRM payout percentage remains authoritative. No new blanket 60% rule. Company-paid materials do not automatically become a worker reimbursement.
- Live agreed-price edits save directly with a reason in existing office notes. Demo price requests retain office approval. Closed job edits remain an office action.
- Materials in completion confirmation; SMS composer for customer communication (no message is sent automatically).
- Weekly web trip: completed labor total, materials total, gross customer price and existing payout calculation.

## Shared API (requires backend release first)
- POST /api/v1/mobile/tasks/{id}/materials: materials_cost, materials_paid_by, expected_revision.
- POST /api/v1/mobile/tasks/{id}/costs: same fields plus labor_price and reason.
- Both require the assigned technician, an active assigned/in-progress job, and the current revision. Old revisions return 409 without retrying a write. No payout-percentage input is accepted.
- GET /api/v1/trips/{worker}: adds labor_total and materials_total, counting completed work by business timezone.
- No migration, new table, database copy or production data test.

## Still separate work
- Real Cash/Zelle/Check customer payment ledger and weekly collection breakdown. The shared backend currently does not store these mobile demo payment records.
- En-route flag and office-to-technician messaging. Do not invent these states on the server or imply SMS was sent.
- Confirm with the owner whether customer-paid materials should be included in customer gross, and reimbursement policy. Current explicit payer and price basis avoid an automatic assumption.

## Release validation
- Mobile TypeScript, lint, domain/API tests and iOS Hermes export.
- Backend synthetic tests and CRM production build.
- The supplied clip shows an empty iOS scene repeatedly animating. Native sign-out must be checked on an iPhone using a NEW TestFlight build; code checks cannot certify this native symptom. Browser preview was unavailable in this session.
- On iPhone: demo technician -> profile -> sign out -> welcome; repeat for other demo roles; live sign out -> welcome -> reopen -> no session; another account can log in; try while a refresh is in flight.
- Synthetic assigned job: record $5000 including $1000 materials -> $4000 labor; existing 60% would mean $2400 labor share (only if that percentage is actually configured). Check second device and web, reject stale edits, confirm completion summary.

## TestFlight
From the mobile directory, after backend release:
`eas build --platform ios --profile production`
Then `eas submit --platform ios --profile production` and select the new build, not build 3.
There is no EAS Update setup; installed build 3 will not receive source changes by itself.
