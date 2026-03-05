import * as fs from 'fs';
import * as path from 'path';
import database from './index';

interface Migration {
  name: string;
  sql: string;
}

async function getMigrationFiles(): Promise<Migration[]> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((file) => ({
    name: file,
    sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8'),
  }));
}

async function runMigrations(): Promise<void> {
  console.log('Starting migrations...');

  const migrations = await getMigrationFiles();
  console.log(`Found ${migrations.length} migration files`);

  for (const migration of migrations) {
    console.log(`Running migration: ${migration.name}`);
    try {
      await database.query(migration.sql);
      console.log(`Migration ${migration.name} completed successfully`);
    } catch (error: any) {
      const ignoredCodes = ['42P07', '42703', '42P01', '23505'];
      if (ignoredCodes.includes(error.code)) {
        console.log(`Migration ${migration.name} skipped: ${error.code}`);
      } else {
        console.error(`Migration ${migration.name} failed:`, error);
        throw error;
      }
    }
  }

  console.log('All migrations completed');
  await database.disconnect();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
