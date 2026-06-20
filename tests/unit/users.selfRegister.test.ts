import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

/**
 * Public self-registration. Must create a DEACTIVATED account with the role
 * hard-forced to AGENT (never client-chosen) and the password hashed — so a
 * stranger can register but gets no access until an admin activates them.
 */

vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    $context: Promise.resolve({
      password: { hash: async (p: string) => `hashed:${p}`, verify: async () => true },
    }),
  },
}));

const mockRepo = {
  existsByEmail: vi.fn(),
  createWithCredential: vi.fn(),
};
vi.mock("@/modules/users/users.repository", () => mockRepo);

const service = await import("@/modules/users/users.service");

const input = { name: "New Person", email: "new@x.test", password: "Str0ng!Passw0rd" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.existsByEmail.mockResolvedValue(false);
  mockRepo.createWithCredential.mockImplementation(async (data: Record<string, unknown>) => ({
    id: "u-new",
    name: data.name,
    email: data.email,
    avatar: null,
    role: data.role,
    deactivatedAt: (data.deactivatedAt as Date) ?? null,
    emailVerified: false,
    mustChangePassword: data.mustChangePassword,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});

describe("users.selfRegister", () => {
  it("creates a DEACTIVATED AGENT with a hashed password", async () => {
    const res = await service.selfRegister(input);
    expect(res).toEqual({ email: "new@x.test" });
    expect(mockRepo.createWithCredential).toHaveBeenCalledTimes(1);
    const data = mockRepo.createWithCredential.mock.calls[0]![0] as Record<string, unknown>;
    expect(data.role).toBe("AGENT"); // forced, never from client input
    expect(data.deactivatedAt).toBeInstanceOf(Date); // no access until admin approves
    expect(data.mustChangePassword).toBe(false);
    expect(data.hashedPassword).toBe("hashed:Str0ng!Passw0rd"); // hashed, not plaintext
  });

  it("rejects a duplicate email and creates nothing", async () => {
    mockRepo.existsByEmail.mockResolvedValue(true);
    await expect(service.selfRegister(input)).rejects.toBeInstanceOf(ConflictError);
    expect(mockRepo.createWithCredential).not.toHaveBeenCalled();
  });
});
