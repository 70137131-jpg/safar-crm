import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceAssistantRateLimit } from "@/lib/ai/rate-limit";
import { getConversation, runAssistant } from "@/modules/assistant/assistant.service";
import { assistantConversationIdSchema } from "@/modules/assistant/assistant.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  if (error instanceof AppError) {
    const status = {
      [ERROR_CODES.VALIDATION]: 400,
      [ERROR_CODES.UNAUTHORIZED]: 401,
      [ERROR_CODES.FORBIDDEN]: 403,
      [ERROR_CODES.NOT_FOUND]: 404,
      [ERROR_CODES.CONFLICT]: 409,
      [ERROR_CODES.RATE_LIMITED]: 429,
      [ERROR_CODES.INTEGRATION]: 502,
      [ERROR_CODES.UNEXPECTED]: 500,
    }[error.code];
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  logger.error({ error }, "assistant.route_failed");
  return NextResponse.json({ error: "Ask Safar could not complete the request." }, { status: 500 });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    enforceAssistantRateLimit(user.id);
    const body: unknown = await request.json();
    return NextResponse.json(await runAssistant(user, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const id = assistantConversationIdSchema.parse(
      new URL(request.url).searchParams.get("conversationId"),
    );
    return NextResponse.json(await getConversation(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}
