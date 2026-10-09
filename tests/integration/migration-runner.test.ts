// Migration runner behaviour on a real PostgreSQL 18 (STACK-ADR-003 sections 4, 5, 9; Foundation brief section 14 [A-2]).
import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { run, TempMigrations } from './support/fixtures.ts';

const tmp = new TempMigrations();
let db: TestDatabase;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(async () => {
  await tmp.cleanup();
  await db.drop();
});

const F1 = {
  '0001_foundation__probe_schema.sql':
    'CREATE SCHEMA probe AUTHORIZATION cm_migrator;\nCREATE TABLE probe.t (id int PRIMARY KEY, v text);\n',
};
const F2 = { '0002_foundation__probe_data.sql': "INSERT INTO probe.t VALUES (1, 'a');\n" };

async function history(): Promise<Record<string, unknown>[]> {
  const c = await db.connect('admin');
  try {
    return (await c.query('SELECT * FROM migration.history ORDER BY version')).rows;
  } finally {
    await c.end();
  }
}
async function one(sql: string): Promise<unknown> {
  const c = await db.connect('admin');
  try {
    return (await c.query(sql)).rows[0]?.x;
  } finally {
    await c.end();
  }
}

describe('fresh database', () => {
  it('applies every file in version order and records the contracted history columns', async () => {
    const dir = await tmp.make({ ...F1, ...F2 });
    const out = await run(db, dir);
    expect(out.error).toBeUndefined();
    expect(out.result).toEqual({ applied: [1, 2], alreadyApplied: 0 });
    const rows = await history();
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    const first = rows[0] as Record<string, unknown>;
    const bytes = new TextEncoder().encode(Object.values(F1)[0]);
    expect(first.file_name).toBe('0001_foundation__probe_schema.sql');
    expect(first.attribution).toBe('foundation');
    expect(first.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(first.mode).toBe('transactional');
    expect(first.state).toBe('complete');
    expect(first.started_at).toBeInstanceOf(Date);
    expect(first.completed_at).toBeInstanceOf(Date);
    expect(Object.keys(first).sort()).toEqual([
      'attribution',
      'checksum',
      'completed_at',
      'file_name',
      'mode',
      'started_at',
      'state',
      'version',
    ]);
    expect(await one('SELECT v AS x FROM probe.t')).toBe('a');
  });

  it('a second run is a no-op that writes nothing', async () => {
    const dir = await tmp.make({ ...F1, ...F2 });
    await run(db, dir);
    const before = await history();
    const c = await db.connect('admin');
    const xid = (await c.query('SELECT xmin::text AS x FROM migration.history ORDER BY version')).rows;
    await c.end();
    const out = await run(db, dir);
    expect(out.result).toEqual({ applied: [], alreadyApplied: 2 });
    expect(out.events.map((e) => e.event)).toContain('run.noop');
    expect(await history()).toEqual(before);
    const c2 = await db.connect('admin');
    expect((await c2.query('SELECT xmin::text AS x FROM migration.history ORDER BY version')).rows).toEqual(xid);
    await c2.end();
  });

  it('a later run applies only the new file', async () => {
    const dir = await tmp.make(F1);
    await run(db, dir);
    await tmp.write(dir, F2);
    const out = await run(db, dir);
    expect(out.result).toEqual({ applied: [2], alreadyApplied: 1 });
  });

  it('keeps the exact bytes: trailing whitespace is part of the checksum and nothing is normalized', async () => {
    const sql = 'CREATE SCHEMA probe AUTHORIZATION cm_migrator;  \t\n\n-- tail \n';
    const dir = await tmp.make({ '0001_foundation__bytes.sql': sql });
    await run(db, dir);
    const rows = await history();
    expect(rows[0]?.checksum).toBe(createHash('sha256').update(Buffer.from(sql, 'utf8')).digest('hex'));
  });
});

describe('preflight (STACK-ADR-003 section 5)', () => {
  it('stops when schema migration does not exist, and does not create it', async () => {
    await db.drop();
    db = await createTestDatabase({ migrationSchema: false });
    const out = await run(db, await tmp.make(F1));
    expect(out.error?.code).toBe('SCHEMA_MISSING');
    expect(await one("SELECT count(*)::int AS x FROM pg_namespace WHERE nspname IN ('migration', 'probe')")).toBe(0);
  });

  it('stops when schema migration is not owned by cm_migrator, and changes nothing', async () => {
    await db.drop();
    db = await createTestDatabase({ migrationSchemaOwner: 'cm_app' });
    const out = await run(db, await tmp.make(F1));
    expect(out.error?.code).toBe('SCHEMA_OWNER');
    expect(
      await one("SELECT count(*)::int AS x FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'migration'"),
    ).toBe(0);
  });

  it('refuses to run as any role other than cm_migrator, including the superuser', async () => {
    const dir = await tmp.make(F1);
    for (const login of ['cm_app', 'cm_queue', 'admin'] as const) {
      const { runMigrations } = await import('../../src/foundation/migrations/runner.ts');
      const err = await runMigrations({ connection: db.config(login), directory: dir }).catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('WRONG_ROLE');
    }
    expect(await one("SELECT count(*)::int AS x FROM pg_namespace WHERE nspname = 'probe'")).toBe(0);
  });

  it('creates only migration.history in schema migration', async () => {
    await run(db, await tmp.make(F1));
    const c: Client = await db.connect('admin');
    const r = await c.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'migration' ORDER BY 1",
    );
    await c.end();
    expect(r.rows.map((x) => x.relname)).toEqual(['history', 'history_file_name_key', 'history_pkey']);
  });
});
