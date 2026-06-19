import type { LeadStatus } from "@prisma/client";

/**
 * Single source of truth for chart colors.
 *
 * Previously these values were duplicated across every report chart
 * (PIE_COLORS, STAGE_COLORS, and inline hsl() literals). Centralizing them
 * here keeps the report palette consistent and editable in one place.
 *
 * Charts need more distinct hues than the semantic UI tokens provide, and the
 * UI semantic tokens (e.g. --destructive) are tuned as background fills with a
 * light foreground rather than as graph strokes, so chart colors are kept as a
 * dedicated, theme-stable palette here. Converting these to dark-aware CSS
 * variables is tracked for the dark-mode pass (Step 8), where rendering can be
 * verified visually.
 */

/** Named semantic series shared across multiple charts. */
export const CHART_SERIES = {
  /** Primary metric (e.g. revenue) — follows the app's foreground/primary token. */
  primary: "hsl(var(--primary))",
  /** Positive / completed / collected. */
  positive: "hsl(142, 71%, 45%)",
  /** Secondary informational metric. */
  info: "hsl(217, 91%, 60%)",
  warning: "hsl(38, 92%, 50%)",
  danger: "hsl(0, 84%, 60%)",
} as const;

/** Distinct hues for arbitrary, unranked categories (e.g. lead sources). */
export const CHART_CATEGORICAL = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(47, 100%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(25, 95%, 53%)",
  "hsl(0, 84%, 60%)",
  "hsl(173, 80%, 40%)",
  "hsl(330, 80%, 60%)",
] as const;

/**
 * Per lead-stage color used by the funnel chart. Keyed by stage so the color is
 * stable regardless of data ordering, with BOOKED/LOST anchored to the same
 * positive/danger hues used elsewhere for those meanings.
 */
export const LEAD_STAGE_COLOR: Record<LeadStatus, string> = {
  NEW: "hsl(217, 91%, 60%)",
  CONTACTED: "hsl(262, 83%, 58%)",
  QUOTATION_SENT: "hsl(47, 100%, 50%)",
  NEGOTIATING: "hsl(25, 95%, 53%)",
  BOOKED: "hsl(142, 71%, 45%)",
  TRAVELLED: "hsl(173, 80%, 40%)",
  LOST: "hsl(0, 84%, 60%)",
};

/** Stage color lookup that tolerates a plain string (e.g. serialized report data). */
export function leadStageColor(stage: string): string {
  return LEAD_STAGE_COLOR[stage as LeadStatus] ?? CHART_SERIES.info;
}
