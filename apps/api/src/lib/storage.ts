import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import { config } from "../config";

/**
 * Object storage abstraction with two interchangeable drivers:
 *   - "local": files on disk under uploads/<userId>/<key> (dev / single host)
 *   - "s3":    any S3-compatible bucket, e.g. Cloudflare R2 (production)
 *
 * Storage keys are POSIX-style "<userId>/<random>.<ext>" and are treated as
 * opaque object keys. The whole contract is async and byte-oriented so the
 * two drivers behave identically to every caller.
 */

// Uploads staged here by multer before being handed to the active driver.
export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "pdfforge-uploads");
mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

/** Rejects keys that could escape their namespace; returns a normalized key. */
function safeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (parts.length === 0 || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return normalized;
}

interface StorageDriver {
  writeBytes(key: string, bytes: Uint8Array): Promise<void>;
  saveUploadedFile(key: string, tmpPath: string): Promise<void>;
  readBytes(key: string): Promise<Buffer>;
  downloadStream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  sizeOf(key: string): Promise<number>;
  remove(key: string): Promise<void>;
}

// ── Local-disk driver ──────────────────────────────────────────────────
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL_UPLOADS_DIR = path.join(apiRoot, "uploads");

function localPath(key: string): string {
  return path.join(LOCAL_UPLOADS_DIR, ...safeKey(key).split("/"));
}

const localDriver: StorageDriver = {
  async writeBytes(key, bytes) {
    const abs = localPath(key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  },
  async saveUploadedFile(key, tmpPath) {
    const abs = localPath(key);
    await mkdir(path.dirname(abs), { recursive: true });
    // rename is atomic on the same filesystem; fall back to copy across mounts.
    try {
      await rename(tmpPath, abs);
    } catch {
      await writeFile(abs, await readFile(tmpPath));
    }
  },
  async readBytes(key) {
    return readFile(localPath(key));
  },
  async downloadStream(key) {
    return createReadStream(localPath(key));
  },
  async exists(key) {
    return existsSync(localPath(key));
  },
  async sizeOf(key) {
    return (await stat(localPath(key))).size;
  },
  async remove(key) {
    await rm(localPath(key), { force: true });
  },
};

// ── S3 / R2 driver (lazily loaded so local dev never needs the SDK) ─────
let s3DriverPromise: Promise<StorageDriver> | null = null;

async function getS3Driver(): Promise<StorageDriver> {
  if (!s3DriverPromise) s3DriverPromise = buildS3Driver();
  return s3DriverPromise;
}

async function buildS3Driver(): Promise<StorageDriver> {
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  } = await import("@aws-sdk/client-s3");

  const bucket = config.S3_BUCKET;
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });

  const collect = async (stream: Readable): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };

  return {
    async writeBytes(key, bytes) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: safeKey(key), Body: bytes }),
      );
    },
    async saveUploadedFile(key, tmpPath) {
      // Buffer the staged upload (≤100 MB per the route limit) then store it.
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: safeKey(key),
          Body: await readFile(tmpPath),
        }),
      );
    },
    async readBytes(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: safeKey(key) }),
      );
      return collect(res.Body as Readable);
    },
    async downloadStream(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: safeKey(key) }),
      );
      return res.Body as Readable;
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: safeKey(key) }));
        return true;
      } catch {
        return false;
      }
    },
    async sizeOf(key) {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: safeKey(key) }),
      );
      return res.ContentLength ?? 0;
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey(key) }));
    },
  };
}

// ── Public API (dispatches to the active driver) ───────────────────────
const useS3 = config.STORAGE_DRIVER === "s3";
const driver = (): Promise<StorageDriver> =>
  useS3 ? getS3Driver() : Promise.resolve(localDriver);

export const writeBytes = async (key: string, bytes: Uint8Array): Promise<void> =>
  (await driver()).writeBytes(key, bytes);

export const saveUploadedFile = async (key: string, tmpPath: string): Promise<void> =>
  (await driver()).saveUploadedFile(key, tmpPath);

export const readBytes = async (key: string): Promise<Buffer> =>
  (await driver()).readBytes(key);

export const downloadStream = async (key: string): Promise<Readable> =>
  (await driver()).downloadStream(key);

export const exists = async (key: string): Promise<boolean> =>
  (await driver()).exists(key);

export const sizeOf = async (key: string): Promise<number> =>
  (await driver()).sizeOf(key);

export const remove = async (key: string): Promise<void> =>
  (await driver()).remove(key);
