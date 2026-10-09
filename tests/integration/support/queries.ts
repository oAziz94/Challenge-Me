// Small read helpers for tests. They use the superuser session only to inspect state (catalogue and history reads).
import type { TestDatabase } from './database.ts';

export async function rows(db: TestDatabase, sql: string, values?: unknown[]): Promise<Record<string, unknown>[]> {
  const c = await db.connect('admin');
  try {
    return (await c.query(sql, values)).rows;
  } finally {
    await c.end();
  }
}

export const historyVersions = async (db: TestDatabase): Promise<unknown[]> =>
  (await rows(db, 'SELECT version FROM migration.history ORDER BY version')).map((r) => r.version);

export const probeTableExists = async (db: TestDatabase): Promise<boolean> =>
  (await rows(db, "SELECT to_regclass('probe.t') AS x"))[0]?.x !== null;

export const SQL_PROBE_1 = 'CREATE SCHEMA probe AUTHORIZATION cm_migrator;\nCREATE TABLE probe.t (id int PRIMARY KEY);\n';
export const SQL_PROBE_2 = 'INSERT INTO probe.t VALUES (2);\n';
export const SQL_PROBE_3 = 'INSERT INTO probe.t VALUES (3);\n';
