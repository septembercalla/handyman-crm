# Shared CRM integration — 2 November 2026

## Current state

The mobile source and the existing CRM backend source now support one shared FastAPI/PostgreSQL installation. No Supabase, second production database, web frontend edits, production writes, migration execution, commit/push or deployment were performed.

**Railway is not ready for the new mobile client yet:** a read-only GET to `https://handyman-crmback-production.up.railway.app/api/v1/mobile/capabilities` returned 404 during verification. The client checks this endpoint before transmitting login credentials and explains that the server needs updating. Local source changes are not evidence of a deployed release.

Backend location: `D:\videos on youtube\study\handymancmr\handyman-crm-latest\handyman-crm\backend`.

Mobile location: `D:\videos on youtube\study\mobile_ap\mobile`.

## What is connected

- Existing customers, task records, assignments, status history and financial calculation services are reused.
- Technician login accounts link `users.handyman_id` to an existing `handymen.id`. Account UUID and handyman UUID are distinct. Only an administrator can provision access; there is no live self-registration.
- Technicians receive only their assigned tasks and the customer name, telephone and job service address required for that work. Internal notes, private worker documents and office-only customer lists are excluded.
- Office users retain their existing web login/cookie flow. Native mobile tokens use a separate token type and cannot authenticate legacy office endpoints. Technician logins are rejected by office authentication.
- Mobile refresh tokens rotate, are stored hashed on the server, and are revocable per session. Native storage uses Expo SecureStore; access tokens stay in memory. Web preview refresh tokens are memory-only. Passwords and live snapshots are never persisted in AsyncStorage.
- Status selection is explicit: open selector, choose an allowed status, inspect the old/new pair, confirm. Opening or selecting alone sends no write. Live technician workflow matches the CRM: `assigned → in_progress → done`. Demo retains its richer intermediate stages with confirmation.
- Server labor-share calculation is displayed; missing percentages remain unspecified. Completing a task never records customer collection or pays a technician.

## API contract

All routes below are relative to `/api/v1`. Existing office endpoints remain in place.

| Endpoint | Purpose / access |
|---|---|
| `GET /mobile/capabilities` | Public, data-free version handshake |
| `POST /mobile/auth/login` | Existing office or provisioned technician credentials |
| `POST /mobile/auth/refresh` | Rotate opaque refresh token |
| `POST /mobile/auth/logout` | Revoke this mobile session |
| `GET /mobile/me` | Authenticated account and handyman link |
| `GET /mobile/tasks?page=1&page_size=100` | Office tasks or technician's own tasks |
| `GET /mobile/tasks/{id}` | Authorized safe task projection |
| `GET /mobile/tasks/{id}/history` | Authorized status history |
| `POST /mobile/tasks/{id}/status` | Technician only; `{status, expected_revision}` |
| `POST /mobile/tasks/{id}/assign` | Office only; `{handyman_id, expected_revision}` |
| `POST /mobile/tasks` | Office only; existing TaskCreate schema and creation service |
| `GET /mobile/team` | Office only; handymen and account linkage |
| `POST /mobile/technicians` | Admin only; `{handyman_id, email, password}` |

These `/mobile` endpoints are **new local changes**, not endpoints already available on the checked production release. The existing web CRM already supports office customer/task creation, assignment and status display through its original endpoints; it does not need a frontend rewrite.

## Synchronization

Reads refresh every 20 seconds while the app is foregrounded, on screen focus/resume, or via manual refresh. There is no WebSocket service or background tracking. Each device has an independent session. The UI shows the last successful sync and request failures.

Task `revision` increments on ORM updates from both web and mobile. Mobile assignment/status writes require the revision the user saw. The server locks/reloads the task, checks ownership and revision, and returns 409 on conflict. The client refreshes and requires a new selection instead of replaying the old write. Reassignment removes the former technician's read/write access server-side. No offline write queue is implemented: network failures are shown and require an explicit retry after refresh. A lost response can mean a committed operation; inspect refreshed state before retrying. Creation/provisioning have no request idempotency keys yet.

