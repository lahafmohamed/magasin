#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'magasin_db',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlPath = path.join(__dirname, '..', 'src', 'db', '061_add_prix_achat_unitaire_to_document_lignes.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = await pool.connect();
try {
  await client.query(sql);
  console.log('✅ Migration 061 applied: prix_achat_unitaire column added to document_lignes and backfilled');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
