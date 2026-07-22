import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { getInvoice } from "@/modules/invoices/invoices.service";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";
import { getAgencyProfile } from "@/modules/settings/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  try {
    const [invoice, agency] = await Promise.all([getInvoice(user, id), getAgencyProfile()]);
    const pdf = await renderInvoicePdf({
      agency: {
        name: agency.agencyName,
        address: agency.agencyAddress,
        phone: agency.agencyPhone,
        email: agency.agencyEmail,
        taxNo: agency.taxRegistrationNo,
      },
      invoiceNumber: invoice.invoiceNumber,
      bookingNumber: invoice.bookingNumber,
      customerName: invoice.customerName,
      amountPaisa: invoice.amountPaisa,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      notes: invoice.notes,
    });
    await logAudit({
      actorId: user.id,
      action: "invoice.download",
      entity: "Invoice",
      entityId: invoice.id,
      after: { invoiceNumber: invoice.invoiceNumber },
      ip: user.ip,
      userAgent: user.userAgent,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("Invoice not found", { status: 404 });
  }
}
