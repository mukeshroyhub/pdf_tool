import { z } from "zod";

const fileName = z.string().trim().min(1).max(255);

export const ocrSchema = z.object({
  /** Tesseract language codes, e.g. ["eng"] or ["eng", "deu"]. */
  languages: z.array(z.string().regex(/^[a-z_]{3,12}$/)).min(1).max(5).default(["eng"]),
  /** Rasterization density; higher = better recognition, slower. */
  dpi: z.number().int().min(150).max(600).default(300),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export type OcrInput = z.infer<typeof ocrSchema>;

export interface OcrResponse {
  file: { id: string; name: string };
  /** Plain text recognized across all pages. */
  text: string;
  languages: string[];
}
