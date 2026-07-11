#!/usr/bin/env node
/**
 * Switches the Prisma datasource provider from SQLite (dev) to PostgreSQL
 * (production). Prisma requires the provider to be a literal in the schema,
 * so the Docker build runs this before `prisma migrate deploy`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = path.join(root, "apps", "api", "prisma", "schema.prisma");

const schema = readFileSync(schemaPath, "utf8");
if (schema.includes('provider = "postgresql"')) {
  console.log("schema.prisma already targets postgresql");
  process.exit(0);
}

writeFileSync(schemaPath, schema.replace('provider = "sqlite"', 'provider = "postgresql"'));
console.log("schema.prisma switched to postgresql");
