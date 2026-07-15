import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError } from "./errors";

const QPDF_TIMEOUT_MS = 60_000;

/** True when the qpdf binary is on PATH (checked once per process). */
let availability: Promise<boolean> | null = null;

export function qpdfAvailable(): Promise<boolean> {
  if (!availability) {
    availability = new Promise((resolve) => {
      execFile("qpdf", ["--version"], { timeout: 15_000 }, (err) => resolve(!err));
    });
  }
  return availability;
}

async function runQpdf(
  buildArgs: (inputPath: string, outputPath: string) => string[],
  inputBytes: Buffer,
  errorCode: string,
  friendly: string,
): Promise<Buffer> {
  if (!(await qpdfAvailable())) {
    throw new AppError(503, "QPDF_UNAVAILABLE", "This feature requires qpdf, which is not installed");
  }
  const workDir = await mkdtemp(path.join(tmpdir(), "pdfforge-qpdf-"));
  try {
    const inputPath = path.join(workDir, "input.pdf");
    const outputPath = path.join(workDir, "output.pdf");
    await writeFile(inputPath, inputBytes);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "qpdf",
        buildArgs(inputPath, outputPath),
        { timeout: QPDF_TIMEOUT_MS },
        (err) => {
          // qpdf exit code 3 = warnings but output was still written; treat as OK.
          const code = (err as { code?: number } | null)?.code;
          if (err && code !== 3) reject(new AppError(400, errorCode, friendly));
          else resolve();
        },
      );
    });

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Encrypts a PDF with 256-bit AES using the given password (user + owner). */
export function encryptPdf(bytes: Buffer, password: string): Promise<Buffer> {
  return runQpdf(
    (input, output) => ["--encrypt", password, password, "256", "--", input, output],
    bytes,
    "ENCRYPT_FAILED",
    "Could not protect this PDF",
  );
}

/** Removes password protection from a PDF (needs the correct password). */
export function decryptPdf(bytes: Buffer, password: string): Promise<Buffer> {
  return runQpdf(
    (input, output) => [`--password=${password}`, "--decrypt", input, output],
    bytes,
    "WRONG_PASSWORD",
    "Wrong password, or the file is not password-protected",
  );
}
