import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  info: "bg-blue-100 text-blue-900 hover:bg-blue-100/80 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-950/80",
  success: "bg-green-100 text-green-900 hover:bg-green-100/80 dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-950/80",
  warning: "bg-yellow-100 text-yellow-900 hover:bg-yellow-100/80 dark:bg-yellow-950 dark:text-yellow-200 dark:hover:bg-yellow-950/80",
  danger: "bg-red-100 text-red-900 hover:bg-red-100/80 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-950/80",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}
