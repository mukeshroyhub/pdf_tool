import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.info(`PDF Tool API listening on ${config.API_URL} (${config.NODE_ENV})`);
  if (!config.smtpEnabled) console.info("SMTP not configured — emails will be logged to console");
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
