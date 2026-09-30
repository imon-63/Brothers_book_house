# Observability

The API sends three kinds of telemetry:

| Signal | Source | Path | Stored in |
|---|---|---|---|
| Traces | OTel NodeSDK (`src/instrumentation.ts`) | OTLP/HTTP → collector `:4318` → tail sampling → Tempo | Tempo (7 days by default) |
| Metrics | OTel meters (SDK, runtime, business) | Prometheus pull on `api:9464/metrics` (job `cholo-api`), plus an OTLP push copy via the collector (`job="otel-collector"`, `exported_job="cholo-api"`) | Prometheus (30 days) |
| Logs | pino JSON on stdout, carrying `trace_id`/`span_id` | Promtail → Loki (optional `--profile logs`) | Loki (14 days) |

Dashboards and alerts always select **`job="cholo-api"`** (the direct scrape). The OTLP copy that comes through the collector is ignored, so nothing is counted twice.

## What is traced

Every trace is `HTTP span → @Traced use-case span → prisma:* spans / pg`. Instrumentation comes from:

* **Auto-instrumentation** (`@opentelemetry/auto-instrumentations-node`): http, express, nestjs-core, pg, pino, and runtime-node (event loop, heap and GC metrics). `fs`, `dns` and `net` are off. Health probes and `/metrics` are not traced.
* **`@prisma/instrumentation`**: `prisma:client:operation`, `prisma:engine:query` and similar, with the query text.
* **`@Traced('orders.place')`** on application services: creates a child span and records `cholo_usecase_duration_ms{usecase,outcome}`.
* **Errors**: the problem+json filter records the exception on the active span for 5xx responses and returns `traceId` in the response body. Support can paste that id straight into Tempo.

### Sampling

The collector's `tail_sampling` processor keeps:

* every trace with an error
* every trace slower than 800 ms
* every trace on `/api/v1/orders*`, `/payments*` or `/checkout*`
* `TRACE_SAMPLE_PCT` percent of everything else (25% in production, 100% locally)

## Metric catalogue

### HTTP (instrumentation-http 0.222, verified in `node_modules`)

On `:9464` the JavaScript Prometheus exporter adds **no unit suffix**:

| Series | Unit | Labels |
|---|---|---|
| `http_server_request_duration_bucket` / `_sum` / `_count` | seconds | `http_route` (e.g. `/api/v1/auth/login`; missing for unmatched URLs), `http_request_method`, `http_response_status_code`, `url_scheme`, `network_protocol_version`, `error_type` (on failures) |

This SDK version emits only the stable semantic-convention metric. The recording rules in `ops/prometheus/rules/recording.yml` also accept the older spelling `http_server_duration` (ms, with `http_method`/`http_status_code` labels) and the collector-suffixed names (`http_server_request_duration_seconds_*`, `http_server_duration_milliseconds_*`), so the dashboards keep working if the SDK or exporter changes.

**Recording rules**

| Rule | Meaning |
|---|---|
| `cholo:http_requests:rate5m{route,method,status}` | Request rate per route, method and status |
| `cholo:http_error_ratio_5xx:5m` | Overall 5xx ratio |
| `cholo:http_latency_seconds:p95` / `:p99` | Overall latency quantiles |
| `cholo:http_route_latency_seconds:p95{route,method}` | p95 per route |
| `cholo:payment_failure_ratio:15m` | Share of failed gateway payments |
| `cholo:usecase_latency_ms:p95{usecase}` | p95 per use-case |

### Business (`src/infrastructure/telemetry/metrics.service.ts`)

Labels must stay **low-cardinality**. The label names below are what the dashboards and alerts expect, so module owners should use exactly these.

