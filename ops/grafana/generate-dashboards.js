/* Generates ops/grafana/dashboards/*.json — edit here, then `node ops/grafana/generate-dashboards.js`. */
const fs = require('fs');
const OUT = require('path').join(__dirname, 'dashboards');
const P = { type: 'prometheus', uid: 'prometheus' };
const T = { type: 'tempo', uid: 'tempo' };
let id = 1;
function panel(type, title, gridPos, targets, extra = {}) {
  return { id: id++, type, title, gridPos, datasource: P, targets: targets.map((t, i) => ({ datasource: P, refId: String.fromCharCode(65 + i), ...t })), ...extra };
}
const ts = (title, gp, targets, unit, extra = {}) =>
  panel('timeseries', title, gp, targets, {
    fieldConfig: { defaults: { unit, custom: { lineWidth: 2, fillOpacity: 8, showPoints: 'never' } }, overrides: [] },
    options: { legend: { displayMode: 'table', placement: 'bottom', calcs: ['mean', 'max', 'lastNotNull'] }, tooltip: { mode: 'multi', sort: 'desc' } },
    ...extra,
  });
const stat = (title, gp, expr, unit, thresholds, extra = {}) =>
  panel('stat', title, gp, [{ expr, instant: false }], {
    fieldConfig: { defaults: { unit, thresholds: { mode: 'absolute', steps: thresholds }, color: { mode: 'thresholds' } }, overrides: [] },
    options: { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'background', graphMode: 'area', textMode: 'value' },
    ...extra,
  });
