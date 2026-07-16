/**
 * local-store.ts — Browser-local file library (IndexedDB).
 *
 * Privacy-first storage: uploaded PDFs live ONLY in the user's browser, never
 * on the server. This module is the single source of truth for both the file
 * library and a private activity log. It stores raw bytes as a Blob alongside
 * lightweight metadata, so the dashboard list, the viewer, and the tools all
 * read from here instead of the API.
 *
 * Why IndexedDB and not localStorage: localStorage caps around 5 MB and only
 * holds strings. IndexedDB stores binary Blobs and scales to hundreds of MB,
 * which is what a PDF library needs.
 *
 * Trade-offs the UI should make the user aware of: files are per-browser and
 * per-device, they are cleared if the user wipes browsing data, and the
 * browser may evict them under storage pressure. There is no cross-device sync.
 */

import type { ActivityDTO, ActivityAction } from "@pdfforge/shared";

const DB_NAME = "pdftool";
const DB_VERSION = 2;
const STORE = "files";
const ACTIVITY_STORE = "activity";

/** Metadata shape mirrors the server's FileDTO so existing UI can reuse it. */
export interface LocalFileMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Full record = metadata + the raw bytes. The blob is never sent anywhere. */
interface LocalFileRecord extends LocalFileMeta {
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Opens (and lazily upgrades) the IndexedDB database. Cached after first open. */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        // Sort the library by newest first without scanning every record.
        store.createIndex("createdAt", "createdAt");
      }
      // v2: a private activity log so the dashboard timeline no longer depends
      // on the server (which would otherwise record file names).
      if (!db.objectStoreNames.contains(ACTIVITY_STORE)) {
        const act = db.createObjectStore(ACTIVITY_STORE, { keyPath: "id" });
        act.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

/**
 * Promisifies a single-store transaction. Defaults to the files store; pass a
 * store name to operate on the activity log instead.
 */
async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
  });
}

function stripBlob(record: LocalFileRecord): LocalFileMeta {
  const { blob: _blob, ...meta } = record;
  return meta;
}

// ── Activity log (private, browser-local) ─────────────────────────────

/** Records a library action locally. Never leaves the browser. Best-effort. */
export async function logActivity(
  action: ActivityAction,
  opts: { fileName?: string; detail?: string } = {},
): Promise<void> {
  const entry: ActivityDTO = {
    id: crypto.randomUUID(),
    action,
    detail: opts.detail ?? opts.fileName ?? null,
    fileId: null,
    fileName: opts.fileName ?? null,
    createdAt: new Date().toISOString(),
  };
  try {
    await tx("readwrite", (store) => store.put(entry), ACTIVITY_STORE);
  } catch {
    // Activity logging is cosmetic; never let it break a file operation.
  }
}

/** Lists recent activity, newest first. */
export async function listActivity(limit = 15): Promise<{
  activities: ActivityDTO[];
  total: number;
  page: number;
  limit: number;
}> {
  const all = await tx<ActivityDTO[]>("readonly", (store) => store.getAll(), ACTIVITY_STORE);
  const sorted = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { activities: sorted.slice(0, limit), total: all.length, page: 1, limit };
}

/** Deletes the given activity entries. Returns how many were removed. */
export async function deleteActivity(ids: string[]): Promise<number> {
  for (const id of ids) {
    await tx("readwrite", (store) => store.delete(id), ACTIVITY_STORE);
  }
  return ids.length;
}

// ── File library ──────────────────────────────────────────────────────

/**
 * Adds a file to the library. Metadata is derived here; the caller supplies the
 * bytes and (optionally) the page count computed client-side. `action` controls
 * how the entry shows in the activity log (an upload vs. a generated result).
 */
export async function addFile(
  bytes: Blob,
  opts: { name: string; mimeType: string; pageCount?: number | null; action?: ActivityAction },
): Promise<LocalFileMeta> {
  const now = new Date().toISOString();
  const record: LocalFileRecord = {
    id: crypto.randomUUID(),
    name: opts.name,
    mimeType: opts.mimeType,
    sizeBytes: bytes.size,
    pageCount: opts.pageCount ?? null,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    blob: bytes,
  };
  await tx("readwrite", (store) => store.put(record));
  await logActivity(opts.action ?? "UPLOAD", { fileName: opts.name });
  return stripBlob(record);
}

/** Lists all files (metadata only), newest first. */
export async function listFiles(): Promise<LocalFileMeta[]> {
  const all = await tx<LocalFileRecord[]>("readonly", (store) => store.getAll());
  return all.map(stripBlob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Returns one file's metadata, or null if it isn't in the library. */
export async function getFileMeta(id: string): Promise<LocalFileMeta | null> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  return record ? stripBlob(record) : null;
}

/** Returns the raw bytes for a file, or null if missing. Used by the viewer and tools. */
export async function getBlob(id: string): Promise<Blob | null> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  return record?.blob ?? null;
}

/** Patches editable metadata (rename, favorite). Returns the updated metadata. */
export async function updateFile(
  id: string,
  patch: Partial<Pick<LocalFileMeta, "name" | "isFavorite">>,
): Promise<LocalFileMeta> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  if (!record) throw new Error("File not found in local library");
  const updated: LocalFileRecord = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await tx("readwrite", (store) => store.put(updated));
  return stripBlob(updated);
}

/**
 * Replaces a file's bytes in place (same id), used by "replace/overwrite" tools
 * so edits update the existing library entry instead of creating a copy.
 */
export async function setBlob(
  id: string,
  blob: Blob,
  patch: Partial<Pick<LocalFileMeta, "name" | "mimeType" | "pageCount">> = {},
): Promise<LocalFileMeta> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  if (!record) throw new Error("File not found in local library");
  const updated: LocalFileRecord = {
    ...record,
    ...patch,
    blob,
    sizeBytes: blob.size,
    updatedAt: new Date().toISOString(),
  };
  await tx("readwrite", (store) => store.put(updated));
  await logActivity("EDIT", { fileName: updated.name });
  return stripBlob(updated);
}

/** Permanently removes a file from the browser library. */
export async function deleteFile(id: string): Promise<void> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  await tx("readwrite", (store) => store.delete(id));
  if (record) await logActivity("DELETE", { fileName: record.name });
}

/** Reads a file's bytes and triggers a browser "Save as" download. */
export async function downloadFile(id: string): Promise<void> {
  const record = await tx<LocalFileRecord | undefined>("readonly", (store) => store.get(id));
  if (!record) throw new Error("File not found in local library");
  const url = URL.createObjectURL(record.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = record.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await logActivity("DOWNLOAD", { fileName: record.name });
}

/** Removes every file — used by a "clear all" / logout-wipe action. */
export async function clearAll(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
  await tx("readwrite", (store) => store.clear(), ACTIVITY_STORE);
}

/**
 * Rough storage usage for the UI meter. Uses the Storage API estimate when
 * available (fast, no full read); otherwise sums the record sizes.
 */
export async function estimateUsage(): Promise<{ usedBytes: number; quotaBytes: number | null }> {
  if (navigator.storage?.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usedBytes: usage ?? 0, quotaBytes: quota ?? null };
  }
  const all = await tx<LocalFileRecord[]>("readonly", (store) => store.getAll());
  return { usedBytes: all.reduce((sum, r) => sum + r.sizeBytes, 0), quotaBytes: null };
}
