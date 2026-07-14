import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./lib/prisma";

const app = createApp();

// ── Token hygiene (runs at boot, then every 12 h) ──────────────────────
// Expired tokens are deleted immediately. Revoked/used tokens are kept for
// a 7-day grace window because refresh-token *reuse detection* relies on
// finding the revoked row (see auth.service refresh()).
const PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

async function purgeExpiredTokens(): Promise<void> {
  const now = new Date();
  const graceCutoff = new Date(Date.now() - PURGE_GRACE_MS);
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: graceCutoff } }] },
  });
  await prisma.actionToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: graceCutoff } }] },
  });
}

void purgeExpiredTokens().catch((err) => console.error("Token purge failed:", err));
setInterval(
  () => void purgeExpiredTokens().catch((err) => console.error("Token purge failed:", err)),
  PURGE_INTERVAL_MS,
).unref();

const server = app.listen(config.PORT, () => {
  console.info(`PDF Tool API listening on ${config.API_URL} (${config.NODE_ENV})`);
  if (!config.emailEnabled) console.info("Email not configured — emails will be logged to console");
  if (!config.googleOAuthEnabled) console.info("Google OAuth not configured — endpoint disabled");
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
