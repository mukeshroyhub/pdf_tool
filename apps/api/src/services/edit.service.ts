import {
  BlendMode,
  degrees,
  PDFDocument,
  PDFFont,
  PDFImage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getCustomFontBytes } from "../lib/fonts";
import type {
  AnnotateInput,
  EditElement,
  FileDTO,
  PageNumbersInput,
  RgbColor,
  WatermarkInput,
} from "@pdfforge/shared";
import type { File as FileModel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { badRequest, notFound } from "../lib/errors";
import {
  getOwnedPdf,
  loadPdf,
  overwrite,
  saveGenerated,
  stripExtension,
  withPdfExtension,
} from "./pdf.service";

const FONT_MAP: Record<string, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
};

/** Custom fonts embedded from font files; value = fallback standard font. */
const CUSTOM_FONT_FALLBACK: Record<string, StandardFonts> = {
  inter: StandardFonts.Helvetica,
  "inter-bold": StandardFonts.HelveticaBold,
};

/**
 * Resolves an element's font: embeds Inter (via fontkit) when requested and
 * installed, otherwise the mapped standard font. Cached per document.
 */
async function resolveFont(
  doc: PDFDocument,
  name: string,
  fonts: Map<string, PDFFont>,
): Promise<PDFFont> {
  const cached = fonts.get(name);
  if (cached) return cached;

  let font: PDFFont | null = null;
  if (name in CUSTOM_FONT_FALLBACK) {
    const bytes = await getCustomFontBytes(name);
    if (bytes) {
      doc.registerFontkit(fontkit);
      // subset: only the used glyphs are embedded, keeping output small.
      font = await doc.embedFont(bytes, { subset: true });
    }
  }
  if (!font) {
    font = await doc.embedFont(
      FONT_MAP[name] ?? CUSTOM_FONT_FALLBACK[name] ?? StandardFonts.Helvetica,
    );
  }
  fonts.set(name, font);
  return font;
}

const toRgb = (c: RgbColor) => rgb(c.r, c.g, c.b);

async function loadImageAsset(
  userId: string,
  doc: PDFDocument,
  imageFileId: string,
  cache: Map<string, PDFImage>,
): Promise<PDFImage> {
  const cached = cache.get(imageFileId);
  if (cached) return cached;

  const file = await prisma.file.findFirst({
    where: { id: imageFileId, userId, deletedAt: null },
  });
  if (!file) throw notFound(`Image file ${imageFileId} not found`);
  if (!(await storage.exists(file.storageKey))) {
    throw badRequest(`"${file.name}" is missing from storage`, "FILE_MISSING");
  }
  const bytes = await storage.readBytes(file.storageKey);
  let image: PDFImage;
  if (file.mimeType === "image/png") image = await doc.embedPng(bytes);
  else if (file.mimeType === "image/jpeg") image = await doc.embedJpg(bytes);
  else throw badRequest(`"${file.name}" must be a PNG or JPEG image`, "UNSUPPORTED_IMAGE");
  cache.set(imageFileId, image);
  return image;
}

