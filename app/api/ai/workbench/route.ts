import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { aiWorkbenchActionSchema } from "@/modules/ai-enhancements/ai-enhancements.schemas";
import {
  getWorkspaceDashboard,
  runWorkbenchAction,
} from "@/modules/ai-enhancements/ai-enhancements.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid AI workspace request.", details: error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (error instanceof AppError) {
    const status =
      error.code === ERROR_CODES.NOT_FOUND
        ? 404
        : error.code === ERROR_CODES.FORBIDDEN
          ? 403
          : error.code === ERROR_CODES.RATE_LIMITED
            ? 429
            : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  logger.error({ error }, "ai_workspace.request_failed");
  return NextResponse.json(
    { error: "The AI workspace could not complete this request." },
    { status: 500 },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    return NextResponse.json(await getWorkspaceDashboard(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const input = aiWorkbenchActionSchema.parse(await request.json());
    return NextResponse.json({ action: input.action, data: await runWorkbenchAction(user, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
