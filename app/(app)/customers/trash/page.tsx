import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TrashClient } from "./TrashClient";

export const metadata: Metadata = {
  title: "Trash · Customers",
};

export default function TrashPage() {
  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Customers", href: "/customers" },
          { label: "Trash" },
        ]}
      />
      <h1 className="mb-2 text-xl font-semibold tracking-tight">
        Deleted Customers
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers that have been soft-deleted. Restore them or permanently
        delete them (ADMIN only).
      </p>
      <TrashClient />
    </PageWrapper>
  );
}
