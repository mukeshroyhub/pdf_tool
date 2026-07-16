"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityListResponse,
  FileDTO,
  FileListResponse,
  UpdateFileInput,
} from "@pdfforge/shared";
import { api } from "./api";
import { countPdfPages } from "./pdf-client";
import * as store from "./local-store";
import * as ops from "./local-ops";

/**
 * Data layer for the browser-local library.
 *
 * Files live in IndexedDB (local-store.ts), never on the server. Read hooks
 * pull from IndexedDB; tool hooks use the just-in-time staging flow in
 * local-ops.ts so the server processes bytes without keeping them. Hook names
 * and return shapes are unchanged, so the UI components need no edits.
 */

const keys = {
  files: (params: string) => ["files", params] as const,
  allFiles: ["files"] as const,
  activity: ["activity"] as const,
  storage: ["storage"] as const,
};

export function useFiles(opts: { favorite?: boolean; search?: string; page?: number } = {}) {
  const qs = JSON.stringify(opts);
  return useQuery({
    queryKey: keys.files(qs),
    queryFn: async (): Promise<FileListResponse> => {
      let files = await store.listFiles();
      if (opts.favorite) files = files.filter((f) => f.isFavorite);
      if (opts.search) {
        const q = opts.search.toLowerCase();
        files = files.filter((f) => f.name.toLowerCase().includes(q));
      }
      return { files, total: files.length, page: 1, limit: files.length };
    },
  });
}

// Activity is now a private, browser-local log (IndexedDB) — the server records
// nothing about files, so nothing about them ever leaves the browser.
export function useActivity() {
  return useQuery({
    queryKey: keys.activity,
    queryFn: (): Promise<ActivityListResponse> => store.listActivity(15),
  });
}

export function useDeleteActivities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => ({ deleted: await store.deleteActivity(ids) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.activity }),
  });
}

/** Browser storage usage for the dashboard meter (IndexedDB, not the server). */
export function useStorageUsage() {
  return useQuery({
    queryKey: keys.storage,
    queryFn: () => store.estimateUsage(),
  });
}

/** Invalidate everything affected by a file change. */
function useInvalidateFileData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.allFiles });
    void qc.invalidateQueries({ queryKey: keys.activity });
    void qc.invalidateQueries({ queryKey: keys.storage });
  };
}

/**
 * Adds picked/dropped files straight into the browser library. Page count for
 * PDFs is computed client-side (best effort). Nothing is uploaded.
 */
export function useUploadFiles(onProgress?: (p: number) => void) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const saved: store.LocalFileMeta[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const pageCount = file.type === "application/pdf" ? await countPdfPages(file) : null;
        saved.push(
          await store.addFile(file, { name: file.name, mimeType: file.type, pageCount }),
        );
        onProgress?.(Math.round(((i + 1) / files.length) * 100));
      }
      return { files: saved };
    },
    onSuccess: invalidate,
  });
}

export function useUpdateFile() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateFileInput }) => {
      const file = await store.updateFile(id, input);
      return { file };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteFile() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (id: string) => {
      await store.deleteFile(id);
      return { message: "File deleted" };
    },
    onSuccess: invalidate,
  });
}

// ── PDF operations ────────────────────────────────────────────────────

export function useFile(id: string) {
  return useQuery({
    queryKey: ["file", id],
    queryFn: async () => {
      const file = await store.getFileMeta(id);
      if (!file) throw new Error("File not found in your browser library");
      return { file };
    },
  });
}

export function useMergePdfs() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (input: { fileIds: string[]; name?: string }) => {
      const file = await ops.runManyToOne(input.fileIds, (serverIds) =>
        api<{ file: FileDTO }>("/api/pdf/merge", {
          method: "POST",
          body: { fileIds: serverIds, name: input.name },
        }),
      );
      return { file };
    },
    onSuccess: invalidate,
  });
}

export function useSplitPdf(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (input: { ranges: Array<{ from: number; to: number }>; baseName?: string }) => {
      const files = await ops.runSingleMany(id, (sid) =>
        api<{ files: FileDTO[] }>(`/api/pdf/${sid}/split`, { method: "POST", body: input }),
      );
      return { files };
    },
    onSuccess: invalidate,
  });
}

