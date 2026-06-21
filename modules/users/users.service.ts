import type { UserRole } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { auth } from "@/lib/auth/server";
import * as leadsService from "@/modules/leads/leads.service";
import * as repo from "./users.repository";
import type {
  ChangePasswordInput,
  CreateUserInput,
  ListUsersInput,
  ResetPasswordInput,
  SignUpInput,
  UpdateProfileInput,
  UpdateUserInput,
} from "./users.schemas";
import type { AssignableAgent, PaginatedResult, UserDTO } from "./users.types";

/**
 * Users service — administration of staff accounts.
 *
 * Rules (spec): cannot deactivate/demote the last active ADMIN; users are never
 * deleted (deactivate only); role changes require `users:manage` (ADMIN);
 * email is unique; every mutation is audited. Passwords are hashed by Better
 * Auth's hasher so they verify at login; hashes never leave this layer.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: UserRole;
  deactivatedAt: Date | null;
  emailVerified: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(r: UserRecord): UserDTO {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    avatar: r.avatar,
    role: r.role,
    isActive: r.deactivatedAt === null,
    emailVerified: r.emailVerified,
    mustChangePassword: r.mustChangePassword,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const ctx = await auth.$context;
  return ctx.password.verify({ hash, password });
}

/**
 * Guards the "always at least one active ADMIN" invariant. `next` describes the
 * intended post-change state of `target`.
 */
async function assertNotLastAdmin(
  target: UserRecord,
  next: { role: UserRole; isActive: boolean },
): Promise<void> {
  const wasActiveAdmin = target.role === "ADMIN" && target.deactivatedAt === null;
  const staysActiveAdmin = next.role === "ADMIN" && next.isActive;
  if (!wasActiveAdmin || staysActiveAdmin) return;

  const others = await repo.countActiveAdmins({ excludeId: target.id });
  if (others === 0) {
    throw new ValidationError("Cannot remove the last active administrator");
  }
}

/**
 * Blocks deactivation while the user still owns open leads. The admin must
 * reassign the pipeline first (Leads → reassign) so nothing is orphaned.
 * (TASKS.md §1.1 — "deactivation gated by open leads".)
 */
