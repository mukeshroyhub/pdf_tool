/**
 * local-ops.ts — Client-orchestrated processing for the browser-local library.
 *
 * Originals live only in IndexedDB (see local-store.ts). To run a server tool
 * on one, we do a just-in-time round-trip:
 *
 *   1. STAGE  — upload the file's bytes to the server as a temporary file.
 *   2. RUN    — call the existing tool endpoint with the temporary id.
 *   3. ABSORB — download the result bytes back into IndexedDB.
 *   4. CLEANUP— delete every server copy (inputs and outputs).
 *
 * The server therefore never keeps the file: it sees the bytes only for the
 * moment it needs to process them. This reuses all existing server logic, so
 * the tools behave exactly as before while the library stays private.
 *
 * Note: staging still creates a short-lived server file and an activity-log
 * entry that includes the file name. A later cleanup pass can disable that
 * server-side logging for full privacy; the files themselves are always
 * deleted here.
 */

import type { FileDTO } from "@pdfforge/shared";
import { api, apiUpload, apiFetchBlob, ApiError } from "./api";
import * as store from "./local-store";

/** Uploads one library file to the server temporarily and returns its DTO. */
async function stage(localId: string): Promise<FileDTO> {
  const [blob, meta] = await Promise.all([store.getBlob(localId), store.getFileMeta(localId)]);
  if (!blob || !meta) throw new ApiError(404, "NOT_FOUND", "That file is no longer in your browser");
  const file = new File([blob], meta.name, { type: meta.mimeType });
  const res = await apiUpload<{ files: FileDTO[] }>("/api/files", [file]);
  const dto = res.files[0];
  if (!dto) throw new ApiError(500, "STAGE_FAILED", "Could not prepare the file for processing");
  return dto;
}

/** Best-effort delete of server copies. Failures are ignored (retention purges them). */
async function cleanup(serverIds: string[]): Promise<void> {
  await Promise.all(
    serverIds.map((id) =>
      api(`/api/files/${id}`, { method: "DELETE" }).catch(() => undefined),
    ),
  );
}

/** Downloads a server result and writes it into IndexedDB as a new library file. */
async function absorb(dto: Pick<FileDTO, "id" | "name"> & Partial<FileDTO>): Promise<store.LocalFileMeta> {
  const blob = await apiFetchBlob(`/api/files/${dto.id}/download`);
  return store.addFile(blob, {
    name: dto.name,
    mimeType: dto.mimeType ?? blob.type ?? "application/pdf",
    pageCount: dto.pageCount ?? null,
  });
}

/**
 * Runs a single-input tool that returns one file (plus optionally extra scalar
 * fields like compress's before/after or remove-text's count). When `replace`
 * is set, the source library entry is overwritten in place (keeps its id);
 * otherwise the result is saved as a new library file. Any non-`file` fields in
 * the server response are passed straight back to the caller.
 */
export async function runSingle<R extends { file: FileDTO }>(
  localId: string,
  run: (serverId: string) => Promise<R>,
  opts: { replace?: boolean } = {},
): Promise<{ file: store.LocalFileMeta } & Omit<R, "file">> {
  const staged = await stage(localId);
  const serverIds = [staged.id];
  try {
    const { file, ...extra } = await run(staged.id);
    if (file.id !== staged.id) serverIds.push(file.id);
    const blob = await apiFetchBlob(`/api/files/${file.id}/download`);
    const meta = opts.replace
      ? await store.setBlob(localId, blob, {
          name: file.name,
          mimeType: file.mimeType,
          pageCount: file.pageCount,
        })
      : await store.addFile(blob, {
          name: file.name,
          mimeType: file.mimeType,
          pageCount: file.pageCount,
        });
    // Object.assign (rather than object spread) keeps tsc happy when merging
    // the generic `extra` fields with the local metadata.
    return Object.assign({ file: meta }, extra) as { file: store.LocalFileMeta } & Omit<R, "file">;
  } finally {
    await cleanup(serverIds);
  }
}

/** Runs a single-input tool that returns many files (split, convert). */
export async function runSingleMany(
  localId: string,
  run: (serverId: string) => Promise<{ files: FileDTO[] }>,
): Promise<store.LocalFileMeta[]> {
  const staged = await stage(localId);
  const serverIds = [staged.id];
  try {
    const { files } = await run(staged.id);
    const saved: store.LocalFileMeta[] = [];
    for (const dto of files) {
      if (dto.id !== staged.id) serverIds.push(dto.id);
      saved.push(await absorb(dto));
    }
    return saved;
  } finally {
    await cleanup(serverIds);
  }
}

/** Runs a many-input tool that returns one file (merge, images-to-pdf). */
export async function runManyToOne(
  localIds: string[],
  run: (serverIds: string[]) => Promise<{ file: FileDTO }>,
): Promise<store.LocalFileMeta> {
  const staged = await Promise.all(localIds.map(stage));
  const serverIds = staged.map((s) => s.id);
  try {
    const { file } = await run(serverIds);
    if (!serverIds.includes(file.id)) serverIds.push(file.id);
    return await absorb(file);
  } finally {
    await cleanup(serverIds);
  }
}

/**
 * Reads form fields from a library PDF (stage → read → cleanup). Returns the
 * field list plus nothing persisted server-side.
 */
export async function runInspect<T>(
  localId: string,
  run: (serverId: string) => Promise<T>,
): Promise<T> {
  const staged = await stage(localId);
  try {
    return await run(staged.id);
  } finally {
    await cleanup([staged.id]);
  }
}

interface RawBatchResult {
  fileId: string; // server id of the input
  ok: boolean;
  files?: Array<{ id: string; name: string }>; // server ids of the outputs
  error?: string;
}

export interface LocalBatchResult {
  fileId: string; // local id of the input
  ok: boolean;
  files?: store.LocalFileMeta[];
  error?: string;
}

/**
 * Runs a batch operation across several library files. Stages them all, calls
 * the batch endpoint, pulls every produced output back into IndexedDB, then
 * deletes all server copies. Results are remapped to local ids.
 */
export async function runBatch(
  localIds: string[],
  call: (serverIds: string[]) => Promise<{ results: RawBatchResult[] }>,
): Promise<{ results: LocalBatchResult[] }> {
  const staged = await Promise.all(localIds.map(stage));
  const serverToLocal = new Map(staged.map((s, i) => [s.id, localIds[i]!]));
  const serverIds = staged.map((s) => s.id);
  try {
    const { results } = await call(serverIds);
    const mapped: LocalBatchResult[] = [];
    for (const r of results) {
      const saved: store.LocalFileMeta[] = [];
      for (const out of r.files ?? []) {
        serverIds.push(out.id);
        saved.push(await absorb({ id: out.id, name: out.name } as FileDTO));
      }
      mapped.push({
        fileId: serverToLocal.get(r.fileId) ?? r.fileId,
        ok: r.ok,
        files: saved,
        error: r.error,
      });
    }
    return { results: mapped };
  } finally {
    await cleanup(serverIds);
  }
}

/** Stages several files, builds a ZIP on the server, downloads it, cleans up. */
export async function zipDownload(
  localIds: string[],
  runDownload: (serverIds: string[]) => Promise<void>,
): Promise<void> {
  const staged = await Promise.all(localIds.map(stage));
  const serverIds = staged.map((s) => s.id);
  try {
    await runDownload(serverIds);
  } finally {
    await cleanup(serverIds);
  }
}
