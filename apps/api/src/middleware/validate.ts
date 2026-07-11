import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../lib/errors";

/** Validates and replaces `req.body` with the parsed (sanitized) value. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
