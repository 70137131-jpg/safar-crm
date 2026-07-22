import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_entry: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

const repo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
vi.mock("@/modules/packages/packages.repository", () => repo);

const service = await import("@/modules/packages/packages.service");
const admin = { id: "admin", email: "a@x.test", name: "Admin", role: "ADMIN" as const };
const manager = { id: "manager", email: "m@x.test", name: "Manager", role: "MANAGER" as const };
const agent = { id: "agent", email: "g@x.test", name: "Agent", role: "AGENT" as const };

function packageRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Umrah 14 nights",
    destination: "Jeddah",
    description: null,
    durationDays: 14,
    pricePaisa: 50_000_000n,
    hotel: "Example Hotel",
    included: ["Flights"],
    excluded: ["Meals"],
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("packages service", () => {
  it("returns a serialized immutable booking snapshot", async () => {
    repo.findById.mockResolvedValue(packageRow());
    const result = await service.getBookablePackage(agent, "11111111-1111-4111-8111-111111111111");
    expect(result.snapshot.pricePaisa).toBe("50000000");
    expect(result.snapshot.title).toBe("Umrah 14 nights");
  });

  it("rejects archived packages for new bookings", async () => {
    repo.findById.mockResolvedValue(packageRow({ status: "ARCHIVED" }));
    await expect(service.getBookablePackage(agent, "11111111-1111-4111-8111-111111111111"))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("allows managers to list packages but not modify them", async () => {
    repo.findMany.mockResolvedValue([packageRow()]);
    expect(await service.listPackages(manager)).toHaveLength(1);
    await expect(service.createPackage(manager, {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows admins to create package templates", async () => {
    repo.create.mockResolvedValue(packageRow());
    const result = await service.createPackage(admin, {
      title: "Umrah 14 nights", destination: "Jeddah", durationDays: 14,
      price: 50_000_000n, included: ["Flights"], excluded: [],
    });
    expect(result.title).toBe("Umrah 14 nights");
  });
});
