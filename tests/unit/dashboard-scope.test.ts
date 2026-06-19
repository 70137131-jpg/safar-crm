import { describe, it, expect } from "vitest";
import { dashboardScope } from "@/app/(app)/dashboard/scope";
import type { UserContext } from "@/lib/permissions/types";
import type { Role } from "@/lib/permissions/types";

function user(role: Role, id = "agent-1"): UserContext {
  return { id, email: `${role}@x.test`, name: role, role };
}

describe("dashboardScope", () => {
  it("returns empty (unscoped) fragments for ADMIN/MANAGER/ACCOUNTANT", () => {
    for (const role of ["ADMIN", "MANAGER", "ACCOUNTANT"] as const) {
      const s = dashboardScope(user(role));
      expect(s.isAgent).toBe(false);
      expect(s.customer).toEqual({});
      expect(s.lead).toEqual({});
      expect(s.booking).toEqual({});
      expect(s.payment).toEqual({});
      expect(s.quotation).toEqual({});
      expect(s.task).toEqual({});
    }
  });

  it("scopes every entity to the AGENT's own records", () => {
    const s = dashboardScope(user("AGENT", "agent-42"));
    expect(s.isAgent).toBe(true);
    // Customer / Lead own directly via assignedAgentId
    expect(s.customer).toEqual({ assignedAgentId: "agent-42" });
    expect(s.lead).toEqual({ assignedAgentId: "agent-42" });
    // Booking owns via linked customer's agent
    expect(s.booking).toEqual({ customer: { is: { assignedAgentId: "agent-42" } } });
    // Payment owns via booking -> customer's agent
    expect(s.payment).toEqual({
      booking: { is: { customer: { is: { assignedAgentId: "agent-42" } } } },
    });
    // Quotation owns via customer OR lead
    expect(s.quotation).toEqual({
      OR: [
        { customer: { is: { assignedAgentId: "agent-42" } } },
        { lead: { is: { assignedAgentId: "agent-42" } } },
      ],
    });
    // Task owns via assignee
    expect(s.task).toEqual({ assignedToId: "agent-42" });
  });

  it("scopes to the specific agent id (no cross-agent leakage)", () => {
    const a = dashboardScope(user("AGENT", "agent-A"));
    const b = dashboardScope(user("AGENT", "agent-B"));
    expect(a.customer).not.toEqual(b.customer);
    expect((a.customer as { assignedAgentId: string }).assignedAgentId).toBe("agent-A");
  });
});
