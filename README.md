# Cholo (চলো)

Cholo is a Bangladeshi e-commerce store with three sections: **বই** (books), **ঘরের বাজার** (groceries) and **গ্যাজেট** (gadgets). It takes Cash-on-Delivery and SSLCOMMERZ payments, delivers everywhere in Bangladesh, and includes an admin studio for orders, stock, finance, CRM, content and support chat.

| Path | What it is |
|---|---|
| `frontend/` | Next.js 15 storefront and admin studio (React 19, Redux Toolkit, TanStack Query). Currently stores its data in the browser's localStorage. It is being moved onto the API. |
| `backend/` | `cholo-api`: a NestJS 11 modular monolith with Prisma 6 and PostgreSQL 16. See [backend/README.md](backend/README.md). |
| `ops/` | nginx, OpenTelemetry Collector, Prometheus (rules and alerts), Tempo, Grafana (datasources and dashboards), Loki/Promtail, and the backup and deploy scripts. |
| `.github/` | CI (lint, typecheck, unit and e2e tests, builds, image builds), deployment to a VPS over SSH, and Dependabot. |

## ⚡ One command — run everything locally

Only Docker Desktop is needed (no Node, no Postgres, no `.env`):

```bash
docker compose -f docker-compose.local.yml up --build      # or: make local
```

First run builds both images (a few minutes). Then:

| What | URL |
|---|---|
| Storefront + admin panel | http://localhost:8080 |
| Admin login | `admin@cholo.shop` / `admin123` (customer: `rafi@gmail.com` / `123456`) |
| API docs (Swagger) | http://localhost:8080/api/docs |
| **Grafana** (no login) — home dashboard **API latency by route**, refreshes every 5 s | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Postgres | `localhost:5433` · user/pass/db `cholo` |

It starts, in order: Postgres → migrations → seed (idempotent) → API → web → nginx, plus
OTel Collector → Tempo (traces) + Prometheus (metrics) → Grafana. Stop with `Ctrl+C`;
`docker compose -f docker-compose.local.yml down -v` wipes the data.

> Ports 8080, 4000, 9464, 4318, 3001, 3200, 9090, 5433 must be free — stop `make api`/`make obs-up` first.

## Architecture

```mermaid
flowchart LR
  B[Browser] -->|HTTPS 443| N[nginx<br/>TLS · gzip · security headers · rate limits]
  N -->|/| W[web<br/>Next.js standalone :3000]
  N -->|/api · /uploads| A[api<br/>NestJS :4000]
  N -->|/grafana| G[Grafana]
  A -->|Prisma| P[(PostgreSQL 16)]
  A -.->|OTLP/HTTP traces + metrics| C[OTel Collector]
  C -.->|OTLP gRPC| T[Tempo]
  C -.->|:8889 exporter| PR[Prometheus]
  PR -.->|scrape :9464/metrics| A
  T -.->|span metrics remote_write| PR
  G --> PR
  G --> T
  G -.-> L[Loki<br/>optional]
  PT[Promtail<br/>optional] -.-> L
  subgraph edge network
    N
    W
    A
    G
  end
  subgraph internal network, no published ports
    P
    C
    T
    PR
    L
  end
```

* Only nginx publishes ports (80/443). Grafana is also bound to `127.0.0.1:3001` so you can reach it through an SSH tunnel.
* A one-shot `migrate` container runs `prisma migrate deploy` before `api` starts. An optional `seed` container loads reference data and the demo catalogue.
* Every API log line includes `trace_id`, so from any log line or slow request you can open the full trace (`HTTP → use-case → prisma:query`) in Grafana.

## Quick start

### 1. Local mode (recommended): apps on your machine, observability in Docker

In this mode Postgres, the API and the web app all run directly on your machine. Docker runs only the observability tools: the OTel Collector, Prometheus, Tempo and Grafana.

```
 host                                          docker (docker-compose.observability.yml)
 ─────────────────────────────                 ──────────────────────────────────────────
 Postgres 13+   :5432  (db "cholo")
 API  npm run start:dev :4000 ──OTLP──────────▶ otel-collector :4318 ──▶ tempo :3200
      /metrics         :9464 ◀──scrape (host.docker.internal:9464)── prometheus :9090
 Web  npm run dev      :3000                    grafana :3001 (anonymous admin) ◀─┘
```

