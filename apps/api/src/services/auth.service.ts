import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import type { LoginInput, RegisterInput, UserDTO } from "@pdfforge/shared";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/jwt";
import { generateToken, hashToken } from "../lib/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/mailer";
import { badRequest, conflict, unauthorized } from "../lib/errors";
import { config } from "../config";

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

export const TOKEN_TYPE = {
  emailVerify: "EMAIL_VERIFY",
  passwordReset: "PASSWORD_RESET",
} as const;

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    hasPassword: user.passwordHash !== null,
    googleLinked: user.googleId !== null,
    storageUsed: Number(user.storageUsed),
    storageLimit: Number(user.storageLimit),
    activityLogging: user.activityLogging,
    createdAt: user.createdAt.toISOString(),
  };
}

interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueSession(user: User, meta: ClientMeta): Promise<AuthResult> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const { token: refreshToken, tokenHash } = generateToken();
  const refreshExpiresAt = new Date(
    Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  return { user, accessToken, refreshToken, refreshExpiresAt };
}

export async function register(input: RegisterInput, meta: ClientMeta): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("An account with this email already exists", "EMAIL_TAKEN");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
  });
  await createAndSendVerification(user);
  return issueSession(user, meta);
}

const GUEST_EMAIL = "guest@pdfforge.local";

/** Logs in to the shared local guest account, creating it on first use. */
export async function loginAsGuest(meta: ClientMeta): Promise<AuthResult> {
  let user = await prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: GUEST_EMAIL, name: "Guest", emailVerified: true },
    });
  }
  return issueSession(user, meta);
}

export async function login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Hash comparison runs even for unknown emails to keep timing uniform.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid";
  const valid = await bcrypt.compare(input.password, hash);
  if (!user || !user.passwordHash || !valid) {
    throw unauthorized("Invalid email or password");
  }
  return issueSession(user, meta);
}

/** Rotates the refresh token: the old one is revoked, a new one is issued. */
export async function refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResult> {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    // Reuse of a revoked token may indicate theft — revoke the whole family.
    if (stored?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized("Invalid or expired refresh token");
  }
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueSession(stored.user, meta);
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function createAndSendVerification(user: User): Promise<void> {
  const { token, tokenHash } = generateToken();
  await prisma.actionToken.create({
    data: {
      tokenHash,
      type: TOKEN_TYPE.emailVerify,
      userId: user.id,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    },
  });
  await sendVerificationEmail(user.email, token);
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerified) throw badRequest("Email is already verified", "ALREADY_VERIFIED");
  await prisma.actionToken.deleteMany({
    where: { userId, type: TOKEN_TYPE.emailVerify },
  });
  await createAndSendVerification(user);
}

export async function verifyEmail(token: string): Promise<User> {
  const stored = await prisma.actionToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (
    !stored ||
    stored.type !== TOKEN_TYPE.emailVerify ||
    stored.usedAt ||
    stored.expiresAt < new Date()
  ) {
    throw badRequest("Invalid or expired verification link", "INVALID_TOKEN");
  }
  const [, user] = await prisma.$transaction([
    prisma.actionToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { emailVerified: true } }),
  ]);
  return user;
}

/** Always succeeds from the caller's perspective to avoid account enumeration. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.actionToken.deleteMany({
    where: { userId: user.id, type: TOKEN_TYPE.passwordReset },
  });
  const { token, tokenHash } = generateToken();
  await prisma.actionToken.create({
    data: {
      tokenHash,
      type: TOKEN_TYPE.passwordReset,
      userId: user.id,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });
  await sendPasswordResetEmail(user.email, token);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const stored = await prisma.actionToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (
    !stored ||
    stored.type !== TOKEN_TYPE.passwordReset ||
    stored.usedAt ||
    stored.expiresAt < new Date()
  ) {
    throw badRequest("Invalid or expired reset link", "INVALID_TOKEN");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.actionToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    // Force re-login everywhere after a password reset.
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/** Creates or links an account from a verified Google identity. */
export async function loginWithGoogle(
  profile: { googleId: string; email: string; name: string; avatarUrl: string | null },
  meta: ClientMeta,
): Promise<AuthResult> {
  let user = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    user = byEmail
      ? await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            emailVerified: true,
            avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          },
        })
      : await prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            googleId: profile.googleId,
            avatarUrl: profile.avatarUrl,
            emailVerified: true, // Google verifies the email for us
          },
        });
  }
  return issueSession(user, meta);
}
