import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { config } from "../config";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  // Body-parser JSON syntax errors arrive here.
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: config.isProd ? "Internal server error" : String(err),
    },
  });
}
