/**
 * Client-side export utilities.
 *
 * Generates CSV or TSV (Excel-compatible) from report data.
 * PDF uses the browser print dialog as a lightweight approach.
 * All exports use server-returned (already permission-filtered) data.
 */

export function generateCSV(
  headers: string[],
  rows: (string | number)[][],
): string {
  const escape = (v: string | number): string => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  return lines.join("\n");
}

export function generateExcel(
  headers: string[],
  rows: (string | number)[][],
): string {
  // TSV format — opens natively in Excel with correct column separation
  const escape = (v: string | number): string => {
    const s = String(v);
    return s.replace(/\t/g, " ").replace(/\n/g, " ");
  };

  const lines = [
    headers.map(escape).join("\t"),
    ...rows.map((row) => row.map(escape).join("\t")),
  ];
  return lines.join("\n");
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob(["\uFEFF" + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCSV(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const csv = generateCSV(headers, rows);
  downloadFile(csv, `${filename}.csv`, "text/csv");
}

export function exportToExcel(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const tsv = generateExcel(headers, rows);
  downloadFile(tsv, `${filename}.xls`, "application/vnd.ms-excel");
}

export function exportToPDF(): void {
  window.print();
}

/**
 * Format paisa string to PKR display for export.
 * Takes serialized paisa (string of bigint) and formats to "1,234.56".
 */
export function paisaToExportPKR(paisaStr: string): string {
  const paisa = BigInt(paisaStr);
  const negative = paisa < 0n;
  const abs = negative ? -paisa : paisa;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}.${frac.toString().padStart(2, "0")}`;
}
