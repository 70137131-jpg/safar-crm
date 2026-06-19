import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { AppError } from "./app-error";
import { ERROR_CODES, type ErrorCode } from "./codes";

/**
 * Discriminated union returned by every server action.
 * The client never sees thrown errors — only this typed result.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; field?: string };

/**
 * Wraps a server action body to:
 *  - catch and classify thrown errors,
 *  - log them with redaction,
 *  - report only unexpected errors to Sentry,
 *  - return a typed ActionResult that hides internal details.
 *
 * Usage:
 *   export const createCustomer = serverAction("customers.create", async (input) => {
 *     const user = await requireUser();
 *     ...
 *     return customer;
 *   });
 */
export function serverAction<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<ActionResult<TResult>> {
  return async (...args: TArgs): Promise<ActionResult<TResult>> => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (err) {
      return handleError(name, err);
    }
  };
}

function handleError(
  name: string,
  err: unknown,
): { ok: false; code: ErrorCode; message: string; field?: string } {
  // Next.js uses thrown values for control flow (redirect, notFound,
  // dynamic-server bail-out). These are not errors — let them propagate
  // so the framework can act on them instead of swallowing/logging them.
  unstable_rethrow(err);

  if (err instanceof ZodError) {
    const first = err.issues[0];
    logger.warn(
      { action: name, code: ERROR_CODES.VALIDATION, issues: err.issues },
      "server action validation error",
    );
    return {
      ok: false,
      code: ERROR_CODES.VALIDATION,
      message: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    };
  }

  if (err instanceof AppError) {
    if (err.expected) {
      logger.warn(
        { action: name, code: err.code, message: err.message },
        "server action expected error",
      );
    } else {
      logger.error({ action: name, code: err.code, err }, "server action error");
      Sentry.captureException(err, { tags: { action: name, code: err.code } });
    }
    return { ok: false, code: err.code, message: err.message, field: err.field };
  }

  // Unknown — report to Sentry, return a generic message to the client.
  logger.error({ action: name, err }, "server action unexpected error");
  Sentry.captureException(err, { tags: { action: name } });

  return {
    ok: false,
    code: ERROR_CODES.UNEXPECTED,
    message: "Something went wrong. Please try again.",
  };
}
