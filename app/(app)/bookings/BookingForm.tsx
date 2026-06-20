"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { toPKR } from "@/lib/money/paisa";
import {
  createBookingAction,
  updateBookingAction,
} from "@/modules/bookings/bookings.actions";
import type { BookingDTO } from "@/modules/bookings/bookings.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedChangesWarning } from "@/lib/hooks/use-unsaved-changes";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CustomerCombobox, type PickedCustomer } from "./CustomerCombobox";
import { toDateInputValue } from "./bookingMeta";

// Client-side mirror of the relevant parts of the server schemas.
const formSchema = z.object({
  travelDate: z.string().trim().or(z.literal("")).optional(),
  totalPrice: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), {
      message: "Enter a valid amount (e.g. 500000 or 500000.50)",
    })
    .or(z.literal(""))
    .optional(),
  notes: z.string().trim().max(2000).or(z.literal("")).optional(),
});
type FormValues = z.infer<typeof formSchema>;

const textareaCls =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface Props {
  mode: "create" | "edit";
  booking?: BookingDTO;
  /** Pre-selected customer when arriving from a customer page (?customerId=). */
  initialCustomer?: PickedCustomer | null;
}

export function BookingForm({ mode, booking, initialCustomer }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(
    mode === "edit" && booking?.customer
      ? { id: booking.customer.id, name: booking.customer.name }
      : (initialCustomer ?? null),
  );
  const [customerError, setCustomerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      travelDate: toDateInputValue(booking?.travelDate),
      totalPrice:
        booking?.totalPricePaisa != null ? toPKR(booking.totalPricePaisa) : "",
      notes: booking?.notes ?? "",
    },
  });

  useUnsavedChangesWarning(
    (form.formState.isDirty || (mode === "create" && !!customer)) && !submitting,
  );

  async function onSubmit(values: FormValues) {
    if (mode === "create" && !customer) {
      setCustomerError("Select a customer for this booking.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createBookingAction({
          customerId: customer!.id,
          travelDate: values.travelDate ?? "",
          totalPrice: values.totalPrice ?? "",
          notes: values.notes ?? "",
        });
        if (result.ok) {
          toast.success("Booking created");
          router.push(`/bookings/${result.data.id}` as Route);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } else if (booking) {
        const result = await updateBookingAction(booking.id, {
          travelDate: values.travelDate ?? "",
          totalPrice: values.totalPrice ?? "",
          // Pass the existing package through so an edit never disconnects it.
          packageId: booking.packageId ?? "",
          notes: values.notes ?? "",
        });
        if (result.ok) {
          toast.success("Booking updated");
          router.push(`/bookings/${booking.id}` as Route);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer (plain markup — not a react-hook-form field) */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Customer{" "}
            {mode === "create" && <span className="text-destructive">*</span>}
          </label>
          {mode === "edit" ? (
            <>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                {customer?.name ?? "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                The customer can&apos;t be changed after a booking is created.
              </p>
            </>
          ) : (
            <CustomerCombobox
              value={customer}
              onChange={(c) => {
                setCustomer(c);
                setCustomerError(null);
              }}
            />
          )}
          {customerError && (
            <p className="text-sm font-medium text-destructive">{customerError}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="travelDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Travel Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="totalPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Price (PKR)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="500000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <textarea
                  className={textareaCls}
                  rows={3}
                  placeholder="Internal notes about this booking…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Create Booking"
                : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
