import type { UserContext } from "@/lib/permissions/types";
import { can, requirePermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { GeminiToolDeclaration, GeminiToolResult } from "@/lib/ai/gemini";
import * as leadsService from "@/modules/leads/leads.service";
import * as customersService from "@/modules/customers/customers.service";
import * as interactionsService from "@/modules/interactions/interactions.service";
import * as tasksService from "@/modules/tasks/tasks.service";
import * as paymentsService from "@/modules/payments/payments.service";
import * as quotationsService from "@/modules/quotations/quotations.service";
import * as repo from "./assistant.repository";
import {
  bookingBalanceToolSchema,
  emptyToolSchema,
  expiringQuotationsToolSchema,
  idToolSchema,
  proposeInteractionToolSchema,
  proposeLeadStatusToolSchema,
  proposeQuotationToolSchema,
  proposeTaskToolSchema,
  searchLeadsToolSchema,
} from "./assistant.schemas";

const READ_TOOLS: GeminiToolDeclaration[] = [
  {
    type: "function",
    name: "get_my_daily_brief",
    description:
      "Get the signed-in staff member's open tasks, active leads, and quotations expiring in the next seven days.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "search_leads",
    description:
      "Search leads visible to the signed-in staff member by name, phone, email, or destination.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text." },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_lead_context",
    description: "Get a permission-scoped lead summary, status history, and recent interactions.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Lead UUID." } },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "get_customer_context",
    description:
      "Get a minimal permission-scoped customer summary and recent interactions. Sensitive passport and date-of-birth data is excluded.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Customer UUID." } },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "list_due_tasks",
    description: "List the signed-in staff member's overdue and upcoming open tasks.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "get_booking_balance",
    description: "Get a permission-scoped booking total, collected amount, and balance.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking UUID." },
      },
      required: ["bookingId"],
    },
  },
  {
    type: "function",
    name: "list_expiring_quotations",
    description: "List visible sent quotations whose validity ends soon.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Look-ahead window in days; defaults to 7.",
        },
      },
    },
  },
];

const PROPOSAL_TOOLS: Array<{
  permission: "tasks:create" | "interactions:create" | "leads:update" | "quotations:create";
  declaration: GeminiToolDeclaration;
}> = [
  {
    permission: "tasks:create",
    declaration: {
      type: "function",
      name: "propose_create_task",
      description:
        "Create a confirmation-required proposal for a CRM task. This never creates the task directly.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          title: { type: "string" },
          dueDate: { type: "string", description: "ISO 8601 date-time." },
          type: {
            type: "string",
            enum: ["FOLLOW_UP", "PASSPORT_EXPIRY", "PAYMENT_DUE", "OTHER"],
          },
          leadId: { type: "string" },
          customerId: { type: "string" },
          bookingId: { type: "string" },
          assignedToId: { type: "string" },
        },
        required: ["summary", "title", "dueDate", "type"],
      },
    },
  },
  {
    permission: "interactions:create",
    declaration: {
      type: "function",
      name: "propose_log_interaction",
      description:
        "Create a confirmation-required proposal to log an interaction. Never logs it directly.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          type: {
            type: "string",
            enum: ["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE"],
          },
          body: { type: "string" },
          leadId: { type: "string" },
          customerId: { type: "string" },
        },
        required: ["summary", "type", "body"],
      },
    },
  },
  {
    permission: "leads:update",
    declaration: {
      type: "function",
      name: "propose_change_lead_status",
      description:
        "Create a confirmation-required lead status proposal. BOOKED is intentionally unavailable because conversion owns that transition.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          leadId: { type: "string" },
          status: {
            type: "string",
            enum: ["NEW", "CONTACTED", "QUOTATION_SENT", "NEGOTIATING", "TRAVELLED", "LOST"],
          },
          version: { type: "integer" },
          lostReason: {
            type: "string",
            enum: ["PRICE", "COMPETITOR", "NO_RESPONSE", "CHANGED_PLANS", "NO_VISA", "OTHER"],
          },
          lostNotes: { type: "string" },
        },
        required: ["summary", "leadId", "status", "version"],
      },
    },
  },
  {
    permission: "quotations:create",
    declaration: {
      type: "function",
      name: "propose_create_quotation_draft",
      description:
        "Create a confirmation-required proposal for a draft quotation. It can never send a quotation.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          customerId: { type: "string" },
          leadId: { type: "string" },
          validTill: { type: "string", description: "YYYY-MM-DD." },
          discount: { type: "string", description: "PKR amount." },
          notes: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "integer" },
                unitPrice: { type: "string", description: "PKR amount." },
              },
              required: ["description", "quantity", "unitPrice"],
            },
          },
        },
        required: ["summary", "items"],
      },
    },
  },
];

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function dateTime(value: Date): string {
  return value.toISOString();
}

function source(label: string, href: string) {
  return { label, href };
}

