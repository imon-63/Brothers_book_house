# cholo-api

The commerce API behind the Cholo (চলো) storefront and admin studio. It is a NestJS 11 modular monolith using Prisma 6 and PostgreSQL 16, with OpenTelemetry built in.

* Base URL: `/api/v1` (URI versioning). Staff endpoints live under `/api/v1/admin/...`.
* Errors are returned as RFC 7807 `application/problem+json` with a stable `code` and a Bangla `detail`.
* OpenAPI/Swagger is served at **`/api/docs`** outside production.
* Read [docs/conventions.md](docs/conventions.md) before adding code.

## Module map

```
src/
├── main.ts / instrumentation.ts      bootstrap (helmet, CORS, validation, versioning, swagger) · OTel SDK
├── config/                           zod-validated env → AppConfig
├── common/                           guards, decorators, problem+json filter, errors, money/text utils
├── infrastructure/                   prisma (tx helper) · telemetry (BusinessMetrics, @Traced) · pino logger
├── platform/                         audit · document counters (CLO-/INV-/…) · notification outbox
└── modules/
    ├── health          /health/live, /health/ready (terminus: DB ping + heap)
    ├── auth            register, login (email/phone), refresh rotation with reuse detection, password reset (OTP)
    ├── staff           staff users and roles (OWNER, ADMIN, MANAGER, SUPPORT, ACCOUNTANT, WAREHOUSE)
    ├── catalog         sections, categories, authors, products, bundles, deals, effective price
    ├── inventory       InventoryService: atomic stock changes and the stock_movements ledger
    ├── customers       CRM (phone-keyed), addresses, notes, tags, wishlist
    ├── orders          cart, checkout, promotions/coupons, shipping rules and zones, geo, order lifecycle
    ├── payments        SSLCOMMERZ init/IPN/validation, refunds, payment events
    ├── finance         invoices/receipts/credit notes, cashbook, purchases, suppliers
    ├── reviews         product reviews and moderation
    ├── support         chat conversations, canned replies
    ├── content         announcements, hero slides, promo popup, store settings
    ├── notifications   staff notifications, outbox delivery worker (SMS/email)
    ├── reports         dashboards, sales/profit reports
    └── activity        audit feed for the admin studio
```

Modules talk to each other only through exported services and domain events. See [conventions](docs/conventions.md#architecture-a-modular-monolith).

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | Watch mode on :4000 |
| `npm run build` / `npm start` | `nest build`, then `node dist/main.js` |
| `npm run lint` · `npm run typecheck` | ESLint over `src` and `test`, and `tsc --noEmit` |
| `npm test` · `npm run test:cov` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | e2e tests in `test/*.e2e-spec.ts`. They boot the real `AppModule` against `DATABASE_URL`, which must be migrated and seeded. |
| `npm run db:migrate` | `prisma migrate dev` (create a migration) |
| `npm run db:deploy` | `prisma migrate deploy` (apply migrations; what the `migrate` container runs) |
| `npm run db:seed` | Idempotent seed (`prisma/seed/seed.ts`) |
| `npm run db:reset` | Drop and recreate the dev DB. **Never run this against production.** |

The seed data comes from JSON snapshots of the frontend (`prisma/seed/data/*.json`). If the frontend's demo data changes, regenerate them with `npx ts-node --transpile-only prisma/seed/export-frontend-data.ts` and commit the result.

Seed switches:

| Variable | Effect |
|---|---|
| `SEED_FORCE=true` | Also refresh copy, prices and settings on rows that already exist. Stock, counters and passwords are never touched. |
| `NODE_ENV=production` | No demo passwords. The OWNER password comes from `SEED_ADMIN_PASSWORD` or `ADMIN_BOOTSTRAP_PASSWORD`. |
| `SEED_DEMO_USERS=true` | Also create the demo customer in production. |
| `SEED_DATA_DIR` | Read the JSON snapshots from somewhere else. |

## Environment

All variables are validated at boot in `src/config/env.ts`, and the process refuses to start if they are invalid. See `.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `test` disables OTel and the OWNER bootstrap; `production` disables Swagger. |
| `PORT` · `API_PREFIX` | `4000` · `api` | |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list |
| `PUBLIC_WEB_URL` · `PUBLIC_API_URL` | localhost | Used for gateway callbacks and links in messages |
| `DATABASE_URL` | required | May point at PgBouncer |
| `DIRECT_URL` | = `DATABASE_URL` | Direct connection used by `prisma migrate` |
| `JWT_ACCESS_SECRET` | required, at least 32 characters | |
| `JWT_ACCESS_TTL` · `JWT_REFRESH_TTL_DAYS` | `15m` · `30` | |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | – | On first boot, creates an OWNER if none exists |
| `SSLCOMMERZ_STORE_ID` / `_PASSWORD` / `_SANDBOX` | `testbox` / `qwerty` / `true` | |
| `OTEL_ENABLED` · `OTEL_SERVICE_NAME` | `true` · `cholo-api` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | – | e.g. `http://otel-collector:4318` (traces, plus metrics push) |
| `OTEL_PROMETHEUS_PORT` | `9464` | Prometheus scrape endpoint `/metrics` |
| `LOG_LEVEL` | `info` | pino log level |

## Docker

`Dockerfile` is a multi-stage build: `deps`, then `build` (`prisma generate`, `nest build`, compiled seed), then `runtime`. The runtime stage runs `node:20-alpine` as a non-root user with `tini` as PID 1 and has a `HEALTHCHECK` on `/api/v1/health/live`. The same image serves three roles:

```bash
docker run … cholo-api                                   # API (:4000, metrics :9464)
docker run … cholo-api npx prisma migrate deploy         # migrate
docker run … cholo-api node seed/seed.js                 # seed
```

The build arg `APP_VERSION` becomes the `APP_VERSION` env var, which is reported as `service.version` on traces.

## More

* [docs/database.md](docs/database.md): ERD, ledgers, constraints, and how localStorage fields map to tables
* [docs/observability.md](docs/observability.md): what is traced, the metric catalogue, dashboards and alerts
* [docs/deployment.md](docs/deployment.md): servers, secrets, TLS, backups and rollback
