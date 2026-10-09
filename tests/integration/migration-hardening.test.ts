// Logging redaction, advisory-lock hardening and concurrency (STACK-ADR-003 section 10; R16).
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATION_RUNNER_LOCK } from '../../src/foundation/db/lock-registry.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { run, TempMigrations } from './support/fixtures.ts';
import { historyVersions, rows, SQL_PROBE_1 as S1 } from './support/queries.ts';

const tmp = new TempMigrations();
let db: TestDatabase;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(async () => {
  await tmp.cleanup();
  await db.drop();
});

const N1 = '0001_foundation__one.sql';
const N2 = '0002_foundation__two.sql';
const N3 = '0003_foundation__three.sql';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('logs and errors never carry SQL text, parameter values or migrated data', () => {
  const SQL_CANARY = 'CANARY_SQL_TEXT_5b1e';
  const DATA_CANARY = 'CANARY_DATA_VALUE_77c0';
  const ALLOWED_KEYS = ['code', 'count', 'durationMs', 'event', 'fileName', 'mode', 'sqlState', 'version'];

  function assertClean(value: unknown): void {
    const text = JSON.stringify(value) + String((value as { stack?: unknown })?.stack ?? '');
    expect(text).not.toContain('CANARY');
    expect(text).not.toMatch(/INSERT INTO|CREATE TABLE|SELECT /);
  }

  it('on a successful run, with canaries in the SQL and in the migrated data', async () => {
    const sql = `-- ${SQL_CANARY}\nCREATE SCHEMA probe AUTHORIZATION cm_migrator;\nCREATE TABLE probe.t (v text UNIQUE);\nINSERT INTO probe.t VALUES ('${DATA_CANARY}');\n`;
    const out = await run(db, await tmp.make({ [N1]: sql }));
    expect(out.error).toBeUndefined();
    expect(out.events.length).toBeGreaterThan(3);
    for (const e of out.events) expect(Object.keys(e).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
    assertClean(out.events);
  });

  it('on a failing run, where the database error itself contains the data (duplicate key)', async () => {
    const dir = await tmp.make({
      [N1]: `CREATE SCHEMA probe AUTHORIZATION cm_migrator;\nCREATE TABLE probe.t (v text UNIQUE);\nINSERT INTO probe.t VALUES ('${DATA_CANARY}');\n`,
      [N2]: `INSERT INTO probe.t VALUES ('${DATA_CANARY}');\n-- ${SQL_CANARY}\n`,
    });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('MIGRATION_FAILED');
    expect(out.error?.sqlState).toBe('23505');
    assertClean(out.error);
    assertClean({ message: out.error?.message, name: out.error?.name });
    expect(out.error?.cause).toBeUndefined();
    assertClean(out.events);
    expect(out.events.at(-1)).toMatchObject({ event: 'run.failed', code: 'MIGRATION_FAILED', sqlState: '23505' });
  });

  it('on a static-rule failure', async () => {
    const out = await run(db, await tmp.make({ [N1]: `SELECT '${DATA_CANARY}'; COMMIT;\n` }));
    expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
    assertClean(out.error);
  });
});

describe('session state does not carry from one file to the next', () => {
  it('resets a plain SET between files', async () => {
    const dir = await tmp.make({
      [N1]: 'SET statement_timeout = 12345;\nCREATE SCHEMA probe AUTHORIZATION cm_migrator;\n',
      [N2]:
        'CREATE TABLE probe.s AS SELECT current_setting(' +
        String.fromCharCode(39) +
        'statement_timeout' +
        String.fromCharCode(39) +
        ') AS v;\n',
    });
    expect((await run(db, dir)).error).toBeUndefined();
    expect(await rows(db, 'SELECT v AS x FROM probe.s')).toEqual([{ x: '0' }]);
  });
  it('reports a missing migrations directory as such, not as a connection failure', async () => {
    const out = await run(db, '/nonexistent/cm-migrations-dir');
    expect(out.error?.code).toBe('DIRECTORY_UNREADABLE');
  });
});

describe('direct session and advisory lock', () => {
  const holder = async (): Promise<Client> => {
    const c = await db.connect('cm_queue');
    return c;
  };

  it('holds the session-level lock for the whole run, in the same backend that executes the migration', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: 'SELECT pg_sleep(1.5);\n' });
    const running = run(db, dir);
    let lock: Record<string, unknown> | undefined;
    for (let i = 0; i < 40 && lock === undefined; i++) {
      await sleep(100);
      const r = await rows(
        db,
        `SELECT l.pid, l.granted, l.classid::bigint AS ns, l.objid::bigint AS key, l.objsubid,
                (SELECT count(*)::int FROM pg_stat_activity a WHERE a.pid = l.pid AND a.query LIKE '%pg_sleep(1.5)%') AS running_migration
           FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      lock = r.find((x) => x.running_migration === 1);
    }
    expect(lock).toMatchObject({
      granted: true,
      ns: String(MIGRATION_RUNNER_LOCK.namespace),
      key: String(MIGRATION_RUNNER_LOCK.key),
      objsubid: 2,
    });
    expect((await running).error).toBeUndefined();
    // Released at the end: nothing left behind.
    expect(await rows(db, "SELECT 1 FROM pg_locks WHERE locktype = 'advisory'")).toHaveLength(0);
  });

  it('waits for a held lock and gives up with LOCK_TIMEOUT instead of interleaving', async () => {
    const other = await holder();
    await other.query('SELECT pg_advisory_lock($1::int, $2::int)', [MIGRATION_RUNNER_LOCK.namespace, MIGRATION_RUNNER_LOCK.key]);
    const dir = await tmp.make({ [N1]: S1 });
    const blocked = await run(db, dir, { lockTimeoutMs: 400 });
    expect(blocked.error?.code).toBe('LOCK_TIMEOUT');
    expect(await rows(db, "SELECT to_regclass('probe.t') AS x")).toEqual([{ x: null }]);
    await other.query('SELECT pg_advisory_unlock($1::int, $2::int)', [MIGRATION_RUNNER_LOCK.namespace, MIGRATION_RUNNER_LOCK.key]);
    await other.end();
    expect((await run(db, dir)).result?.applied).toEqual([1]);
  });

  it('two simultaneous runs never interleave: one applies, the other finds nothing to do', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: 'SELECT pg_sleep(1);\n', [N3]: 'INSERT INTO probe.t VALUES (3);\n' });
    const [a, b] = await Promise.all([run(db, dir), run(db, dir)]);
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    const applied = [a.result?.applied.length, b.result?.applied.length].sort();
    expect(applied).toEqual([0, 3]);
    expect(await historyVersions(db)).toEqual([1, 2, 3]);
  });

  it('uses an advisory lock namespace that application locks do not share (two-integer key space)', async () => {
    const other = await holder();
    // A single-bigint advisory lock with the numerically equal key is a different lock and does not block the runner.
    await other.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_RUNNER_LOCK.key]);
    expect((await run(db, await tmp.make({ [N1]: S1 }), { lockTimeoutMs: 400 })).error).toBeUndefined();
    await other.end();
  });
});
