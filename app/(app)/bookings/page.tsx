import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { BookingListClient } from "./BookingListClient";

export const metadata: Metadata = {
  title: "Bookings",
};

export default async function BookingsPage() {
  const user = await getCurrentUser();
  const canCreate = !!user && can(user, "bookings:create");

  return (
    <PageWrapper>
      <PageHeader
        title="Bookings"
        description="Confirmed trips and their status."
        actions={
          canCreate ? (
            <Link
              href="/bookings/new"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Booking</span>
            </Link>
          ) : undefined
        }
      />
      <BookingListClient />
    </PageWrapper>
  );
}
