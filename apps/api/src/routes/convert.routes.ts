import { Router } from "express";
import { batchSchema, compressSchema, convertSchema, imagesToPdfSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as convert from "../services/convert.service";
import * as compress from "../services/compress.service";
import * as batch from "../services/batch.service";

export const convertRouter = Router();
convertRouter.use(requireAuth);

convertRouter.post("/images-to-pdf", validateBody(imagesToPdfSchema), async (req, res, next) => {
  try {
    const file = await convert.imagesToPdf(req.auth!.sub, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

convertRouter.post("/:id", validateBody(convertSchema), async (req, res, next) => {
  try {
    const files = await convert.convert(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ files });
  } catch (err) {
    next(err);
  }
});

export const compressRouter = Router();
compressRouter.use(requireAuth);

compressRouter.post("/:id", validateBody(compressSchema), async (req, res, next) => {
  try {
    const result = await compress.compress(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export const batchRouter = Router();
batchRouter.use(requireAuth);

batchRouter.post("/", validateBody(batchSchema), async (req, res, next) => {
  try {
    const results = await batch.runBatch(req.auth!.sub, req.body);
    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});
