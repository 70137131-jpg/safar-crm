import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/codes";
import { getDownloadUrl } from "@/modules/documents/documents.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gated document download (ARCHITECTURE.md §2.7 / §8):
 *   1) resolve session,
 *   2) permission check + audit (inside the service),
 *   3) 302 → freshly minted 5-minute R2 signed URL.
 *
 * The signed URL is never embedded anywhere persistent — it is returned only
 * to a request that has already passed authorization and been audited.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) {
    // Send the browser to login; the link is only ever shown to authed users.
    return NextResponse.redirect(new URL("/login", req.url), 302);
  }

  const disposition =
    new URL(req.url).searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  try {
    const { url } = await getDownloadUrl(user, id, { disposition });
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === ERROR_CODES.FORBIDDEN) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.code === ERROR_CODES.NOT_FOUND) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
