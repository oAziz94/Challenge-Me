// B2 regression against a real PostgreSQL 18: $ is a valid character inside an identifier, so x$$q$ is ONE identifier and the
// text after it is ordinary SQL. The lexer must agree with the database. Both sides are proven for each case.
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NO_TRANSACTION_MARKER } from '../../src/foundation/migrations/static-rules.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { migrateRepository, run, TempMigrations } from './support/fixtures.ts';
import { NL, dirWithBaselineAnd, rulesOf } from './support/lexer-fixtures.ts';
import { historyVersions } from './support/queries.ts';

const tmp = new TempMigrations();
let db: TestDatabase;
let admin: Client;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrateRepository(db);
  admin = await db.connect('admin');
});
afterAll(async () => {
  await tmp.cleanup();
  await admin?.end();
  await db?.drop();
});

const hidden = 'CREATE TABLE identity.x$$q$ (a int); COMMIT; -- $q$';
const noTx = NO_TRANSACTION_MARKER + NL + 'CREATE TABLE identity.y$$q$ (a int); CREATE TABLE identity.z$$q$ (b int); -- $q$';
const tablesNamed = async (names: string[]): Promise<string[]> =>
  (
    await admin.query(
      "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'identity' AND relname = ANY($1) ORDER BY 1",
      [names],
    )
  ).rows.map((r) => String(r.relname));

describe('B2 hidden COMMIT after an identifier containing $', () => {
  it('PostgreSQL reads x$$q$ as one identifier and executes the COMMIT after it', async () => {
    await admin.query('BEGIN');
    await admin.query(hidden);
    // The COMMIT inside the file ended the transaction, so this ROLLBACK has nothing to undo and the table persists.
    await admin.query('ROLLBACK');
    expect(await tablesNamed(['x$$q$'])).toEqual(['x$$q$']);
    await admin.query('DROP TABLE identity."x$$q$"');
  });

  it('the checker sees the COMMIT, and the runner refuses the file before executing anything', async () => {
    expect(rulesOf(hidden)).toContain('transaction-control');
    const out = await run(db, await dirWithBaselineAnd(tmp, '0002_foundation__hidden.sql', hidden + NL));
    expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
    expect(out.error?.rules).toContain('transaction-control');
    expect(await historyVersions(db)).toEqual([1]);
    expect(await tablesNamed(['x$$q$'])).toEqual([]);
  });
});

describe('B2 hidden second statement in a no-transaction file', () => {
  it('PostgreSQL executes both statements', async () => {
    await admin.query(noTx);
    expect(await tablesNamed(['y$$q$', 'z$$q$'])).toEqual(['y$$q$', 'z$$q$']);
    await admin.query('DROP TABLE identity."y$$q$", identity."z$$q$"');
  });

  it('the checker sees the second statement, and the runner refuses the file before executing anything', async () => {
    expect(rulesOf(noTx)).toContain('multiple-statements');
    const out = await run(db, await dirWithBaselineAnd(tmp, '0002_foundation__two_statements.sql', noTx + NL));
    expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
    expect(out.error?.rules).toContain('multiple-statements');
    expect(await historyVersions(db)).toEqual([1]);
    expect(await tablesNamed(['y$$q$', 'z$$q$'])).toEqual([]);
  });
});

describe('B2 genuine dollar quoting is unchanged', () => {
  it('parses in PostgreSQL and passes the checker, including as a no-transaction file', async () => {
    const genuine = 'DO $$ BEGIN PERFORM 1; END $$; SELECT $q$a;b$q$ AS v';
    const r = await admin.query(genuine);
    expect(Array.isArray(r) ? r.at(-1)?.rows : r.rows).toEqual([{ v: 'a;b' }]);
    expect(rulesOf(genuine + ';')).toEqual([]);
    const one = NO_TRANSACTION_MARKER + NL + 'DO $x$ BEGIN PERFORM 1; PERFORM 2; END $x$;';
    await admin.query(one);
    expect(rulesOf(one)).toEqual([]);
  });
});
