"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { signIn } from "@/lib/auth/client";
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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/dashboard";
  const [submitting, setSubmitting] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Seed every field so inputs are controlled from first render (avoids
    // React's "uncontrolled → controlled" warning when a field is undefined).
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    router.push(from as Route);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Form>
  );
}
