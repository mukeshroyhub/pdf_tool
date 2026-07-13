// One-off cleanup: removes the legacy shared guest account from production.
// Usage (PowerShell):
//   $env:DATABASE_URL = "<External Database URL from Render dashboard>"
//   node scripts/delete-old-guest.mjs
//
// Get the URL: Render dashboard -> pdftool-db -> Connections -> External Database URL
// (starts with postgresql:// and ends with .render.com/pdfforge)

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("postgresql")) {
  console.error("Set DATABASE_URL to the External Database URL first (see comments above).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query(
    "SELECT id, email, \"createdAt\" FROM users WHERE email = 'guest@pdfforge.local'",
  );
  if (rows.length === 0) {
    console.log("Nothing to do — the old shared guest account does not exist.");
  } else {
    // Cascade rules in the schema remove the guest's tokens, files and activity rows.
    await client.query("DELETE FROM users WHERE email = 'guest@pdfforge.local'");
    console.log("Deleted the old shared guest account:", rows[0].id);
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
