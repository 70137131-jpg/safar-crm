"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { toPKR } from "@/lib/money/paisa";
import { createLeadAction, updateLeadAction } from "@/modules/leads/leads.actions";
import { listAssignableAgentsAction } from "@/modules/users/users.actions";
import type { LeadDTO } from "@/modules/leads/leads.types";
import type { AssignableAgent } from "@/modules/users/users.types";
import {
  TRIP_PURPOSE_OPTIONS,
  ROUTE_SHAPE_OPTIONS,
  toDateInputValue,
} from "./leadMeta";
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

const formSchema = z.object({
  contactName: z.string().trim().min(1, "Contact Name is required").max(200),
  contactPhone: z.string().trim().min(1, "Phone is required").max(50),
  contactEmail: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  destination: z.string().trim().max(100).or(z.literal("")).optional(),
  tripPurpose: z.string().trim().or(z.literal("")).optional(),
  routeShape: z.string().trim().or(z.literal("")).optional(),
  pax: z.string().trim().or(z.literal("")).optional(),
  budget: z.string().trim().or(z.literal("")).optional(),
  travelDate: z.string().trim().or(z.literal("")).optional(),
  source: z.string().trim().max(100).or(z.literal("")).optional(),
  assignedAgentId: z.string().trim().or(z.literal("")).optional(),
});
type FormValues = z.infer<typeof formSchema>;

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function LeadForm({ mode, lead }: { mode: "create" | "edit"; lead?: LeadDTO }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contactName: lead?.contactName ?? "",
      contactPhone: lead?.contactPhone ?? "",
      contactEmail: lead?.contactEmail ?? "",
      destination: lead?.destination ?? "",
      tripPurpose: lead?.tripPurpose ?? "",
      routeShape: lead?.routeShape ?? "",
      pax: lead?.pax?.toString() ?? "",
      budget: lead?.budgetPaisa != null ? toPKR(lead.budgetPaisa) : "",
      travelDate: toDateInputValue(lead?.travelDate),
      source: lead?.source ?? "",
      assignedAgentId: lead?.assignedAgentId ?? "",
    },
  });

  useEffect(() => {
    void listAssignableAgentsAction().then((r) => {
      if (r.ok) setAgents(r.data);
    });
  }, []);

  useUnsavedChangesWarning(form.formState.isDirty && !submitting);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createLeadAction(values)
          : await updateLeadAction(lead!.id, values);
      if (result.ok) {
        toast.success(mode === "create" ? "Lead created" : "Lead updated");
        router.push(`/leads/${result.data.id}` as Route);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Contact Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Phone <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="03001234567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="lead@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination</FormLabel>
                <FormControl>
                  <Input placeholder="Jeddah" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="tripPurpose"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip Purpose</FormLabel>
                <FormControl>
                  <select className={inputCls} {...field}>
                    <option value="">—</option>
                    {TRIP_PURPOSE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="routeShape"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Route</FormLabel>
                <FormControl>
                  <select className={inputCls} {...field}>
                    <option value="">—</option>
                    {ROUTE_SHAPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="pax"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pax</FormLabel>
                <FormControl>
                  <Input type="number" min={1} placeholder="2" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="budget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Budget (PKR)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="500000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="travelDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Travel Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <FormControl>
                  <Input placeholder="WhatsApp, Referral…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assignedAgentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned Agent</FormLabel>
                <FormControl>
                  <select className={inputCls} {...field}>
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
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
            {submitting ? "Saving…" : mode === "create" ? "Create Lead" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
