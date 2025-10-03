import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  user: process.env.PGUSER || 'user',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'yahoo_dataset',
  password: process.env.PGPASSWORD || '1234',
  port: Number(process.env.PGPORT || 5432),
  max: Number(process.env.PGMAXCLIENTS || 10),
  idleTimeoutMillis: Number(process.env.PGIDLE || 30000)
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});