const row = (title, y) => ({ id: id++, type: 'row', title, collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, panels: [] });
const green = (v2, v3) => [{ color: 'green', value: null }, { color: 'orange', value: v2 }, { color: 'red', value: v3 }];
function dash(uid, title, tags, panels, templating = [], links = []) {
  return {
    uid, title, tags, editable: false, schemaVersion: 39, version: 1, refresh: '30s', timezone: 'browser',
    time: { from: 'now-6h', to: 'now' }, graphTooltip: 1,
    annotations: { list: [{ builtIn: 1, datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)', name: 'Annotations & Alerts', type: 'dashboard' }] },
    templating: { list: templating }, links: [{ title: 'Cholo dashboards', type: 'dashboards', tags: ['cholo'], asDropdown: true }, ...links], panels,
  };
}
const routeVar = { name: 'route', label: 'Route', type: 'query', datasource: P, query: { query: 'label_values(cholo:http_requests:rate5m, route)', refId: 'q' }, definition: 'label_values(cholo:http_requests:rate5m, route)', includeAll: true, multi: true, current: { text: 'All', value: '$__all' }, refresh: 2, sort: 1, allValue: '.*' };
const instVar = { name: 'instance', label: 'Instance', type: 'query', datasource: P, query: { query: 'label_values(up{job="cholo-api"}, instance)', refId: 'q' }, definition: 'label_values(up{job="cholo-api"}, instance)', includeAll: true, multi: true, current: { text: 'All', value: '$__all' }, refresh: 2, allValue: '.*' };

// ─────────── (a) RED ───────────
id = 1;
const NEW_B = 'rate(http_server_request_duration_bucket{job="cholo-api"}[$__rate_interval]) or rate(http_server_request_duration_seconds_bucket[$__rate_interval])';
const OLD_B = 'rate(http_server_duration_bucket{job="cholo-api"}[$__rate_interval]) or rate(http_server_duration_milliseconds_bucket[$__rate_interval])';
const q = (p) => `histogram_quantile(${p}, sum by (le) (${NEW_B}))\nor\nhistogram_quantile(${p}, sum by (le) (${OLD_B})) / 1000`;
const qRoute = (p) => `histogram_quantile(${p}, sum by (le, http_route, http_request_method) (${NEW_B.replace(/\{job="cholo-api"\}/, '{job="cholo-api",http_route=~"$route"}').replace('seconds_bucket[', 'seconds_bucket{http_route=~"$route"}[')}))\nor\nmax without (http_method) (label_replace(histogram_quantile(${p}, sum by (le, http_route, http_method) (${OLD_B.replace(/\{job="cholo-api"\}/, '{job="cholo-api",http_route=~"$route"}').replace('milliseconds_bucket[', 'milliseconds_bucket{http_route=~"$route"}[')})) / 1000, "http_request_method", "$1", "http_method", "(.*)"))`;
const red = dash('cholo-api-red', 'Cholo API · RED', ['cholo', 'api', 'red'], [
  row('Overview', 0),
  stat('Requests / s', { h: 4, w: 6, x: 0, y: 1 }, 'sum(cholo:http_requests:rate5m{route=~"$route"})', 'reqps', [{ color: 'blue', value: null }]),
  stat('5xx ratio', { h: 4, w: 6, x: 6, y: 1 }, 'sum(cholo:http_requests:rate5m{route=~"$route",status=~"5.."}) / clamp_min(sum(cholo:http_requests:rate5m{route=~"$route"}), 1e-9)', 'percentunit', green(0.01, 0.02)),
  stat('p95 latency', { h: 4, w: 6, x: 12, y: 1 }, 'cholo:http_latency_seconds:p95', 's', green(0.4, 0.8)),
  stat('API targets up', { h: 4, w: 6, x: 18, y: 1 }, 'sum(up{job="cholo-api"})', 'none', [{ color: 'red', value: null }, { color: 'green', value: 1 }]),
  row('Rate', 5),
  ts('Request rate by route', { h: 8, w: 12, x: 0, y: 6 }, [{ expr: 'sum by (route) (cholo:http_requests:rate5m{route=~"$route"})', legendFormat: '{{route}}' }], 'reqps'),
  ts('Request rate by method / status class', { h: 8, w: 12, x: 12, y: 6 }, [{ expr: 'sum by (method, class) (label_replace(cholo:http_requests:rate5m{route=~"$route"}, "class", "${1}xx", "status", "(\\\\d).."))', legendFormat: '{{method}} {{class}}' }], 'reqps'),
  row('Errors', 14),
  ts('Error ratio (5xx) by route', { h: 8, w: 12, x: 0, y: 15 }, [{ expr: 'sum by (route) (cholo:http_requests:rate5m{route=~"$route",status=~"5.."}) / clamp_min(sum by (route) (cholo:http_requests:rate5m{route=~"$route"}), 1e-9)', legendFormat: '{{route}}' }], 'percentunit',
    { fieldConfig: { defaults: { unit: 'percentunit', custom: { lineWidth: 2, fillOpacity: 8, showPoints: 'never', thresholdsStyle: { mode: 'line' } }, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.02 }] } }, overrides: [] } }),
  ts('4xx / 5xx per second by route + status', { h: 8, w: 12, x: 12, y: 15 }, [{ expr: 'sum by (route, status) (cholo:http_requests:rate5m{route=~"$route",status=~"[45].."})', legendFormat: '{{status}} {{route}}' }], 'reqps'),
  row('Duration', 23),
  ts('Latency p50 / p95 / p99 (all routes)', { h: 8, w: 12, x: 0, y: 24 }, [
    { expr: q(0.5), legendFormat: 'p50' }, { expr: q(0.95), legendFormat: 'p95' }, { expr: q(0.99), legendFormat: 'p99' },
  ], 's'),
  ts('p95 by route · method', { h: 8, w: 12, x: 12, y: 24 }, [{ expr: qRoute(0.95), legendFormat: '{{http_request_method}} {{http_route}}' }], 's'),
  ts('p99 by route · method', { h: 8, w: 12, x: 0, y: 32 }, [{ expr: qRoute(0.99), legendFormat: '{{http_request_method}} {{http_route}}' }], 's'),
  ts('p50 by route · method', { h: 8, w: 12, x: 12, y: 32 }, [{ expr: qRoute(0.5), legendFormat: '{{http_request_method}} {{http_route}}' }], 's'),
  row('Traces (Tempo span metrics — click an exemplar dot to open the trace)', 40),
  ts('Span-metrics p95 by route (with exemplars)', { h: 8, w: 12, x: 0, y: 41 }, [{ expr: 'histogram_quantile(0.95, sum by (le, http_route) (rate(traces_spanmetrics_latency_bucket{service="cholo-api",span_kind="SPAN_KIND_SERVER"}[$__rate_interval])))', legendFormat: '{{http_route}}', exemplar: true }], 's'),
  { id: id++, type: 'table', title: 'Slowest recent traces (> 800ms)', gridPos: { h: 8, w: 12, x: 12, y: 41 }, datasource: T,
    targets: [{ datasource: T, refId: 'A', queryType: 'traceql', query: '{ resource.service.name = "cholo-api" && kind = server && duration > 800ms }', limit: 20, tableType: 'traces' }] },
  { id: id++, type: 'table', title: 'Recent error traces', gridPos: { h: 8, w: 24, x: 0, y: 49 }, datasource: T,
    targets: [{ datasource: T, refId: 'A', queryType: 'traceql', query: '{ resource.service.name = "cholo-api" && status = error }', limit: 20, tableType: 'traces' }] },
], [routeVar], [{ title: 'Explore traces', type: 'link', url: '/explore?left=%7B%22datasource%22:%22tempo%22%7D', targetBlank: true }]);

