import type { UserRole } from "@prisma/client";

/** Minimal user shape for assignment pickers. */
export interface AssignableAgent {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * User DTO returned by the users service. `isActive` is derived from
 * `deactivatedAt` so the UI never reasons about timestamps for status.
 * No password / account fields are ever exposed.
 */
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
