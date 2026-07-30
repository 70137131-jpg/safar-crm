import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { notificationActionSchema } from "@/modules/assistant/assistant-notifications.schemas";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/assistant/assistant-notifications.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid notification action" }, { status: 400 });
  }
  if (error instanceof AppError) {
    const status =
      error.code === ERROR_CODES.NOT_FOUND ? 404 : error.code === ERROR_CODES.FORBIDDEN ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  logger.error({ error }, "assistant.notifications_failed");
  return NextResponse.json({ error: "Notifications are unavailable" }, { status: 500 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    return NextResponse.json(await listNotifications(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const input = notificationActionSchema.parse(await request.json());
    if (input.action === "read") {
      await markNotificationRead(user, input.id);
    } else {
      await markAllNotificationsRead(user);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
