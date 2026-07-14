import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { ConvertInput, FileDTO, ImagesToPdfInput } from "@pdfforge/shared";
import type { File as FileModel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { badRequest, notFound } from "../lib/errors";
import { rasterizePdf } from "../lib/rasterize";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, stripExtension } from "./pdf.service";

async function getOwned(userId: string, fileId: string): Promise<FileModel> {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId, deletedAt: null } });
  if (!file) throw notFound("File not found");
  if (!(await storage.exists(file.storageKey))) {
    throw badRequest(`"${file.name}" is missing from storage`, "FILE_MISSING");
  }
  return file;
}

function readBytes(file: FileModel): Promise<Buffer> {
  return storage.readBytes(file.storageKey);
}

/** PDF → one image file per page. */
async function pdfToImages(
  userId: string,
  file: FileModel,
  input: ConvertInput,
): Promise<FileDTO[]> {
  const bytes = await readBytes(file);
  const format = input.target === "png" ? "png" : "jpeg";
  const pages = await rasterizePdf(bytes, { dpi: input.dpi, format, quality: input.quality });
  const base = stripExtension(input.name ?? file.name);
  const ext = input.target === "png" ? "png" : "jpg";
  const mime = input.target === "png" ? "image/png" : "image/jpeg";

  const results: FileModel[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const name = pages.length === 1 ? `${base}.${ext}` : `${base}-p${i + 1}.${ext}`;
    results.push(await saveGeneratedAny(userId, name, pages[i]!.buffer, mime, null));
  }
  return results.map(toFileDTO);
}

/** Single image → single-page PDF sized to the image. */
async function imageToPdf(
  userId: string,
  file: FileModel,
  input: ConvertInput,
): Promise<FileDTO> {
  const doc = await PDFDocument.create();
  await addImagePage(doc, await readBytes(file), file.mimeType);
  const bytes = await doc.save();
  const name = `${stripExtension(input.name ?? file.name)}.pdf`;
  const created = await saveGeneratedAny(userId, name, Buffer.from(bytes), "application/pdf", 1);
  return toFileDTO(created);
}

async function addImagePage(doc: PDFDocument, bytes: Buffer, mimeType: string): Promise<void> {
  // Normalize anything sharp can read (webp etc.) to PNG/JPEG for pdf-lib.
  let embedBytes = bytes;
  let embedMime = mimeType;
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    embedBytes = await sharp(bytes).png().toBuffer();
    embedMime = "image/png";
  }
  const image =
    embedMime === "image/png" ? await doc.embedPng(embedBytes) : await doc.embedJpg(embedBytes);
  // 96 dpi pixels → 72 dpi points.
  const w = (image.width * 72) / 96;
  const h = (image.height * 72) / 96;
  const page = doc.addPage([w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });
}

/** Several images combined into one PDF, one page per image. */
export async function imagesToPdf(userId: string, input: ImagesToPdfInput): Promise<FileDTO> {
  const doc = await PDFDocument.create();
  let firstName = "images";
  for (const id of input.fileIds) {
    const file = await getOwned(userId, id);
    if (!file.mimeType.startsWith("image/")) {
      throw badRequest(`"${file.name}" is not an image`, "NOT_AN_IMAGE");
    }
    if (firstName === "images") firstName = stripExtension(file.name);
    await addImagePage(doc, await readBytes(file), file.mimeType);
  }
  const bytes = await doc.save();
  const name = `${stripExtension(input.name ?? firstName)}.pdf`;
  const created = await saveGeneratedAny(
    userId,
    name,
    Buffer.from(bytes),
    "application/pdf",
    doc.getPageCount(),
  );
  await activity.log(userId, "CONVERT", {
    fileId: created.id,
    detail: `${input.fileIds.length} images → ${name}`,
  });
  return toFileDTO(created);
}

export async function convert(
  userId: string,
  fileId: string,
  input: ConvertInput,
): Promise<FileDTO[]> {
  const file = await getOwned(userId, fileId);
  const isPdf = file.mimeType === "application/pdf";
  const isImage = file.mimeType.startsWith("image/");

  let results: FileDTO[];

  if (input.target === "png" || input.target === "jpg") {
    if (!isPdf) throw badRequest("Image export requires a PDF source", "UNSUPPORTED_CONVERSION");
    await getOwnedPdf(userId, fileId); // validates parseability
    results = await pdfToImages(userId, file, input);
  } else {
    // target === "pdf": wrap a single image in a page.
    if (!isImage) {
      throw badRequest("This file is already a PDF or cannot become one", "UNSUPPORTED_CONVERSION");
    }
    results = [await imageToPdf(userId, file, input)];
  }

  await activity.log(userId, "CONVERT", {
    fileId: results[0]!.id,
    detail: `${file.name} → ${input.target.toUpperCase()}${results.length > 1 ? ` (${results.length} files)` : ""}`,
  });
  return results;
}

