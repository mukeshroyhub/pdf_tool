import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt";
import { unauthorized } from "../lib/errors";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

/** Requires a valid `Authorization: Bearer <accessToken>` header. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(unauthorized());
    return;
  }
  req.auth = verifyAccessToken(header.slice("Bearer ".length));
  next();
}
