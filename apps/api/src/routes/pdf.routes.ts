import { Router } from "express";
import {
  annotateSchema,
  pageNumbersSchema,
  protectSchema,
  redactSchema,
  removeTextSchema,
  mergeSchema,
  rebuildSchema,
  replacePagesSchema,
  splitSchema,
  unlockSchema,
  watermarkSchema,
} from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as pdf from "../services/pdf.service";
import * as edit from "../services/edit.service";
import * as redactService from "../services/redact.service";
import * as protectService from "../services/protect.service";

export const pdfRouter = Router();

pdfRouter.use(requireAuth);

pdfRouter.post("/merge", validateBody(mergeSchema), async (req, res, next) => {
  try {
    const file = await pdf.merge(req.auth!.sub, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/split", validateBody(splitSchema), async (req, res, next) => {
  try {
    const files = await pdf.split(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ files });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/rebuild", validateBody(rebuildSchema), async (req, res, next) => {
  try {
    const file = await pdf.rebuild(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/replace-pages", validateBody(replacePagesSchema), async (req, res, next) => {
  try {
    const file = await pdf.replacePages(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/annotate", validateBody(annotateSchema), async (req, res, next) => {
  try {
    const file = await edit.annotate(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/watermark", validateBody(watermarkSchema), async (req, res, next) => {
  try {
    const file = await edit.watermark(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/page-numbers", validateBody(pageNumbersSchema), async (req, res, next) => {
  try {
    const file = await edit.addPageNumbers(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/protect", validateBody(protectSchema), async (req, res, next) => {
  try {
    const file = await protectService.protect(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/unlock", validateBody(unlockSchema), async (req, res, next) => {
  try {
    const file = await protectService.unlock(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/redact", validateBody(redactSchema), async (req, res, next) => {
  try {
    const file = await redactService.redact(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

pdfRouter.post("/:id/remove-text", validateBody(removeTextSchema), async (req, res, next) => {
  try {
    const result = await redactService.removeText(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
