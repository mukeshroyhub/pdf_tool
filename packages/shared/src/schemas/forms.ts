import { z } from "zod";

const fileName = z.string().trim().min(1).max(255);

/** A form field as reported by GET /api/forms/:id. */
export interface FormFieldInfo {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "optionlist" | "button" | "signature";
  value: string | boolean | string[] | null;
  options: string[];
  readOnly: boolean;
  required: boolean;
  /** First widget position (PDF points, top-left origin), when resolvable. */
  page: number | null;
  rect: { x: number; y: number; w: number; h: number } | null;
}

export const fillFormSchema = z.object({
  values: z.record(
    z.string().min(1),
    z.union([z.string().max(10_000), z.boolean(), z.array(z.string().max(1000)).max(100)]),
  ),
  /** Flattening bakes values into the page and removes the fields. */
  flatten: z.boolean().default(false),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

const coord = z.number().min(-10_000).max(10_000);
const dim = z.number().min(4).max(10_000);

const baseField = {
  name: z.string().trim().min(1).max(120),
  page: z.number().int().min(0),
  x: coord,
  y: coord,
  w: dim,
  h: dim,
};

export const createFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...baseField, type: z.literal("text"), defaultValue: z.string().max(1000).default(""), multiline: z.boolean().default(false) }),
  z.object({ ...baseField, type: z.literal("checkbox"), checked: z.boolean().default(false) }),
  z.object({ ...baseField, type: z.literal("dropdown"), options: z.array(z.string().min(1).max(200)).min(1).max(100), defaultValue: z.string().max(200).optional() }),
  z.object({ ...baseField, type: z.literal("radio"), options: z.array(z.string().min(1).max(200)).min(2).max(20) }),
  // pdf-lib cannot create true digital-signature fields; this renders a
  // labelled signature line backed by a text field.
  z.object({ ...baseField, type: z.literal("signature") }),
]);

export const createFormSchema = z.object({
  fields: z.array(createFieldSchema).min(1).max(200),
  mode: z.enum(["new", "replace"]).default("new"),
  name: fileName.optional(),
});

export type FillFormInput = z.infer<typeof fillFormSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;
