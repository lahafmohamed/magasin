/**
 * Fresh-database bootstrap (CI + client provisioning).
 *
 * The migration chain is NOT fresh-DB replayable (early migrations alter
 * tables only the former legacy schema snapshot created; 010 uses CREATE INDEX
 * CONCURRENTLY; 001's shapes contradict 043). A fresh DB therefore loads a
 * pg_dump --schema-only baseline of the real database (src/db/ci-baseline.sql,
 * regenerate after adding a migration), the reference data every code path
 * assumes (roles, plan_comptable for the 072 auto-posting triggers,
 * three_way_match_config), then creates the admin user and marks all
 * migrations as applied (schema_migrations baseline).
 *
 * Usage:  node scripts/ci-db-setup.mjs   (reads DB_* from the environment)
 * Local:  safe to point at a scratch database only — it assumes empty.
 * Tests:  --reset-test-db drops/recreates public only after the strict test
 *         environment/database-name guard passes.
 *
 * Provisioning (deploy/provision-client.sh) overrides the CI defaults via env:
 *   ADMIN_USERNAME ADMIN_PASSWORD ADMIN_EMAIL ADMIN_FULLNAME
 *   ADMIN_MUST_CHANGE_PASSWORD=true   (force le changement au 1er login)
 *   MAGASIN_CODE MAGASIN_NAME
 * Defaults are the historical CI values — CI behaviour is unchanged.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '..', 'src', 'db');
const resetTestDb = process.argv.includes('--reset-test-db');
const databaseName = process.env.DB_NAME || 'magasin_ci';

if (
  resetTestDb &&
  (
    process.env.NODE_ENV !== 'test' ||
    !(databaseName === 'magasin_ci' || databaseName.toLowerCase().endsWith('_test'))
  )
) {
  console.error(
    `ci-db-setup: refusing --reset-test-db for NODE_ENV=${process.env.NODE_ENV || '(empty)'} DB_NAME=${databaseName}`
  );
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: databaseName,
});

/** Strip psql meta-commands (\restrict et al. from pg_dump 18) — not SQL. */
function loadSql(file) {
  return readFileSync(path.join(dbDir, file), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

await client.connect();

if (resetTestDb) {
  console.log(`Resetting disposable test schema in ${databaseName}...`);
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
}

const { rows: guard } = await client.query("SELECT to_regclass('public.utilisateurs') AS t");
if (guard[0].t !== null) {
  console.error('ci-db-setup: target database is not empty (utilisateurs exists) — refusing to load the baseline over it.');
  process.exit(1);
}

console.log('Loading schema baseline (ci-baseline.sql)...');
await client.query(loadSql('ci-baseline.sql'));

console.log('Loading reference data (ci-ref-data.sql)...');
await client.query(loadSql('ci-ref-data.sql'));

// The pg_dump preamble left this connection with search_path = '' — restore it.
await client.query('SET search_path TO public');

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@ci.local';
const adminFullName = process.env.ADMIN_FULLNAME || 'CI Admin';
const mustChangePassword = process.env.ADMIN_MUST_CHANGE_PASSWORD === 'true';
const magasinCode = process.env.MAGASIN_CODE || 'MAG-CI';
const magasinName = process.env.MAGASIN_NAME || 'Magasin CI';

console.log(`Creating admin user "${adminUsername}"...`);
const hash = await bcrypt.hash(adminPassword, 12);
await client.query(
  `INSERT INTO utilisateurs (username, email, password_hash, nom_complet, role_id, actif, must_change_password)
   SELECT $2, $3, $1, $4, r.id, true, $5
   FROM roles r WHERE r.nom = 'admin'
   ON CONFLICT (username) DO NOTHING`,
  [hash, adminUsername, adminEmail, adminFullName, mustChangePassword]
);

console.log('Creating default magasin location...');
// Sales flows resolve the active magasin from stock_locations (StockMagasinService).
await client.query(
  `INSERT INTO stock_locations (code, nom, location_type, actif, est_principal)
   VALUES ($1, $2, 'magasin', true, true)
   ON CONFLICT (code) DO NOTHING`,
  [magasinCode, magasinName]
);

await client.end();

console.log('Marking migrations as applied (migrate.mjs --baseline)...');
const { spawnSync } = await import('node:child_process');
const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'migrate.mjs'), '--baseline'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(res.status ?? 1);