## First safe two-device scenario, after an authorized rollout

1. Use synthetic people and an unmistakable `TEST MOBILE` job. Do not use a real customer's record for acceptance testing.
2. In the existing web CRM, an administrator creates an active test handyman. In the mobile company workspace, the administrator opens Team and provisions that handyman's login using a unique test email and a disposable password of at least 12 characters (maximum 72 UTF-8 bytes). Deliver credentials privately. Existing office accounts flagged for initial password change must complete that step in the web CRM first.
3. A dispatcher creates a synthetic customer and job in the existing web CRM, then assigns the job to that handyman. The existing web task creation/assignment services are reused unchanged. Alternatively the new mobile office routes create a task for an existing customer and assign it; the current mobile form only offers customers already present in its loaded task list.
4. On a second device, open the same Expo project, choose **Connect to company backend**, then sign in as the test technician. The job appears after refresh. An unrelated technician must not see it.
5. Open the job, select **In progress**, confirm, then refresh the web CRM. Repeat with **Work completed**. Inspect shared history. No payment is created.
6. On two technician devices open the same revision. Confirm a status on device A, then try the stale selection on B: expect 409, refreshed state and a fresh selection requirement.

For Expo Go, start one Metro instance with `npm start -- --max-workers 1`; scan its QR on both phones on the same trusted network. Keep default mock mode for demos; switch to company mode on the welcome screen for shared server data. The mode switch never imports mock jobs into the CRM. The API URL is public configuration, not a secret:

```env
EXPO_PUBLIC_DATA_PROVIDER=mock
EXPO_PUBLIC_API_URL=https://handyman-crmback-production.up.railway.app/api/v1
```

## Deployment gate — not executed

The existing database needs the prepared Alembic revision `fa0711b2c901_mobile_accounts_and_task_revision.py` (parent `e9a6b1c4d804`): technician enum value, nullable unique user/handyman FK, task revision, and mobile session table. Do not run the new backend against the old schema. Review the migration and current Railway configuration first: its pre-deploy command may apply migrations automatically when deployment is triggered.

Before an authorized rollout: back up the existing database, review migration against the actual production head, validate PostgreSQL locking and enum migration in an approved test environment, then deploy the compatible backend and verify the data-free capability endpoint. No production migration or deployment is authorized by this document. Do not blindly downgrade after creating technician accounts: older code does not understand that role, and the downgrade deliberately retains the PostgreSQL enum label.

## Boundaries and verification

Live MVP covers accounts, task reads/creation/assignment, status and history. Photos, notes, offers, price requests, shift/location tracking, notifications, payment collection/verification and payroll payout workflows remain demo-only and are hidden/blocked in company mode. Their mock design and behavior remain available. New customer creation stays in the existing web CRM. Credential recovery, technician password change UX, authentication rate limiting, session cleanup, mutation idempotency and complete live financial workflows remain follow-up work.

- Full backend suite: **260 passed** using synthetic fixtures and SQLite in memory. No persistent test database or production connection. This validates application behavior, not PostgreSQL lock/DDL semantics.
- Mobile: strict TypeScript, formatting, source/native text checks, **28 tests**, Expo dependency version check passed.
- Expo Doctor: **21/21 checks passed**. Metro generated the complete iOS JavaScript bundle successfully (HTTP 200); this is not physical device acceptance.
- Browser: demo navigation and status choose/confirm/cancel checked; selection alone left status unchanged.
- Physical iPhone and real two-device acceptance are still required after the backend rollout. Expo Go compatibility is retained; no prebuild, emulator or native project was created.
- Package install reported 17 dependency advisories (2 low, 9 moderate, 6 high). No forced dependency upgrades were applied.

Historical `BACKEND.md`/`AUDIT.md` describe the earlier read-only audit. This document supersedes their statements that the live adapter is unimplemented.

