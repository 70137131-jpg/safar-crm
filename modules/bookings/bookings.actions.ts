"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  createBookingSchema,
  updateBookingSchema,
  changeBookingStatusSchema,
  cancelBookingSchema,
  listBookingsSchema,
} from "./bookings.schemas";
import type {
  BookingDTO,
  BookingListItem,
  BookingStatusEventDTO,
  PaginatedResult,
} from "./bookings.types";
import * as service from "./bookings.service";

/**
 * Bookings server actions.
 *
 * Every action:
 *   1. requireUser() — loads session
 *   2. Zod parse — validates input
 *   3. Delegates to service (which calls requirePermission())
 *   4. Returns typed ActionResult
 */

export const createBookingAction = serverAction(
  "bookings.create",
  async (formData: Record<string, unknown>): Promise<BookingDTO> => {
    const user = await requireUser();
    const input = createBookingSchema.parse(formData);
    return service.createBooking(user, input);
  },
);

export const updateBookingAction = serverAction(
  "bookings.update",
  async (id: string, formData: Record<string, unknown>): Promise<BookingDTO> => {
    const user = await requireUser();
    const input = updateBookingSchema.parse(formData);
    return service.updateBooking(user, id, input);
  },
);

export const changeBookingStatusAction = serverAction(
  "bookings.changeStatus",
  async (id: string, formData: Record<string, unknown>): Promise<BookingDTO> => {
    const user = await requireUser();
    const input = changeBookingStatusSchema.parse(formData);
    return service.changeStatus(user, id, input);
  },
);

export const cancelBookingAction = serverAction(
  "bookings.cancel",
  async (id: string, formData: Record<string, unknown>): Promise<BookingDTO> => {
    const user = await requireUser();
    const input = cancelBookingSchema.parse(formData);
    return service.cancelBooking(user, id, input);
  },
);

export const getBookingAction = serverAction(
  "bookings.get",
  async (id: string): Promise<BookingDTO> => {
    const user = await requireUser();
    return service.getBooking(user, id);
  },
);

export const listBookingsAction = serverAction(
  "bookings.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<BookingListItem>> => {
    const user = await requireUser();
    const input = listBookingsSchema.parse(params);
    return service.listBookings(user, input);
  },
);

export const getBookingHistoryAction = serverAction(
  "bookings.history",
  async (id: string): Promise<BookingStatusEventDTO[]> => {
    const user = await requireUser();
    return service.getBookingHistory(user, id);
  },
);
