import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'magasin',
  password: process.env.DB_PASSWORD || 'magasin',
  database: process.env.DB_NAME || 'magasin_dev',
});

async function run() {
  const c = await pool.connect();
  try {
    const { rows: cols } = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'plan_comptable'"
    );
    const names = cols.map(r => r.column_name);

    if (!names.includes('classe')) {
      await c.query('ALTER TABLE plan_comptable ADD COLUMN classe INTEGER DEFAULT 1 CHECK (classe BETWEEN 1 AND 9)');
      console.log('classe added');
    }
    if (!names.includes('niveau')) {
      await c.query('ALTER TABLE plan_comptable ADD COLUMN niveau INTEGER DEFAULT 1');
      console.log('niveau added');
    }
    if (!names.includes('compte_parent')) {
      await c.query('ALTER TABLE plan_comptable ADD COLUMN compte_parent VARCHAR(8)');
      console.log('compte_parent added');
    }

    console.log('Done');
  } catch (e) {
    console.error(e.message);
  } finally {
    c.release();
    await pool.end();
  }
}

run();
