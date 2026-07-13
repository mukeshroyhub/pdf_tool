import { PDFDocument } from "pdf-lib";
import type { File as FileModel } from "@prisma/client";
import type { FileDTO, ListFilesQuery, UpdateFileInput } from "@pdfforge/shared";
import { prisma } from "../lib/prisma";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { AppError, badRequest, notFound } from "../lib/errors";

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function toFileDTO(file: FileModel): FileDTO {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    pageCount: file.pageCount,
    isFavorite: file.isFavorite,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

async function countPdfPages(storageKey: string): Promise<number | null> {
  try {
    const bytes = await storage.readBytes(storageKey);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null; // page count is best-effort, never blocks an upload
  }
}

export interface IncomingUpload {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string; // relative to uploads root, already written to disk
}

/** Registers uploaded files, enforcing the user's storage quota atomically. */
export async function registerUploads(
  userId: string,
  uploads: IncomingUpload[],
): Promise<FileDTO[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const incomingTotal = uploads.reduce((sum, u) => sum + u.sizeBytes, 0);

  if (user.storageUsed + BigInt(incomingTotal) > user.storageLimit) {
    await Promise.all(uploads.map((u) => storage.remove(u.storageKey)));
    throw new AppError(413, "QUOTA_EXCEEDED", "Not enough storage space for this upload");
  }

  const created: FileModel[] = [];
  for (const upload of uploads) {
    const pageCount =
      upload.mimeType === "application/pdf" ? await countPdfPages(upload.storageKey) : null;
    const file = await prisma.file.create({
      data: {
        userId,
        name: upload.originalName,
        mimeType: upload.mimeType,
        sizeBytes: BigInt(upload.sizeBytes),
        storageKey: upload.storageKey,
        pageCount,
      },
    });
    await activity.log(userId, "UPLOAD", { fileId: file.id, detail: upload.originalName });
    created.push(file);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { storageUsed: { increment: BigInt(incomingTotal) } },
  });

  return created.map(toFileDTO);
}

export async function list(userId: string, query: ListFilesQuery) {
  const where = {
    userId,
    deletedAt: null,
    ...(query.favorite !== undefined ? { isFavorite: query.favorite } : {}),
    ...(query.search ? { name: { contains: query.search } } : {}),
  };
  const [files, total] = await prisma.$transaction([
    prisma.file.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.file.count({ where }),
  ]);
  return { files: files.map(toFileDTO), total, page: query.page, limit: query.limit };
}

async function getOwned(userId: string, fileId: string): Promise<FileModel> {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId, deletedAt: null } });
  if (!file) throw notFound("File not found");
  return file;
}

export async function getOne(userId: string, fileId: string): Promise<FileDTO> {
  return toFileDTO(await getOwned(userId, fileId));
}

export async function update(
  userId: string,
  fileId: string,
  input: UpdateFileInput,
): Promise<FileDTO> {
  const existing = await getOwned(userId, fileId);
  const file = await prisma.file.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
    },
  });
  if (input.name !== undefined && input.name !== existing.name) {
    await activity.log(userId, "RENAME", {
      fileId: file.id,
      detail: `${existing.name} → ${input.name}`,
    });
  }
  if (input.isFavorite !== undefined && input.isFavorite !== existing.isFavorite) {
    await activity.log(userId, input.isFavorite ? "FAVORITE" : "UNFAVORITE", {
      fileId: file.id,
      detail: file.name,
    });
  }
  return toFileDTO(file);
}

export async function destroy(userId: string, fileId: string): Promise<void> {
  const file = await getOwned(userId, fileId);
  await storage.remove(file.storageKey);
  // Log first so the activity survives with fileId set to null by the cascade rule.
  await activity.log(userId, "DELETE", { detail: file.name });
  await prisma.file.delete({ where: { id: file.id } });
  await prisma.user.update({
    where: { id: userId },
    data: { storageUsed: { decrement: file.sizeBytes } },
  });
}

export async function forDownload(userId: string, fileId: string): Promise<FileModel> {
  const file = await getOwned(userId, fileId);
  if (!(await storage.exists(file.storageKey))) {
    throw badRequest("File contents are missing from storage", "FILE_MISSING");
  }
  await activity.log(userId, "DOWNLOAD", { fileId: file.id, detail: file.name });
  return file;
}
