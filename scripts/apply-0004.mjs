// One-off: paste supabase/migrations/0004_contact_hardening_counter.sql into
// Supabase Studio → SQL Editor and run it there. This script is only a
// convenience when SUPABASE_DB_URL is available locally.
//
// Usage: SUPABASE_DB_URL=postgres://... node scripts/apply-0004.mjs
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/0004_contact_hardening_counter.sql",
  "utf8",
);

const connStr = process.env.SUPABASE_DB_URL;
if (!connStr) {
  console.log(
    "No SUPABASE_DB_URL set — open Supabase Studio → SQL Editor and run supabase/migrations/0004_contact_hardening_counter.sql there.",
  );
  process.exit(0);
}

const postgres = (await import("postgres")).default;
const sql0 = postgres(connStr, { ssl: "prefer" });
try {
  await sql0.unsafe(sql);
  console.log("✓ migration 0004 applied");
} catch (e) {
  console.error("migration 0004 error:", e.message);
  process.exit(1);
} finally {
  await sql0.end();
}