**Prerequisites:** Node ≥ 20.11, PostgreSQL 13+ listening on `localhost:5432`, and Docker Desktop (or Docker Engine on Linux) for the observability containers.

**Step 1 — Database (once).** Skip `createdb` if the `cholo` database already exists.

```bash
createdb cholo
```

**Step 2 — Backend environment (once).**

```bash
cd backend && cp .env.example .env
```

Edit `backend/.env` so it contains exactly these values. Replace `faruk` with your Postgres user and add `:password` after it if your user has one.

```dotenv
NODE_ENV=development
PORT=4000
API_PREFIX=api
CORS_ORIGINS=http://localhost:3000
PUBLIC_WEB_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:4000
DATABASE_URL=postgresql://faruk@localhost:5432/cholo?schema=public
DIRECT_URL=postgresql://faruk@localhost:5432/cholo?schema=public
JWT_ACCESS_SECRET=local-dev-secret-local-dev-secret-local-dev
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
ADMIN_BOOTSTRAP_EMAIL=admin@cholo.shop
ADMIN_BOOTSTRAP_PASSWORD=admin123
SSLCOMMERZ_STORE_ID=testbox
SSLCOMMERZ_STORE_PASSWORD=qwerty
SSLCOMMERZ_SANDBOX=true
# observability (local mode)
OTEL_ENABLED=true
OTEL_SERVICE_NAME=cholo-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_PROMETHEUS_PORT=9464
LOG_LEVEL=info
```

Do not leave a variable present but empty, such as `OTEL_EXPORTER_OTLP_ENDPOINT=`. Env validation rejects empty values. Delete the line instead.

**Step 3 — Install, migrate and seed.**

```bash
make install        # npm ci in backend and frontend
make migrate        # prisma migrate deploy (no-op if the DB is already migrated)
make seed           # idempotent: geo, catalogue, coupons, settings, demo users
```

**Step 4 — Start observability.**

```bash
make obs-up
```

This is the same as `docker compose -f docker-compose.observability.yml up -d`.

**Step 5 — Run the apps, each in its own terminal.**

```bash
make api            # http://localhost:4000/api/v1 · Swagger /api/docs · metrics :9464/metrics
make web            # http://localhost:3000 (admin studio at /admin)
```

**Step 6 — Check that it works.**

```bash
curl -s localhost:4000/api/v1/health/ready                      # {"status":"ok",…}
curl -s localhost:9464/metrics | grep http_server_request_duration_count | head -3
open http://localhost:9090/targets                              # job "cholo-api" should be UP
open http://localhost:3001                                      # Grafana, no login
```

Grafana opens on **Cholo › API latency by route**. That dashboard refreshes every 5s over the last 15 minutes and shows:

* p50, p95 and p99 per route and method, as a table and as time series
* request rate and 5xx rate per route
* the slowest routes
* `@Traced` use-case latency
* Tempo traces (click a ◆ exemplar or a route to open its traces)

Other dashboards: **Cholo API · RED**, **Cholo Business**, **Node runtime**.

Generate some traffic to see the panels move:

```bash
for i in $(seq 50); do
  curl -s -o /dev/null -XPOST localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
    -d '{"identifier":"admin@cholo.shop","password":"admin123"}'
  curl -s -o /dev/null localhost:4000/api/v1/health/ready
done
```

(The login route allows 10 requests per minute per IP. Requests beyond that show up as 429s in the error panels.)

**Stop:** `Ctrl-C` in the API and web terminals, then `make obs-down`. The observability data is kept in Docker volumes.

**Troubleshooting**

| Symptom | Fix |
|---|---|
| Prometheus target `cholo-api` is DOWN | Check that the API is running and `OTEL_ENABLED=true`. `curl localhost:9464/metrics` must work on the host. On Linux, `host.docker.internal` comes from the `extra_hosts: host-gateway` entry, and a host firewall must allow port 9464 from the docker bridge. |
| API crashes at boot with `TypeError: events is not iterable` (`@prisma/instrumentation`) | The installed `@prisma/instrumentation` must match Prisma 6: `cd backend && npm i @prisma/instrumentation@^6.19.0`. As a stopgap, set `OTEL_ENABLED=false`. |
| No traces in Tempo | Check `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` and `docker compose -f docker-compose.observability.yml logs otel-collector`. |
| Port 4318, 9090 or 3001 already in use | The full Docker stack (`make up`) uses the same ports. Run only one of the two modes at a time. |

