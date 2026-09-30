# Backend conventions

How code is organised in `cholo-api` and the rules every module follows.
Read this before adding a module.

## Architecture: a modular monolith

One deployable, many modules with hard boundaries. Every business capability
is a Nest module under `src/modules/<name>`. Modules talk to each other in
two ways only:

1. **Exported application services**, for synchronous reads and commands that
   must share a transaction. Examples: `InventoryService`, `AuditService`,
   `DocumentCounterService`, `OutboxService`.
2. **Domain events** (`src/common/events/domain-events.ts`), for reactions
   that can happen after commit. Examples: an invoice issued on
   `order.status_changed`, CRM totals updated on `order.placed`.

A module never imports another module's controller, DTO or repository, and
never reaches into another module's tables when that module owns a service
for it.

```
src/
├── main.ts                 bootstrap: security middleware, validation, versioning, swagger
├── instrumentation.ts      OpenTelemetry SDK (loaded first)
├── app.module.ts           wires infrastructure + feature modules, global guards/filter
├── config/                 zod-validated env → typed AppConfig
├── common/                 framework-level building blocks (no business rules)
│   ├── decorators/         @Public @OptionalAuth @Roles @Staff @CurrentUser …
│   ├── guards/             JwtAuthGuard (global), RolesGuard (global)
│   ├── filters/            AllExceptionsFilter → RFC 7807 problem+json
│   ├── errors/             DomainError, NotFoundError, BusinessRuleError, ConflictError …
│   ├── dto/                PageQueryDto, Page<T>, toPage, skipTake
│   ├── events/             domain event names + payload types
│   ├── types/              AuthUser, STAFF_ROLES
│   └── utils/              money (Decimal), text (BD phone, slug, bn digits), retry
├── infrastructure/         technical adapters
│   ├── prisma/             PrismaService (+ tx helper, Tx/Db types)
│   ├── telemetry/          BusinessMetrics (OTel meters), @Traced decorator
│   └── logger/             pino with trace/span ids, redaction
├── platform/               cross-cutting domain services (global)
│   ├── audit/              AuditService.record(entry, tx)
│   ├── counters/           DocumentCounterService.next(tx, scope) → CLO-2042, INV-000001
│   └── outbox/             OutboxService.enqueue(msg, tx)
└── modules/<feature>/
    ├── <feature>.module.ts
    ├── controllers/        <x>.controller.ts (public) · <x>.admin.controller.ts (staff)
    ├── application/        use-case services (orchestration, transactions, events)
    ├── domain/             pure logic, no Nest/Prisma (state machines, calculators): unit tested
    ├── dto/                class-validator request DTOs + response shapes
    ├── mappers/            DB row → API response (Decimal → number, hide internals)
    ├── listeners/          @OnEvent handlers
    └── *.spec.ts           tests next to the code
```

A feature that is really several sub-domains (orders → cart, promotions,
shipping, geo) keeps them as sub-modules in its folder, imported by the parent
module. `app.module.ts` only lists top-level modules.

## HTTP

- URI versioning: `/api/v1/...`. Admin/staff endpoints live under
  `/api/v1/admin/...` and carry a role decorator (`@Staff()`, `@Managers()`,
  `@Finance()`, `@Fulfilment()`, `@Roles(...)`).
- Every route is authenticated unless it has `@Public()`. Guest-capable
  routes (cart, checkout, tracking) use `@OptionalAuth()`.
- Validation: class-validator DTOs; the global `ValidationPipe` runs with
  `whitelist + forbidNonWhitelisted + transform`.
- Errors: throw `DomainError` subclasses with a stable `code`
  (`stock.insufficient`, `coupon.expired`, …) and a user-facing Bangla
  `message`. The filter turns them into `application/problem+json`.
- Lists return `Page<T>` (`items, page, pageSize, total, pages`).
- Money leaves the API as `number` (2dp) via mappers. It never becomes a
  float inside the domain; use `D()`, `sum()`, `allocate()`, `round2()`.
- Swagger: annotate DTOs and add `@ApiTags('Orders · অর্ডার')` per controller.

## Data rules

- Use `prisma.tx(async (tx) => …)` for any multi-write use case. Pass `tx`
  down to `AuditService.record`, `InventoryService.*`,
  `DocumentCounterService.next` and `OutboxService.enqueue`, so that
  everything commits or rolls back together.
- Stock changes only through `InventoryService` (atomic conditional UPDATE +
  ledger row).
- Human numbers only through `DocumentCounterService` (gapless, inside the
  transaction).
- Ledgers (`stock_movements`, `cash_transactions`, `financial_documents`,
  `audit_logs`) are append-only. Correct them with reversing entries.
- Soft-delete (`deletedAt`) for catalog, customers and coupons; filter
  `deletedAt: null` in reads.
- Emit domain events after the transaction resolves:
  `const r = await prisma.tx(...); this.events.emit(Events.X, payload);`
- Record an audit row for every staff mutation (`area`, `summary` in Bangla).

## Observability

- Put `@Traced('orders.place')` on important use cases. It creates a child
  span of the HTTP request and records `cholo_usecase_duration_ms`.
- Count business outcomes with `BusinessMetrics` (low-cardinality labels
  only: no ids, phones or free text).
- Log with Nest's `Logger`. pino adds `trace_id`/`span_id`.

## Testing

- Unit-test every `domain/` file (pure functions: pricing, state machine,
  coupon rules, segmenting).
- `npm test`, `npm run typecheck` and `npm run lint` must pass.

## Related docs

- [Database](database.md): ERD, ledgers, SQL constraints, and how localStorage fields map to tables
- [Observability](observability.md): traces, metric catalogue and label contract, dashboards, alerts
- [Deployment](deployment.md): server setup, CI/CD secrets, TLS, backups, rollback
- [Backend README](../README.md): module map, scripts, environment
