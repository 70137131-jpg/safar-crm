import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { confirmProposal, rejectProposal } from "@/modules/assistant/assistant.service";
import { assistantProposalActionSchema } from "@/modules/assistant/assistant.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const { action } = assistantProposalActionSchema.parse(await request.json());
    const result =
      action === "confirm" ? await confirmProposal(user, id) : await rejectProposal(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid proposal action" }, { status: 400 });
    }
    if (error instanceof AppError) {
      const status =
        error.code === ERROR_CODES.NOT_FOUND
          ? 404
          : error.code === ERROR_CODES.FORBIDDEN
            ? 403
            : error.code === ERROR_CODES.CONFLICT
              ? 409
              : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Proposal action failed" }, { status: 500 });
  }
}
