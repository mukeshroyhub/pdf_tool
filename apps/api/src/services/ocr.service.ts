import { PDFDocument } from "pdf-lib";
import type { OcrInput, OcrResponse } from "@pdfforge/shared";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { badRequest } from "../lib/errors";
import { rasterizePdf } from "../lib/rasterize";
import { listLanguages, ocrImage } from "../lib/tesseract";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, overwrite, stripExtension, withPdfExtension } from "./pdf.service";
import { toFileDTO } from "./file.service";

export { listLanguages };

/**
 * Produces a searchable PDF: each page is rasterized, OCR'd into a
 * single-page PDF with an invisible text layer, then reassembled.
 */
export async function ocr(userId: string, fileId: string, input: OcrInput): Promise<OcrResponse> {
  const installed = await listLanguages();
  const missing = input.languages.filter((l) => !installed.includes(l));
  if (missing.length > 0) {
    throw badRequest(
      `Language pack(s) not installed: ${missing.join(", ")}. Available: ${installed.join(", ")}`,
      "LANGUAGE_UNAVAILABLE",
    );
  }

  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);
  const pages = await rasterizePdf(bytes, { dpi: input.dpi, format: "png" });

  const out = await PDFDocument.create();
  const texts: string[] = [];
  for (const page of pages) {
    const result = await ocrImage(page.buffer, input.languages, input.dpi);
    texts.push(result.text);
    const pagePdf = await PDFDocument.load(result.pdf);
    const [copied] = await out.copyPages(pagePdf, [0]);
    out.addPage(copied!);
  }

  const outBytes = Buffer.from(await out.save());
  const pageCount = out.getPageCount();
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, outBytes, pageCount)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-searchable`),
          outBytes,
          "application/pdf",
          pageCount,
        );

  await activity.log(userId, "OCR", {
    fileId: result.id,
    detail: `${file.name} (${input.languages.join("+")}, ${pageCount} pages)`,
  });

  const dto = toFileDTO(result);
  return {
    file: { id: dto.id, name: dto.name },
    text: texts.join("\n\n"),
    languages: input.languages,
  };
}
