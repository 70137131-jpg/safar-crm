import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getBookingAction } from "@/modules/bookings/bookings.actions";
import { BookingForm } from "../../BookingForm";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Booking",
};

export default async function EditBookingPage({ params }: Props) {
  const { id } = await params;
  const result = await getBookingAction(id);
  if (!result.ok) notFound();

  // A cancelled booking is read-only — the service rejects edits, so don't even
  // show the form.
  if (result.data.status === "CANCELLED") {
    redirect(`/bookings/${id}` as Route);
  }

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Bookings", href: "/bookings" },
          { label: result.data.bookingNumber, href: `/bookings/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Edit Booking
        </h1>
        <BookingForm mode="edit" booking={result.data} />
      </div>
    </PageWrapper>
  );
}
