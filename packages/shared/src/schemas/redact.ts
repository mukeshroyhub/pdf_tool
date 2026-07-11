import { z } from "zod";

const fileName = z.string().trim().min(1).max(255);
const coord = z.number().min(-10_000).max(10_000);
const dim = z.number().min(0.5).max(10_000);

/** Areas use PDF points with a top-left origin, like the editor elements. */
export const redactSchema = z.object({
  areas: z
    .array(z.object({ page: z.number().int().min(0), x: coord, y: coord, w: dim, h: dim }))
    .min(1)
    .max(200),
  /** Rasterization density for the affected pages. */
  dpi: z.number().int().min(72).max(300).default(150),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export const removeTextSchema = z.object({
  /** Exact text to remove wherever it is drawn (e.g. a watermark). */
  text: z.string().min(1).max(500),
  /** 0-based page indices; omitted = all pages. */
  pages: z.array(z.number().int().min(0)).max(2000).optional(),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export type RedactInput = z.infer<typeof redactSchema>;
export type RemoveTextInput = z.infer<typeof removeTextSchema>;
