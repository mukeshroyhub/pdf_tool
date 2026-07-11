import { z } from "zod";

const fileName = z.string().trim().min(1).max(255);

export const mergeSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(2, "Select at least two PDFs").max(20),
  name: fileName.optional(),
});

const pageRange = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .refine((r) => r.to >= r.from, { message: "Range end must be >= start" });

export const splitSchema = z.object({
  ranges: z.array(pageRange).min(1).max(50),
  baseName: fileName.optional(),
});

/**
 * Rebuild describes the output document as an ordered page list.
 * `source` is a 0-based page index of the original, or "blank".
 * One spec covers reorder, rotate, delete, duplicate, insert-blank and extract.
 */
export const rebuildSchema = z.object({
  pages: z
    .array(
      z.object({
        source: z.union([z.number().int().min(0), z.literal("blank")]),
        rotate: z
          .number()
          .int()
          .refine((d) => d % 90 === 0, { message: "Rotation must be a multiple of 90" })
          .default(0),
      }),
    )
    .min(1, "Document must keep at least one page")
    .max(2000),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export const replacePagesSchema = z.object({
  sourceFileId: z.string().min(1),
  /** 1-based page numbers in the target to replace. */
  targetPages: z.array(z.number().int().min(1)).min(1).max(500),
  /** 1-based page numbers in the source, matched by position to targetPages. */
  sourcePages: z.array(z.number().int().min(1)).min(1).max(500),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export type MergeInput = z.infer<typeof mergeSchema>;
export type SplitInput = z.infer<typeof splitSchema>;
export type RebuildInput = z.infer<typeof rebuildSchema>;
export type ReplacePagesInput = z.infer<typeof replacePagesSchema>;
