import { metrics, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';

const tracer = trace.getTracer('cholo.usecase', '1.0.0');
const duration = metrics.getMeter('cholo.usecase').createHistogram('cholo_usecase_duration_ms', {
  description: 'Duration of traced application use-cases',
  unit: 'ms',
});

/**
 * Wrap an application-service method in a span + duration metric.
 *
 *   @Traced('orders.place')
 *   async place(dto: PlaceOrderDto) { … }
 *
 * The span becomes a child of the HTTP span, so Grafana/Tempo shows
 * `POST /api/v1/orders → orders.place → prisma:query …` end-to-end.
 * Errors are recorded on the span and re-thrown untouched.
 */
export function Traced(name?: string, attributes: Attributes = {}): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const spanName = name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
        const started = performance.now();
        let outcome = 'ok';
        try {
          return await original.apply(this, args);
        } catch (err) {
          outcome = 'error';
          const e = err as Error;
          span.recordException(e);
          span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message });
          throw err;
        } finally {
          duration.record(performance.now() - started, { usecase: spanName, outcome });
          span.end();
        }
      });
    };
    return descriptor;
  };
}

/** Attach attributes to whatever span is active (e.g. order.no after it is generated). */
export function annotate(attrs: Attributes) {
  trace.getActiveSpan()?.setAttributes(attrs);
}
