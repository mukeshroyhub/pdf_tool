import { z } from "zod";

/** RGB in 0..1, matching pdf-lib's rgb(). */
export const colorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
});

const coord = z.number().min(-10_000).max(10_000);
const dim = z.number().min(0.1).max(10_000);

/**
 * All coordinates are in PDF points with a TOP-LEFT origin
 * (the server flips the Y axis per page).
 */
const base = { page: z.number().int().min(0) };

export const textElementSchema = z.object({
  ...base,
  type: z.literal("text"),
  x: coord,
  y: coord,
  text: z.string().min(1).max(5000),
  fontSize: z.number().min(4).max(144),
  color: colorSchema,
  // "inter" / "inter-bold" embed the open-source Inter font server-side — a
  // much closer match for modern geometric brand fonts (Uber Move, Circular,
  // Gotham…) than Helvetica. Falls back to Helvetica when Inter is unavailable.
  font: z
    .enum(["helvetica", "helvetica-bold", "times", "courier", "inter", "inter-bold"])
    .default("helvetica"),
});

export const highlightElementSchema = z.object({
  ...base,
  type: z.literal("highlight"),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
  color: colorSchema,
  opacity: z.number().min(0.05).max(1).default(0.35),
});

export const whiteoutElementSchema = z.object({
  ...base,
  type: z.literal("whiteout"),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
});

export const rectElementSchema = z.object({
  ...base,
  type: z.literal("rect"),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
  stroke: colorSchema,
  strokeWidth: z.number().min(0.25).max(50).default(2),
  fill: colorSchema.nullable().default(null),
});

export const ellipseElementSchema = z.object({
  ...base,
  type: z.literal("ellipse"),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
  stroke: colorSchema,
  strokeWidth: z.number().min(0.25).max(50).default(2),
  fill: colorSchema.nullable().default(null),
});

export const lineElementSchema = z.object({
  ...base,
  type: z.literal("line"),
  x1: coord,
  y1: coord,
  x2: coord,
  y2: coord,
  color: colorSchema,
  width: z.number().min(0.25).max(50).default(2),
});

export const inkElementSchema = z.object({
  ...base,
  type: z.literal("ink"),
  paths: z
    .array(z.array(z.object({ x: coord, y: coord })).min(2).max(3000))
    .min(1)
    .max(200),
  color: colorSchema,
  width: z.number().min(0.25).max(50).default(2),
});

export const imageElementSchema = z.object({
  ...base,
  type: z.literal("image"),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
  imageFileId: z.string().min(1),
});

export const editElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  highlightElementSchema,
  whiteoutElementSchema,
  rectElementSchema,
  ellipseElementSchema,
  lineElementSchema,
  inkElementSchema,
  imageElementSchema,
]);

export const annotateSchema = z.object({
  elements: z.array(editElementSchema).min(1).max(500),
  mode: z.enum(["new", "replace"]).default("new"),
  name: z.string().trim().min(1).max(255).optional(),
});

export const watermarkSchema = z.object({
  text: z.string().trim().min(1).max(200),
  fontSize: z.number().min(8).max(200).default(48),
  color: colorSchema.default({ r: 0.6, g: 0.6, b: 0.6 }),
  opacity: z.number().min(0.05).max(1).default(0.25),
  rotation: z.number().min(-90).max(90).default(-45),
  mode: z.enum(["new", "replace"]).default("new"),
  name: z.string().trim().min(1).max(255).optional(),
});

export const PAGE_NUMBER_POSITIONS = [
  "bottom-center",
  "bottom-right",
  "bottom-left",
  "top-center",
  "top-right",
  "top-left",
] as const;

export const pageNumbersSchema = z.object({
  position: z.enum(PAGE_NUMBER_POSITIONS).default("bottom-center"),
  startAt: z.number().int().min(1).max(100_000).default(1),
  fontSize: z.number().min(6).max(48).default(11),
  /** "n" = "1"; "n-of-total" = "1 of 10"; "page-n" = "Page 1". */
  format: z.enum(["n", "n-of-total", "page-n"]).default("n"),
  margin: z.number().min(4).max(200).default(28),
  color: colorSchema.default({ r: 0.3, g: 0.3, b: 0.3 }),
  mode: z.enum(["new", "replace"]).default("new"),
  name: z.string().trim().min(1).max(255).optional(),
});

export type EditElement = z.infer<typeof editElementSchema>;
export type AnnotateInput = z.infer<typeof annotateSchema>;
export type WatermarkInput = z.infer<typeof watermarkSchema>;
export type PageNumbersInput = z.infer<typeof pageNumbersSchema>;
export type RgbColor = z.infer<typeof colorSchema>;
