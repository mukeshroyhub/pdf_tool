import { Router } from "express";
import { createFormSchema, fillFormSchema, ocrSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as ocrService from "../services/ocr.service";
import * as formService from "../services/form.service";

export const ocrRouter = Router();
ocrRouter.use(requireAuth);

ocrRouter.get("/languages", async (_req, res, next) => {
  try {
    res.json({ languages: await ocrService.listLanguages() });
  } catch (err) {
    next(err);
  }
});

ocrRouter.post("/:id", validateBody(ocrSchema), async (req, res, next) => {
  try {
    res.status(201).json(await ocrService.ocr(req.auth!.sub, req.params.id!, req.body));
  } catch (err) {
    next(err);
  }
});

export const formRouter = Router();
formRouter.use(requireAuth);

formRouter.get("/:id", async (req, res, next) => {
  try {
    res.json({ fields: await formService.inspect(req.auth!.sub, req.params.id!) });
  } catch (err) {
    next(err);
  }
});

formRouter.post("/:id/fill", validateBody(fillFormSchema), async (req, res, next) => {
  try {
    const file = await formService.fill(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});

formRouter.post("/:id/create", validateBody(createFormSchema), async (req, res, next) => {
  try {
    const file = await formService.create(req.auth!.sub, req.params.id!, req.body);
    res.status(201).json({ file });
  } catch (err) {
    next(err);
  }
});