export function useRebuildPdf(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      pages: Array<{ source: number | "blank"; rotate: number }>;
      mode: "new" | "replace";
      name?: string;
    }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/pdf/${sid}/rebuild`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useAnnotatePdf(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { elements: unknown[]; mode: "new" | "replace"; name?: string }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/pdf/${sid}/annotate`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useWatermarkPdf(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      text: string;
      fontSize?: number;
      opacity?: number;
      rotation?: number;
      mode: "new" | "replace";
      name?: string;
    }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/pdf/${sid}/watermark`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useAddPageNumbers(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      position: string;
      startAt?: number;
      format?: string;
      mode: "new" | "replace";
    }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/pdf/${sid}/page-numbers`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useProtectPdf(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { password: string; name?: string }) =>
      ops.runSingle(id, (sid) =>
        api<{ file: FileDTO }>(`/api/pdf/${sid}/protect`, { method: "POST", body: input }),
      ),
    onSuccess: invalidate,
  });
}

export function useUnlockPdf(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { password: string; name?: string }) =>
      ops.runSingle(id, (sid) =>
        api<{ file: FileDTO }>(`/api/pdf/${sid}/unlock`, { method: "POST", body: input }),
      ),
    onSuccess: invalidate,
  });
}

// ── Convert / compress / batch ────────────────────────────────────────

export function useConvertFile(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (input: { target: string; dpi?: number; quality?: number; name?: string }) => {
      const files = await ops.runSingleMany(id, (sid) =>
        api<{ files: FileDTO[] }>(`/api/convert/${sid}`, { method: "POST", body: input }),
      );
      return { files };
    },
    onSuccess: invalidate,
  });
}

export function useCompressFile(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      level: "low" | "medium" | "high" | "custom";
      dpi?: number;
      quality?: number;
      mode: "new" | "replace";
    }) =>
      ops.runSingle(
        id,
        (sid) =>
          api<{ file: FileDTO; before: number; after: number }>(`/api/compress/${sid}`, {
            method: "POST",
            body: input,
          }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useImagesToPdf() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: async (input: { fileIds: string[]; name?: string }) => {
      const file = await ops.runManyToOne(input.fileIds, (serverIds) =>
        api<{ file: FileDTO }>("/api/convert/images-to-pdf", {
          method: "POST",
          body: { fileIds: serverIds, name: input.name },
        }),
      );
      return { file };
    },
    onSuccess: invalidate,
  });
}

export interface BatchResult {
  fileId: string;
  ok: boolean;
  files?: Array<{ id: string; name: string }>;
  error?: string;
}

export function useBatch() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      operation: "convert" | "compress" | "watermark";
      fileIds: string[];
      params: Record<string, unknown>;
    }) =>
      ops.runBatch(input.fileIds, (serverIds) =>
        api<{ results: BatchResult[] }>("/api/batch", {
          method: "POST",
          body: { operation: input.operation, fileIds: serverIds, params: input.params },
        }),
      ),
    onSuccess: invalidate,
  });
}

// ── Forms ─────────────────────────────────────────────────────────────

export interface FormFieldInfo {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "optionlist" | "button" | "signature";
  value: string | boolean | string[] | null;
  options: string[];
  readOnly: boolean;
  required: boolean;
  page: number | null;
  rect: { x: number; y: number; w: number; h: number } | null;
}

export function useFormFields(id: string) {
  return useQuery({
    queryKey: ["form-fields", id],
    queryFn: () =>
      ops.runInspect(id, (sid) => api<{ fields: FormFieldInfo[] }>(`/api/forms/${sid}`)),
  });
}

export function useFillForm(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      values: Record<string, string | boolean | string[]>;
      flatten: boolean;
      mode: "new" | "replace";
    }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/forms/${sid}/fill`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
      void qc.invalidateQueries({ queryKey: ["form-fields", id] });
    },
  });
}

export function useCreateForm(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { fields: unknown[]; mode: "new" | "replace"; name?: string }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/forms/${sid}/create`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
      void qc.invalidateQueries({ queryKey: ["form-fields", id] });
    },
  });
}

// ── Redaction & text removal ──────────────────────────────────────────

export function useRedactPdf(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: {
      areas: Array<{ page: number; x: number; y: number; w: number; h: number }>;
      dpi?: number;
      mode: "new" | "replace";
    }) =>
      ops.runSingle(
        id,
        (sid) => api<{ file: FileDTO }>(`/api/pdf/${sid}/redact`, { method: "POST", body: input }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useRemoveText(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { text: string; pages?: number[]; mode: "new" | "replace" }) =>
      ops.runSingle(
        id,
        (sid) =>
          api<{ file: FileDTO; removed: number }>(`/api/pdf/${sid}/remove-text`, {
            method: "POST",
            body: input,
          }),
        { replace: input.mode === "replace" },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}
