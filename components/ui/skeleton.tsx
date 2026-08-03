import { cn } from "@/lib/cn"

/**
 * Placeholder block. Styling lives in the `.skeleton` class in `globals.css` so
 * every placeholder shares one viewport-anchored light sweep — see the comment
 * there for why the glow is a fixed-attachment background rather than a
 * per-element animation.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
