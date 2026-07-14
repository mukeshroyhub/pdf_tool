import { z } from "zod";

const fileName = z.string().trim().min(1).max(255);

export const CONVERT_TARGETS = ["pdf", "png", "jpg"] as const;

export const convertSchema = z.object({
  target: z.enum(CONVERT_TARGETS),
  /** Rasterization density for pdf → image targets. */
  dpi: z.number().int().min(36).max(600).default(150),
  /** JPEG quality for jpg output. */
  quality: z.number().int().min(10).max(100).default(85),
  name: fileName.optional(),
});

export const imagesToPdfSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(50),
  name: fileName.optional(),
});

export const COMPRESSION_LEVELS = ["low", "medium", "high", "custom"] as const;

export const compressSchema = z.object({
  level: z.enum(COMPRESSION_LEVELS),
  /** Custom-level knobs (ignored otherwise). */
  dpi: z.number().int().min(36).max(300).default(100),
  quality: z.number().int().min(10).max(95).default(60),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export const batchSchema = z.object({
  operation: z.enum(["convert", "compress", "watermark"]),
  fileIds: z.array(z.string().min(1)).min(1).max(50),
  /** Operation-specific parameters, validated by the target service. */
  params: z.record(z.string(), z.unknown()).default({}),
});

export type ConvertInput = z.infer<typeof convertSchema>;
export type ImagesToPdfInput = z.infer<typeof imagesToPdfSchema>;
export type CompressInput = z.infer<typeof compressSchema>;
export type BatchInput = z.infer<typeof batchSchema>;

export interface BatchResultItem {
  fileId: string;
  ok: boolean;
  /** Present on success (single or multiple outputs). */
  files?: Array<{ id: string; name: string }>;
  error?: string;
}
