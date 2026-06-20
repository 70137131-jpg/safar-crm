import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCustomerAction } from "@/modules/customers/customers.actions";
import { BookingForm } from "../BookingForm";
import type { PickedCustomer } from "../CustomerCombobox";

interface Props {
  searchParams: Promise<{ customerId?: string }>;
}

export const metadata: Metadata = {
  title: "New Booking",
};

export default async function NewBookingPage({ searchParams }: Props) {
  const { customerId } = await searchParams;

  // Optional prefill when arriving from a customer page (?customerId=…).
  // If the customer can't be loaded (e.g. not owned by an AGENT), we silently
  // fall back to the searchable picker.
  let initialCustomer: PickedCustomer | null = null;
  if (customerId) {
    const result = await getCustomerAction(customerId);
    if (result.ok) {
      initialCustomer = { id: result.data.id, name: result.data.name };
    }
  }

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Bookings", href: "/bookings" },
          { label: "New Booking" },
        ]}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Create Booking
        </h1>
        <BookingForm mode="create" initialCustomer={initialCustomer} />
      </div>
    </PageWrapper>
  );
}
