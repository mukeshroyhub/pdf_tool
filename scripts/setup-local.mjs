#!/usr/bin/env node
/**
 * One-command offline setup:
 *   node scripts/setup-local.mjs   (or: npm run setup)
 *
 * - Creates apps/api/.env with freshly generated JWT secrets (if missing)
 * - Creates the SQLite database schema
 * Everything runs locally; no network access is required after `npm install`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiDir = path.join(root, "apps", "api");
const envPath = path.join(apiDir, ".env");

if (existsSync(envPath)) {
  console.log("✓ apps/api/.env already exists — keeping it");
} else {
  const template = readFileSync(path.join(root, ".env.example"), "utf8");
  const env = template
    .replace("JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars-long", `JWT_ACCESS_SECRET=${randomBytes(32).toString("hex")}`)
    .replace("JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars-long", `JWT_REFRESH_SECRET=${randomBytes(32).toString("hex")}`);
  writeFileSync(envPath, env);
  console.log("✓ apps/api/.env created with generated secrets");
}

execFileSync(process.execPath, [path.join(apiDir, "scripts", "dev-migrate.mjs")], {
  cwd: apiDir,
  stdio: "inherit",
  env: { ...process.env },
});

console.log("\nAll set. Start the app with:  npm run dev");
console.log("Then open http://localhost:3000");
console.log("\nOffline notes:");
console.log("  - Sign-up/sign-in work fully offline (email links print to this console)");
console.log("  - Office conversions need LibreOffice installed locally (optional)");
console.log("  - OCR needs Tesseract installed locally (optional)");
