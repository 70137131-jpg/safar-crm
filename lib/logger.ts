import pino, { type Logger } from "pino";
import { env } from "./env";

/**
 * Pino logger with a global PII redaction list. Anything matched by
 * `redact.paths` is replaced with "[REDACTED]" before serialization.
 *
 * Never log raw request bodies, raw form values, or any object that may
 * contain passport/DOB/file keys without first running redactPII().
 */

const isDev = env.NODE_ENV === "development";

const redactPaths = [
  // PII
  "passportNo", "*.passportNo", "*.*.passportNo",
  "dob", "*.dob", "*.*.dob",
  "passportExpiry", "*.passportExpiry",
  // Credentials & tokens
  "password", "*.password",
  "token", "*.token",
  "sessionToken", "*.sessionToken",
  "authorization", "*.authorization",
  "cookie", "*.cookie",
  "headers.cookie", "headers.authorization",
  // Storage refs
  "fileKey", "*.fileKey",
  "signedUrl", "*.signedUrl",
  // Free-form text that may contain PII (allowed at trace only)
  "body", "*.body",
];

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  base: { env: env.NODE_ENV },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,env" },
    },
  }),
});

export type { Logger };
