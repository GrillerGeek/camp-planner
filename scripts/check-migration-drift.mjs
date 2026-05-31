#!/usr/bin/env node
// Migration-drift check for camp-planner.
//
// Two modes:
//   --structural        Repo-only sanity of supabase/migrations/. No DB access.
//                       Validates filenames, contiguous NNN_ numbering, non-empty.
//   --drift <file>      Compares repo migrations against the list of APPLIED
//                       migration names in <file> (one name per line, as read
//                       from supabase_migrations.schema_migrations). Fails if any
//                       repo migration is not applied to the database.
//
// Zero dependencies — Node built-ins only.
//
// Naming note: the schema_migrations `name` column is historically inconsistent
// about the NNN_ prefix (some rows carry it, some don't, and there are extra
// ad-hoc rows). We therefore compare on a NORMALIZED name (lowercased, leading
// digits+underscore stripped, .sql dropped) and only assert repo ⊆ applied —
// extra applied rows are fine.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const FILENAME_RE = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

/** Normalize any migration identifier to a comparable key. */
function normalize(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.sql$/, "")
    .replace(/^\d+[_-]/, "");
}

/** Read + validate the repo migration files. Returns { files, errors }. */
function readRepoMigrations() {
  const errors = [];
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch (err) {
    return { files: [], errors: [`Cannot read ${MIGRATIONS_DIR}: ${err.message}`] };
  }

  const files = [];
  for (const f of entries) {
    const m = FILENAME_RE.exec(f);
    if (!m) {
      errors.push(`Bad filename (expected NNN_snake_case.sql): ${f}`);
      continue;
    }
    const num = Number(m[1]);
    const slug = m[2];
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8").trim();
    if (body.length === 0) errors.push(`Empty migration file: ${f}`);
    files.push({ file: f, num, slug, normalized: normalize(slug) });
  }
  files.sort((a, b) => a.num - b.num);
  return { files, errors };
}

/** Structural mode: contiguous numbering, no gaps, no duplicates. */
function runStructural() {
  const { files, errors } = readRepoMigrations();
  if (files.length === 0 && errors.length === 0) {
    errors.push("No migration files found.");
  }

  const seen = new Map();
  for (const f of files) {
    if (seen.has(f.num)) {
      errors.push(
        `Duplicate migration number ${String(f.num).padStart(3, "0")}: ${seen.get(f.num)} and ${f.file}`
      );
    } else {
      seen.set(f.num, f.file);
    }
  }

  // Contiguous from 1..N (the highest number present).
  if (files.length > 0) {
    const max = files[files.length - 1].num;
    for (let n = 1; n <= max; n++) {
      if (!seen.has(n)) errors.push(`Gap in migration numbering: missing ${String(n).padStart(3, "0")}_*`);
    }
  }

  if (errors.length > 0) {
    console.error("✗ Migration structural check failed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ Structural check passed — ${files.length} migrations, contiguous 001..${String(files[files.length - 1].num).padStart(3, "0")}, all well-formed.`);
}

/** Drift mode: every repo migration must appear in the applied set. */
function runDrift(appliedFile) {
  const { files, errors } = readRepoMigrations();
  if (errors.length > 0) {
    console.error("✗ Cannot run drift check — repo migrations are malformed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  let appliedRaw;
  try {
    appliedRaw = readFileSync(appliedFile, "utf8");
  } catch (err) {
    console.error(`✗ Cannot read applied-migrations file '${appliedFile}': ${err.message}`);
    process.exit(1);
  }
  const applied = new Set(
    appliedRaw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map(normalize)
  );

  const missing = files.filter((f) => !applied.has(f.normalized));

  // Emit a markdown report to stdout (the workflow tees this into the issue).
  if (missing.length > 0) {
    console.log(`## ✗ Migration drift detected\n`);
    console.log(`${missing.length} repo migration(s) are committed but NOT applied to the database:\n`);
    for (const f of missing) console.log(`- \`${f.file}\` (normalized: \`${f.normalized}\`)`);
    console.log(
      `\nApply via \`apply_migration\` / the Supabase CLI (so it records in ` +
        `\`supabase_migrations.schema_migrations\`), then re-run this workflow.\n` +
        `\n_Note: migrations applied by pasting SQL into the dashboard do NOT record ` +
        `in the tracker and will false-positive here — always apply via a recording mechanism._`
    );
    process.exit(1);
  }

  console.log(`✓ No drift — all ${files.length} repo migrations are applied to the database.`);
}

// --- entry ---
const [, , mode, arg] = process.argv;
if (mode === "--structural") {
  runStructural();
} else if (mode === "--drift") {
  if (!arg) {
    console.error("Usage: check-migration-drift.mjs --drift <applied-names-file>");
    process.exit(2);
  }
  runDrift(arg);
} else {
  console.error("Usage: check-migration-drift.mjs (--structural | --drift <file>)");
  process.exit(2);
}
