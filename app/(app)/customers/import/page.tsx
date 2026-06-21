import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { ImportClient } from "./ImportClient";

export const metadata: Metadata = {
  title: "Import Customers",
};

export default function ImportCustomersPage() {
  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Customers", href: "/customers" },
          { label: "Import" },
        ]}
      />
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">
          Import Customers
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Upload a CSV file with customer data (up to 25 MB / 50,000 rows).
          Preview rows before importing; any rejected rows can be downloaded as
          an error report.
        </p>
        <ImportClient />
      </div>
    </PageWrapper>
  );
}
