import type { DocumentType } from "@prisma/client";

/**
 * Document DTO returned by the service to UI/actions.
 *
 * SECURITY: deliberately omits `fileKey` and `checksumSha256`. The R2 object
 * key is a secret — clients reference a document only by `id` and download via
 * the gated route `/api/documents/[id]/download`. Never add fileKey here.
 */
export interface DocumentDTO {
  id: string;
  type: DocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiryDate: Date | null;
  customerId: string | null;
  bookingId: string | null;
  uploadedById: string;
  uploadedBy: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response for step 1 of the upload handshake. The client PUTs the file bytes
 * to `uploadUrl` sending exactly `requiredHeaders`, then calls confirmUpload
 * with the returned `fileKey`.
 */
export interface UploadTicket {
  uploadUrl: string;
  fileKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}
