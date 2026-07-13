import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import ExcelJS from "exceljs";
import type { ConvertInput, FileDTO, ImagesToPdfInput } from "@pdfforge/shared";
import type { File as FileModel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { badRequest, notFound } from "../lib/errors";
import { rasterizePdf } from "../lib/rasterize";
import { convertWithSoffice } from "../lib/soffice";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, stripExtension } from "./pdf.service";

const OFFICE_MIMES: Record<string, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const OFFICE_EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(OFFICE_MIMES).map(([ext, mime]) => [mime, ext]),
);

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

/** PDF → XLSX by clustering extracted text into rows/columns. */
async function pdfToXlsx(userId: string, file: FileModel, input: ConvertInput): Promise<FileDTO> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const raw = await readBytes(file);
  // Copy: pdf.js detaches the buffer it receives (see lib/rasterize.ts).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(raw) }).promise;
  const workbook = new ExcelJS.Workbook();

  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const sheet = workbook.addWorksheet(`Page ${p}`);

      // Group items into rows by Y (2pt tolerance), then order by X.
      const rows = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]! / 2) * 2;
        const x = item.transform[4]!;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ x, str: item.str.trim() });
      }
      const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]); // top → bottom
      for (const [, items] of sorted) {
        items.sort((a, b) => a.x - b.x);
        sheet.addRow(items.map((i) => i.str));
      }
    }
  } finally {
    await doc.destroy();
  }

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const name = `${stripExtension(input.name ?? file.name)}.xlsx`;
  const created = await saveGeneratedAny(userId, name, bytes, OFFICE_MIMES.xlsx!, null);
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
  const officeExt = OFFICE_EXT_BY_MIME[file.mimeType];

  let results: FileDTO[];

  if (input.target === "png" || input.target === "jpg") {
    if (!isPdf) throw badRequest("Image export requires a PDF source", "UNSUPPORTED_CONVERSION");
    await getOwnedPdf(userId, fileId); // validates parseability
    results = await pdfToImages(userId, file, input);
  } else if (input.target === "pdf") {
    if (isImage) {
      results = [await imageToPdf(userId, file, input)];
    } else if (officeExt) {
      const out = await convertWithSoffice(await readBytes(file), officeExt, "pdf");
      const parsed = await PDFDocument.load(out, { ignoreEncryption: true });
      const name = `${stripExtension(input.name ?? file.name)}.pdf`;
      const created = await saveGeneratedAny(
        userId,
        name,
        out,
        "application/pdf",
        parsed.getPageCount(),
      );
      results = [toFileDTO(created)];
    } else {
      throw badRequest("This file is already a PDF or cannot become one", "UNSUPPORTED_CONVERSION");
    }
  } else if (input.target === "xlsx") {
    if (!isPdf) throw badRequest("Excel export requires a PDF source", "UNSUPPORTED_CONVERSION");
    results = [await pdfToXlsx(userId, file, input)];
  } else {
    // docx / pptx from PDF via LibreOffice import filters.
    if (!isPdf) {
      throw badRequest(`Converting to ${input.target} requires a PDF source`, "UNSUPPORTED_CONVERSION");
    }
    const filter = input.target === "docx" ? "writer_pdf_import" : "impress_pdf_import";
    const out = await convertWithSoffice(await readBytes(file), "pdf", input.target, filter);
    const name = `${stripExtension(input.name ?? file.name)}.${input.target}`;
    const created = await saveGeneratedAny(userId, name, out, OFFICE_MIMES[input.target]!, null);
    results = [toFileDTO(created)];
  }

  await activity.log(userId, "CONVERT", {
    fileId: results[0]!.id,
    detail: `${file.name} → ${input.target.toUpperCase()}${results.length > 1 ? ` (${results.length} files)` : ""}`,
  });
  return results;
}

