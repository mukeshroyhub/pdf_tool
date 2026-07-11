import { z } from "zod";

export const updateFileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255).optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isFavorite !== undefined, {
    message: "Nothing to update",
  });

export const listFilesQuerySchema = z.object({
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  search: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const deleteActivitiesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export type UpdateFileInput = z.infer<typeof updateFileSchema>;
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
export type DeleteActivitiesInput = z.infer<typeof deleteActivitiesSchema>;