// ─────────── (b) Business ───────────
id = 1;
const inc = (m, by, extra = '') => `sum by (${by}) (increase(${m}{job="cholo-api"${extra}}[$__rate_interval]))`;
const biz = dash('cholo-business', 'Cholo Business', ['cholo', 'business'], [
  row('Orders', 0),
  stat('Orders (range)', { h: 4, w: 6, x: 0, y: 1 }, 'sum(increase(cholo_orders_placed_total{job="cholo-api"}[$__range]))', 'none', [{ color: 'blue', value: null }], { options: { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'value', graphMode: 'none' } }),
  stat('GMV ৳ (range)', { h: 4, w: 6, x: 6, y: 1 }, 'sum(increase(cholo_order_value_bdt_sum{job="cholo-api"}[$__range]))', 'currencyBDT', [{ color: 'green', value: null }], { options: { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'value', graphMode: 'none' } }),
  stat('Avg order ৳', { h: 4, w: 6, x: 12, y: 1 }, 'sum(increase(cholo_order_value_bdt_sum{job="cholo-api"}[$__range])) / clamp_min(sum(increase(cholo_order_value_bdt_count{job="cholo-api"}[$__range])), 1)', 'currencyBDT', [{ color: 'green', value: null }], { options: { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'value', graphMode: 'none' } }),
  stat('Payment failure ratio (15m)', { h: 4, w: 6, x: 18, y: 1 }, 'cholo:payment_failure_ratio:15m', 'percentunit', green(0.1, 0.25)),
  ts('Orders placed by payment method', { h: 8, w: 12, x: 0, y: 5 }, [{ expr: inc('cholo_orders_placed_total', 'payment_method'), legendFormat: '{{payment_method}}' }], 'none', { fieldConfig: { defaults: { unit: 'none', custom: { drawStyle: 'bars', fillOpacity: 70, stacking: { mode: 'normal' } } }, overrides: [] } }),
  ts('Orders placed by section', { h: 8, w: 12, x: 12, y: 5 }, [{ expr: inc('cholo_orders_placed_total', 'section'), legendFormat: '{{section}}' }], 'none', { fieldConfig: { defaults: { unit: 'none', custom: { drawStyle: 'bars', fillOpacity: 70, stacking: { mode: 'normal' } } }, overrides: [] } }),
  { id: id++, type: 'heatmap', title: 'Order value distribution (৳)', gridPos: { h: 8, w: 12, x: 0, y: 13 }, datasource: P,
    targets: [{ datasource: P, refId: 'A', expr: 'sum by (le) (increase(cholo_order_value_bdt_bucket{job="cholo-api"}[$__rate_interval]))', format: 'heatmap', legendFormat: '{{le}}' }],
    options: { calculate: false, yAxis: { unit: 'currencyBDT' }, color: { scheme: 'Oranges', mode: 'scheme' }, cellGap: 1 } },
  ts('Order status transitions', { h: 8, w: 12, x: 12, y: 13 }, [{ expr: inc('cholo_order_status_transitions_total', 'from, to'), legendFormat: '{{from}} → {{to}}' }], 'none'),
  row('Checkout & payments', 21),
  ts('Checkout failures by reason', { h: 8, w: 12, x: 0, y: 22 }, [{ expr: inc('cholo_checkout_failures_total', 'reason'), legendFormat: '{{reason}}' }], 'none', { fieldConfig: { defaults: { unit: 'none', custom: { drawStyle: 'bars', fillOpacity: 70, stacking: { mode: 'normal' } } }, overrides: [] } }),
  ts('Gateway payments by outcome', { h: 8, w: 12, x: 12, y: 22 }, [{ expr: inc('cholo_payments_total', 'outcome'), legendFormat: '{{outcome}}' }], 'none', { fieldConfig: { defaults: { unit: 'none', custom: { drawStyle: 'bars', fillOpacity: 70, stacking: { mode: 'normal' } } }, overrides: [{ matcher: { id: 'byRegexp', options: '.*(failed|FAILED).*' }, properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'red' } }] }] } }),
  ts('Successful payment amount ৳ (sum per interval)', { h: 8, w: 12, x: 0, y: 30 }, [{ expr: 'sum(increase(cholo_payment_value_bdt_sum{job="cholo-api"}[$__rate_interval]))', legendFormat: '৳ collected' }], 'currencyBDT'),
  ts('Use-case p95 (ms) — @Traced', { h: 8, w: 12, x: 12, y: 30 }, [{ expr: 'histogram_quantile(0.95, sum by (le, usecase) (rate(cholo_usecase_duration_ms_bucket{job="cholo-api"}[$__rate_interval])))', legendFormat: '{{usecase}}' }], 'ms'),
  row('Operations', 38),
  ts('Stock movements by type', { h: 8, w: 8, x: 0, y: 39 }, [{ expr: inc('cholo_stock_movements_total', 'type'), legendFormat: '{{type}}' }], 'none'),
  ts('Auth events', { h: 8, w: 8, x: 8, y: 39 }, [{ expr: inc('cholo_auth_events_total', 'event'), legendFormat: '{{event}}' }], 'none'),
  ts('Outbox deliveries by channel · result', { h: 8, w: 8, x: 16, y: 39 }, [{ expr: inc('cholo_outbox_deliveries_total', 'channel, result'), legendFormat: '{{channel}} {{result}}' }], 'none'),
  ts('Use-case error rate', { h: 8, w: 12, x: 0, y: 47 }, [{ expr: 'sum by (usecase) (rate(cholo_usecase_duration_ms_count{job="cholo-api",outcome="error"}[$__rate_interval]))', legendFormat: '{{usecase}}' }], 'ops'),
  ts('Open orders (process-local gauge)', { h: 8, w: 12, x: 12, y: 47 }, [{ expr: 'sum(cholo_orders_open{job="cholo-api"})', legendFormat: 'open' }], 'none'),
]);