Demo logins, created by the seed outside production:

| Role | Login | Password |
|---|---|---|
| OWNER (admin studio) | `admin@cholo.shop` | `admin123` |
| Customer | `rafi@gmail.com` or `01711111111` | `123456` |

Run `make help` to see every task: `make api`, `make web`, `make seed`, `make obs-up`, `make up`, `make e2e` and more.

### 2. Full stack with Docker

```bash
make up             # cp .env.example .env (if missing) + dev overlay build → http://localhost:8080
make seed-docker    # seed the containerised database (demo users included)
```

`make up` is the same as `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d`. It runs its own Postgres, published on `localhost:5433`, so it does not touch your local database.

In the dev overlay the API runs `nest start --watch` from `./backend`, so it reloads when you edit code. Every service port is published on localhost, and Grafana logs you in automatically as an anonymous admin.

Production-like, using images from GHCR:

```bash
docker compose pull && docker compose up -d
docker compose --profile seed run --rm seed        # reference data (demo users only if SEED_DEMO_USERS=true)
docker compose --profile logs up -d                # optional Loki + Promtail
```

### URLs (dev overlay)

| What | URL |
|---|---|
| Storefront via nginx | http://localhost:8080 |
| Storefront direct | http://localhost:3000 |
| Admin studio | http://localhost:8080/admin |
| API | http://localhost:8080/api/v1 (direct: http://localhost:4000/api/v1) |
| Swagger (non-production only) | http://localhost:4000/api/docs |
| Health | `/api/v1/health/live`, `/api/v1/health/ready` |
| Grafana | http://localhost:8080/grafana/ or http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Tempo | http://localhost:3200 |
| API metrics | http://localhost:9464/metrics |
| Postgres | `localhost:5433` (user/db from `.env`) |

## Seeding

`backend/prisma/seed/seed.ts` loads the committed JSON snapshots in `backend/prisma/seed/data/`, so neither the seed nor the Docker image needs the frontend source. It upserts:

* Geography (divisions, districts, upazilas, unions)
* Shipping zones and rules
* Sections, categories, authors and brands
* Products with an opening stock ledger entry, and bundles
* Couriers, cash accounts and document counters
* Coupons, the ticker, the promo popup, hero slides and canned replies
* Store settings, tags and users

It is safe to re-run. By default it only inserts rows that are missing. With `SEED_FORCE=true` it also refreshes catalogue copy, prices and settings, but it never changes stock, counters or passwords. After you change the frontend's demo data, run `npx ts-node --transpile-only prisma/seed/export-frontend-data.ts` to regenerate the snapshots.

## Docs

* [backend/README.md](backend/README.md): module map, scripts and environment variables
* [backend/docs/conventions.md](backend/docs/conventions.md): rules every backend module follows
* [backend/docs/database.md](backend/docs/database.md): ERD, ledgers, constraints, and how localStorage fields map to tables
* [backend/docs/observability.md](backend/docs/observability.md): traces, metric catalogue, dashboards, alerts and runbooks
* [backend/docs/deployment.md](backend/docs/deployment.md): server setup, secrets, TLS, backups, rollback

## CI/CD at a glance

* **`ci.yml`** runs on every PR and push. Path filters skip unrelated jobs.
  * backend: lint, typecheck, unit tests with coverage, migrations and a double seed against `postgres:16`, then e2e tests
  * frontend: `tsc` and `next build`
  * ops: `compose config`, `promtool`, `otelcol validate`, `shellcheck`
  * Docker: image build check with the GHA cache
* **`deploy.yml`** runs on push to `main` or manually. It runs CI, pushes `ghcr.io/<owner>/cholo-api|cholo-web:sha-xxxxxxx` and `:latest`, then deploys over SSH to the `production` environment (where required reviewers can gate it). On the server it migrates, starts the stack and checks health, and rolls back automatically if the checks fail. Required secrets are listed in [deployment.md](backend/docs/deployment.md#github-configuration).
