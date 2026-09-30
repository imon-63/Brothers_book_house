/**
 * OpenTelemetry bootstrap. Must run BEFORE Nest/express/http are imported,
 * so `main.ts` imports this file first (and Docker runs `node -r`).
 *
 *  • Traces  → OTLP/HTTP (OTel Collector → Tempo/Jaeger)
 *  • Metrics → Prometheus pull endpoint on :OTEL_PROMETHEUS_PORT/metrics
 *              (+ OTLP push when an endpoint is configured)
 *  • Auto-instrumentation: http, express, nestjs-core, pg, pino, dns off, fs off
 *  • Prisma queries become child spans via @prisma/instrumentation
 */
// Load .env before reading OTEL_* (the Nest ConfigModule loads it too late for us).
import 'dotenv/config';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader, type MetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const enabled = (process.env.OTEL_ENABLED ?? 'true') !== 'false' && process.env.NODE_ENV !== 'test';

let sdk: NodeSDK | undefined;

if (enabled) {
  if (process.env.OTEL_DEBUG === 'true') diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const readers: MetricReader[] = [
    new PrometheusExporter({ port: Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464), endpoint: '/metrics' }),
  ];
  if (endpoint) {
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    );
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'cholo-api',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? '1.0.0',
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined,
    metricReaders: readers,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // health probes and the metrics scrape are noise
          ignoreIncomingRequestHook: (req) => /\/(health|metrics)/.test(req.url ?? ''),
        },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
}

export const telemetryEnabled = enabled;

/** Flush spans/metrics; called from Nest's shutdown hook so nothing is lost on deploy. */
export async function shutdownTelemetry(): Promise<void> {
  try {
    await sdk?.shutdown();
  } catch (err) {
    console.error('OTel shutdown failed', err);
  }
}
