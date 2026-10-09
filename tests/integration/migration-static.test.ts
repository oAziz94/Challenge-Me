// Static rules as enforced by the runner on a real database (STACK-ADR-003 sections 4, 6, 9): a violation in ANY pending
// file stops the run before ANY pending file is applied.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { run, TempMigrations } from './support/fixtures.ts';
import { historyVersions, probeTableExists, rows, SQL_PROBE_1 as S1 } from './support/queries.ts';

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
const BOM = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('SELECT 1;')]);

const bad: [string, string | Uint8Array, string][] = [
  ['transaction control', 'COMMIT;\n', 'transaction-control'],
  ['a CR character', 'SELECT 1;\r\n', 'carriage-return'],
  ['a UTF-8 BOM', BOM, 'bom'],
  ['a reference to schema migration', 'DROP TABLE migration.history;\n', 'schema-migration-reference'],
  ['an insert into the history table', 'INSERT INTO migration.history VALUES (9);\n', 'schema-migration-reference'],
  ['two statements in a no-transaction file', '-- cm:mode=no_transaction\nSELECT 1; SELECT 2;\n', 'multiple-statements'],
  ['disabling RLS', 'ALTER TABLE probe.t DISABLE ROW LEVEL SECURITY;\n', 'rls-disabled'],
];

describe('static rules', () => {
  for (const [label, content, rule] of bad) {
    it('rejects ' + label + ' and applies nothing, not even the valid earlier file', async () => {
      const out = await run(db, await tmp.make({ [N1]: S1, [N2]: content }));
      expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
      expect(out.error?.version).toBe(2);
      expect(out.error?.rules).toContain(rule);
      expect(await probeTableExists(db)).toBe(false);
      expect(await historyVersions(db)).toEqual([]);
    });
  }

  it('leaves migration.history untouched when a file tries to drop it', async () => {
    const dir = await tmp.make({ [N1]: S1 });
    await run(db, dir);
    await tmp.write(dir, { [N2]: 'DROP TABLE migration.history;\n' });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
    expect(await historyVersions(db)).toEqual([1]);
    expect(await rows(db, "SELECT to_regclass('migration.history') AS x")).toEqual([{ x: 'migration.history' }]);
  });

  it('checks only pending files; an applied file is protected by its checksum instead', async () => {
    const dir = await tmp.make({ [N1]: S1 });
    await run(db, dir);
    await writeFile(join(dir, N1), 'COMMIT;');
    expect((await run(db, dir)).error?.code).toBe('CHECKSUM_MISMATCH');
  });
});
