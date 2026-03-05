import { Pool } from 'pg';

const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;

const pool = new Pool({
  host: POSTGRES_HOST || 'localhost',
  port: parseInt(POSTGRES_PORT || '5432', 10),
  user: POSTGRES_USER || 'postgres',
  password: POSTGRES_PASSWORD || 'postgres',
  database: POSTGRES_DB || 'security_analyzer',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error:', err);
});

export async function query(
  text: string,
  params?: unknown[]
): Promise<{ rows: Record<string, unknown>[] }> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[Database] Executed query', {
      text: text.substring(0, 50),
      duration,
      rows: res.rowCount,
    });
    return res;
  } catch (error) {
    console.error('[Database] Query error:', error);
    throw error;
  }
}

export default pool;
