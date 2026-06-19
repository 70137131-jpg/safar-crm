"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { updateNotificationsAction } from "@/modules/settings/settings.actions";
import type { SettingsDTO } from "@/modules/settings/settings.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";

const warnDays = z.coerce.number().int().min(0).max(365);

const formSchema = z.object({
  notifyPassportExpiry: z.boolean(),
  notifyPaymentDue: z.boolean(),
  notifyDailySummary: z.boolean(),
  notifyQuotationExpiry: z.boolean(),
  notifyOverdueTasks: z.boolean(),
  passportExpiryWarnDays: warnDays,
  paymentDueWarnDays: warnDays,
  quotationExpiryWarnDays: warnDays,
  overdueTaskWarnDays: warnDays,
});
type FormValues = z.infer<typeof formSchema>;

export function NotificationsForm({ settings }: { settings: SettingsDTO }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notifyPassportExpiry: settings.notifyPassportExpiry,
      notifyPaymentDue: settings.notifyPaymentDue,
      notifyDailySummary: settings.notifyDailySummary,
      notifyQuotationExpiry: settings.notifyQuotationExpiry,
      notifyOverdueTasks: settings.notifyOverdueTasks,
      passportExpiryWarnDays: settings.passportExpiryWarnDays,
      paymentDueWarnDays: settings.paymentDueWarnDays,
      quotationExpiryWarnDays: settings.quotationExpiryWarnDays,
      overdueTaskWarnDays: settings.overdueTaskWarnDays,
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await updateNotificationsAction(values);
      if (res.ok) {
        toast.success("Notification settings saved");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const rows: { key: keyof FormValues; daysKey?: keyof FormValues; title: string; desc: string }[] = [
    { key: "notifyPassportExpiry", daysKey: "passportExpiryWarnDays", title: "Passport reminders", desc: "Warn before a customer's passport expires." },
    { key: "notifyPaymentDue", daysKey: "paymentDueWarnDays", title: "Payment reminders", desc: "Warn before a booking balance is due." },
    { key: "notifyQuotationExpiry", daysKey: "quotationExpiryWarnDays", title: "Quotation expiry reminders", desc: "Warn before a sent quotation expires." },
    { key: "notifyOverdueTasks", daysKey: "overdueTaskWarnDays", title: "Overdue task reminders", desc: "Remind about tasks past their due date." },
    { key: "notifyDailySummary", title: "Daily summary emails", desc: "A daily digest of activity and what's due." },
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <FormField
                control={form.control}
                name={row.key as any}
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                        checked={field.value as boolean}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-medium text-sm">
                        {row.title}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">{row.desc}</p>
                    </div>
                  </FormItem>
                )}
              />
              {row.daysKey && (
                <div className="flex items-center gap-2 pl-7 sm:pl-0">
                  <FormField
                    control={form.control}
                    name={row.daysKey as any}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            className="h-9 w-20 px-2"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <span className="text-xs text-muted-foreground">days before</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}
