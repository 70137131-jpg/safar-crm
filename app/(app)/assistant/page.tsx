import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { env } from "@/lib/env";
import { AssistantClient } from "./AssistantClient";

export const metadata: Metadata = {
  title: "Ask Safar",
  description: "Permission-aware operations copilot for Safar CRM.",
};

export default async function AssistantPage() {
  const user = await requireUser();
  requirePermission(user, "assistant:use");

  return (
    <PageWrapper>
      <PageHeader title="Ask Safar" description="Your permission-aware CRM operations copilot." />
      <AssistantClient configured={Boolean(env.GEMINI_API_KEY)} />
    </PageWrapper>
  );
}