async function assertNoOpenAssignments(userId: string): Promise<void> {
  const openLeads = await leadsService.countOpenLeadsForAgent(userId);
  if (openLeads > 0) {
    throw new ConflictError(
      `This user still has ${openLeads} open lead${openLeads === 1 ? "" : "s"} assigned. ` +
        `Reassign them before deactivating.`,
    );
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Roster of assignable agents (used by lead assignment). */
export async function listAssignableAgents(user: UserContext): Promise<AssignableAgent[]> {
  requirePermission(user, "leads:view");
  return repo.findAssignableAgents();
}

export async function listUsers(
  user: UserContext,
  input: ListUsersInput,
): Promise<PaginatedResult<UserDTO>> {
  requirePermission(user, "users:view");
  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    role: input.role,
    status: input.status,
  });
  return {
    items: items.map(toDTO),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function getUser(user: UserContext, id: string): Promise<UserDTO> {
  requirePermission(user, "users:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("User not found");
  return toDTO(record);
}

/** The current user's own profile. No special permission — identity only. */
export async function getProfile(user: UserContext): Promise<UserDTO> {
  const record = await repo.findById(user.id);
  if (!record) throw new NotFoundError("User not found");
  return toDTO(record);
}

// ─── Public self-registration ────────────────────────────────────────────────

/**
 * Public sign-up (unauthenticated). Creates a DEACTIVATED account that an admin
 * must activate (Settings → Users → Reactivate) before the person can sign in.
 *
 * Security: NO permission check (public flow), but the role is hard-forced to
 * AGENT — never taken from client input — and the account has no access until
 * approved. Mirrors the admin-create credential path (no session is created, so
 * the new user is not auto-signed-in).
 */
export async function selfRegister(
  input: SignUpInput,
  meta?: { ip?: string; userAgent?: string },
): Promise<{ email: string }> {
  if (await repo.existsByEmail(input.email)) {
    throw new ConflictError("An account with this email already exists");
  }

  const hashedPassword = await hashPassword(input.password);

  await withAudit(
    {
      actorId: null, // system / self-registration
      action: "user.self_register",
      entity: "User",
      before: null,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) =>
      toDTO(
        await repo.createWithCredential(
          {
            name: input.name,
            email: input.email,
            role: "AGENT", // never client-chosen
            hashedPassword,
            mustChangePassword: false,
            deactivatedAt: new Date(), // pending admin approval — no access yet
          },
          tx,
        ),
      ),
  );

  return { email: input.email };
}

// ─── Admin mutations ─────────────────────────────────────────────────────────

export async function createUser(user: UserContext, input: CreateUserInput): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  if (await repo.existsByEmail(input.email)) {
    throw new ConflictError("A user with this email already exists");
  }

  const hashedPassword = await hashPassword(input.temporaryPassword);

  return withAudit(
    {
      actorId: user.id,
      action: "user.create",
      entity: "User",
      before: null,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.createWithCredential(
        {
          name: input.name,
          email: input.email,
          role: input.role,
          hashedPassword,
          mustChangePassword: true, // require change on first login
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function updateUser(
  user: UserContext,
  id: string,
  input: UpdateUserInput,
): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("User not found");

  await assertNotLastAdmin(existing, { role: input.role, isActive: input.isActive });

  const goingInactive = existing.deactivatedAt === null && !input.isActive;
  const goingActive = existing.deactivatedAt !== null && input.isActive;

  if (goingInactive) await assertNoOpenAssignments(existing.id);

  const before = toDTO(existing);

  return withAudit(
    {
      actorId: user.id,
      action: "user.update",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        {
          name: input.name,
          avatar: input.avatar ?? null,
          role: input.role,
          ...(goingInactive ? { deactivatedAt: new Date(), deactivatedById: user.id } : {}),
          ...(goingActive ? { deactivatedAt: null, deactivatedById: null } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function deactivateUser(user: UserContext, id: string): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("User not found");
  if (existing.deactivatedAt !== null) throw new ValidationError("User is already deactivated");
  if (existing.id === user.id) throw new ForbiddenError("You cannot deactivate your own account");

  await assertNotLastAdmin(existing, { role: existing.role, isActive: false });
  await assertNoOpenAssignments(existing.id);

  const before = toDTO(existing);
  return withAudit(
    {
      actorId: user.id,
      action: "user.deactivate",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        { deactivatedAt: new Date(), deactivatedById: user.id },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function reactivateUser(user: UserContext, id: string): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("User not found");
  if (existing.deactivatedAt === null) throw new ValidationError("User is already active");

  const before = toDTO(existing);
  return withAudit(
    {
      actorId: user.id,
      action: "user.reactivate",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(id, { deactivatedAt: null, deactivatedById: null }, tx);
      return toDTO(record);
    },
  );
}

export async function changeRole(user: UserContext, id: string, role: UserRole): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("User not found");

  await assertNotLastAdmin(existing, { role, isActive: existing.deactivatedAt === null });

  const before = toDTO(existing);
  return withAudit(
    {
      actorId: user.id,
      action: "user.role_change",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(id, { role }, tx);
      return toDTO(record);
    },
  );
}

export async function resetPassword(
  user: UserContext,
  id: string,
  input: ResetPasswordInput,
): Promise<UserDTO> {
  requirePermission(user, "users:manage");

  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("User not found");

  const hashedPassword = await hashPassword(input.newPassword);
  const before = toDTO(existing);

  return withAudit(
    {
      actorId: user.id,
      action: "user.password_reset",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      await repo.updatePasswordHash(id, hashedPassword, tx);
      const record = await repo.update(id, { mustChangePassword: true }, tx);
      return toDTO(record);
    },
  );
}

// ─── Self-service (profile) ──────────────────────────────────────────────────

export async function updateProfile(
  user: UserContext,
  input: UpdateProfileInput,
): Promise<UserDTO> {
  const existing = await repo.findById(user.id);
  if (!existing) throw new NotFoundError("User not found");

  const emailChanged = input.email !== existing.email;
  if (emailChanged && (await repo.existsByEmail(input.email, user.id))) {
    throw new ConflictError("A user with this email already exists");
  }

  const before = toDTO(existing);
  return withAudit(
    {
      actorId: user.id,
      action: "user.profile_update",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        user.id,
        {
          name: input.name,
          avatar: input.avatar ?? null,
          email: input.email,
          ...(emailChanged ? { emailVerified: false } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function changePassword(
  user: UserContext,
  input: ChangePasswordInput,
): Promise<UserDTO> {
  const existing = await repo.findById(user.id);
  if (!existing) throw new NotFoundError("User not found");

  const currentHash = await repo.findCredentialHash(user.id);
  if (!currentHash || !(await verifyPassword(currentHash, input.currentPassword))) {
    throw new ValidationError("Current password is incorrect", "currentPassword");
  }

  const hashedPassword = await hashPassword(input.newPassword);
  const before = toDTO(existing);

  return withAudit(
    {
      actorId: user.id,
      action: "user.password_change",
      entity: "User",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: UserDTO) => r.id,
    },
    async (tx) => {
      await repo.updatePasswordHash(user.id, hashedPassword, tx);
      const record = await repo.update(user.id, { mustChangePassword: false }, tx);
      return toDTO(record);
    },
  );
}
