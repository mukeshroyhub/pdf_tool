import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError } from "./errors";

const SOFFICE_TIMEOUT_MS = 120_000;

/** True when a LibreOffice binary is on PATH (checked once per process). */
let availability: Promise<boolean> | null = null;

export function sofficeAvailable(): Promise<boolean> {
  if (!availability) {
    availability = new Promise((resolve) => {
      execFile("soffice", ["--version"], { timeout: 15_000 }, (err) => resolve(!err));
    });
  }
  return availability;
}

/**
 * Converts a document with LibreOffice in an isolated profile directory
 * (parallel-safe). Returns the converted bytes.
 */
export async function convertWithSoffice(
  inputBytes: Buffer,
  inputExt: string,
  targetExt: string,
  infilter?: string,
): Promise<Buffer> {
  if (!(await sofficeAvailable())) {
    throw new AppError(
      503,
      "CONVERTER_UNAVAILABLE",
      "Office conversion requires LibreOffice, which is not installed on this server",
    );
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "pdfforge-lo-"));
  try {
    const inputPath = path.join(workDir, `input.${inputExt}`);
    await writeFile(inputPath, inputBytes);

    const args = [
      "--headless",
      "--norestore",
      `-env:UserInstallation=file://${workDir}/profile`,
      ...(infilter ? [`--infilter=${infilter}`] : []),
      "--convert-to",
      targetExt,
      "--outdir",
      workDir,
      inputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      execFile("soffice", args, { timeout: SOFFICE_TIMEOUT_MS }, (err, _stdout, stderr) => {
        if (err) {
          reject(
            new AppError(
              500,
              "CONVERSION_FAILED",
              `LibreOffice conversion failed: ${String(stderr || err.message).slice(0, 300)}`,
            ),
          );
        } else resolve();
      });
    });

    const produced = (await readdir(workDir)).find(
      (f) => f.startsWith("input.") && f.endsWith(`.${targetExt.split(":")[0]}`) && f !== `input.${inputExt}`,
    );
    if (!produced) {
      throw new AppError(500, "CONVERSION_FAILED", "LibreOffice produced no output file");
    }
    return await readFile(path.join(workDir, produced));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
