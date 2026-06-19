"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/modules/customers/customers.actions";
import type { CustomerDTO } from "@/modules/customers/customers.types";
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

// ─── Form schema (client-side mirror of server schemas) ─────────────────────

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  phone: z.string().trim().or(z.literal("")).optional(),
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Must be a 2-letter country code")
    .or(z.literal(""))
    .optional(),
  passportNo: z
    .string()
    .trim()
    .toUpperCase()
    .or(z.literal(""))
    .optional(),
  passportExpiry: z.string().or(z.literal("")).optional(),
  dob: z.string().or(z.literal("")).optional(),
  address: z.string().trim().max(500).or(z.literal("")).optional(),
  notes: z.string().trim().max(2000).or(z.literal("")).optional(),
  assignedAgentId: z.string().or(z.literal("")).optional(),
});
type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0] ?? "";
}

function isExpiringSoon(date: string | undefined): boolean {
  if (!date) return false;
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return new Date(date) <= sixMonths;
}

const inputCls =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  mode: "create" | "edit";
  customer?: CustomerDTO;
}

export function CustomerForm({ mode, customer }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      nationality: customer?.nationality ?? "",
      passportNo: customer?.passportNo ?? "",
      passportExpiry: toDateInputValue(customer?.passportExpiry),
      dob: toDateInputValue(customer?.dob),
      address: customer?.address ?? "",
      notes: customer?.notes ?? "",
      assignedAgentId: customer?.assignedAgentId ?? "",
    },
  });

  const passportExpiry = form.watch("passportExpiry");

  useUnsavedChangesWarning(form.formState.isDirty && !submitting);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createCustomerAction(values);
        if (result.ok) {
          toast.success("Customer created");
          router.push(`/customers/${result.data.id}` as Route);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } else if (customer) {
        const result = await updateCustomerAction(customer.id, values);
        if (result.ok) {
          toast.success("Customer updated");
          router.push(`/customers/${customer.id}` as Route);
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
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Name <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="Full name" aria-required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Email + Phone row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="customer@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="03001234567"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Nationality */}
        <FormField
          control={form.control}
          name="nationality"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nationality</FormLabel>
              <FormControl>
                <Input
                  className="max-w-[120px] uppercase"
                  placeholder="PK"
                  maxLength={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Passport section */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium text-muted-foreground">
            Passport Information
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="passportNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passport Number</FormLabel>
                  <FormControl>
                    <Input
                      className="uppercase"
                      placeholder="AB1234567"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="passportExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passport Expiry</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  {isExpiringSoon(passportExpiry) && (
                    <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Passport expires within 6 months
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        {/* DOB */}
        <FormField
          control={form.control}
          name="dob"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of Birth</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="max-w-[200px]"
                  max={new Date().toISOString().split("T")[0]}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Address */}
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <textarea
                  className={inputCls}
                  rows={2}
                  placeholder="Street address, city, country"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <textarea
                  className={inputCls}
                  rows={3}
                  placeholder="Internal notes about this customer…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create Customer"
                : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
