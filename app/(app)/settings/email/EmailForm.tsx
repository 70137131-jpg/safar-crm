"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { updateEmailAction, sendTestEmailAction } from "@/modules/settings/settings.actions";
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

const formSchema = z.object({
  senderName: z.string().trim().max(120).or(z.literal("")).optional(),
  senderEmail: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  replyToEmail: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function EmailForm({ settings }: { settings: SettingsDTO }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      senderName: settings.senderName ?? "",
      senderEmail: settings.senderEmail ?? "",
      replyToEmail: settings.replyToEmail ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await updateEmailAction(values);
      if (res.ok) {
        toast.success("Email settings saved");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await sendTestEmailAction({});
      if (res.ok) toast.success(`Test email sent to ${res.data.to}`);
      else toast.error(res.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormField
          control={form.control}
          name="senderName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sender name</FormLabel>
              <FormControl>
                <Input placeholder="Safar Travels" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="senderEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sender email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="hello@agency.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="replyToEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reply-to</FormLabel>
              <FormControl>
                <Input type="email" placeholder="support@agency.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={sendTest}
            disabled={testing}
          >
            <Send className="mr-2 h-4 w-4" />
            {testing ? "Sending…" : "Send test email"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Test emails use Resend and the sender above (or the configured fallback). Save your
          changes first.
        </p>
      </form>
    </Form>
  );
}
