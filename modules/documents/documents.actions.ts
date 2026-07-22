"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  createUploadUrlSchema,
  confirmUploadSchema,
  listDocumentsSchema,
} from "./documents.schemas";
import type { DocumentDTO, UploadTicket } from "./documents.types";
import * as service from "./documents.service";

/**
 * Documents server actions.
 *
 * Every action: requireUser() → Zod parse → service (which authorizes via
 * requirePermission) → typed ActionResult.
 *
 * Upload is a two-step handshake (presigned PUT):
 *   1) createUploadUrlAction  — get a 5-min signed PUT URL
 *   2) confirmUploadAction    — finalize + record the row after the bytes land
 * Downloads go through the gated route /api/documents/[id]/download.
 */

export const createUploadUrlAction = serverAction(
  "documents.createUploadUrl",
  async (input: Record<string, unknown>): Promise<UploadTicket> => {
    const user = await requireUser();
    const parsed = createUploadUrlSchema.parse(input);
    return service.createUploadTicket(user, parsed);
  },
);

export const confirmUploadAction = serverAction(
  "documents.confirmUpload",
  async (input: Record<string, unknown>): Promise<DocumentDTO> => {
    const user = await requireUser();
    const parsed = confirmUploadSchema.parse(input);
    return service.confirmUpload(user, parsed);
  },
);

export const getDocumentsAction = serverAction(
  "documents.list",
  async (input: Record<string, unknown>): Promise<DocumentDTO[]> => {
    const user = await requireUser();
    const parsed = listDocumentsSchema.parse(input);
    return service.listDocuments(user, parsed);
  },
);

export const deleteDocumentAction = serverAction(
  "documents.delete",
  async (id: string): Promise<DocumentDTO> => {
    const user = await requireUser();
    return service.deleteDocument(user, id);
  },
);
