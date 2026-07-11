import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError } from "./errors";

const OCR_TIMEOUT_MS = 180_000;

let availability: Promise<boolean> | null = null;

export function tesseractAvailable(): Promise<boolean> {
  if (!availability) {
    availability = new Promise((resolve) => {
      execFile("tesseract", ["--version"], { timeout: 15_000 }, (err) => resolve(!err));
    });
  }
  return availability;
}

/** Installed language packs (e.g. ["eng", "deu"]); "osd" is filtered out. */
export function listLanguages(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("tesseract", ["--list-langs"], { timeout: 15_000 }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      resolve(
        stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[a-z_]{3,12}$/.test(l) && l !== "osd"),
      );
    });
  });
}

/**
 * OCRs one page image, returning a single-page searchable PDF (image with an
 * invisible text layer) and the recognized plain text.
 */
export async function ocrImage(
  imageBytes: Buffer,
  languages: string[],
  dpi: number,
): Promise<{ pdf: Buffer; text: string }> {
  if (!(await tesseractAvailable())) {
    throw new AppError(
      503,
      "OCR_UNAVAILABLE",
      "OCR requires Tesseract, which is not installed on this server",
    );
  }
  const workDir = await mkdtemp(path.join(tmpdir(), "pdfforge-ocr-"));
  try {
    const inputPath = path.join(workDir, "page.png");
    await writeFile(inputPath, imageBytes);
    const outBase = path.join(workDir, "out");

    await new Promise<void>((resolve, reject) => {
      execFile(
        "tesseract",
        [inputPath, outBase, "-l", languages.join("+"), "--dpi", String(dpi), "pdf", "txt"],
        { timeout: OCR_TIMEOUT_MS },
        (err, _stdout, stderr) => {
          if (err) {
            reject(
              new AppError(
                500,
                "OCR_FAILED",
                `Tesseract failed: ${String(stderr || err.message).slice(0, 300)}`,
              ),
            );
          } else resolve();
        },
      );
    });

    return {
      pdf: await readFile(`${outBase}.pdf`),
      text: (await readFile(`${outBase}.txt`, "utf8")).trim(),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
