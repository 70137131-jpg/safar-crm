const REDACT_KEYS = new Set([
  "passportExpiry",
  "dob",
  "password",
  "token",
  "sessionToken",
  "fileKey",
  "signedUrl",
  "authorization",
  "cookie",
]);

const MASK_KEYS = new Set(["passportNo"]); // mask to last-4 rather than full removal

function maskPassport(value: unknown): string {
  if (typeof value !== "string" || value.length < 4) return "[REDACTED]";
  return `****${value.slice(-4)}`;
}

/**
 * Returns a deep clone of `input` with PII keys masked or removed.
 * Safe to pass into AuditLog.before/after, Pino payloads, Sentry contexts.
 */
export function redactPII<T>(input: T): T {
  return walk(input) as T;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // Money is `bigint` paisa across the system; JSON (and Prisma's Json column)
  // cannot serialize BigInt, so audit payloads must carry it as a string.
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (MASK_KEYS.has(k)) {
        out[k] = maskPassport(v);
      } else if (REDACT_KEYS.has(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}
