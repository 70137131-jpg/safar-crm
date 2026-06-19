import { ERROR_CODES, type ErrorCode } from "./codes";

/**
 * Base class for all expected errors.
 *
 * `expected: true` (default) means the error represents a known business
 * condition (validation, forbidden, conflict) — these are NOT sent to Sentry.
 * `expected: false` is reserved for IntegrationError / UnexpectedError.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  override readonly cause?: unknown;
  readonly expected: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { field?: string; cause?: unknown; expected?: boolean },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.field = opts?.field;
    this.cause = opts?.cause;
    this.expected = opts?.expected ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(ERROR_CODES.VALIDATION, message, { field });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(ERROR_CODES.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(ERROR_CODES.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(ERROR_CODES.NOT_FOUND, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(ERROR_CODES.CONFLICT, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(ERROR_CODES.RATE_LIMITED, message);
  }
}

export class IntegrationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(ERROR_CODES.INTEGRATION, message, { cause, expected: false });
  }
}