/** Draws one element onto its page. Client Y is top-left; pdf-lib is bottom-left. */
async function drawElement(
  userId: string,
  doc: PDFDocument,
  element: EditElement,
  fonts: Map<string, PDFFont>,
  images: Map<string, PDFImage>,
): Promise<void> {
  const pageCount = doc.getPageCount();
  if (element.page >= pageCount) {
    throw badRequest(
      `Element targets page ${element.page + 1} but the document has ${pageCount} pages`,
      "PAGE_OUT_OF_BOUNDS",
    );
  }
  const page = doc.getPage(element.page);
  const { height } = page.getSize();
  const flipY = (y: number) => height - y;

  switch (element.type) {
    case "text": {
      const font = await resolveFont(doc, element.font, fonts);
      // Draw each line; y refers to the TOP of the text block.
      const lines = element.text.split("\n");
      const lineHeight = element.fontSize * 1.25;
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: element.x,
          y: flipY(element.y) - element.fontSize - i * lineHeight,
          size: element.fontSize,
          font,
          color: toRgb(element.color),
        });
      });
      break;
    }
    case "highlight":
      page.drawRectangle({
        x: element.x,
        y: flipY(element.y) - element.h,
        width: element.w,
        height: element.h,
        color: toRgb(element.color),
        opacity: element.opacity,
        blendMode: BlendMode.Multiply,
      });
      break;
    case "whiteout":
      page.drawRectangle({
        x: element.x,
        y: flipY(element.y) - element.h,
        width: element.w,
        height: element.h,
        color: rgb(1, 1, 1),
      });
      break;
    case "rect":
      page.drawRectangle({
        x: element.x,
        y: flipY(element.y) - element.h,
        width: element.w,
        height: element.h,
        borderColor: toRgb(element.stroke),
        borderWidth: element.strokeWidth,
        ...(element.fill ? { color: toRgb(element.fill) } : {}),
      });
      break;
    case "ellipse":
      page.drawEllipse({
        x: element.x + element.w / 2,
        y: flipY(element.y) - element.h / 2,
        xScale: element.w / 2,
        yScale: element.h / 2,
        borderColor: toRgb(element.stroke),
        borderWidth: element.strokeWidth,
        ...(element.fill ? { color: toRgb(element.fill) } : {}),
      });
      break;
    case "line":
      page.drawLine({
        start: { x: element.x1, y: flipY(element.y1) },
        end: { x: element.x2, y: flipY(element.y2) },
        color: toRgb(element.color),
        thickness: element.width,
      });
      break;
    case "ink":
      for (const path of element.paths) {
        for (let i = 1; i < path.length; i += 1) {
          const a = path[i - 1]!;
          const b = path[i]!;
          page.drawLine({
            start: { x: a.x, y: flipY(a.y) },
            end: { x: b.x, y: flipY(b.y) },
            color: toRgb(element.color),
            thickness: element.width,
            lineCap: 1, // round caps make strokes continuous
          });
        }
      }
      break;
    case "image": {
      const image = await loadImageAsset(userId, doc, element.imageFileId, images);
      page.drawImage(image, {
        x: element.x,
        y: flipY(element.y) - element.h,
        width: element.w,
        height: element.h,
      });
      break;
    }
  }
}

export async function annotate(
  userId: string,
  fileId: string,
  input: AnnotateInput,
): Promise<FileDTO> {
  const file: FileModel = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);

  const fonts = new Map<string, PDFFont>();
  const images = new Map<string, PDFImage>();
  for (const element of input.elements) {
    await drawElement(userId, doc, element, fonts, images);
  }

  const bytes = await doc.save();
  const pageCount = doc.getPageCount();
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, bytes, pageCount)
      : await saveGenerated(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-edited`),
          bytes,
          pageCount,
        );

  await activity.log(userId, "EDIT", {
    fileId: result.id,
    detail: `${input.elements.length} elements on ${file.name}`,
  });
  return toFileDTO(result);
}

export async function watermark(
  userId: string,
  fileId: string,
  input: WatermarkInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(input.text, input.fontSize);
    // Centre the rotated text on the page.
    const angleRad = (input.rotation * Math.PI) / 180;
    const cx = width / 2 - (textWidth / 2) * Math.cos(angleRad);
    const cy = height / 2 - (textWidth / 2) * Math.sin(angleRad);
    page.drawText(input.text, {
      x: cx,
      y: cy,
      size: input.fontSize,
      font,
      color: toRgb(input.color),
      opacity: input.opacity,
      rotate: degrees(input.rotation),
    });
  }

  const bytes = await doc.save();
  const pageCount = doc.getPageCount();
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, bytes, pageCount)
      : await saveGenerated(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-watermarked`),
          bytes,
          pageCount,
        );

  await activity.log(userId, "WATERMARK", {
    fileId: result.id,
    detail: `"${input.text}" on ${file.name}`,
  });
  return toFileDTO(result);
}

/** Stamps a page number onto every page at the chosen corner. */
export async function addPageNumbers(
  userId: string,
  fileId: string,
  input: PageNumbersInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const lastNumber = input.startAt + pages.length - 1;

  pages.forEach((page, i) => {
    const num = input.startAt + i;
    const label =
      input.format === "n-of-total"
        ? `${num} of ${lastNumber}`
        : input.format === "page-n"
          ? `Page ${num}`
          : `${num}`;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, input.fontSize);
    const y = input.position.startsWith("top")
      ? height - input.margin - input.fontSize
      : input.margin;
    const x = input.position.endsWith("center")
      ? (width - textWidth) / 2
      : input.position.endsWith("right")
        ? width - input.margin - textWidth
        : input.margin;
    page.drawText(label, { x, y, size: input.fontSize, font, color: toRgb(input.color) });
  });

  const bytes = await doc.save();
  const pageCount = doc.getPageCount();
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, bytes, pageCount)
      : await saveGenerated(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-numbered`),
          bytes,
          pageCount,
        );

  await activity.log(userId, "PAGE_NUMBERS", { fileId: result.id, detail: file.name });
  return toFileDTO(result);
}
