import "server-only";
import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";

/**
 * Dashboard widgets query the DB directly (module services are stubs for the
 * read-only dashboard, per ARCHITECTURE.md §5.12). Because they bypass the
 * service layer, they MUST apply ownership scoping themselves — otherwise an
 * AGENT would see agency-wide data (including financials) on the dashboard,
 * which they cannot see anywhere else.
 *
 * Ownership model (mirrors the module services):
 *   - Customer / Lead   → `assignedAgentId`
 *   - Booking           → linked customer's `assignedAgentId`
 *   - Payment           → booking → customer's `assignedAgentId`
 *   - Quotation         → customer's OR lead's `assignedAgentId`
 *   - Task              → `assignedToId` (the assignee)
 *
 * ADMIN / MANAGER / ACCOUNTANT see everything (empty `where` fragments).
 */
export interface DashboardScope {
  isAgent: boolean;
  customer: Prisma.CustomerWhereInput;
  lead: Prisma.LeadWhereInput;
  booking: Prisma.BookingWhereInput;
  payment: Prisma.PaymentWhereInput;
  quotation: Prisma.QuotationWhereInput;
  task: Prisma.TaskWhereInput;
}

export function dashboardScope(user: UserContext): DashboardScope {
  const agentId = user.role === "AGENT" ? user.id : null;
  if (!agentId) {
    return { isAgent: false, customer: {}, lead: {}, booking: {}, payment: {}, quotation: {}, task: {} };
  }
  return {
    isAgent: true,
    customer: { assignedAgentId: agentId },
    lead: { assignedAgentId: agentId },
    booking: { customer: { is: { assignedAgentId: agentId } } },
    payment: { booking: { is: { customer: { is: { assignedAgentId: agentId } } } } },
    quotation: {
      OR: [
        { customer: { is: { assignedAgentId: agentId } } },
        { lead: { is: { assignedAgentId: agentId } } },
      ],
    },
    task: { assignedToId: agentId },
  };
}