// ─────────── (c) Node runtime ───────────
id = 1;
const I = '{job="cholo-api",instance=~"$instance"}';
const node = dash('cholo-node-runtime', 'Node runtime', ['cholo', 'runtime'], [
  row('V8 heap', 0),
  ts('Heap used vs limit', { h: 8, w: 12, x: 0, y: 1 }, [
    { expr: `sum by (instance) (v8js_memory_heap_used${I})`, legendFormat: 'used {{instance}}' },
    { expr: `sum by (instance) (v8js_memory_heap_limit${I})`, legendFormat: 'limit {{instance}}' },
  ], 'bytes'),
  ts('Heap used by space', { h: 8, w: 12, x: 12, y: 1 }, [{ expr: `sum by (v8js_heap_space_name) (v8js_memory_heap_used${I})`, legendFormat: '{{v8js_heap_space_name}}' }], 'bytes', { fieldConfig: { defaults: { unit: 'bytes', custom: { fillOpacity: 40, stacking: { mode: 'normal' } } }, overrides: [] } }),
  row('Event loop', 9),
  ts('Event-loop delay', { h: 8, w: 12, x: 0, y: 10 }, [
    { expr: `max by (instance) (nodejs_eventloop_delay_p50${I})`, legendFormat: 'p50 {{instance}}' },
    { expr: `max by (instance) (nodejs_eventloop_delay_p99${I})`, legendFormat: 'p99 {{instance}}' },
    { expr: `max by (instance) (nodejs_eventloop_delay_max${I})`, legendFormat: 'max {{instance}}' },
  ], 's'),
  ts('Event-loop utilization', { h: 8, w: 12, x: 12, y: 10 }, [{ expr: `max by (instance) (nodejs_eventloop_utilization${I})`, legendFormat: '{{instance}}' }], 'percentunit'),
  row('GC', 18),
  ts('GC time per second by type', { h: 8, w: 12, x: 0, y: 19 }, [{ expr: `sum by (v8js_gc_type) (rate(v8js_gc_duration_sum${I}[$__rate_interval]))`, legendFormat: '{{v8js_gc_type}}' }], 's'),
  ts('GC runs per second by type', { h: 8, w: 12, x: 12, y: 19 }, [{ expr: `sum by (v8js_gc_type) (rate(v8js_gc_duration_count${I}[$__rate_interval]))`, legendFormat: '{{v8js_gc_type}}' }], 'ops'),
  row('Host (OTel collector hostmetrics)', 27),
  ts('CPU utilization by state', { h: 8, w: 8, x: 0, y: 28 }, [{ expr: 'avg by (state) (system_cpu_utilization{job="otel-collector",state!="idle"})', legendFormat: '{{state}}' }], 'percentunit', { fieldConfig: { defaults: { unit: 'percentunit', max: 1, custom: { fillOpacity: 40, stacking: { mode: 'normal' } } }, overrides: [] } }),
  ts('Load average', { h: 8, w: 8, x: 8, y: 28 }, [
    { expr: 'max(system_cpu_load_average_1m{job="otel-collector"})', legendFormat: '1m' },
    { expr: 'max(system_cpu_load_average_5m{job="otel-collector"})', legendFormat: '5m' },
    { expr: 'max(system_cpu_load_average_15m{job="otel-collector"})', legendFormat: '15m' },
  ], 'short'),
  ts('Memory by state', { h: 8, w: 8, x: 16, y: 28 }, [{ expr: 'sum by (state) (system_memory_usage{job="otel-collector"})', legendFormat: '{{state}}' }], 'bytes', { fieldConfig: { defaults: { unit: 'bytes', custom: { fillOpacity: 40, stacking: { mode: 'normal' } } }, overrides: [] } }),
  ts('Disk used % by mountpoint', { h: 8, w: 12, x: 0, y: 36 }, [{ expr: '1 - sum by (mountpoint) (system_filesystem_usage{job="otel-collector",state="free"}) / sum by (mountpoint) (system_filesystem_usage{job="otel-collector"})', legendFormat: '{{mountpoint}}' }], 'percentunit'),
  ts('Network bytes/s', { h: 8, w: 12, x: 12, y: 36 }, [{ expr: 'sum by (direction) (rate(system_network_io_total{job="otel-collector",device!~"lo|veth.*|docker.*|br-.*"}[$__rate_interval]) or rate(system_network_io{job="otel-collector",device!~"lo|veth.*|docker.*|br-.*"}[$__rate_interval]))', legendFormat: '{{direction}}' }], 'Bps'),
  row('Telemetry pipeline', 44),
  ts('Collector: spans accepted / refused / exported', { h: 8, w: 12, x: 0, y: 45 }, [
    { expr: 'sum(rate({__name__=~"otelcol_receiver_accepted_spans(_total)?"}[$__rate_interval]))', legendFormat: 'accepted' },
    { expr: 'sum(rate({__name__=~"otelcol_receiver_refused_spans(_total)?"}[$__rate_interval]))', legendFormat: 'refused' },
    { expr: 'sum(rate({__name__=~"otelcol_exporter_sent_spans(_total)?"}[$__rate_interval]))', legendFormat: 'exported' },
  ], 'ops'),
  ts('Scrape health', { h: 8, w: 12, x: 12, y: 45 }, [{ expr: 'up', legendFormat: '{{job}} {{instance}}' }], 'none'),
], [instVar]);

