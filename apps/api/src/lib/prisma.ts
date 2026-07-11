import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";

/**
 * Prisma runs engine-less (engineType "client") with a JS driver adapter:
 * libsql for `file:` URLs in development/tests, pg for PostgreSQL.
 */
function createAdapter() {
  if (config.DATABASE_URL.startsWith("file:")) {
    // Resolve relative SQLite paths against the API package root so the
    // database location doesn't depend on the process working directory.
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const dbPath = path.resolve(apiRoot, config.DATABASE_URL.slice("file:".length));
    return new PrismaLibSQL({ url: `file:${dbPath}` });
  }
  return new PrismaPg({ connectionString: config.DATABASE_URL });
}

export const prisma = new PrismaClient({ adapter: createAdapter() });
