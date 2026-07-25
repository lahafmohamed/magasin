#!/usr/bin/env node
/**
 * Ordered, tracked database migration runner.
 *
 * Applies every src/db/NNN_*.sql file in ascending numeric order, exactly once,
 * recording each in a `schema_migrations` table. Each migration runs inside its
 * own transaction; a failure rolls that migration back and stops the run.
 *
 * Usage:
 *   node migrate.mjs            # apply all pending migrations
 *   node migrate.mjs --status   # list applied vs pending, apply nothing
 *   node migrate.mjs --dry-run  # show what would run, apply nothing
 *   node migrate.mjs --baseline # mark ALL existing files as applied WITHOUT running
 *                               # (use once on a DB already set up via the old scripts)
 *
 * This supersedes the ad-hoc setup-*.mjs / run-*.mjs scripts (which applied
 * hardcoded subsets in implicit order).
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, 'src', 'db');

const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has('--status');
const DRY_RUN = args.has('--dry-run');
const BASELINE = args.has('--baseline');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'magasin_db',
});

/** All migration files, sorted by leading numeric prefix then name. */
function listMigrations() {
  return fs
    .readdirSync(DB_DIR)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const applied = await appliedSet(client);
    const all = listMigrations();
    const pending = all.filter((f) => !applied.has(f));

    if (BASELINE) {
      for (const f of pending) {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      }
      console.log(`✅ Baselined ${pending.length} migration(s) as already-applied (none executed).`);
      return;
    }

    if (STATUS_ONLY) {
      console.log(`Applied: ${all.length - pending.length} / ${all.length}`);
      for (const f of all) console.log(`  ${applied.has(f) ? '✓' : '·'} ${f}`);
      return;
    }

    if (pending.length === 0) {
      console.log('✅ Database is up to date — no pending migrations.');
      return;
    }

    console.log(`${pending.length} pending migration(s):`);
    pending.forEach((f) => console.log(`  · ${f}`));
    if (DRY_RUN) {
      console.log('\n(dry run — nothing applied)');
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(DB_DIR, file), 'utf-8');
      const isConcurrent = /create\s+index\s+concurrently/i.test(sql) || /drop\s+index\s+concurrently/i.test(sql);
      process.stdout.write(`▶️  ${file} ... `);
      try {
        if (!isConcurrent) {
          await client.query('BEGIN');
        }
        await client.query(sql);
        if (!isConcurrent) {
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } else {
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        }
        console.log('done');
      } catch (err) {
        if (!isConcurrent) {
          await client.query('ROLLBACK');
        }
        console.error(`\n❌ ${file} failed: ${err.message}`);
        console.error('Stopped. Fix the migration and re-run.');
        process.exit(1);
      }
    }
    console.log('\n🎉 All pending migrations applied.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