| Metric | Type | Labels (contract) |
|---|---|---|
| `cholo_orders_placed_total` | counter | `payment_method` (COD, SSLCOMMERZ…), `section` (book/food/gadget) |
| `cholo_order_value_bdt` | histogram (৳; buckets 100…10000) | `payment_method` |
| `cholo_order_status_transitions_total` | counter | `from`, `to` (OrderStatus) |
| `cholo_checkout_failures_total` | counter | `reason` (`stock`, `coupon`, `validation`, `blocked`, `shipping`, `internal`) |
| `cholo_payments_total` | counter | `provider`, `status` (`initiated`, `success`, `failed`, `cancelled`, `expired`, lowercase) |
| `cholo_payment_value_bdt` | histogram | `provider` |
| `cholo_stock_movements_total` | counter | `type` (StockMovementType) |
| `cholo_auth_events_total` | counter | `event` (`login`, `login_failed`, `refresh`, `refresh_reuse`, `logout`, `register`), `role` |
| `cholo_outbox_deliveries_total` | counter | `channel` (SMS/EMAIL…), `result` (`sent`, `failed`, `retry`) |
| `cholo_orders_open` | up-down counter | `section` |
| `cholo_usecase_duration_ms` | histogram (ms) | `usecase` (span name), `outcome` (`ok`/`error`) |

### Runtime (instrumentation-runtime-node)

| Metric | Labels / notes |
|---|---|
| `v8js_memory_heap_used`, `v8js_memory_heap_limit`, `v8js_memory_heap_space_*` | `v8js_heap_space_name` |
| `nodejs_eventloop_delay_{min,max,mean,stddev,p50,p90,p99}` | seconds |
| `nodejs_eventloop_utilization`, `nodejs_eventloop_time` | |
| `v8js_gc_duration_{bucket,sum,count}` | `v8js_gc_type` |

### Host (collector `hostmetrics`)

`system_cpu_utilization`, `system_cpu_load_average_*`, `system_memory_usage`, `system_filesystem_usage`, `system_network_io`. These carry the label `job="otel-collector"`.

### Tempo span metrics (via remote_write, with exemplars)

`traces_spanmetrics_latency_bucket`, `traces_spanmetrics_calls_total`, `traces_service_graph_request_total`, labelled with `service`, `span_name`, `span_kind` and `http_route`.

## Dashboards (Grafana › folder "Cholo")

| Dashboard | Use it for |
|---|---|
| **API latency by route** (`cholo-api-latency`, home) | Real time: refreshes every 5s, last 15 minutes, with an adjustable rate window. Shows a per-route table (req/s, p50/p95/p99, 5xx %), sorted by p95 with links to that route's traces; p50/p95/p99 time series per route and method; the top-10 slowest routes; request and error rate per route; 4xx/5xx by status; a latency heatmap; use-case p95 with a table; span-metric p95 with ◆ exemplars; and the slowest Tempo traces. |
| **Cholo API · RED** (`cholo-api-red`) | Rate, errors and duration over hours or days, using the recording rules. Also recent error traces and traces slower than 800 ms. |
| **Cholo Business** (`cholo-business`) | Orders by payment method and section, GMV and average order value, order value heatmap, status transitions, checkout failures by reason, payments by status, stock movements, auth events, outbox, use-case p95 and error rate. |
| **Node runtime** (`cholo-node-runtime`) | Heap vs limit, heap by space, event-loop delay and utilisation, GC, host CPU/load/memory/disk/network, and the telemetry pipeline's own health. |

The dashboards are generated from `ops/grafana/generate-dashboards.js`. Edit the generator, run `make dashboards`, and commit the JSON. CI fails if the two are out of sync. Provisioned dashboards are read-only in the UI.

## Alerts (`ops/prometheus/rules/alerts.yml`)

