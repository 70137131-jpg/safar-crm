import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Safar CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Internal staff access only.</p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
