// One-off data migration: copies all rows from the old Render PostgreSQL
// database to the new Neon database. Safe to re-run (it clears the target
// tables first, then copies fresh).
//
// Usage (PowerShell, from the project root):
//   $env:OLD_DATABASE_URL = "<Render External Database URL>"
//   $env:NEW_DATABASE_URL = "<Neon connection string>"
//   node scripts/migrate-to-neon.mjs
//
// Prerequisite: the API must have booted once against Neon (it runs
// `prisma db push` on start, which creates the empty tables there).

import pg from "pg";

const oldUrl = process.env.OLD_DATABASE_URL;
const newUrl = process.env.NEW_DATABASE_URL;
if (!oldUrl?.startsWith("postgresql") || !newUrl?.startsWith("postgresql")) {
  console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL first (see comments at top of file).");
  process.exit(1);
}

// Parent tables first so foreign keys resolve.
const TABLES = ["users", "refresh_tokens", "action_tokens", "files", "activities"];

const source = new pg.Client({ connectionString: oldUrl, ssl: { rejectUnauthorized: false } });
const target = new pg.Client({ connectionString: newUrl, ssl: { rejectUnauthorized: false } });

const q = (name) => `"${name}"`; // preserve camelCase identifiers

try {
  await source.connect();
  await target.connect();

  // Sanity check: target schema must exist (created by the API's first boot).
  const check = await target.query(
    "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
    [TABLES],
  );
  if (check.rows[0].n !== TABLES.length) {
    console.error(
      "Target tables are missing on Neon. Make sure the Render API restarted against the new DATABASE_URL (its logs run `prisma db push`), then re-run this script.",
    );
    process.exit(1);
  }

  // Clear target in child-first order, then copy in parent-first order.
  await target.query(
    `TRUNCATE TABLE ${[...TABLES].reverse().map(q).join(", ")} RESTART IDENTITY CASCADE`,
  );

  for (const table of TABLES) {
    const { rows } = await source.query(`SELECT * FROM ${q(table)}`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const params = cols.map((_, i) => `$${i + 1}`).join(", ");
      await target.query(
        `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${params})`,
        cols.map((c) => row[c]),
      );
    }
    console.log(`${table}: copied ${rows.length} rows`);
  }

  console.log("\nMigration complete. Sign in on the live site to verify.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await source.end().catch(() => undefined);
  await target.end().catch(() => undefined);
}
