import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-muted-foreground">Page not found.</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
