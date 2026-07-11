import { Router } from "express";
import { deleteActivitiesSchema, listActivityQuerySchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { badRequest } from "../lib/errors";
import { validateBody } from "../middleware/validate";
import * as activity from "../services/activity.service";

export const activityRouter = Router();

activityRouter.use(requireAuth);

activityRouter.get("/", async (req, res, next) => {
  try {
    const query = listActivityQuerySchema.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query parameters", "INVALID_QUERY");
    res.json(await activity.list(req.auth!.sub, query.data));
  } catch (err) {
    next(err);
  }
});

// Bulk-delete selected activity entries (scoped to the authenticated user).
activityRouter.post("/delete", validateBody(deleteActivitiesSchema), async (req, res, next) => {
  try {
    const deleted = await activity.deleteMany(req.auth!.sub, req.body.ids);
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});
