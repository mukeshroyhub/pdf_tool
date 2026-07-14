import { Router } from "express";
import { createFormSchema, fillFormSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as formService from "../services/form.service";

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
