import type { Role } from "./permissions";

/**
 * The thin user object passed through services / actions.
 * Never carry a raw Better Auth session into business code — extract
 * the fields you need into a UserContext at the boundary.
 */
export interface UserContext {
  id: string;
  email: string;
  name: string;
  role: Role;
  ip?: string;
  userAgent?: string;
}

/**
 * Marker shape for resources that can be "owned" by an agent.
 * Pass any object with `assignedAgentId` (Customer, Lead, Booking, …)
 * to `can()` to apply ownership scoping.
 */
export interface OwnableResource {
  assignedAgentId?: string | null;
}

export type { Role };
export type { Permission } from "./permissions";
