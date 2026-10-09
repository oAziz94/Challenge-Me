// Shared by the B1 and B2 regressions: a migrated database, and a migrations directory whose version 1 is the repository baseline.
import { readFile } from 'node:fs/promises';
import { checkMigrationBytes } from '../../../src/foundation/migrations/static-rules.ts';
import { REPOSITORY_MIGRATIONS, TempMigrations } from './fixtures.ts';

export const SQ = String.fromCharCode(39);
export const DQ = String.fromCharCode(34);
export const BSL = String.fromCharCode(92);
export const NL = String.fromCharCode(10);

export const rulesOf = (sql: string): string[] => checkMigrationBytes(new TextEncoder().encode(sql)).map((f) => f.rule);

/** A directory holding the already-applied baseline as version 1 and `second` as version 2. */
export async function dirWithBaselineAnd(tmp: TempMigrations, secondName: string, second: string): Promise<string> {
  const dir = await tmp.make({ [secondName]: second });
  await tmp.write(dir, {
    '0001_foundation__database_baseline.sql': await readFile(REPOSITORY_MIGRATIONS + '/0001_foundation__database_baseline.sql'),
  });
  return dir;
}
