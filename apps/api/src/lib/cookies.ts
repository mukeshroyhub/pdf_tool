import type { Response } from "express";
import { config } from "../config";

export const REFRESH_COOKIE = "pf_rt";

/** Refresh token lives in an httpOnly cookie scoped to the auth endpoints. */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/api/auth",
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}
