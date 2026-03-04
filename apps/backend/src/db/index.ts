import { Pool, PoolClient, QueryResult } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'security_user',
    password: process.env.PGPASSWORD || 'security_pass',
    database: process.env.PGDATABASE || 'security_analyzer',
  };
}

class Database {
  private pool: Pool | null = null;

  async connect(): Promise<Pool> {
    if (!this.pool) {
      const config = getDatabaseConfig();
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err: Error) => {
        console.error('Unexpected database error:', err);
      });

      try {
        const client = await this.pool.connect();
        client.release();
        console.log('Database connected successfully');
      } catch (error) {
        console.error('Failed to connect to database:', error);
        throw error;
      }
    }
    return this.pool;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    const pool = await this.connect();
    return pool.query(text, params);
  }

  async getClient(): Promise<PoolClient> {
    const pool = await this.connect();
    return pool.connect();
  }
}

export const database = new Database();
export default database;
