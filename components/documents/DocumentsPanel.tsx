"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  UploadCloud,
  Download,
  Trash2,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { DocumentDTO } from "@/modules/documents/documents.types";
import {
  getDocumentsAction,
  createUploadUrlAction,
  confirmUploadAction,
  deleteDocumentAction,
} from "@/modules/documents/documents.actions";

// ─── Client-side constants (mirror ARCHITECTURE.md §8 — r2.ts is server-only) ─

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 25 * 1024 * 1024;

const DOC_TYPES = [
  { value: "PASSPORT", label: "Passport" },
  { value: "VISA", label: "Visa" },
  { value: "TICKET", label: "Ticket" },
  { value: "VOUCHER", label: "Hotel Voucher" },
  { value: "INVOICE", label: "Invoice" },
  { value: "OTHER", label: "Other" },
] as const;
type DocTypeValue = (typeof DOC_TYPES)[number]["value"];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((t) => [t.value, t.label]),
);
const TYPE_TONE: Record<string, StatusTone> = {
  PASSPORT: "info",
  VISA: "info",
  TICKET: "neutral",
  VOUCHER: "neutral",
  INVOICE: "success",
  OTHER: "neutral",
};
const CATEGORY_ORDER: DocTypeValue[] = ["PASSPORT", "VISA", "TICKET", "VOUCHER", "INVOICE", "OTHER"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(date));
}

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function FileIcon({ contentType }: { contentType: string }) {
  const Icon = contentType.startsWith("image/") ? ImageIcon : FileText;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function ExpiryBadge({ expiryDate }: { expiryDate: Date | string | null }) {
  if (!expiryDate) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(expiryDate);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  if (days < 0) return <StatusBadge tone="danger">Expired</StatusBadge>;
  if (days <= 30) return <StatusBadge tone="warning">{days}d left</StatusBadge>;
  if (days <= 45) return <StatusBadge tone="warning">{days}d left</StatusBadge>;
  return <span className="text-muted-foreground">{formatDate(expiryDate)}</span>;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  customerId?: string;
  bookingId?: string;
  canUpload: boolean;
  canDelete: boolean;
  /** Group documents under category headings (used on booking detail). */
  categorized?: boolean;
}

export function DocumentsPanel({ customerId, bookingId, canUpload, canDelete, categorized }: Props) {
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [docType, setDocType] = useState<DocTypeValue>("PASSPORT");
  const [expiry, setExpiry] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parent = bookingId ? { bookingId } : { customerId };

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getDocumentsAction(parent);
    if (res.ok) setDocs(res.data);
    else setLoadError(res.message);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setUploadError(null);

      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError("Unsupported file type. Allowed: PDF, JPEG, PNG.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setUploadError("File exceeds the 25 MB limit.");
        return;
      }

      setUploading(true);
      try {
        const checksum = await sha256Hex(file);

        const ticketRes = await createUploadUrlAction({
          ...parent,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          type: docType,
        });
        if (!ticketRes.ok) {
          setUploadError(ticketRes.message);
          return;
        }

        const put = await fetch(ticketRes.data.uploadUrl, {
          method: "PUT",
          headers: ticketRes.data.requiredHeaders,
          body: file,
        });
        if (!put.ok) {
          setUploadError("Upload to storage failed. Please retry.");
          return;
        }

        const confirmRes = await confirmUploadAction({
          ...parent,
          fileKey: ticketRes.data.fileKey,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksumSha256: checksum,
          type: docType,
          expiryDate: expiry || undefined,
        });
        if (!confirmRes.ok) {
          setUploadError(confirmRes.message);
          return;
        }

        setDocs((prev) => [confirmRes.data, ...prev]);
        setExpiry("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch {
        setUploadError("Something went wrong during upload. Please retry.");
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, bookingId, docType, expiry],
  );

  async function handleDelete(id: string) {
    const res = await deleteDocumentAction(id);
    if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== id));
    else setLoadError(res.message);
  }

  return (
    <div className="space-y-6">
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (!uploading) void handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border border-dashed p-4 transition-colors sm:p-6",
            dragActive ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocTypeValue)}
                disabled={uploading}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Expiry date (optional)
              </span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                disabled={uploading}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col items-center justify-center gap-2 py-4 text-center">
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag &amp; drop a file here, or
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Browse"}
            </button>
            <p className="text-xs text-muted-foreground">PDF, JPEG or PNG · max 25 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>

          {uploadError && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {uploadError}
            </p>
          )}
        </div>
      )}

      {loadError && (
        <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No documents yet"
          description={canUpload ? "Upload a file to get started." : "No documents have been uploaded."}
        />
      ) : categorized ? (
        <CategorizedList docs={docs} canDelete={canDelete} onDelete={handleDelete} />
      ) : (
        <DocumentList docs={docs} canDelete={canDelete} onDelete={handleDelete} />
      )}
    </div>
  );
}

