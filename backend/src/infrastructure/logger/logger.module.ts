import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { LoggerModule as PinoModule } from 'nestjs-pino';
import { AppConfig } from '@/config/app-config.service';

/**
 * Structured JSON logs (pino). Every line carries trace_id/span_id so a log in
 * Loki/Grafana jumps straight to its trace. Secrets and tokens are redacted.
 */
@Module({
  imports: [
    PinoModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          mixin: () => {
            const ctx = trace.getActiveSpan()?.spanContext();
            return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
          },
          autoLogging: { ignore: (req) => /\/(health|metrics)/.test(req.url ?? '') },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.password',
              '*.refreshToken',
              '*.code',
            ],
            censor: '[redacted]',
          },
          customProps: () => ({ service: config.get('OTEL_SERVICE_NAME') }),
          transport: config.isProduction || config.isTest ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
