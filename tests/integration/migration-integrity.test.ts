// Integrity checks as enforced by the runner on a real database (STACK-ADR-003 section 9).
// Every failure stops the run before ANY new migration is applied.
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/foundation/migrations/files.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { run, TempMigrations } from './support/fixtures.ts';
import { historyVersions, probeTableExists, rows, SQL_PROBE_1 as S1, SQL_PROBE_2 as S2, SQL_PROBE_3 as S3 } from './support/queries.ts';

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

describe('integrity checks stop the run before anything new is applied', () => {
  it('checksum mismatch on an applied file', async () => {
    const dir = await tmp.make({ [N1]: S1 });
    await run(db, dir);
    await tmp.write(dir, { [N1]: S1 + ' ', [N2]: S2 });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('CHECKSUM_MISMATCH');
    expect(out.error?.version).toBe(1);
    expect(await historyVersions(db)).toEqual([1]);
  });

  it('applied version whose file is missing', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: S2 });
    await run(db, dir);
    await rm(join(dir, N2));
    const out = await run(db, dir);
    expect(out.error?.code).toBe('MISSING_APPLIED_FILE');
    expect(out.error?.versions).toEqual([2]);
    expect(await historyVersions(db)).toEqual([1, 2]);
  });

  it('renamed applied file', async () => {
    const dir = await tmp.make({ [N1]: S1 });
    await run(db, dir);
    await rename(join(dir, N1), join(dir, '0001_foundation__renamed.sql'));
    await tmp.write(dir, { [N2]: S2 });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('RENAMED_APPLIED_FILE');
    expect(await historyVersions(db)).toEqual([1]);
  });

  it('duplicate version among files, before anything is applied', async () => {
    const dir = await tmp.make({ [N1]: S1, [N2]: S2, '0002_identity__other.sql': S3 });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('DUPLICATE_VERSION');
    expect(out.error?.versions).toEqual([2]);
    expect(await probeTableExists(db)).toBe(false);
    expect(await historyVersions(db)).toEqual([]);
  });

  it('older pending migration below the highest applied version', async () => {
    const only1 = await tmp.make({ [N1]: S1 });
    await run(db, only1);
    // History {1, 3} with files {1, 2, 3}: version 3 recorded as applied the way a divergent branch would have left it.
    await rows(
      db,
      "INSERT INTO migration.history (version, file_name, attribution, checksum, mode, state, completed_at) VALUES (3, $1, 'foundation', $2, 'transactional', 'complete', now())",
      [N3, sha256Hex(new TextEncoder().encode(S3))],
    );
    const dir = await tmp.make({ [N1]: S1, [N2]: S2, [N3]: S3 });
    const out = await run(db, dir);
    expect(out.error?.code).toBe('OUT_OF_ORDER');
    expect(out.error?.versions).toEqual([2]);
    expect(await historyVersions(db)).toEqual([1, 3]);
  });

  it('a gap in versions, a malformed name and a stray file are rejected before anything is applied', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ [N1]: S1, [N3]: S3 }, 'VERSION_GAP'],
      [{ [N1]: S1, 'notes.txt': 'x' }, 'INVALID_FILE_NAME'],
      [{ [N1]: S1, '0002_nosuchschema__x.sql': S2 }, 'INVALID_FILE_NAME'],
    ];
    for (const [files, code] of cases) expect((await run(db, await tmp.make(files))).error?.code).toBe(code);
    expect(await probeTableExists(db)).toBe(false);
  });
});
