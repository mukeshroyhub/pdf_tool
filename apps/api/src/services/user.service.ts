import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import type { ChangePasswordInput, UpdateProfileInput } from "@pdfforge/shared";
import { prisma } from "../lib/prisma";
import { badRequest, notFound, unauthorized } from "../lib/errors";

const BCRYPT_ROUNDS = 12;

export async function getById(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  return user;
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.activityLogging !== undefined ? { activityLogging: input.activityLogging } : {}),
    },
  });
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await getById(userId);
  if (!user.passwordHash) {
    throw badRequest(
      "This account uses Google sign-in and has no password set",
      "NO_PASSWORD_SET",
    );
  }
  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw unauthorized("Current password is incorrect");

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Sign out all other sessions on password change.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
