import pkg from 'pg';
import 'dotenv/config';
const { Pool } = pkg;

export const pool = new Pool({
  user: process.env.PGUSER || 'user',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'yahoo_dataset',
  password: process.env.PGPASSWORD || '1234',
  port: Number(process.env.PGPORT || 5432),
  max: Number(process.env.PGMAXCLIENTS || 10),
  idleTimeoutMillis: Number(process.env.PGIDLE || 30_000)
});

pool.on('error', (e) => console.error('PG pool error:', e.message));
