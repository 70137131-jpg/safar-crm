export const PKT_TZ = "Asia/Karachi";

/**
 * Returns the start of `date` in PKT, expressed as a UTC Date suitable for DB.
 * Use anywhere you mean "midnight PKT on day X".
 */
export function pktStartOfDay(date: Date = new Date()): Date {
  const pkt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${pkt}T00:00:00+05:00`);
}

/** Display a Date in PKT. Default: short date + 24h time. */
export function formatPKT(
  date: Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat("en-PK", { ...opts, timeZone: PKT_TZ }).format(date);
}

/** YYYY-MM-DD in PKT for date-only fields. */
export function pktDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
