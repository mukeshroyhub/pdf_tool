import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { CompressInput, FileDTO } from "@pdfforge/shared";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { rasterizePdf } from "../lib/rasterize";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, overwrite, stripExtension, withPdfExtension } from "./pdf.service";

/** Per-level rasterization settings; "low" stays lossless. */
const LEVEL_SETTINGS: Record<string, { dpi: number; quality: number } | null> = {
  low: null,
  medium: { dpi: 120, quality: 70 },
  high: { dpi: 90, quality: 50 },
};

export async function compress(
  userId: string,
  fileId: string,
  input: CompressInput,
): Promise<{ file: FileDTO; before: number; after: number }> {
  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);

  let outBytes: Buffer;
  let pageCount: number;

  const settings =
    input.level === "custom" ? { dpi: input.dpi, quality: input.quality } : LEVEL_SETTINGS[input.level];

  if (!settings) {
    // Lossless: re-serialize with object streams; strips dead objects.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    outBytes = Buffer.from(await doc.save({ useObjectStreams: true }));
    pageCount = doc.getPageCount();
    // Never grow the file: fall back to the original when it was already optimal.
    if (outBytes.length >= bytes.length) outBytes = bytes;
  } else {
    // Lossy: re-render pages to JPEG at reduced DPI and rebuild the document.
    const pages = await rasterizePdf(bytes, {
      dpi: settings.dpi,
      format: "jpeg",
      quality: settings.quality,
    });
    const doc = await PDFDocument.create();
    for (const page of pages) {
      // mozjpeg squeezes a further ~10-20% out of the canvas JPEG.
      const optimized = await sharp(page.buffer)
        .jpeg({ quality: settings.quality, mozjpeg: true })
        .toBuffer();
      const image = await doc.embedJpg(optimized);
      const w = (page.width * 72) / settings.dpi;
      const h = (page.height * 72) / settings.dpi;
      doc.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
    }
    outBytes = Buffer.from(await doc.save({ useObjectStreams: true }));
    pageCount = doc.getPageCount();
  }

  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, outBytes, pageCount)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-compressed`),
          outBytes,
          "application/pdf",
          pageCount,
        );

  await activity.log(userId, "COMPRESS", {
    fileId: result.id,
    detail: `${file.name}: ${Math.round(bytes.length / 1024)}KB → ${Math.round(outBytes.length / 1024)}KB (${input.level})`,
  });
  return { file: toFileDTO(result), before: bytes.length, after: outBytes.length };
}
