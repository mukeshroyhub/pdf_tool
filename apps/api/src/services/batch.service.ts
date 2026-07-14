import {
  batchSchema,
  compressSchema,
  convertSchema,
  watermarkSchema,
  type BatchInput,
  type BatchResultItem,
} from "@pdfforge/shared";
import { AppError, badRequest } from "../lib/errors";
import * as convertService from "./convert.service";
import * as compressService from "./compress.service";
import * as editService from "./edit.service";

export { batchSchema };

/** Runs one operation across many files; failures are reported per file. */
export async function runBatch(userId: string, input: BatchInput): Promise<BatchResultItem[]> {
  let runner: (fileId: string) => Promise<Array<{ id: string; name: string }>>;

  switch (input.operation) {
    case "convert": {
      const params = convertSchema.safeParse(input.params);
      if (!params.success) throw badRequest("Invalid convert parameters", "INVALID_PARAMS");
      runner = async (fileId) =>
        (await convertService.convert(userId, fileId, params.data)).map((f) => ({
          id: f.id,
          name: f.name,
        }));
      break;
    }
    case "compress": {
      const params = compressSchema.safeParse({ ...input.params, mode: "new" });
      if (!params.success) throw badRequest("Invalid compress parameters", "INVALID_PARAMS");
      runner = async (fileId) => {
        const r = await compressService.compress(userId, fileId, params.data);
        return [{ id: r.file.id, name: r.file.name }];
      };
      break;
    }
    case "watermark": {
      const params = watermarkSchema.safeParse({ ...input.params, mode: "new" });
      if (!params.success) throw badRequest("Invalid watermark parameters", "INVALID_PARAMS");
      runner = async (fileId) => {
        const f = await editService.watermark(userId, fileId, params.data);
        return [{ id: f.id, name: f.name }];
      };
      break;
    }
  }

  const results: BatchResultItem[] = [];
  for (const fileId of input.fileIds) {
    try {
      results.push({ fileId, ok: true, files: await runner(fileId) });
    } catch (err) {
      results.push({
        fileId,
        ok: false,
        error: err instanceof AppError ? err.message : "Operation failed",
      });
    }
  }
  return results;
}
