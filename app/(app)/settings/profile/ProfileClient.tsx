"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Moon, Sun } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { updateProfileAction, changePasswordAction } from "@/modules/users/users.actions";
import type { UserDTO } from "@/modules/users/users.types";
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

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Invalid email"),
  avatar: z.string().trim().url("Must be a valid URL").or(z.literal("")).optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(12, "At least 12 characters")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/[0-9]/, "Add a digit")
      .regex(/[^A-Za-z0-9]/, "Add a special character"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(
    new Date(date),
  );
}

export function ProfileClient({ profile }: { profile: UserDTO }) {
  const router = useRouter();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: profile.name, email: profile.email, avatar: profile.avatar ?? "" },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function onSaveProfile(values: ProfileValues) {
    setSavingProfile(true);
    try {
      const res = await updateProfileAction(values);
      if (res.ok) {
        toast.success("Profile updated");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(values: PasswordValues) {
    setSavingPassword(true);
    try {
      const res = await changePasswordAction(values);
      if (res.ok) {
        toast.success("Password changed");
        passwordForm.reset();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {profile.mustChangePassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          For security, please set a new password below.
        </div>
      )}

      {/* Account info */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} url={profile.avatar} />
          <div>
            <p className="font-medium">{profile.name}</p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="mt-0.5"><StatusBadge tone="info">{profile.role}</StatusBadge></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last login</dt>
            <dd className="mt-0.5">{formatDate(profile.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="mt-0.5">{formatDate(profile.createdAt)}</dd>
          </div>
        </dl>
      </section>

      {/* Profile form */}
      <Form {...profileForm}>
        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
          <h2 className="text-lg font-semibold">Profile</h2>
          <FormField
            control={profileForm.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={profileForm.control}
            name="email"
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
          <FormField
            control={profileForm.control}
            name="avatar"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Avatar URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Form>

      {/* Appearance */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <ThemeToggle />
      </section>

      {/* Change password */}
      <Form {...passwordForm}>
        <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
          <h2 className="text-lg font-semibold">Change password</h2>
          <FormField
            control={passwordForm.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={passwordForm.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground mt-2">Min 12 chars with upper, lower, digit and symbol.</p>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Form>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-14 w-14 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-medium text-primary">
      {initials || "?"}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;
  const current = mounted ? (theme ?? "system") : "system";

  return (
    <div className="inline-flex rounded-md border p-1">
      {options.map((o) => {
        const Icon = o.icon;
        const active = current === o.value;
        return (
          <Button
            key={o.value}
            variant={active ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTheme(o.value)}
            className="gap-1.5 h-8 font-normal"
            aria-pressed={active}
          >
            <Icon className="h-4 w-4" />
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
