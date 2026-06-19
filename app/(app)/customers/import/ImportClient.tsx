"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { importCustomersAction } from "@/modules/customers/customers.actions";
import type { ImportResult } from "@/modules/customers/customers.types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── CSV parser ─────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const headers = headerLine.split(",").map((h) => h.trim().replace(/^"(.*)"$/, "$1"));

  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

// ─── Steps ──────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "importing" | "result";

const EXPECTED_COLUMNS = [
  "name",
  "email",
  "phone",
  "nationality",
  "passportNo",
  "passportExpiry",
  "dob",
  "address",
  "notes",
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);

    if (
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls")
    ) {
      toast.error(
        "XLSX support requires the exceljs library. Please export to CSV for now.",
      );
      return;
    }

    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      toast.error("No valid rows found in the file.");
      return;
    }
    setRows(parsed);
    setStep("preview");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    setStep("importing");
    const res = await importCustomersAction(rows);
    if (res.ok) {
      setResult(res.data);
      setStep("result");
    } else {
      toast.error(res.message);
      setStep("preview");
    }
  }, [rows]);

  // ── Upload step ────────────────────────────────────────────────────────

  if (step === "upload") {
    return (
      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">
          Drop a CSV file here, or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Expected columns: {EXPECTED_COLUMNS.join(", ")}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
    );
  }

  // ── Preview step ───────────────────────────────────────────────────────

  if (step === "preview") {
    const headerKeys = rows.length > 0 ? Object.keys(rows[0]!) : [];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {rows.length} row{rows.length !== 1 && "s"} found
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setRows([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleImport}>
              Import {rows.length} rows
            </Button>
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                {headerKeys.map((key) => (
                  <TableHead
                    key={key}
                    className={cn(
                      !EXPECTED_COLUMNS.includes(key) && "text-amber-700",
                    )}
                  >
                    {key}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  {headerKeys.map((key) => (
                    <TableCell key={key} className="max-w-[200px] truncate">
                      {row[key] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > 100 && (
            <p className="p-3 text-center text-xs text-muted-foreground">
              Showing first 100 of {rows.length} rows
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Importing step ─────────────────────────────────────────────────────

  if (step === "importing") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium">Importing customers…</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This may take a moment for large files.
        </p>
      </div>
    );
  }

  // ── Result step ────────────────────────────────────────────────────────

  if (step === "result" && result) {
    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{result.totalRows}</p>
            <p className="text-sm text-muted-foreground">Total Rows</p>
          </div>
          <div className="rounded-lg border bg-green-50 p-4 text-center dark:bg-green-950/20">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">
              {result.successCount}
            </p>
            <p className="text-sm text-green-600 dark:text-green-500">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              Imported
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border p-4 text-center",
              result.errorCount > 0
                ? "bg-red-50 dark:bg-red-950/20"
                : "bg-card",
            )}
          >
            <p
              className={cn(
                "text-2xl font-bold",
                result.errorCount > 0
                  ? "text-red-700 dark:text-red-400"
                  : "text-muted-foreground",
              )}
            >
              {result.errorCount}
            </p>
            <p
              className={cn(
                "text-sm",
                result.errorCount > 0
                  ? "text-red-600 dark:text-red-500"
                  : "text-muted-foreground",
              )}
            >
              {result.errorCount > 0 ? (
                <>
                  <XCircle className="mr-1 inline h-4 w-4" />
                  Failed
                </>
              ) : (
                "No errors"
              )}
            </p>
          </div>
        </div>

        {/* Error details */}
        {result.errors.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Errors ({result.errors.length})
            </h3>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errors.map((err, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{err.row}</TableCell>
                      <TableCell>{err.name ?? "—"}</TableCell>
                      <TableCell className="text-destructive">{err.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => router.push("/customers")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setRows([]);
              setResult(null);
            }}
          >
            Import More
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