async function createProposal(
  user: UserContext,
  conversationId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
): Promise<GeminiToolResult> {
  const proposal = await repo.createProposal({
    conversationId,
    userId: user.id,
    type,
    summary,
    payload,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  await logAudit({
    actorId: user.id,
    action: "assistant.proposal.create",
    entity: "AiActionProposal",
    entityId: proposal.id,
    before: null,
    after: { type, summary, status: proposal.status },
    ip: user.ip,
    userAgent: user.userAgent,
  });
  const dto = {
    id: proposal.id,
    type: proposal.type,
    summary: proposal.summary,
    status: proposal.status,
    expiresAt: proposal.expiresAt.toISOString(),
  };
  return {
    data: {
      proposalId: proposal.id,
      status: "PENDING_CONFIRMATION",
      summary,
      message: "The staff member must explicitly confirm this proposal in the UI.",
    },
    proposal: dto,
  };
}

export function assistantToolDeclarations(user: UserContext): GeminiToolDeclaration[] {
  return [
    ...READ_TOOLS,
    ...PROPOSAL_TOOLS.filter(({ permission }) => can(user, permission)).map(
      ({ declaration }) => declaration,
    ),
  ];
}

export async function executeAssistantTool(
  user: UserContext,
  conversationId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<GeminiToolResult> {
  const allowed = new Set(assistantToolDeclarations(user).map((tool) => tool.name));
  if (!allowed.has(name)) {
    throw new Error("This tool is not available for your role.");
  }

  switch (name) {
    case "get_my_daily_brief": {
      emptyToolSchema.parse(args);
      const [tasks, leads, quotations] = await Promise.all([
        tasksService.listTasks(user, {
          page: 1,
          pageSize: 100,
          status: "OPEN",
          mine: true,
        }),
        leadsService.listLeads(user, {
          page: 1,
          pageSize: 100,
          sortBy: "createdAt",
          sortOrder: "desc",
          includeDeleted: false,
        }),
        quotationsService.listQuotations(user, {
          page: 1,
          pageSize: 100,
          sortBy: "validTill",
          sortOrder: "asc",
          status: "SENT",
        }),
      ]);
      const now = Date.now();
      const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
      const openLeads = leads.items.filter(
        (lead) => !["BOOKED", "TRAVELLED", "LOST"].includes(lead.status),
      );
      const dueTasks = tasks.items
        .filter((task) => task.dueDate.getTime() <= sevenDays)
        .map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: dateTime(task.dueDate),
          overdue: task.dueDate.getTime() < now,
          type: task.type,
          leadId: task.leadId,
          customerId: task.customerId,
          bookingId: task.bookingId,
        }));
      const expiring = quotations.items
        .filter(
          (quote) =>
            quote.validTill &&
            quote.validTill.getTime() >= now &&
            quote.validTill.getTime() <= sevenDays,
        )
        .map((quote) => ({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          targetName: quote.targetName,
          validTill: dateOnly(quote.validTill),
          totalPaisa: quote.totalPaisa.toString(),
        }));
      return {
        data: {
          asOf: new Date().toISOString(),
          dueTasks,
          activeLeadCount: openLeads.length,
          recentActiveLeads: openLeads.slice(0, 10).map((lead) => ({
            id: lead.id,
            contactName: lead.contactName,
            status: lead.status,
            destination: lead.destination,
            travelDate: dateOnly(lead.travelDate),
          })),
          expiringQuotations: expiring,
        },
        sources: [
          source("Tasks", "/tasks"),
          source("Leads", "/leads"),
          source("Quotations", "/quotations"),
        ],
      };
    }
    case "search_leads": {
      const input = searchLeadsToolSchema.parse(args);
      const result = await leadsService.listLeads(user, {
        page: 1,
        pageSize: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
        search: input.query,
        includeDeleted: false,
      });
      return {
        data: result.items.map((lead) => ({
          id: lead.id,
          contactName: lead.contactName,
          status: lead.status,
          destination: lead.destination,
          source: lead.source,
          travelDate: dateOnly(lead.travelDate),
          assignedAgent: lead.assignedAgent?.name ?? null,
        })),
        sources: result.items.map((lead) =>
          source(`Lead: ${lead.contactName}`, `/leads/${lead.id}`),
        ),
      };
    }
    case "get_lead_context": {
      const { id } = idToolSchema.parse(args);
      const [lead, history, interactions] = await Promise.all([
        leadsService.getLead(user, id),
        leadsService.getLeadHistory(user, id),
        interactionsService.listByLead(user, id),
      ]);
      return {
        data: {
          lead: {
            id: lead.id,
            contactName: lead.contactName,
            status: lead.status,
            source: lead.source,
            destination: lead.destination,
            tripPurpose: lead.tripPurpose,
            routeShape: lead.routeShape,
            pax: lead.pax,
            budgetPaisa: lead.budgetPaisa?.toString() ?? null,
            travelDate: dateOnly(lead.travelDate),
            assignedAgent: lead.assignedAgent?.name ?? null,
            customerId: lead.customerId,
            version: lead.version,
          },
          statusHistory: history.slice(-10).map((event) => ({
            from: event.fromStatus,
            to: event.toStatus,
            reason: event.reason,
            occurredAt: dateTime(event.occurredAt),
          })),
          untrustedInteractionNotes: interactions.slice(-10).map((item) => ({
            type: item.type,
            body: item.body.slice(0, 1500),
            occurredAt: dateTime(item.occurredAt),
          })),
        },
        sources: [source(`Lead: ${lead.contactName}`, `/leads/${lead.id}`)],
      };
    }
    case "get_customer_context": {
      const { id } = idToolSchema.parse(args);
      const [customer, interactions] = await Promise.all([
        customersService.getCustomer(user, id),
        interactionsService.listByCustomer(user, id),
      ]);
      return {
        data: {
          customer: {
            id: customer.id,
            name: customer.name,
            nationality: customer.nationality,
            assignedAgent: customer.assignedAgent?.name ?? null,
            createdAt: dateTime(customer.createdAt),
          },
          untrustedInteractionNotes: interactions.slice(-10).map((item) => ({
            type: item.type,
            body: item.body.slice(0, 1500),
            occurredAt: dateTime(item.occurredAt),
          })),
        },
        sources: [source(`Customer: ${customer.name}`, `/customers/${customer.id}`)],
      };
    }
    case "list_due_tasks": {
      emptyToolSchema.parse(args);
      const result = await tasksService.listTasks(user, {
        page: 1,
        pageSize: 100,
        status: "OPEN",
        mine: true,
      });
      return {
        data: result.items.map((task) => ({
          id: task.id,
          title: task.title,
          type: task.type,
          dueDate: dateTime(task.dueDate),
          overdue: task.dueDate.getTime() < Date.now(),
          leadId: task.leadId,
          customerId: task.customerId,
          bookingId: task.bookingId,
        })),
        sources: [source("Tasks", "/tasks")],
      };
    }
    case "get_booking_balance": {
      const { bookingId } = bookingBalanceToolSchema.parse(args);
      const balance = await paymentsService.getBookingBalance(user, bookingId);
      return {
        data: {
          bookingId,
          totalPaisa: balance.totalPaisa.toString(),
          collectedPaisa: balance.collectedPaisa.toString(),
          balancePaisa: balance.balancePaisa.toString(),
          fullyPaid: balance.fullyPaid,
        },
        sources: [source("Booking payments", `/bookings/${bookingId}`)],
      };
    }
    case "list_expiring_quotations": {
      const { days } = expiringQuotationsToolSchema.parse(args);
      const result = await quotationsService.listQuotations(user, {
        page: 1,
        pageSize: 100,
        sortBy: "validTill",
        sortOrder: "asc",
        status: "SENT",
      });
      const now = Date.now();
      const cutoff = now + days * 24 * 60 * 60 * 1000;
      const rows = result.items.filter(
        (quote) =>
          quote.validTill &&
          quote.validTill.getTime() >= now &&
          quote.validTill.getTime() <= cutoff,
      );
      return {
        data: rows.map((quote) => ({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          targetName: quote.targetName,
          totalPaisa: quote.totalPaisa.toString(),
          validTill: dateOnly(quote.validTill),
        })),
        sources: rows.map((quote) =>
          source(`Quotation ${quote.quoteNumber ?? "draft"}`, `/quotations/${quote.id}`),
        ),
      };
    }
    case "propose_create_task": {
      requirePermission(user, "tasks:create");
      const input = proposeTaskToolSchema.parse(args);
      const { summary, ...payload } = input;
      return createProposal(user, conversationId, "CREATE_TASK", summary, payload);
    }
    case "propose_log_interaction": {
      requirePermission(user, "interactions:create");
      const input = proposeInteractionToolSchema.parse(args);
      const { summary, ...payload } = input;
      return createProposal(user, conversationId, "LOG_INTERACTION", summary, payload);
    }
    case "propose_change_lead_status": {
      const input = proposeLeadStatusToolSchema.parse(args);
      const lead = await leadsService.getLead(user, input.leadId);
      requirePermission(user, "leads:update", lead);
      const { summary, ...payload } = input;
      return createProposal(user, conversationId, "CHANGE_LEAD_STATUS", summary, payload);
    }
    case "propose_create_quotation_draft": {
      requirePermission(user, "quotations:create");
      const input = proposeQuotationToolSchema.parse(args);
      const { summary, ...payload } = input;
      return createProposal(user, conversationId, "CREATE_QUOTATION_DRAFT", summary, payload);
    }
    default:
      throw new Error(`Unknown assistant tool: ${name}`);
  }
}
