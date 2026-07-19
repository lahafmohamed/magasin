/**
 * CI database bootstrap.
 *
 * The migration chain is NOT fresh-DB replayable (early migrations alter
 * tables only the long-dead schema.sql created; 010 uses CREATE INDEX
 * CONCURRENTLY; 001's shapes contradict 043). CI therefore loads a
 * pg_dump --schema-only baseline of the real database (src/db/ci-baseline.sql,
 * regenerate after adding a migration), the reference data every code path
 * assumes (roles, plan_comptable for the 072 auto-posting triggers,
 * three_way_match_config), then creates the admin test user and marks all
 * migrations as applied (schema_migrations baseline).
 *
 * Usage:  node scripts/ci-db-setup.mjs   (reads DB_* from the environment)
 * Local:  safe to point at a scratch database only — it assumes empty.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '..', 'src', 'db');

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'magasin_ci',
});

/** Strip psql meta-commands (\restrict et al. from pg_dump 18) — not SQL. */
function loadSql(file) {
  return readFileSync(path.join(dbDir, file), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

const { rows: guard } = await (async () => {
  await client.connect();
  return client.query("SELECT to_regclass('public.utilisateurs') AS t");
})();
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

console.log('Creating admin test user...');
const hash = await bcrypt.hash('admin123', 12);
await client.query(
  `INSERT INTO utilisateurs (username, email, password_hash, nom_complet, role_id, actif, must_change_password)
   SELECT 'admin', 'admin@ci.local', $1, 'CI Admin', r.id, true, false
   FROM roles r WHERE r.nom = 'admin'
   ON CONFLICT (username) DO NOTHING`,
  [hash]
);

console.log('Creating default magasin location...');
// Sales flows resolve the active magasin from stock_locations (StockMagasinService).
await client.query(
  `INSERT INTO stock_locations (code, nom, location_type, actif, est_principal)
   VALUES ('MAG-CI', 'Magasin CI', 'magasin', true, true)
   ON CONFLICT (code) DO NOTHING`
);

await client.end();

console.log('Marking migrations as applied (migrate.mjs --baseline)...');
const { spawnSync } = await import('node:child_process');
const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'migrate.mjs'), '--baseline'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(res.status ?? 1);
