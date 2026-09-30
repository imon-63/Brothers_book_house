import { HttpStatus } from '@nestjs/common';

/**
 * Domain errors are thrown by application services and translated to
 * RFC 7807 problem+json by AllExceptionsFilter. `code` is a stable,
 * machine-readable identifier the frontend can switch on; `message` is
 * human text (Bangla is fine — it is shown to users).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string | number) {
    super(`${entity.toLowerCase()}.not_found`, id != null ? `${entity} ${id} পাওয়া যায়নি` : `${entity} পাওয়া যায়নি`, HttpStatus.NOT_FOUND, { entity, id });
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

export class BusinessRuleError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(code = 'auth.forbidden', message = 'এই কাজের অনুমতি নেই') {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(code = 'auth.unauthorized', message = 'লগইন প্রয়োজন') {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}