for (const [f, d] of [['cholo-api-red.json', red], ['cholo-business.json', biz], ['node-runtime.json', node]]) {
  fs.writeFileSync(`${OUT}/${f}`, JSON.stringify(d, null, 2) + '\n');
  console.log(f, d.panels.length, 'panels');
}

// ─────────── (d) API latency by route — real-time ───────────
// Metric names verified against @opentelemetry/instrumentation-http 0.222 + exporter-prometheus 0.222:
//   http_server_request_duration_{bucket,sum,count}  (seconds)
//   labels: http_route, http_request_method, http_response_status_code, url_scheme, network_protocol_version
id = 1;
const SEL = 'job="cholo-api",http_route=~"$route",http_request_method=~"$method"';
const W = '[$window]';
const unmatched = (e) => `label_replace(${e}, "http_route", "(unmatched)", "http_route", "")`;
const qq = (p, by = 'http_route, http_request_method') => unmatched(`histogram_quantile(${p}, sum by (le, ${by}) (rate(http_server_request_duration_bucket{${SEL}}${W})))`);
const rps = (by = 'http_route, http_request_method') => unmatched(`sum by (${by}) (rate(http_server_request_duration_count{${SEL}}${W}))`);
const err5 = unmatched(`sum by (http_route, http_request_method) (rate(http_server_request_duration_count{${SEL},http_response_status_code=~"5.."}${W})) / clamp_min(sum by (http_route, http_request_method) (rate(http_server_request_duration_count{${SEL}}${W})), 1e-9)`);
const tbl = (expr, ref) => ({ expr, refId: ref, instant: true, format: 'table' });
const ms = (title, gp, targets, extra = {}) => ts(title, gp, targets, 's', extra);
const ucSel = 'job="cholo-api",usecase=~"$usecase"';

