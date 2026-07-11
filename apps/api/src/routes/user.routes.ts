import { Router } from "express";
import { changePasswordSchema, updateProfileSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { toUserDTO } from "../services/auth.service";
import * as users from "../services/user.service";

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get("/me", async (req, res, next) => {
  try {
    const user = await users.getById(req.auth!.sub);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

userRouter.patch("/me", validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const user = await users.updateProfile(req.auth!.sub, req.body);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

userRouter.post("/me/password", validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    await users.changePassword(req.auth!.sub, req.body);
    res.json({ message: "Password changed. Other sessions were signed out." });
  } catch (err) {
    next(err);
  }
});
