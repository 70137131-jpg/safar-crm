import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { IntegrationError, ValidationError } from "@/lib/errors";

/**
 * Cloudflare R2 storage adapter (S3-compatible).
 *
 * Hard rules (ARCHITECTURE.md §8):
 *   - One PRIVATE bucket per environment. No public read.
 *   - Raw bucket URLs are NEVER exposed. Callers receive object keys; the only
 *     way bytes leave the system is a short-lived signed URL minted here.
 *   - Allowed content types: application/pdf, image/jpeg, image/png. Max 25 MB.
 *   - Signed URLs expire in 5 minutes.
 *
 * This module is `server-only` — it must never be bundled into client code,
 * because it holds the R2 secret credentials.
 */

// ─── Constraints (ARCHITECTURE.md §8) ────────────────────────────────────────

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 3;

export function isAllowedContentType(value: string): value is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Validates the declared content-type and size before we ever mint an upload
 * URL or record a row. Throws a ValidationError (expected, not Sentry-reported).
 */
export function assertUploadConstraints(contentType: string, sizeBytes: number): void {
  if (!isAllowedContentType(contentType)) {
    throw new ValidationError(
      `Unsupported file type "${contentType}". Allowed: PDF, JPEG, PNG.`,
      "contentType",
    );
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ValidationError("File appears to be empty.", "sizeBytes");
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError(
      `File exceeds the ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`,
      "sizeBytes",
    );
  }
}

// ─── Object key construction ─────────────────────────────────────────────────

/** Strip path separators / unsafe chars so a filename can't escape its prefix. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // Keep only filename-safe chars; collapse everything else to underscores.
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "file";
}

/**
 * Content-addressed key: `documents/{customerId}/{uuid}/{filename}`
 * (ARCHITECTURE.md §8). A fresh UUID guarantees uniqueness even when two
 * files share a name.
 */
export function buildDocumentKey(customerId: string, fileName: string): string {
  return `documents/${customerId}/${randomUUID()}/${sanitizeFileName(fileName)}`;
}

// ─── Client (lazy singleton) ─────────────────────────────────────────────────

let cached: { client: S3Client; bucket: string } | null = null;

function getClient(): { client: S3Client; bucket: string } {
  if (cached) return cached;

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_DOCUMENTS } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_DOCUMENTS) {
    throw new IntegrationError(
      "R2 storage is not configured (missing R2_* environment variables).",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: MAX_ATTEMPTS, // built-in adaptive retry for transient failures
  });

  cached = { client, bucket: R2_BUCKET_DOCUMENTS };
  return cached;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound" || e?.name === "NoSuchKey"
  );
}

// ─── Operations ──────────────────────────────────────────────────────────────

export interface HeadResult {
  contentLength: number;
  contentType: string | undefined;
  etag: string | undefined;
}

/**
 * Returns object metadata, or `null` when the object does not exist.
 * Used to confirm a presigned upload actually landed before we record a row.
 */
export async function headObject(key: string): Promise<HeadResult | null> {
  const { client, bucket } = getClient();
  try {
    const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      contentLength: out.ContentLength ?? 0,
      contentType: out.ContentType,
      etag: out.ETag,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    logger.error({ err, key }, "r2.head_failed");
    throw new IntegrationError("Failed to inspect the uploaded file.", err);
  }
}

/**
 * Server-side streaming upload. Used for server-generated artefacts (e.g. PDFs)
 * where the bytes already live on the server. Browser document uploads use a
 * presigned PUT instead (see createSignedUploadUrl).
 */
export async function uploadFile(params: {
  key: string;
  body: Buffer | Uint8Array | string | ReadableStream;
  contentType: string;
  checksumSha256?: string; // base64-encoded; lets R2 verify integrity on write
}): Promise<void> {
  const { client, bucket } = getClient();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: params.body as PutObjectCommand["input"]["Body"],
        ContentType: params.contentType,
        ...(params.checksumSha256 ? { ChecksumSHA256: params.checksumSha256 } : {}),
      }),
    );
  } catch (err) {
    logger.error({ err, key: params.key }, "r2.upload_failed");
    throw new IntegrationError("Failed to upload the file.", err);
  }
}

/** Best-effort delete. A missing object is treated as success (idempotent). */
export async function deleteFile(key: string): Promise<void> {
  const { client, bucket } = getClient();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (isNotFound(err)) return;
    logger.error({ err, key }, "r2.delete_failed");
    throw new IntegrationError("Failed to delete the file.", err);
  }
}

/**
 * Mint a 5-minute presigned PUT URL constrained to the declared content type.
 * The browser uploads directly to R2 with this URL — bytes never transit our
 * server. Size is enforced post-upload via headObject().
 */
export async function createSignedUploadUrl(params: {
  key: string;
  contentType: string;
}): Promise<string> {
  const { client, bucket } = getClient();
  try {
    return await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        ContentType: params.contentType,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  } catch (err) {
    logger.error({ err, key: params.key }, "r2.sign_upload_failed");
    throw new IntegrationError("Failed to prepare the upload.", err);
  }
}

/**
 * Mint a 5-minute presigned GET URL. `fileName` drives the download filename via
 * Content-Disposition. NEVER embed the result in an email (ARCHITECTURE.md §2.7)
 * — only hand it to a request that has already passed permission + audit.
 */
export async function createSignedDownloadUrl(params: {
  key: string;
  fileName: string;
  contentType?: string;
  disposition?: "attachment" | "inline";
}): Promise<string> {
  const { client, bucket } = getClient();
  const safeName = sanitizeFileName(params.fileName);
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: params.key,
        ResponseContentDisposition: `${params.disposition ?? "attachment"}; filename="${safeName}"`,
        ...(params.contentType ? { ResponseContentType: params.contentType } : {}),
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  } catch (err) {
    logger.error({ err, key: params.key }, "r2.sign_download_failed");
    throw new IntegrationError("Failed to prepare the download.", err);
  }
}
