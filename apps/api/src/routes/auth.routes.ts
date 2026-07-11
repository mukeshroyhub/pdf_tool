import { Router, type Request } from "express";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@pdfforge/shared";
import * as auth from "../services/auth.service";
import { toUserDTO } from "../services/auth.service";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from "../lib/cookies";
import { AppError, badRequest } from "../lib/errors";
import { config } from "../config";

export const authRouter = Router();

const clientMeta = (req: Request) => ({
  userAgent: req.headers["user-agent"],
  ip: req.ip,
});

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const result = await auth.register(req.body, clientMeta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.status(201).json({ user: toUserDTO(result.user), accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await auth.login(req.body, clientMeta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ user: toUserDTO(result.user), accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/guest", authLimiter, async (req, res, next) => {
  try {
    const result = await auth.loginAsGuest(clientMeta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ user: toUserDTO(result.user), accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new AppError(401, "NO_REFRESH_TOKEN", "No refresh token");
    const result = await auth.refresh(token, clientMeta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ user: toUserDTO(result.user), accessToken: result.accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearRefreshCookie(res);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  "/forgot-password",
  authLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res, next) => {
    try {
      await auth.forgotPassword(req.body.email);
      // Identical response whether or not the account exists.
      res.json({ message: "If that email is registered, a reset link has been sent" });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  "/reset-password",
  authLimiter,
  validateBody(resetPasswordSchema),
  async (req, res, next) => {
    try {
      await auth.resetPassword(req.body.token, req.body.password);
      res.json({ message: "Password has been reset. Please sign in." });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/verify-email", validateBody(verifyEmailSchema), async (req, res, next) => {
  try {
    const user = await auth.verifyEmail(req.body.token);
    res.json({ message: "Email verified", user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-verification", requireAuth, async (req, res, next) => {
  try {
    await auth.resendVerification(req.auth!.sub);
    res.json({ message: "Verification email sent" });
  } catch (err) {
    next(err);
  }
});

// ── Google OAuth (authorization-code flow) ─────────────────────────────

const googleClient = () =>
  new OAuth2Client({
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${config.API_URL}/api/auth/google/callback`,
  });

const OAUTH_STATE_COOKIE = "pf_oauth_state";

authRouter.get("/google", (req, res) => {
  if (!config.googleOAuthEnabled) {
    res.status(503).json({
      error: {
        code: "OAUTH_NOT_CONFIGURED",
        message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
    });
    return;
  }
  const state = randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });
  const url = googleClient().generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
  res.redirect(url);
});

authRouter.get("/google/callback", async (req, res, next) => {
  try {
    if (!config.googleOAuthEnabled) throw badRequest("Google OAuth is not configured");
    const { code, state } = req.query;
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE);
    if (typeof code !== "string" || typeof state !== "string" || state !== expectedState) {
      throw badRequest("Invalid OAuth state", "OAUTH_STATE_MISMATCH");
    }
    const client = googleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw badRequest("Google did not return an identity token");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw badRequest("Incomplete Google profile");

    const result = await auth.loginWithGoogle(
      {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name ?? payload.email.split("@")[0]!,
        avatarUrl: payload.picture ?? null,
      },
      clientMeta(req),
    );
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    // The web app finishes the session by calling /api/auth/refresh.
    res.redirect(`${config.WEB_URL}/auth/callback`);
  } catch (err) {
    next(err);
  }
});
