import { PDFDocument } from "pdf-lib";
import type { FileDTO, ProtectInput, UnlockInput } from "@pdfforge/shared";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { encryptPdf, decryptPdf } from "../lib/qpdf";
import { toFileDTO } from "./file.service";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, stripExtension, withPdfExtension } from "./pdf.service";

async function pageCountOf(bytes: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

/** Adds password protection (256-bit AES) and saves the result as a new file. */
export async function protect(
  userId: string,
  fileId: string,
  input: ProtectInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);
  const pageCount = await pageCountOf(bytes);
  const encrypted = await encryptPdf(bytes, input.password);
  const created = await saveGeneratedAny(
    userId,
    withPdfExtension(input.name ?? `${stripExtension(file.name)}-protected`),
    encrypted,
    "application/pdf",
    pageCount,
  );
  await activity.log(userId, "PROTECT", { fileId: created.id, detail: file.name });
  return toFileDTO(created);
}

/** Removes password protection (needs the correct password); saves a new file. */
export async function unlock(
  userId: string,
  fileId: string,
  input: UnlockInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);
  const decrypted = await decryptPdf(bytes, input.password);
  const pageCount = await pageCountOf(decrypted);
  const created = await saveGeneratedAny(
    userId,
    withPdfExtension(input.name ?? `${stripExtension(file.name)}-unlocked`),
    decrypted,
    "application/pdf",
    pageCount,
  );
  await activity.log(userId, "UNLOCK", { fileId: created.id, detail: file.name });
  return toFileDTO(created);
}
