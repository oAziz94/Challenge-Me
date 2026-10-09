// Execution semantics: transactional rollback and the crash-safe no-transaction protocol (STACK-ADR-003 section 9).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveStartedMigration } from '../../src/foundation/migrations/runner.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { NO_TX, run, TempMigrations } from './support/fixtures.ts';
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
const hist = (): Promise<Record<string, unknown>[]> =>
  rows(db, 'SELECT version, mode, state, completed_at FROM migration.history ORDER BY version');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('transactional files (default)', () => {
  it('roll back completely when a later statement fails: no partial effect, no history row', async () => {
    const bad = 'CREATE TABLE probe.partial (a int);\nINSERT INTO probe.t VALUES (1);\nSELECT 1/0;\n';
    const out = await run(db, await tmp.make({ [N1]: S1, [N2]: bad, [N3]: 'INSERT INTO probe.t VALUES (3);\n' }));
    expect(out.error?.code).toBe('MIGRATION_FAILED');
    expect(out.error?.version).toBe(2);
    expect(out.error?.sqlState).toBe('22012');
    expect(await historyVersions(db)).toEqual([1]);
    expect(await rows(db, "SELECT to_regclass('probe.partial') AS x")).toEqual([{ x: null }]);
    expect(await rows(db, 'SELECT count(*)::int AS n FROM probe.t')).toEqual([{ n: 0 }]);
  });

  it('a transaction-control statement hidden from the lexical check is refused by the database itself', async () => {
    const sneaky = "DO $$ BEGIN EXECUTE 'COMMIT'; END $$;\n";
    const out = await run(db, await tmp.make({ [N1]: S1, [N2]: sneaky }));
    expect(out.error?.code).toBe('MIGRATION_FAILED');
    expect(out.error?.version).toBe(2);
    expect(await historyVersions(db)).toEqual([1]);
  });
});

describe('no-transaction files', () => {
  it('record started durably before the statement runs and complete after it', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: NO_TX + 'SELECT pg_sleep(1.5);\n' });
    const running = run(db, dir);
    let seen: Record<string, unknown> | undefined;
    for (let i = 0; i < 40 && seen === undefined; i++) {
      await sleep(100);
      seen = (await hist()).find((r) => r.version === 2);
    }
    expect(seen).toMatchObject({ mode: 'no_transaction', state: 'started', completed_at: null });
    const out = await running;
    expect(out.error).toBeUndefined();
    expect((await hist()).find((r) => r.version === 2)).toMatchObject({ mode: 'no_transaction', state: 'complete' });
    expect((await hist()).find((r) => r.version === 2)?.completed_at).toBeInstanceOf(Date);
  });

  it('can run a statement that cannot run in a transaction (CREATE INDEX CONCURRENTLY)', async () => {
    const out = await run(db, await tmp.make({ [N1]: S1, [N2]: NO_TX + 'CREATE INDEX CONCURRENTLY t_id_idx ON probe.t (id);\n' }));
    expect(out.error).toBeUndefined();
    expect(await rows(db, "SELECT indisvalid AS x FROM pg_index WHERE indexrelid = 'probe.t_id_idx'::regclass")).toEqual([{ x: true }]);
  });

  it('leave the row started on failure, block every later run, and never retry', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: NO_TX + 'SELECT 1/0;\n', [N3]: 'INSERT INTO probe.t VALUES (3);\n' });
    const first = await run(db, dir);
    expect(first.error?.code).toBe('MIGRATION_FAILED');
    expect(first.error?.version).toBe(2);
    expect((await hist()).find((r) => r.version === 2)).toMatchObject({ state: 'started', completed_at: null });

    const second = await run(db, dir);
    expect(second.error?.code).toBe('UNFINISHED_STARTED');
    expect(second.error?.versions).toEqual([2]);
    expect(second.events.map((e) => e.event)).not.toContain('migration.start');
    expect(await historyVersions(db)).toEqual([1, 2]);
    expect(await rows(db, 'SELECT count(*)::int AS n FROM probe.t')).toEqual([{ n: 0 }]);
  });

  it('treat a killed session as a failure: the row stays started and the next run stops', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: NO_TX + 'SELECT pg_sleep(30);\n' });
    const running = run(db, dir);
    let killed = 0;
    for (let i = 0; i < 50 && killed === 0; i++) {
      await sleep(100);
      const r = await rows(
        db,
        "SELECT pg_terminate_backend(pid)::int AS k FROM pg_stat_activity WHERE datname = current_database() AND query LIKE '%pg_sleep(30);%' AND pid <> pg_backend_pid()",
      );
      killed = r.length;
    }
    expect(killed).toBeGreaterThan(0);
    const out = await running;
    expect(out.error?.code).toBe('MIGRATION_FAILED');
    expect((await hist()).find((r) => r.version === 2)).toMatchObject({ state: 'started' });
    expect((await run(db, dir)).error?.code).toBe('UNFINISHED_STARTED');
  });
});

describe('the reviewed procedure for an unfinished no-transaction migration', () => {
  const NOTX_FAIL = NO_TX + 'SELECT 1/0;\n';
  async function stuck(): Promise<{ dir: string; checksum: string }> {
    const dir = await tmp.make({ [N1]: S1, [N2]: NOTX_FAIL });
    await run(db, dir);
    const checksum = String((await rows(db, 'SELECT checksum FROM migration.history WHERE version = 2'))[0]?.checksum);
    return { dir, checksum };
  }
  const opts = (dir: string, version: number, checksum: string) => ({
    connection: db.config('cm_migrator'),
    directory: dir,
    version,
    checksum,
  });

  it('records the human-completed outcome through the single started -> complete transition, then later files apply', async () => {
    const { dir, checksum } = await stuck();
    await resolveStartedMigration(opts(dir, 2, checksum));
    expect((await hist()).find((r) => r.version === 2)).toMatchObject({ state: 'complete' });
    await tmp.write(dir, { [N3]: 'INSERT INTO probe.t VALUES (3);\n' });
    expect((await run(db, dir)).result).toEqual({ applied: [3], alreadyApplied: 2 });
  });

  it('refuses a wrong checksum, a complete row, an unknown version, and an edited file', async () => {
    const { dir, checksum } = await stuck();
    const refused = async (o: ReturnType<typeof opts>): Promise<unknown> =>
      resolveStartedMigration(o).then(
        () => 'resolved',
        (e: { code?: string }) => e.code,
      );
    expect(await refused(opts(dir, 2, 'f'.repeat(64)))).toBe('RESOLVE_REFUSED');
    expect(await refused(opts(dir, 1, checksum))).toBe('RESOLVE_REFUSED');
    expect(await refused(opts(dir, 9, checksum))).toBe('RESOLVE_REFUSED');
    await tmp.write(dir, { [N2]: NOTX_FAIL + ' ' });
    expect(await refused(opts(dir, 2, checksum))).toBe('RESOLVE_REFUSED');
    expect((await hist()).find((r) => r.version === 2)).toMatchObject({ state: 'started' });
  });
});
