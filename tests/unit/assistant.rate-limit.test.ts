import { beforeEach, describe, expect, it } from "vitest";
import { RateLimitError } from "@/lib/errors";
import { enforceAssistantRateLimit, resetAssistantRateLimitsForTests } from "@/lib/ai/rate-limit";

describe("assistant rate limiting", () => {
  beforeEach(() => resetAssistantRateLimitsForTests());

  it("allows twenty requests in a five-minute window", () => {
    for (let index = 0; index < 20; index++) {
      expect(() => enforceAssistantRateLimit("user-1", 1_000)).not.toThrow();
    }
  });

  it("blocks the twenty-first request without affecting other users", () => {
    for (let index = 0; index < 20; index++) {
      enforceAssistantRateLimit("user-1", 1_000);
    }
    expect(() => enforceAssistantRateLimit("user-1", 1_000)).toThrow(RateLimitError);
    expect(() => enforceAssistantRateLimit("user-2", 1_000)).not.toThrow();
  });

  it("resets after five minutes", () => {
    for (let index = 0; index < 20; index++) {
      enforceAssistantRateLimit("user-1", 1_000);
    }
    expect(() => enforceAssistantRateLimit("user-1", 1_000 + 5 * 60 * 1000)).not.toThrow();
  });
});