// ─── List variants ────────────────────────────────────────────────────────────

function CategorizedList({
  docs,
  canDelete,
  onDelete,
}: {
  docs: DocumentDTO[];
  canDelete: boolean;
  onDelete: (id: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((type) => {
        const group = docs.filter((d) => d.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type}>
            <h4 className="mb-2 text-sm font-semibold">{TYPE_LABEL[type] ?? type}</h4>
            <DocumentList docs={group} canDelete={canDelete} onDelete={onDelete} />
          </div>
        );
      })}
    </div>
  );
}

function DocumentList({
  docs,
  canDelete,
  onDelete,
}: {
  docs: DocumentDTO[];
  canDelete: boolean;
  onDelete: (id: string) => void | Promise<void>;
}) {
  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-3 sm:hidden">
        {docs.map((doc) => (
          <li key={doc.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon contentType={doc.contentType} />
                <span className="truncate text-sm font-medium">{doc.fileName}</span>
              </div>
              <StatusBadge tone={TYPE_TONE[doc.type] ?? "neutral"}>
                {TYPE_LABEL[doc.type] ?? doc.type}
              </StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{formatBytes(doc.sizeBytes)}</span>
              <ExpiryBadge expiryDate={doc.expiryDate} />
              <span>{doc.uploadedBy?.name ?? "—"}</span>
              <span>{formatDate(doc.createdAt)}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RowActions doc={doc} canDelete={canDelete} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Size</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
              <th className="px-4 py-2 font-medium">Uploaded by</th>
              <th className="px-4 py-2 font-medium">Uploaded</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileIcon contentType={doc.contentType} />
                    <span className="max-w-[20rem] truncate">{doc.fileName}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge tone={TYPE_TONE[doc.type] ?? "neutral"}>
                    {TYPE_LABEL[doc.type] ?? doc.type}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatBytes(doc.sizeBytes)}</td>
                <td className="px-4 py-2">
                  <ExpiryBadge expiryDate={doc.expiryDate} />
                </td>
                <td className="px-4 py-2 text-muted-foreground">{doc.uploadedBy?.name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(doc.createdAt)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <RowActions doc={doc} canDelete={canDelete} onDelete={onDelete} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RowActions({
  doc,
  canDelete,
  onDelete,
}: {
  doc: DocumentDTO;
  canDelete: boolean;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const previewable = doc.contentType === "application/pdf" || doc.contentType.startsWith("image/");
  return (
    <>
      {previewable && (
        <a
          href={`/api/documents/${doc.id}/download?disposition=inline`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title="Preview"
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Preview</span>
        </a>
      )}
      <a
        href={`/api/documents/${doc.id}/download`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        title="Download"
      >
        <Download className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">Download</span>
      </a>
      {canDelete && (
        <ConfirmDialog
          title="Delete document?"
          description={`"${doc.fileName}" will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => onDelete(doc.id)}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Delete</span>
            </button>
          )}
        />
      )}
    </>
  );
}
