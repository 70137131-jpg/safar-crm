import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Safar CRM", template: "%s · Safar CRM" },
  description: "Internal CRM for Safar Travels.",
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
