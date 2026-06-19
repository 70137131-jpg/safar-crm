import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProfileAction } from "@/modules/users/users.actions";
import { ProfileClient } from "./ProfileClient";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const res = await getProfileAction();
  if (!res.ok) notFound();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">Your account details and preferences.</p>
      </div>
      <ProfileClient profile={res.data} />
    </section>
  );
}
