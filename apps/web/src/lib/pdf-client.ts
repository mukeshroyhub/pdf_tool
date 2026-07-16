"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { ApiError } from "./api";
import { getBlob } from "./local-store";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** Lazily loads pdf.js and wires up its worker (client-only). */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * Opens a PDF from the browser-local library (IndexedDB) by its local id.
 * Pass `password` for encrypted files. When a password is required or wrong,
 * pdf.js rejects with an error whose name is "PasswordException" — callers can
 * detect that via isPasswordError() and prompt the user.
 */
export async function openPdfDocument(
  fileId: string,
  password?: string,
): Promise<PDFDocumentProxy> {
  const blob = await getBlob(fileId);
  if (!blob) throw new ApiError(404, "PDF_NOT_FOUND", "This file is no longer in your browser");
  const data = await blob.arrayBuffer();
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data, password }).promise;
}

/**
 * True when a pdf.js open failure means "needs a (correct) password".
 * Duck-typed on purpose: pdf.js's PasswordException does not reliably extend
 * Error across versions, so an instanceof check would miss it.
 */
export function isPasswordError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "PasswordException"
  );
}

/**
 * Counts pages of a PDF blob client-side (best effort). Used when adding a file
 * to the library so the list can show a page count without a server round-trip.
 */
export async function countPdfPages(source: Blob): Promise<number | null> {
  try {
    const data = await source.arrayBuffer();
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = doc.numPages;
    await doc.destroy();
    return pages;
  } catch {
    return null; // never block an upload on page counting
  }
}

/**
 * Renders a single page into a canvas at the given scale.
 *
 * Returns a handle so the caller can cancel an in-flight render. This is
 * essential: PDF.js throws "Cannot use the same canvas during multiple
 * render() operations" if a second render starts on a canvas before the
 * first finishes (which happens on re-render, scale change, or React's
 * dev-mode double-invoked effects). The caller must cancel() on cleanup.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
): { promise: Promise<void>; cancel: () => void } {
  let cancelled = false;
  let task: import("pdfjs-dist").RenderTask | null = null;

  const promise = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return;
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    task = page.render({
      canvasContext: ctx,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    });
    try {
      await task.promise;
    } catch (err) {
      // A cancelled render rejects with RenderingCancelledException — expected.
      if (!(err instanceof Error) || err.name !== "RenderingCancelledException") throw err;
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** Backend/standard-font family the overlay text element supports. */
export type EditorFont = "helvetica" | "helvetica-bold" | "times" | "courier";

/** A single run of existing text in a page, positioned for the editor overlay. */
export interface PageTextLine {
  text: string;
  /** Top-left origin, PDF points (matches the scale-1 editor overlay). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rendered font size in points (matches the original as closely as possible). */
  fontSize: number;
  /** Closest supported font to the original run, for size-accurate replacement. */
  font: EditorFont;
}

/** Picks the closest supported standard font to an original PDF run. */
function matchFont(fontName: string, fontFamily: string): EditorFont {
  const n = `${fontName} ${fontFamily}`.toLowerCase();
  if (/mono|courier|consol/.test(n)) return "courier";
  const isSerif = /serif|times|georgia|roman|minion|garamond|book/.test(n) && !/sans/.test(n);
  if (isSerif) return "times";
  const isBold = /bold|black|heavy|semibold|\bsb\b/.test(n);
  return isBold ? "helvetica-bold" : "helvetica";
}

// Multiply two 2D affine matrices [a,b,c,d,e,f] (PDF/pdf.js convention).
function mulMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!,
  ];
}

const textLineCache = new WeakMap<PDFDocumentProxy, Map<number, PageTextLine[]>>();

/**
 * Extracts the existing text of a page as positioned runs, so the editor can
 * offer click-to-edit. Coordinates are converted into the top-left-origin,
 * scale-1 space the overlay uses. Returns [] for scanned pages (no text layer).
 * Cached per document + page.
 */
export async function getPageTextLines(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<PageTextLine[]> {
  let perDoc = textLineCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    textLineCache.set(doc, perDoc);
  }
  const cached = perDoc.get(pageNumber);
  if (cached) return cached;

  await loadPdfjs();
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const styles = content.styles as Record<string, { fontFamily?: string }>;

  const lines: PageTextLine[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str || !item.str.trim()) continue;
    // Compose viewport (flips y to top-left origin) with the item's text matrix.
    const tx = mulMatrix(viewport.transform as number[], item.transform);
    const fontHeight = Math.hypot(tx[2]!, tx[3]!);
    if (fontHeight <= 0) continue;
    const fontName = item.fontName ?? "";
    const fontFamily = styles?.[fontName]?.fontFamily ?? "";
    lines.push({
      text: item.str,
      x: tx[4]!,
      y: tx[5]! - fontHeight, // baseline origin minus height ≈ top of the run
      w: Math.max(item.width || fontHeight, 4),
      h: fontHeight,
      // Keep one decimal so the replacement size matches the original precisely.
      fontSize: Math.round(fontHeight * 10) / 10,
      font: matchFont(fontName, fontFamily),
    });
  }

  perDoc.set(pageNumber, lines);
  return lines;
}

const objectUrlCache = new Map<string, string>();

/** Returns a blob object URL for a library file (cached per session). */
export async function fetchFileObjectUrl(fileId: string): Promise<string> {
  const cached = objectUrlCache.get(fileId);
  if (cached) return cached;
  const blob = await getBlob(fileId);
  if (!blob) throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer in your browser");
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(fileId, url);
  return url;
}
