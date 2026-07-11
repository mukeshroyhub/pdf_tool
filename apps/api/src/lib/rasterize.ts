import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";

// pdf.js needs its bundled standard fonts (Helvetica etc.) to draw text in Node.
const require_ = createRequire(import.meta.url);
const STANDARD_FONTS_DIR = `${path.join(
  path.dirname(require_.resolve("pdfjs-dist/package.json")),
  "standard_fonts",
)}/`;

/** Rendered page image plus its pixel dimensions. */
export interface RasterPage {
  buffer: Buffer;
  width: number;
  height: number;
}

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/**
 * Renders every page of a PDF to PNG or JPEG buffers at the given DPI
 * using pdf.js with a Node canvas.
 */
export async function rasterizePdf(
  pdfBytes: Uint8Array,
  opts: { dpi: number; format: "png" | "jpeg"; quality?: number },
): Promise<RasterPage[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    // pdf.js rejects Node Buffers and DETACHES the buffer it receives
    // (worker transfer), so hand it an owned copy, never a view.
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: STANDARD_FONTS_DIR,
  }).promise;

  const scale = opts.dpi / 72;
  const pages: RasterPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      // White background so JPEG (no alpha) looks right.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      await page.render({
        // @napi-rs/canvas context is API-compatible with the DOM context.
        canvasContext: ctx as unknown as Parameters<typeof page.render>[0]["canvasContext"],
        viewport,
      }).promise;
      const buffer =
        opts.format === "png"
          ? canvas.toBuffer("image/png")
          : canvas.toBuffer("image/jpeg", opts.quality ?? 85);
      pages.push({ buffer, width, height });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
