#!/usr/bin/env node
/**
 * Engine-free SQLite migration for development and tests.
 * Uses Node's built-in sqlite module (Node >= 22.13) so setup works even
 * before any native npm packages are installed correctly.
 *
 *   node scripts/dev-migrate.mjs           # create/update the db
 *   node scripts/dev-migrate.mjs --reset   # drop and recreate first
 */
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const url = process.env.DATABASE_URL ?? readDotEnvUrl() ?? "file:./dev.db";
if (!url.startsWith("file:")) {
  console.error("dev-migrate only handles SQLite file: URLs, got:", url);
  process.exit(1);
}

const dbPath = path.resolve(apiDir, url.slice("file:".length));

if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

const sql = readFileSync(path.join(apiDir, "prisma", "init.sql"), "utf8");
const db = new DatabaseSync(dbPath);
db.exec(sql);

// Additive column migrations for existing databases. SQLite has no
// "ADD COLUMN IF NOT EXISTS", so check the current columns first.
ensureColumn(db, "users", "activityLogging", `BOOLEAN NOT NULL DEFAULT true`);

db.close();
console.log(`SQLite schema applied to ${dbPath}`);

function ensureColumn(database, table, column, definition) {
  const cols = database.prepare(`PRAGMA table_info("${table}")`).all();
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    console.log(`Added column ${table}.${column}`);
  }
}

function readDotEnvUrl() {
  try {
    const env = readFileSync(path.join(apiDir, ".env"), "utf8");
    const match = env.match(/^DATABASE_URL="?([^"\n]+)"?/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}
