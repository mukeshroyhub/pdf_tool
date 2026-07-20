import type { Response } from "express";
import { config } from "../config";

export const REFRESH_COOKIE = "pf_rt";

/**
 * Readable "is there a session?" flag that shadows the refresh cookie.
 *
 * The refresh token itself is httpOnly, so the browser app cannot tell whether
 * a session exists — it used to fire POST /api/auth/refresh on every cold load
 * and eat a 401 for anonymous visitors (noise in the logs, a wasted round-trip
 * on the login page's critical path). This cookie carries NO secret and grants
 * NO access: it is just a "1" the client can read to decide whether attempting
 * a refresh is worthwhile. Its lifetime is tied to the refresh token's.
 */
export const SESSION_HINT_COOKIE = "pf_session";

/** Refresh token lives in an httpOnly cookie scoped to the auth endpoints. */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/api/auth",
    expires: expiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, "1", {
    httpOnly: false, // deliberately readable — see the comment above
    secure: config.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.clearCookie(SESSION_HINT_COOKIE, { path: "/" });
}