const latVars = [
  { name: 'route', label: 'Route', type: 'query', datasource: P, query: { query: 'label_values(http_server_request_duration_count{job="cholo-api"}, http_route)', refId: 'q' }, definition: 'label_values(http_server_request_duration_count{job="cholo-api"}, http_route)', includeAll: true, multi: true, allValue: '.*', current: { text: 'All', value: '$__all' }, refresh: 2, sort: 1 },
  { name: 'method', label: 'Method', type: 'query', datasource: P, query: { query: 'label_values(http_server_request_duration_count{job="cholo-api"}, http_request_method)', refId: 'q' }, definition: 'label_values(http_server_request_duration_count{job="cholo-api"}, http_request_method)', includeAll: true, multi: true, allValue: '.*', current: { text: 'All', value: '$__all' }, refresh: 2, sort: 1 },
  { name: 'usecase', label: 'Use-case', type: 'query', datasource: P, query: { query: 'label_values(cholo_usecase_duration_ms_count{job="cholo-api"}, usecase)', refId: 'q' }, definition: 'label_values(cholo_usecase_duration_ms_count{job="cholo-api"}, usecase)', includeAll: true, multi: true, allValue: '.*', current: { text: 'All', value: '$__all' }, refresh: 2, sort: 1 },
  { name: 'window', label: 'Rate window', type: 'custom', query: '30s,1m,2m,5m', current: { text: '1m', value: '1m' }, options: ['30s', '1m', '2m', '5m'].map((v) => ({ text: v, value: v, selected: v === '1m' })) },
];

const routeTable = {
  id: id++, type: 'table', title: 'Per route · method — latency, rate, errors (now)', gridPos: { h: 10, w: 24, x: 0, y: 5 }, datasource: P,
  targets: [
    { datasource: P, ...tbl(rps(), 'A') },
    { datasource: P, ...tbl(qq(0.5), 'B') },
    { datasource: P, ...tbl(qq(0.95), 'C') },
    { datasource: P, ...tbl(qq(0.99), 'D') },
    { datasource: P, ...tbl(err5, 'E') },
  ],
  transformations: [
    { id: 'merge', options: {} },
    { id: 'organize', options: { excludeByName: { Time: true }, renameByName: { http_route: 'Route', http_request_method: 'Method', 'Value #A': 'req/s', 'Value #B': 'p50', 'Value #C': 'p95', 'Value #D': 'p99', 'Value #E': '5xx %' }, indexByName: { http_request_method: 0, http_route: 1, 'Value #A': 2, 'Value #B': 3, 'Value #C': 4, 'Value #D': 5, 'Value #E': 6 } } },
    { id: 'sortBy', options: { sort: [{ field: 'p95', desc: true }] } },
  ],
  fieldConfig: {
    defaults: { custom: { align: 'auto', cellOptions: { type: 'auto' } } },
    overrides: [
      { matcher: { id: 'byRegexp', options: '^p(50|95|99)$' }, properties: [{ id: 'unit', value: 's' }, { id: 'decimals', value: 3 }, { id: 'custom.cellOptions', value: { type: 'color-background', mode: 'basic' } }, { id: 'thresholds', value: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.3 }, { color: 'red', value: 0.8 }] } }] },
      { matcher: { id: 'byName', options: 'req/s' }, properties: [{ id: 'unit', value: 'reqps' }, { id: 'decimals', value: 2 }] },
      { matcher: { id: 'byName', options: '5xx %' }, properties: [{ id: 'unit', value: 'percentunit' }, { id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'thresholds', value: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.02 }] } }] },
      { matcher: { id: 'byName', options: 'Route' }, properties: [{ id: 'links', value: [{ title: 'Traces for this route (Tempo)', url: '/explore?schemaVersion=1&panes=%7B%22t%22:%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22traceql%22,%22query%22:%22%7Bresource.service.name%3D%5C%22cholo-api%5C%22%20%26%26%20span.http.route%3D%5C%22${__value.raw}%5C%22%7D%22%7D%5D,%22range%22:%7B%22from%22:%22now-15m%22,%22to%22:%22now%22%7D%7D%7D' }] }] },
    ],
  },
  options: { showHeader: true, cellHeight: 'sm', footer: { show: false } },
};

