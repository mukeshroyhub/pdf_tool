import { Router } from "express";
import { config } from "../config";
import { summary } from "../services/analytics.service";

export const adminRouter = Router();

/**
 * GET /api/admin/stats — aggregate usage numbers for the owner.
 *
 * Guarded by a shared key in the x-admin-key header (set ADMIN_KEY in .env).
 * When no key is configured, the endpoint doesn't exist (404) so it can never
 * leak on an unconfigured box. The data is aggregate-only (see analytics
 * service) — even the owner cannot see anything about individual users here.
 */
adminRouter.get("/stats", async (req, res, next) => {
  try {
    if (!config.ADMIN_KEY) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
      return;
    }
    const provided = req.header("x-admin-key");
    if (provided !== config.ADMIN_KEY) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } });
      return;
    }
    res.json(await summary(30));
  } catch (err) {
    next(err);
  }
});
