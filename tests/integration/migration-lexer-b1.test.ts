// B1 regression against a real PostgreSQL 18: Unicode-escape identifiers spell schema migration. Both sides are proven: the database
// really resolves the escaped name to migration.history, and the static checker rejects the same bytes before the runner executes
// anything. Fixtures are controlled: statements delete nothing (WHERE false) or run in a rolled-back transaction.
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { migrateRepository, run, TempMigrations } from './support/fixtures.ts';
import { BSL, DQ, NL, SQ, dirWithBaselineAnd, rulesOf } from './support/lexer-fixtures.ts';
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

const plain = 'DELETE FROM U&' + DQ + BSL + '006Digration' + DQ + '.history';
const uescape = 'DELETE FROM U&' + DQ + '!006Digration' + DQ + ' UESCAPE ' + SQ + '!' + SQ + '.history';
const fixtureRow =
  'INSERT INTO migration.history (version, file_name, attribution, checksum, mode, state, completed_at) VALUES (9000, ' +
  [SQ + 'fixture.sql' + SQ, SQ + 'foundation' + SQ, SQ + 'a'.repeat(64) + SQ, SQ + 'transactional' + SQ, SQ + 'complete' + SQ].join(', ') +
  ', now())';

for (const [label, stmt] of [
  ['the backslash form', plain],
  ['the explicit UESCAPE form', uescape],
] as const) {
  describe('B1 ' + label, () => {
    it('PostgreSQL resolves it to migration.history (parse-safe, then a rolled-back real delete)', async () => {
      await expect(admin.query(stmt + ' WHERE false')).resolves.toMatchObject({ rowCount: 0 });
      // A different code point does not resolve, so the success above is the real table and not a lenient parse.
      await expect(admin.query(stmt.replace('006D', '006E') + ' WHERE false')).rejects.toMatchObject({ code: '42P01' });
      await admin.query('BEGIN');
      try {
        await admin.query(fixtureRow);
        expect((await admin.query(stmt + ' WHERE version = 9000')).rowCount).toBe(1);
      } finally {
        await admin.query('ROLLBACK');
      }
      expect(await historyVersions(db)).toEqual([1]);
    });

    it('the static checker rejects it, and the runner refuses it before executing anything', async () => {
      expect(rulesOf(stmt + ';')).toContain('unicode-escape');
      const dir = await dirWithBaselineAnd(tmp, '0002_foundation__forged.sql', stmt + ';' + NL);
      const out = await run(db, dir);
      expect(out.error?.code).toBe('STATIC_RULE_VIOLATION');
      expect(out.error?.rules).toContain('unicode-escape');
      expect(await historyVersions(db)).toEqual([1]);
    });
  });
}

describe('B1 the BYPASSRLS escape spelling', () => {
  const stmt = 'ALTER ROLE cm_app U&' + DQ + BSL + '0062ypassrls' + DQ;
  it('PostgreSQL reads it as the BYPASSRLS keyword for a role that may change it (rolled back), and refuses cm_migrator', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query(stmt);
      const r = await admin.query('SELECT rolbypassrls FROM pg_roles WHERE rolname = $1', ['cm_app']);
      expect(r.rows[0]?.rolbypassrls).toBe(true);
    } finally {
      await admin.query('ROLLBACK');
    }
    expect((await admin.query('SELECT rolbypassrls FROM pg_roles WHERE rolname = $1', ['cm_app'])).rows[0]?.rolbypassrls).toBe(false);
    const migrator = await db.connect('cm_migrator');
    await expect(migrator.query(stmt)).rejects.toMatchObject({ code: '42501' });
    await migrator.end();
  });
  it('the checker rejects the escape spelling outright', () => {
    expect(rulesOf(stmt + ';')).toContain('unicode-escape');
  });
});
