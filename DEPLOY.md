# Deploying to Railway

Three services in one Railway project, all on Railway-provided domains
(`*.up.railway.app`). No custom domain is configured anywhere.

```
Postgres  ──DATABASE_URL──▶  backend (/backend)  ◀──HTTPS + cookies──  frontend (/frontend)
```

Everything the platform needs is already in the repository:

| File | What it does |
|---|---|
| `backend/railway.json` | runs `alembic upgrade head` before every deploy, starts uvicorn on `$PORT`, health check on `/health` |
| `backend/requirements.txt` | exact pins exported from `uv.lock` — the builder installs from this |
| `backend/.python-version` | pins Python 3.12 |
| `frontend/railway.json` | `npm ci && npm run build`, then `next start` on `$PORT` |
| `frontend/package.json` → `engines.node` | pins the Node major |

---

## Order matters

The two services reference each other: the frontend needs the API URL, the API
needs the frontend origin for CORS. Neither domain exists before its service is
created, so the setup runs in two passes. Follow the steps in order.

### 1. Push the repository to GitHub

Railway deploys from a repo. One repo, both services — they are separated by
**Root Directory**.

### 2. Create the project and the database

New Project → **Deploy PostgreSQL**. Nothing else to configure; Railway generates
`DATABASE_URL` on the service.

### 3. Backend service

Add a service from the same GitHub repo, then in **Settings**:

* **Root Directory**: `/backend`
* **Networking → Generate Domain** → note it down, e.g.
  `handyman-api-production.up.railway.app`

**Variables** (Postgres is referenced, not copy-pasted):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — use the reference picker, not a literal |
| `SECRET_KEY` | a long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENV` | `production` |
| `CORS_ORIGINS` | placeholder for now, e.g. `https://example.com` — fixed in step 5 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` (optional) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `14` (optional) |
| `GOOGLE_MAPS_SERVER_API_KEY` | optional server-only key for Geocoding API and Routes API; keep it out of `NEXT_PUBLIC_*` |

Do **not** set `PORT` — Railway injects it.

Handyman document storage is disabled safely in production until a private R2/S3
adapter is configured. Do not set `FILE_STORAGE_BACKEND=local` on Railway: local
service files are ephemeral, and the API deliberately rejects that backend when
`ENV=production`. The current storage-related settings are
`FILE_STORAGE_BACKEND`, `FILE_STORAGE_LOCAL_PATH`, and `FILE_STORAGE_MAX_MB`; the
first two are for local development only at this stage.

Deploy. The migration runs by itself (`preDeployCommand`). Check
`https://<backend-domain>/health` → `{"status":"ok"}` and
`https://<backend-domain>/docs`.

### 4. Frontend service

Add a second service from the same repo:

* **Root Directory**: `/frontend`
* **Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend-domain>/api/v1` — the domain from step 3 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | optional; without it maps render as a schematic |

> `NEXT_PUBLIC_*` values are compiled **into the bundle at build time**. Change
> one later and you must **Redeploy**, not Restart — a restart keeps the old
> value baked in.

For the full dispatch map, enable billing and the **Maps JavaScript API**,
**Geocoding API**, and **Routes API** in Google Cloud. Create separate keys:

- frontend key: restrict by HTTP referrer to the Railway frontend domain (and
  localhost for development), and restrict the API to Maps JavaScript API;
- backend key: restrict to the backend environment where possible and allow only
  Geocoding API and Routes API.

After adding either key in Railway, redeploy the corresponding service.

Deploy, then **Networking → Generate Domain**, e.g.
`handyman-front-production.up.railway.app`.

### 5. Close the loop

Go back to the backend and set the real value:

```
CORS_ORIGINS = https://<frontend-domain>
```

No trailing slash, `https://` included, comma-separated if there is more than
one. Saving it redeploys the backend.

### 6. Create the first user

The database is empty, so nobody can sign in yet. From the backend service:

```bash
railway run --service <backend-service> \
  python -m app.create_admin --email you@example.com --password 'a-long-password'
```

Or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` as variables and run
`railway run python -m app.create_admin`. The script writes exactly one user and
nothing else.

Do not run `app.seed` against production. It is intended for local development
and staging demos only. The production `--reset` path is blocked in code even
when `--force` is supplied.

If demo fixtures were accidentally added, first run the read-only preview:

```bash
railway run --service <backend-service> python -m app.cleanup_demo
```

The command matches the exact stable signatures from `app.seed`, rolls its
transaction back, reports counts, and always reports `Users: 0`. Modified rows
and demo customers/handymen that are now referenced by non-demo tasks are kept.

Only after reviewing that dry run, commit the same narrowly scoped cleanup with:

```bash
railway run --service <backend-service> \
  python -m app.cleanup_demo --apply --confirm REMOVE_DEMO_FIXTURES
```

This command is intentionally not part of deployment and must never be run
without an explicit production-data approval.

### 7. Check it

Open `https://<frontend-domain>`, sign in with the account from step 6. Home,
Tasks, Schedule, Handymen and Customers should all load.

---

## Verified before the deploy

The cross-site setup — the part that usually breaks on the first deploy — was
tested locally over HTTPS on two genuinely different hosts (`app.local` and
`api.local`, self-signed certificate):

* login works cross-site, the cookie lands with `Secure; HttpOnly; SameSite=None`
* the session survives a reload (`GET /auth/me` sends the cookie back)
* all screens load, mutations write to the database
* logout actually clears the cookies
* 27 cross-site API calls, zero non-2xx, zero console errors
* CORS answers the configured origin only and ignores everything else

---

## When something goes wrong

| Symptom | Cause |
|---|---|
| Login returns 200 but the app bounces back to `/login` | `ENV` is not `production` on the backend, so the cookie is `SameSite=Lax` and the browser drops it cross-site |
| Browser console: "blocked by CORS policy" | `CORS_ORIGINS` does not exactly match the frontend origin — check the scheme and the missing trailing slash |
| Frontend calls `http://localhost:8000` in production | `NEXT_PUBLIC_API_URL` was set after the build; hit **Redeploy** |
| Backend crash-loops on start | `DATABASE_URL` was pasted as a literal instead of `${{Postgres.DATABASE_URL}}`, or the migration failed — read the Deploy Logs, the `preDeployCommand` output is at the top |
| `/health` fine, everything else 401 | expected: every endpoint except `/health` and `/` requires a session |
| Login says "Invalid email or password" | step 6 was skipped, or the password went through shell history mangling — rerun with `--reset-password` |
