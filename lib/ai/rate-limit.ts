import { RateLimitError } from "@/lib/errors";

interface Bucket {
  count: number;
  resetsAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 20;

/**
 * Per-instance safety limit. Production should move this to a shared store
 * before horizontal scale; this still bounds accidental loops in each worker.
 */
export function enforceAssistantRateLimit(userId: string, now = Date.now()): void {
  const existing = buckets.get(userId);
  if (!existing || existing.resetsAt <= now) {
    buckets.set(userId, { count: 1, resetsAt: now + WINDOW_MS });
    return;
  }
  if (existing.count >= MAX_REQUESTS) {
    throw new RateLimitError("Ask Safar request limit reached. Try again in a few minutes.");
  }
  existing.count += 1;
}

export function resetAssistantRateLimitsForTests(): void {
  buckets.clear();
}
