import { redirect } from "next/navigation";

/** Settings has no index — land on the user's own profile (always accessible). */
export default function SettingsPage() {
  redirect("/settings/profile");
}
