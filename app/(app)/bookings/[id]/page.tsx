import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getBookingAction } from "@/modules/bookings/bookings.actions";
import { BookingDetailClient } from "./BookingDetailClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getBookingAction(id);
  return { title: result.ok ? result.data.bookingNumber : "Booking" };
}

export default async function BookingDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  const result = await getBookingAction(id);
  if (!result.ok) notFound();

  const user = await getCurrentUser();
  // Ownership flows through the linked customer's assigned agent.
  const owner = { assignedAgentId: result.data.customer?.assignedAgentId ?? null };
  const caps = {
    canUpdate: !!user && can(user, "bookings:update", owner),
    canCancel: !!user && can(user, "bookings:cancel", owner),
    canCreateTask: !!user && can(user, "tasks:create"),
    canAssignTask: !!user && can(user, "tasks:assign"),
  };
  const paymentCaps = {
    canRecord: !!user && can(user, "payments:create"),
    canRefund: !!user && can(user, "payments:refund"),
    cashOnly: user?.role === "AGENT",
  };

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Bookings", href: "/bookings" },
          { label: result.data.bookingNumber },
        ]}
      />
      <BookingDetailClient
        key={result.data.id}
        booking={result.data}
        caps={caps}
        paymentCaps={paymentCaps}
        initialTab={tab}
      />
    </PageWrapper>
  );
}
