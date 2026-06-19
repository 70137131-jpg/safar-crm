"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { updateAgencyAction } from "@/modules/settings/settings.actions";
import type { SettingsDTO } from "@/modules/settings/settings.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "UTC"] as const;

const formSchema = z.object({
  agencyName: z.string().trim().min(1, "Agency name is required").max(200),
  agencyPhone: z.string().trim().max(40).or(z.literal("")).optional(),
  agencyEmail: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  agencyAddress: z.string().trim().max(500).or(z.literal("")).optional(),
  agencyWebsite: z.string().trim().url("Must be a valid URL").or(z.literal("")).optional(),
  taxPercentage: z.coerce.number().min(0).max(100),
  defaultTimezone: z.enum(TIMEZONES),
});
type FormValues = z.infer<typeof formSchema>;

const inputClass =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function AgencyForm({ settings }: { settings: SettingsDTO }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agencyName: settings.agencyName,
      agencyPhone: settings.agencyPhone ?? "",
      agencyEmail: settings.agencyEmail ?? "",
      agencyAddress: settings.agencyAddress ?? "",
      agencyWebsite: settings.agencyWebsite ?? "",
      taxPercentage: settings.taxPercentage,
      defaultTimezone: (TIMEZONES as readonly string[]).includes(settings.defaultTimezone as any)
        ? (settings.defaultTimezone as (typeof TIMEZONES)[number])
        : "Asia/Karachi",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await updateAgencyAction({ ...values, defaultCurrency: "PKR" });
      if (res.ok) {
        toast.success("Agency settings saved");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormField
          control={form.control}
          name="agencyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Agency name <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="agencyPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+92..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="agencyEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="agencyWebsite"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="agencyAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <textarea
                  className={inputClass}
                  rows={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="taxPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tax %</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min={0} max={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>Currency</FormLabel>
            <FormControl>
              <Input value="PKR" disabled readOnly />
            </FormControl>
            <p className="text-xs text-muted-foreground">PKR only in v1.</p>
          </FormItem>
          <FormField
            control={form.control}
            name="defaultTimezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
