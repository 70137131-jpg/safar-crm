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
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          };
          void runAssistant(user, body, (text) => send("delta", { text }))
            .then((result) => send("complete", result))
            .catch((error: unknown) => {
              if (!(error instanceof AppError) && !(error instanceof ZodError)) {
                logger.error({ error }, "assistant.stream_failed");
              }
              send("error", {
                error:
                  error instanceof AppError
                    ? error.message
                    : error instanceof ZodError
                      ? (error.issues[0]?.message ?? "Invalid request")
                      : "Ask Safar could not complete the request.",
              });
            })
            .finally(() => controller.close());
        },
      });
      return new Response(stream, {
        headers: {
          "cache-control": "no-cache, no-transform",
          "content-type": "text/event-stream; charset=utf-8",
          "x-accel-buffering": "no",
        },
      });
    }
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
