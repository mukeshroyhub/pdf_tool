import { PDFDocument, rgb } from "pdf-lib";
import type { FileDTO, RedactInput, RemoveTextInput } from "@pdfforge/shared";
import * as storage from "../lib/storage";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { badRequest } from "../lib/errors";
import { rasterizePdf } from "../lib/rasterize";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, overwrite, stripExtension, withPdfExtension } from "./pdf.service";

/**
 * True redaction. Black boxes are drawn over the areas, then every affected
 * page is re-rendered as an image and swapped back in — the underlying text
 * and graphics are destroyed, not merely hidden. Untouched pages keep their
 * original (selectable) content.
 */
export async function redact(
  userId: string,
  fileId: string,
  input: RedactInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();

  for (const area of input.areas) {
    if (area.page >= total) {
      throw badRequest(
        `Redaction targets page ${area.page + 1} but the document has ${total} pages`,
        "PAGE_OUT_OF_BOUNDS",
      );
    }
  }

  // 1. Draw opaque boxes on the affected pages.
  const affectedPages = [...new Set(input.areas.map((a) => a.page))].sort((a, b) => a - b);
  for (const area of input.areas) {
    const page = doc.getPage(area.page);
    const pageH = page.getHeight();
    page.drawRectangle({
      x: area.x,
      y: pageH - area.y - area.h,
      width: area.w,
      height: area.h,
      color: rgb(0, 0, 0),
    });
  }

  // 2. Rasterize the whole boxed document once, then rebuild it swapping
  //    affected pages for their rendered images.
  const boxedBytes = Buffer.from(await doc.save());
  const rendered = await rasterizePdf(boxedBytes, { dpi: input.dpi, format: "jpeg", quality: 80 });

  const out = await PDFDocument.create();
  const source = await PDFDocument.load(boxedBytes, { ignoreEncryption: true });
  for (let i = 0; i < total; i += 1) {
    if (affectedPages.includes(i)) {
      const image = await out.embedJpg(rendered[i]!.buffer);
      const w = (rendered[i]!.width * 72) / input.dpi;
      const h = (rendered[i]!.height * 72) / input.dpi;
      out.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
    } else {
      const [copied] = await out.copyPages(source, [i]);
      out.addPage(copied!);
    }
  }

  const outBytes = Buffer.from(await out.save());
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, outBytes, total)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-redacted`),
          outBytes,
          "application/pdf",
          total,
        );

  await activity.log(userId, "REDACT", {
    fileId: result.id,
    detail: `${input.areas.length} areas on ${affectedPages.length} page(s) of ${file.name}`,
  });
  return toFileDTO(result);
}

// ── Text removal via content-stream filtering ─────────────────────────

/** Decodes a PDF literal string's escape sequences ((), \n, \053, …). */
function decodePdfLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (/[0-7]/.test(next)) {
      const oct = raw.slice(i + 1).match(/^[0-7]{1,3}/)![0];
      out += String.fromCharCode(parseInt(oct, 8));
      i += oct.length - 1;
    } else out += next; // \\, \(, \) and friends
    i += 1;
  }
  return out;
}

/**
 * Concatenates the strings inside one BT..ET block. Handles both literal
 * strings `(...)` and hex strings `<...>` (pdf-lib emits the latter),
 * decoding hex bytes as Latin-1 — accurate for standard-font WinAnsi text.
 */
function textOfBlock(block: string): string {
  let text = "";
  const literalRe = /\(((?:\\.|[^\\()])*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(block)) !== null) text += decodePdfLiteral(m[1]!);
  const hexRe = /<([0-9A-Fa-f\s]+)>/g;
  while ((m = hexRe.exec(block)) !== null) {
    const hex = m[1]!.replace(/\s+/g, "");
    for (let i = 0; i + 1 < hex.length + 1; i += 2) {
      const byte = hex.slice(i, i + 2).padEnd(2, "0");
      text += String.fromCharCode(parseInt(byte, 16));
    }
  }
  return text;
}

/**
 * Removes every BT..ET text block whose decoded text contains the target
 * string. Works for simply-encoded text (standard fonts) — which covers
 * watermarks added by PDFForge and most stamping tools. Subset-encoded
 * text does not match and is reported as zero removals.
 */
export async function removeText(
  userId: string,
  fileId: string,
  input: RemoveTextInput,
): Promise<{ file: FileDTO; removed: number }> {
  const file = await getOwnedPdf(userId, fileId);
  const bytes = await storage.readBytes(file.storageKey);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const targetPages =
    input.pages && input.pages.length > 0
      ? input.pages.filter((p) => p < total)
      : Array.from({ length: total }, (_, i) => i);

  let removed = 0;
  for (const pageIdx of targetPages) {
    const contents = await getDecodedPageContents(doc, pageIdx);
    if (!contents) continue;

    const text = contents.toString("latin1");
    const filtered = text.replace(/BT[\s\S]*?ET/g, (block) => {
      if (textOfBlock(block).includes(input.text)) {
        removed += 1;
        return "";
      }
      return block;
    });
    if (filtered.length !== text.length) {
      setPageContents(doc, pageIdx, Buffer.from(filtered, "latin1"));
    }
  }

  const outBytes = Buffer.from(await doc.save());
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, outBytes, total)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-cleaned`),
          outBytes,
          "application/pdf",
          total,
        );

  await activity.log(userId, "REMOVE_TEXT", {
    fileId: result.id,
    detail: `"${input.text}" ×${removed} from ${file.name}`,
  });
  return { file: toFileDTO(result), removed };
}

// Helpers below use pdf-lib internals guarded behind small shims.
import { PDFContentStream, PDFName, PDFRawStream, PDFArray, PDFStream, decodePDFRawStream } from "pdf-lib";

async function getDecodedPageContents(doc: PDFDocument, pageIdx: number): Promise<Buffer | null> {
  const page = doc.getPage(pageIdx);
  const contentsRef = page.node.get(PDFName.of("Contents"));
  const contents = doc.context.lookup(contentsRef);
  const chunks: Buffer[] = [];

  const pushStream = (stream: PDFStream) => {
    if (stream instanceof PDFRawStream) {
      chunks.push(Buffer.from(decodePDFRawStream(stream).decode()));
    } else if (stream instanceof PDFContentStream) {
      chunks.push(Buffer.from(stream.getContents()));
    }
  };

  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      const s = doc.context.lookup(contents.get(i));
      if (s) pushStream(s as PDFStream);
      chunks.push(Buffer.from("\n"));
    }
  } else if (contents) {
    pushStream(contents as PDFStream);
  } else {
    return null;
  }
  return Buffer.concat(chunks);
}

function setPageContents(doc: PDFDocument, pageIdx: number, contents: Buffer): void {
  const page = doc.getPage(pageIdx);
  const stream = doc.context.flateStream(contents);
  const ref = doc.context.register(stream);
  page.node.set(PDFName.of("Contents"), ref);
}
