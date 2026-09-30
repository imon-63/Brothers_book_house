import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { DomainError } from '@/common/errors/domain.error';

type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  traceId?: string;
  errors?: unknown;
  details?: Record<string, unknown>;
};

/**
 * One error shape for the whole API (RFC 7807 application/problem+json).
 * Maps DomainError, HttpException (incl. validation), Prisma known errors
 * and DB constraint violations; everything else becomes an opaque 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const span = trace.getActiveSpan();
    const problem = this.toProblem(exception, req);
    problem.traceId = span?.spanContext().traceId;

    if (problem.status >= 500) {
      this.logger.error({ err: exception, path: req.url }, 'Unhandled error');
      span?.recordException(exception as Error);
      span?.setStatus({ code: SpanStatusCode.ERROR });
    }
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(ex: unknown, req: Request): Problem {
    const base = { instance: req.originalUrl ?? req.url, type: 'about:blank' };

    if (ex instanceof DomainError) {
      return { ...base, status: ex.status, title: HttpStatus[ex.status] ?? 'Error', code: ex.code, detail: ex.message, details: ex.details };
    }

    if (ex instanceof HttpException) {
      const status = ex.getStatus();
      const body = ex.getResponse() as string | { message?: string | string[]; error?: string };
      const messages = typeof body === 'string' ? [body] : Array.isArray(body.message) ? body.message : [body.message ?? ex.message];
      const isValidation = status === HttpStatus.BAD_REQUEST && Array.isArray((body as { message?: unknown }).message);
      return {
        ...base,
        status,
        title: HttpStatus[status] ?? 'Error',
        code: isValidation ? 'validation.failed' : `http.${status}`,
        detail: isValidation ? 'অনুরোধে ভুল তথ্য আছে' : String(messages[0]),
        errors: isValidation ? messages : undefined,
      };
    }

    if (ex instanceof Prisma.PrismaClientKnownRequestError) {
      switch (ex.code) {
        case 'P2002':
          return { ...base, status: 409, title: 'Conflict', code: 'db.unique_violation', detail: 'এই তথ্য আগেই আছে', details: { target: ex.meta?.target } };
        case 'P2025':
          return { ...base, status: 404, title: 'Not Found', code: 'db.not_found', detail: 'রেকর্ড পাওয়া যায়নি' };
        case 'P2003':
          return { ...base, status: 409, title: 'Conflict', code: 'db.foreign_key', detail: 'সম্পর্কিত রেকর্ড থাকায় কাজটি করা যায়নি' };
        case 'P2034':
          return { ...base, status: 409, title: 'Conflict', code: 'db.serialization', detail: 'একই সময়ে অন্য পরিবর্তন হয়েছে, আবার চেষ্টা করুন' };
        default:
          break;
      }
    }

    // Raised by CHECK constraints / append-only triggers (SQLSTATE 23514, 23P01).
    const raw = ex as { message?: string };
    if (typeof raw?.message === 'string' && /(violates (check|exclusion) constraint|append-only|immutable)/.test(raw.message)) {
      const constraint = raw.message.match(/constraint "([^"]+)"/)?.[1];
      return { ...base, status: 422, title: 'Unprocessable Entity', code: 'db.constraint', detail: 'ডেটার নিয়ম ভঙ্গ হয়েছে', details: constraint ? { constraint } : undefined };
    }

    return { ...base, status: 500, title: 'Internal Server Error', code: 'internal', detail: 'সার্ভারে সমস্যা হয়েছে' };
  }
}
