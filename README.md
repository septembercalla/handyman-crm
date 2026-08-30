# Handyman CRM

An internal dispatcher tool: customer requests, handyman assignment, the day on a
map, work statuses. The interface reference is SuperDispatch TMS — we copy the
layout, density and navigation logic, not the brand.

Current state: **complete through SPEC §10 item 8, and ready to deploy.** Every
screen reads and writes through the FastAPI backend and PostgreSQL; no mock data
is left in the app. Railway config for both services is committed — see
[DEPLOY.md](DEPLOY.md).

---

## Quick start

### 1. Database

Any PostgreSQL reachable over `DATABASE_URL`. The quickest path is a Railway
Postgres: create the service from the template, open **Variables**, copy the
public `DATABASE_URL`.

### 2. Backend

```bash
cd backend
uv sync
cp .env.example .env          # paste DATABASE_URL, set SECRET_KEY
uv run alembic upgrade head
uv run python -m app.seed     # demo data: 1 dispatcher, 5 handymen, 14 customers, 32 tasks
uv run uvicorn app.main:app --reload
```

API on http://localhost:8000, interactive docs on **http://localhost:8000/docs**.
Sign in with `dispatcher@handyman.crm` / `demo`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

http://localhost:3000 — the sign-in form is pre-filled with the seeded account,
press **Sign in**. The backend must be running: the frontend has no data of its
own any more.

### Both at once

From the repository root: `npm install && npm run dev` starts the frontend and the
backend side by side through `concurrently`. In VS Code: **Terminal → Run Build
Task** (`dev: all`). Handy root scripts: `npm run db:migrate`, `npm run db:seed`,
`npm run db:reset`, `npm run lint`, `npm run lint:back`.

---

## What already works

### Screens

| Screen | Route | What is inside |
|---|---|---|
| Login | `/login` | Sign-in against `POST /auth/login`; wrong credentials show an error and stay put |
| Home | `/` | Status counters, the "Today" and "Needs assignment" tables |
| Tasks | `/tasks` | Dense table; filters, sorting and pagination **in query params** |
| Task — create | `/tasks/new` | One page in sections: Task Details · Customer · Schedule & Location · Assignment |
| Task — record | `/tasks/[id]` | Details, status history, transition buttons, mini map, customer, handyman |
| Task — edit | `/tasks/[id]/edit` | The same form with the values filled in |
| Handymen | `/handymen` | Handyman list, skills, today's load |
| Handyman — day | `/handymen/[id]` | **The key screen**: date switcher, Stops / Tasks tabs with counters, day route map |
| Schedule | `/schedule` | Every handyman's day on a timeline, drag & drop for unassigned tasks |
| Customers | `/customers` | Customer list |
| Customer — site | `/customers/[id]` | The full work history for the address plus site notes |

A link to a filtered task list can be shared — the table state lives in the URL and
survives a reload.

### API (`/api/v1`)

```
POST   /auth/login          POST /auth/refresh   POST /auth/logout   GET /auth/me
GET    /tasks               ?status= &handyman_id= &category= &priority=
                            &date_from= &date_to= &search= &unassigned=
                            &ordering=-created_at &page=1 &page_size=25
POST   /tasks               GET /tasks/{id}      PATCH /tasks/{id}   DELETE /tasks/{id}
POST   /tasks/{id}/assign   POST /tasks/{id}/status                  GET /tasks/{id}/history
GET    /handymen            POST /handymen       GET/PATCH /handymen/{id}
GET    /handymen/{id}/tasks?date=YYYY-MM-DD
GET    /customers           POST /customers      GET/PATCH /customers/{id}
GET    /customers/{id}/tasks
GET    /schedule?date=YYYY-MM-DD                 GET /schedule/unassigned
GET    /dashboard/stats
```

Everything except `/health` and `/` requires a session. Tokens are set as httpOnly
cookies; an `Authorization: Bearer` header also works, so `/docs` and curl stay
usable.

The task lifecycle from SPEC §4 is enforced in `app/services/tasks.py`, not in the
routers: forbidden transitions return `409`, `assigned` without a handyman returns
`409`, and closed tasks accept nothing but `internal_notes`. Every status change
writes a `task_status_history` row.

---

## Stack

**Frontend** — Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 ·
shadcn/ui-style components on Radix · TanStack Table v8 · TanStack Query ·
react-hook-form + zod · dnd-kit · `@vis.gl/react-google-maps`.

**Backend** — Python 3.12 · FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic v2 ·
PostgreSQL · JWT in httpOnly cookies · `uv` as the package manager. No Docker: the
database is external and reached through `DATABASE_URL`.

## Data

There is one source of truth: PostgreSQL, reached through the API. The browser
holds no application data.

`lib/api/client.ts` is the only place that talks to the network. Every request
carries `credentials: "include"` so the httpOnly auth cookies travel with it; no
token is ever kept in JS. A `401` sends the browser to `/login`, except on
`POST /auth/login` and `GET /auth/me`, which report the failure to their caller
instead (otherwise a wrong password would bounce the page instead of showing an
error). Empty filters are dropped from the query string rather than sent as
blanks.

Reset the database with `npm run db:reset`. On an empty (production) database,
create the first account with `python -m app.create_admin` — it writes one user
and nothing else, unlike the demo seed.

## Maps

If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset, maps are drawn as a schematic from
the coordinates: points, numbering, route — the UI is fully usable without a key.
As soon as the key lands in `.env.local`, the same screens render real Google Maps
with no code changes (`components/map/map-view.tsx`).

Server-side, `GOOGLE_MAPS_API_KEY` enables address geocoding on task create and on
address change. Without it tasks are saved without coordinates and the task record
shows a warning — nothing fails.

## Design tokens

Palette, density and typography are defined in `app/globals.css` per SPEC §7:
44px table row, 36px input, 4px radius, 14px base, 72px sidebar. Measurements taken
from the reference interface are in `ui-spec.md` next to SPEC.md.

## Language

All UI copy, demo data, code comments and docs are in English.

---

## Next up, per SPEC §10

1. ~~Repository skeleton, configs, README~~ ✅
2. ~~Models + Alembic + seed script~~ ✅
3. ~~Auth + CRUD for tasks/handymen/customers~~ ✅
4. ~~Frontend: layout, sidebar, login, api client~~ ✅
5. ~~Tasks — list with filters and pagination through the URL~~ ✅
6. ~~Tasks — create/edit form~~ ✅
7. ~~Handyman day view~~ ✅ (Google Maps switches on with the key)
8. ~~Schedule with drag & drop~~ ✅
9. Deploy to Railway — config committed, steps in [DEPLOY.md](DEPLOY.md); the
   deploy itself has to be run from an account with Railway access

On Railway the frontend and the API sit on different hosts, so the auth cookie is
cross-site: the backend switches to `SameSite=None; Secure` when `ENV=production`
and `CORS_ORIGINS` must name the frontend origin. That whole path was tested
locally over HTTPS on two separate hostnames before shipping.
