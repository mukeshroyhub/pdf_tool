"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityListResponse,
  FileDTO,
  FileListResponse,
  UpdateFileInput,
} from "@pdfforge/shared";
import { api, apiUpload } from "./api";

const keys = {
  files: (params: string) => ["files", params] as const,
  allFiles: ["files"] as const,
  activity: ["activity"] as const,
};

export function useFiles(opts: { favorite?: boolean; search?: string; page?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.favorite) params.set("favorite", "true");
  if (opts.search) params.set("search", opts.search);
  if (opts.page) params.set("page", String(opts.page));
  const qs = params.toString();
  return useQuery({
    queryKey: keys.files(qs),
    queryFn: () => api<FileListResponse>(`/api/files${qs ? `?${qs}` : ""}`),
  });
}

export function useActivity() {
  return useQuery({
    queryKey: keys.activity,
    queryFn: () => api<ActivityListResponse>("/api/activity?limit=15"),
  });
}

export function useDeleteActivities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number }>("/api/activity/delete", { method: "POST", body: { ids } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.activity }),
  });
}

/** Invalidate everything affected by a file change (lists, timeline, quota). */
function useInvalidateFileData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.allFiles });
    void qc.invalidateQueries({ queryKey: keys.activity });
  };
}

export function useUploadFiles(onProgress?: (p: number) => void) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (files: File[]) =>
      apiUpload<{ files: FileDTO[] }>("/api/files", files, onProgress),
    onSuccess: invalidate,
  });
}

export function useUpdateFile() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFileInput }) =>
      api<{ file: FileDTO }>(`/api/files/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteFile() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/api/files/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── PDF operations ────────────────────────────────────────────────────

export function useFile(id: string) {
  return useQuery({
    queryKey: ["file", id],
    queryFn: () => api<{ file: FileDTO }>(`/api/files/${id}`),
  });
}

export function useMergePdfs() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { fileIds: string[]; name?: string }) =>
      api<{ file: FileDTO }>("/api/pdf/merge", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useSplitPdf(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { ranges: Array<{ from: number; to: number }>; baseName?: string }) =>
      api<{ files: FileDTO[] }>(`/api/pdf/${id}/split`, { method: "POST", body: input }),
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
    }) => api<{ file: FileDTO }>(`/api/pdf/${id}/rebuild`, { method: "POST", body: input }),
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
      api<{ file: FileDTO }>(`/api/pdf/${id}/annotate`, { method: "POST", body: input }),
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
    }) => api<{ file: FileDTO }>(`/api/pdf/${id}/watermark`, { method: "POST", body: input }),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

// ── Convert / compress / batch ────────────────────────────────────────

export function useConvertFile(id: string) {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { target: string; dpi?: number; quality?: number; name?: string }) =>
      api<{ files: FileDTO[] }>(`/api/convert/${id}`, { method: "POST", body: input }),
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
      api<{ file: FileDTO; before: number; after: number }>(`/api/compress/${id}`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

export function useImagesToPdf() {
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { fileIds: string[]; name?: string }) =>
      api<{ file: FileDTO }>("/api/convert/images-to-pdf", { method: "POST", body: input }),
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
      operation: "convert" | "compress" | "watermark" | "ocr";
      fileIds: string[];
      params: Record<string, unknown>;
    }) => api<{ results: BatchResult[] }>("/api/batch", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

// ── OCR & forms ───────────────────────────────────────────────────────

export function useOcrLanguages() {
  return useQuery({
    queryKey: ["ocr-languages"],
    queryFn: () => api<{ languages: string[] }>("/api/ocr/languages"),
    staleTime: Infinity,
  });
}

export function useOcrPdf(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFileData();
  return useMutation({
    mutationFn: (input: { languages: string[]; dpi?: number; mode: "new" | "replace" }) =>
      api<{ file: { id: string; name: string }; text: string; languages: string[] }>(
        `/api/ocr/${id}`,
        { method: "POST", body: input },
      ),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}

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
    queryFn: () => api<{ fields: FormFieldInfo[] }>(`/api/forms/${id}`),
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
    }) => api<{ file: FileDTO }>(`/api/forms/${id}/fill`, { method: "POST", body: input }),
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
      api<{ file: FileDTO }>(`/api/forms/${id}/create`, { method: "POST", body: input }),
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
    }) => api<{ file: FileDTO }>(`/api/pdf/${id}/redact`, { method: "POST", body: input }),
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
      api<{ file: FileDTO; removed: number }>(`/api/pdf/${id}/remove-text`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["file", id] });
    },
  });
}
