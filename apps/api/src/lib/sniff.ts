import { open } from "node:fs/promises";

/**
 * Lightweight magic-byte verification for uploaded files. The client-declared
 * MIME type is only trusted after the file's on-disk signature agrees with it
 * (S3/C1 in the security audit). Dependency-free by design.
 */

const PDF = Buffer.from("%PDF-");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF = Buffer.from("RIFF");
const WEBP = Buffer.from("WEBP");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // OOXML containers (docx/xlsx/pptx)
const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy Office

function matches(head: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "application/pdf":
      // The PDF spec allows the %PDF- header anywhere in the first 1024 bytes.
      return head.subarray(0, 1024).includes(PDF);
    case "image/png":
      return head.subarray(0, PNG.length).equals(PNG);
    case "image/jpeg":
      return head.subarray(0, JPEG.length).equals(JPEG);
    case "image/webp":
      return head.subarray(0, 4).equals(RIFF) && head.subarray(8, 12).equals(WEBP);
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return head.subarray(0, CFB.length).equals(CFB);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return head.subarray(0, ZIP.length).equals(ZIP);
    default:
      return false; // types outside the allow-list are rejected outright
  }
}

/** Reads the first 1 KiB of a file and checks it against the declared MIME type. */
export async function signatureMatches(absPath: string, mimeType: string): Promise<boolean> {
  const fh = await open(absPath, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(head, 0, 1024, 0);
    if (bytesRead === 0) return false;
    return matches(head.subarray(0, bytesRead), mimeType);
  } finally {
    await fh.close();
  }
}
