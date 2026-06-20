import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Create your Safar CRM account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New accounts require administrator approval before access is granted.
        </p>
        <div className="mt-6">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
