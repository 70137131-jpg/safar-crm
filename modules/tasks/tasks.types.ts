import type { TaskStatus, TaskType } from "@prisma/client";

export interface TaskDTO {
  id: string;
  title: string;
  dueDate: Date;
  status: TaskStatus;
  type: TaskType;
  leadId: string | null;
  customerId: string | null;
  bookingId: string | null;
  assignedToId: string;
  assignedTo: { id: string; name: string } | null;
  doneAt: Date | null;
  createdAt: Date;
}

export interface TaskListItem {
  id: string;
  title: string;
  dueDate: Date;
  status: TaskStatus;
  type: TaskType;
  assignedToId: string;
  assignedTo: { id: string; name: string } | null;
  customerId: string | null;
  bookingId: string | null;
  leadId: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
