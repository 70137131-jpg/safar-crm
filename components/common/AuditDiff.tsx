import { cn } from "@/lib/cn";

/**
 * Renders an audit row's `before`/`after` payloads. When both sides are plain
 * objects it shows a compact field-level diff (changed rows highlighted);
 * otherwise it falls back to side-by-side raw JSON. Values are already
 * PII-redacted upstream, so they're displayed verbatim.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const hasBefore = before !== undefined && before !== null;
  const hasAfter = after !== undefined && after !== null;

  if (!hasBefore && !hasAfter) {
    return <p className="text-xs text-muted-foreground">No payload recorded.</p>;
  }

  if (isPlainObject(before) || isPlainObject(after)) {
    const b = isPlainObject(before) ? before : {};
    const a = isPlainObject(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();

    return (
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Before</th>
              <th className="px-3 py-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((k) => {
              const bv = k in b ? b[k] : undefined;
              const av = k in a ? a[k] : undefined;
              const changed = JSON.stringify(bv) !== JSON.stringify(av);
              return (
                <tr key={k} className={cn(changed && "bg-yellow-50 dark:bg-yellow-950/30")}>
                  <td className="px-3 py-1.5 font-medium text-foreground">{k}</td>
                  <td className="break-all px-3 py-1.5 font-mono text-muted-foreground">
                    {formatValue(bv)}
                  </td>
                  <td
                    className={cn(
                      "break-all px-3 py-1.5 font-mono",
                      changed ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatValue(av)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Non-object payloads (string/number/array) — raw JSON, side by side.
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
          {hasBefore ? JSON.stringify(before, null, 2) : "—"}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
          {hasAfter ? JSON.stringify(after, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}
