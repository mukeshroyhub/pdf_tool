import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";

/**
 * Local-disk storage provider. Files live under uploads/<userId>/<storageKey>.
 * The interface is deliberately minimal so an S3-compatible provider can be
 * swapped in via the same contract in the cloud-storage phase.
 */
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const UPLOADS_DIR = path.join(apiRoot, "uploads");

export async function ensureUserDir(userId: string): Promise<string> {
  const dir = path.join(UPLOADS_DIR, userId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function resolveStorageKey(storageKey: string): string {
  const abs = path.resolve(UPLOADS_DIR, storageKey);
  // Defense in depth: never allow a key to escape the uploads root.
  if (!abs.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error(`Storage key escapes uploads root: ${storageKey}`);
  }
  return abs;
}

export function openReadStream(storageKey: string): Readable {
  return createReadStream(resolveStorageKey(storageKey));
}

export function exists(storageKey: string): boolean {
  return existsSync(resolveStorageKey(storageKey));
}

export async function sizeOf(storageKey: string): Promise<number> {
  return (await stat(resolveStorageKey(storageKey))).size;
}

export async function remove(storageKey: string): Promise<void> {
  await rm(resolveStorageKey(storageKey), { force: true });
}