| Alert | Condition | Severity |
|---|---|---|
| <a id="choloapidown"></a>`CholoApiDown` | `up{job="cholo-api"} == 0` or the target is absent, for 2m | page |
| <a id="cholohigh5xxrate"></a>`CholoHigh5xxRate` | 5xx ratio > 2% over 5m (with > 0.05 req/s) | page |
| <a id="cholohighlatencyp95"></a>`CholoHighLatencyP95` | p95 > 800 ms for 10m | ticket |
| <a id="cholocheckoutfailuresspike"></a>`CholoCheckoutFailuresSpike` | > 10 failures in 10m and more than 3× the 6h baseline | page |
| <a id="cholopaymentfailureratiohigh"></a>`CholoPaymentFailureRatioHigh` | > 25% of gateway payments failed over 15m (≥ 8 attempts) | page |
| <a id="cholooutboxfailures"></a>`CholoOutboxFailures` | > 5 failed deliveries in 15m | ticket |
| `CholoNoOrdersForLong` | No orders for 3h during 09–23 Dhaka time | ticket |
| `CholoHeapHigh` | heap > 85% of the V8 limit for 10m | ticket |
| `CholoEventLoopLag` | event-loop p99 > 200 ms for 5m | ticket |
| `CholoHostDiskFilling` | a filesystem > 85% full | page |
| `CholoOtelCollectorRefusing` | the collector is dropping spans | ticket |

To route alerts, point `alerting.alertmanagers` in `prometheus.yml` at an Alertmanager, or import the rules into Grafana Alerting with a Telegram, Slack or email contact point.

**Runbooks (short)**

* **API down.** Run `docker compose ps api` and `docker compose logs --tail=200 api`, then `curl` `/api/v1/health/ready` from the nginx container. The usual causes are a bad env value (the process refuses to boot and prints `Invalid environment configuration`), the database being unreachable, or OOM. Roll back if the problem started with a deploy (see [deployment.md](deployment.md#rollback)).
* **5xx.** In RED, open **4xx/5xx by route** and find the route. In Tempo, run `{ resource.service.name="cholo-api" && status=error }`. The span's exception event has the stack trace.
* **Latency.** In **API latency by route**, find the slow route in the table, click a ◆ exemplar or the route link, and read the span waterfall. See the next section.
* **Checkout failures.** In **Cholo Business**, look at checkout failures by reason. `stock` or `coupon` spikes are business events (a sale ended, stock ran out). `validation` or `internal` spikes usually mean a regression.
* **Payments.** Check the SSLCOMMERZ status and credentials, and whether IPN callbacks reach `/api/v1/payments/…` (nginx access log). Then `SELECT event_type, error, count(*) FROM payment_events WHERE received_at > now() - interval '1 hour' GROUP BY 1,2;`
* **Outbox.** `SELECT template, last_error, count(*) FROM notification_outbox WHERE status='FAILED' GROUP BY 1,2;`

## How to find a slow checkout trace

1. Open Grafana → **API latency by route**. Pick the route `POST /api/v1/orders` (or whatever the checkout route is called) from the Route variable, or find it at the top of the table sorted by p95.
2. Either:
   * click the route name in the table ("Traces for this route"), which opens Explore with `{resource.service.name="cholo-api" && span.http.route="…"}`; or
   * on **p95 by route from span metrics**, hover over a ◆ exemplar in the spike and click **Query with Tempo**.
3. In the trace waterfall, compare `orders.place` (the use-case span) with its children:
   * many sequential `prisma:engine:query` spans point to an N+1 query, so batch them;
   * a single long query needs an index (check `EXPLAIN`, and `pg_stat_statements` in Postgres);
   * a long gap with no child spans means CPU work or a slow external call (SSLCOMMERZ init shows up as an outgoing `POST` HTTP span).
4. From the trace, **Logs for this span** jumps to Loki (`{service="api"} | trace_id="…"`) when the logs profile is running.
5. A customer who reports an error can give support the `traceId` from the problem+json body. Paste it into Tempo's search.

Shortcut in Explore → Tempo: `{ resource.service.name="cholo-api" && name="orders.place" && duration > 1s }`

## Local mode

Run `make obs-up` (see the root README). Prometheus scrapes the API on the host at `host.docker.internal:9464` every 5s, the collector listens on `localhost:4318`, and Grafana is at `http://localhost:3001` with anonymous admin access.