const latency = dash('cholo-api-latency', 'API latency by route', ['cholo', 'api', 'latency', 'realtime'], [
  stat('Requests / s', { h: 4, w: 6, x: 0, y: 0 }, `sum(rate(http_server_request_duration_count{${SEL}}${W}))`, 'reqps', [{ color: 'blue', value: null }]),
  stat('p95 (all selected routes)', { h: 4, w: 6, x: 6, y: 0 }, `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_bucket{${SEL}}${W})))`, 's', green(0.3, 0.8)),
  stat('p99 (all selected routes)', { h: 4, w: 6, x: 12, y: 0 }, `histogram_quantile(0.99, sum by (le) (rate(http_server_request_duration_bucket{${SEL}}${W})))`, 's', green(0.5, 1.5)),
  stat('5xx ratio', { h: 4, w: 6, x: 18, y: 0 }, `sum(rate(http_server_request_duration_count{${SEL},http_response_status_code=~"5.."}${W})) / clamp_min(sum(rate(http_server_request_duration_count{${SEL}}${W})), 1e-9)`, 'percentunit', green(0.01, 0.02)),
  routeTable,
  ms('p95 by route · method', { h: 9, w: 12, x: 0, y: 15 }, [{ expr: qq(0.95), legendFormat: '{{http_request_method}} {{http_route}}' }]),
  ms('p99 by route · method', { h: 9, w: 12, x: 12, y: 15 }, [{ expr: qq(0.99), legendFormat: '{{http_request_method}} {{http_route}}' }]),
  ms('p50 by route · method', { h: 9, w: 12, x: 0, y: 24 }, [{ expr: qq(0.5), legendFormat: '{{http_request_method}} {{http_route}}' }]),
  { id: id++, type: 'bargauge', title: 'Slowest routes right now (p95, top 10)', gridPos: { h: 9, w: 12, x: 12, y: 24 }, datasource: P,
    targets: [{ datasource: P, refId: 'A', expr: `topk(10, ${qq(0.95)})`, instant: true, legendFormat: '{{http_request_method}} {{http_route}}' }],
    fieldConfig: { defaults: { unit: 's', decimals: 3, min: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.3 }, { color: 'red', value: 0.8 }] }, color: { mode: 'thresholds' } }, overrides: [] },
    options: { orientation: 'horizontal', displayMode: 'gradient', showUnfilled: true, valueMode: 'color', reduceOptions: { calcs: ['lastNotNull'] }, namePlacement: 'left', sizing: 'auto' } },
  ts('Request rate by route · method', { h: 9, w: 12, x: 0, y: 33 }, [{ expr: rps(), legendFormat: '{{http_request_method}} {{http_route}}' }], 'reqps'),
  ts('Error rate by route (5xx ratio)', { h: 9, w: 12, x: 12, y: 33 }, [{ expr: err5, legendFormat: '{{http_request_method}} {{http_route}}' }], 'percentunit',
    { fieldConfig: { defaults: { unit: 'percentunit', min: 0, custom: { lineWidth: 2, fillOpacity: 8, showPoints: 'never', thresholdsStyle: { mode: 'line' } }, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.02 }] } }, overrides: [] } }),
  ts('4xx + 5xx per second by route · status', { h: 9, w: 12, x: 0, y: 42 }, [{ expr: unmatched(`sum by (http_route, http_response_status_code) (rate(http_server_request_duration_count{${SEL},http_response_status_code=~"[45].."}${W}))`), legendFormat: '{{http_response_status_code}} {{http_route}}' }], 'reqps'),
  { id: id++, type: 'heatmap', title: 'Latency distribution (selected routes)', gridPos: { h: 9, w: 12, x: 12, y: 42 }, datasource: P,
    targets: [{ datasource: P, refId: 'A', expr: `sum by (le) (increase(http_server_request_duration_bucket{${SEL}}${W}))`, format: 'heatmap', legendFormat: '{{le}}' }],
    options: { calculate: false, yAxis: { unit: 's' }, color: { scheme: 'Spectral', mode: 'scheme', reverse: true }, cellGap: 1, tooltip: { mode: 'single', yHistogram: true } } },
  row('Use-cases (@Traced → cholo_usecase_duration_ms)', 51),
  ts('Use-case p95 (ms)', { h: 9, w: 12, x: 0, y: 52 }, [{ expr: `histogram_quantile(0.95, sum by (le, usecase) (rate(cholo_usecase_duration_ms_bucket{${ucSel}}${W})))`, legendFormat: '{{usecase}}' }], 'ms'),
  { id: id++, type: 'table', title: 'Use-cases — calls/s, p50, p95, p99, error %', gridPos: { h: 9, w: 12, x: 12, y: 52 }, datasource: P,
    targets: [
      { datasource: P, ...tbl(`sum by (usecase) (rate(cholo_usecase_duration_ms_count{${ucSel}}${W}))`, 'A') },
      { datasource: P, ...tbl(`histogram_quantile(0.5, sum by (le, usecase) (rate(cholo_usecase_duration_ms_bucket{${ucSel}}${W})))`, 'B') },
      { datasource: P, ...tbl(`histogram_quantile(0.95, sum by (le, usecase) (rate(cholo_usecase_duration_ms_bucket{${ucSel}}${W})))`, 'C') },
      { datasource: P, ...tbl(`histogram_quantile(0.99, sum by (le, usecase) (rate(cholo_usecase_duration_ms_bucket{${ucSel}}${W})))`, 'D') },
      { datasource: P, ...tbl(`sum by (usecase) (rate(cholo_usecase_duration_ms_count{${ucSel},outcome="error"}${W})) / clamp_min(sum by (usecase) (rate(cholo_usecase_duration_ms_count{${ucSel}}${W})), 1e-9)`, 'E') },
    ],
    transformations: [
      { id: 'merge', options: {} },
      { id: 'organize', options: { excludeByName: { Time: true }, renameByName: { usecase: 'Use-case', 'Value #A': 'calls/s', 'Value #B': 'p50 ms', 'Value #C': 'p95 ms', 'Value #D': 'p99 ms', 'Value #E': 'error %' } } },
      { id: 'sortBy', options: { sort: [{ field: 'p95 ms', desc: true }] } },
    ],
    fieldConfig: { defaults: {}, overrides: [
      { matcher: { id: 'byRegexp', options: 'p\\d+ ms' }, properties: [{ id: 'unit', value: 'ms' }, { id: 'decimals', value: 1 }] },
      { matcher: { id: 'byName', options: 'calls/s' }, properties: [{ id: 'unit', value: 'ops' }, { id: 'decimals', value: 2 }] },
      { matcher: { id: 'byName', options: 'error %' }, properties: [{ id: 'unit', value: 'percentunit' }] },
    ] } },
  row('Traces (Tempo) — click an exemplar ◆ or a trace id', 61),
  ts('p95 by route from span metrics (◆ exemplars → trace)', { h: 9, w: 12, x: 0, y: 62 }, [{ expr: 'histogram_quantile(0.95, sum by (le, http_route) (rate(traces_spanmetrics_latency_bucket{service="cholo-api",span_kind="SPAN_KIND_SERVER",http_route=~"$route"}[$window])))', legendFormat: '{{http_route}}', exemplar: true }], 's'),
  { id: id++, type: 'table', title: 'Slowest traces in range (selected routes)', gridPos: { h: 9, w: 12, x: 12, y: 62 }, datasource: T,
    targets: [{ datasource: T, refId: 'A', queryType: 'traceql', query: '{ resource.service.name = "cholo-api" && kind = server && span.http.route =~ "${route:regex}" && duration > 200ms }', limit: 25, tableType: 'traces' }] },
]);
latency.refresh = '5s';
latency.time = { from: 'now-15m', to: 'now' };
latency.timepicker = { refresh_intervals: ['5s', '10s', '30s', '1m', '5m'] };
latency.templating.list = latVars;
fs.writeFileSync(`${OUT}/cholo-api-latency.json`, JSON.stringify(latency, null, 2) + '\n');
console.log('cholo-api-latency.json', latency.panels.length, 'panels');
