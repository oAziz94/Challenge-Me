import { describe, expect, it } from 'vitest';
import { checkMigrationBytes, NO_TRANSACTION_MARKER, readMode } from './static-rules.ts';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const rules = (s: string | Uint8Array): string[] => checkMigrationBytes(typeof s === 'string' ? enc(s) : s).map((f) => f.rule);
const CR = String.fromCharCode(13);
const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);
const BSL = String.fromCharCode(92);
const NL = String.fromCharCode(10);

describe('byte rules (STACK-ADR-003 section 4)', () => {
  it('accepts a plain LF file', () => {
    expect(rules('CREATE SCHEMA a AUTHORIZATION cm_migrator;\n')).toEqual([]);
  });
  it('rejects a CR character, even a lone one', () => {
    expect(rules('SELECT 1;' + CR + '\n')).toContain('carriage-return');
    expect(rules('SELECT 1;' + CR)).toContain('carriage-return');
  });
  it('rejects a UTF-8 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('SELECT 1;')]);
    expect(rules(bom)).toContain('bom');
  });
  it('rejects NUL and invalid UTF-8', () => {
    expect(rules(new Uint8Array([...enc('SELECT 1;'), 0]))).toContain('nul');
    expect(rules(new Uint8Array([0xff, 0xfe, 0x41]))).toContain('invalid-utf8');
  });
  it('reports a position and never SQL text', () => {
    const f = checkMigrationBytes(enc('SELECT 1;\nSELECT 2;' + CR + '\n'));
    expect(f).toEqual([{ rule: 'carriage-return', line: 2 }]);
  });
});

describe('transaction control (STACK-ADR-003 section 9)', () => {
  for (const stmt of [
    'BEGIN',
    'begin transaction',
    'START TRANSACTION',
    'COMMIT',
    'END',
    'ROLLBACK',
    'ABORT',
    'SAVEPOINT s',
    'RELEASE SAVEPOINT s',
    'PREPARE TRANSACTION ' + SQ + 'x' + SQ,
  ]) {
    it('rejects ' + stmt, () => {
      expect(rules('SELECT 1;\n' + stmt + ';')).toContain('transaction-control');
    });
  }
  it('allows BEGIN inside a PL/pgSQL body and unrelated statements', () => {
    expect(rules('DO $$ BEGIN PERFORM 1; END $$;')).toEqual([]);
    expect(rules('PREPARE p AS SELECT 1;')).toEqual([]);
  });
  it('is not fooled by comments or string literals', () => {
    expect(rules('-- COMMIT;\nSELECT ' + SQ + 'COMMIT;' + SQ + ';')).toEqual([]);
    expect(rules('/* BEGIN; */ SELECT 1;')).toEqual([]);
  });
  it('sees a COMMIT hidden after a comment on the same statement start', () => {
    expect(rules('SELECT 1; /* x */ COMMIT;')).toContain('transaction-control');
  });
});

describe('modes and the one-statement rule', () => {
  it('defaults to transactional; the marker must be the exact first line', () => {
    expect(readMode(enc('SELECT 1;'))).toBe('transactional');
    expect(readMode(enc(NO_TRANSACTION_MARKER + '\nSELECT 1;'))).toBe('no_transaction');
    expect(readMode(enc('SELECT 1;\n' + NO_TRANSACTION_MARKER))).toBe('transactional');
  });
  it('accepts exactly one statement in no_transaction mode', () => {
    expect(rules(NO_TRANSACTION_MARKER + '\nCREATE INDEX CONCURRENTLY i ON t (c);')).toEqual([]);
  });
  it('rejects two statements in no_transaction mode', () => {
    expect(rules(NO_TRANSACTION_MARKER + '\nSELECT 1; SELECT 2;')).toContain('multiple-statements');
  });
  it('counts a semicolon inside a literal or body as no boundary', () => {
    expect(rules(NO_TRANSACTION_MARKER + '\nSELECT ' + SQ + 'a;b' + SQ + ';')).toEqual([]);
    expect(rules(NO_TRANSACTION_MARKER + '\nDO $x$ BEGIN PERFORM 1; PERFORM 2; END $x$;')).toEqual([]);
  });
  it('rejects a marker that is not the first line, or an unknown cm: marker', () => {
    expect(rules('SELECT 1;\n' + NO_TRANSACTION_MARKER)).toContain('marker-misplaced');
    expect(rules('-- cm:mode=other\nSELECT 1;')).toContain('marker-unknown');
  });
  it('rejects an empty file and an unterminated literal', () => {
    expect(rules('-- only a comment\n')).toContain('no-statement');
    expect(rules('SELECT ' + SQ + 'open;')).toContain('unterminated-literal');
    expect(rules('SELECT $a$ open;')).toContain('unterminated-literal');
  });
});

describe('schema migration is closed to ordinary migration SQL (STACK-ADR-003 section 6)', () => {
  const refs = [
    'CREATE TABLE migration.x (a int);',
    'DROP TABLE migration.history;',
    'INSERT INTO migration.history VALUES (1);',
    'UPDATE MIGRATION.history SET state = 1;',
    'DELETE FROM migration.history;',
    'TRUNCATE migration.history;',
    'GRANT SELECT ON migration.history TO cm_app;',
    'ALTER TABLE migration.history ADD COLUMN c int;',
    'CREATE FUNCTION migration.f() RETURNS int LANGUAGE sql AS ' + SQ + 'SELECT 1' + SQ + ';',
    'SELECT * FROM "migration"."history";',
    'SELECT * FROM migration .history;',
    'DO $$ BEGIN EXECUTE ' + SQ + 'DROP TABLE migration.history' + SQ + '; END $$;',
  ];
  for (const sql of refs) {
    it('rejects: ' + sql.slice(0, 40), () => {
      expect(rules(sql)).toContain('schema-migration-reference');
    });
  }
  it('does not reject words that merely contain the word, or comments', () => {
    expect(rules('CREATE TABLE content.migrations (a int);')).toEqual([]);
    expect(rules('CREATE TABLE content.data_migration_log (a int);')).toEqual([]);
    expect(rules('-- see the migration notes\nSELECT 1;')).toEqual([]);
  });
});

describe('lexer and PostgreSQL agree on identifiers and escapes (review B1, B2)', () => {
  it('rejects Unicode-escape identifiers and strings, which can spell schema migration', () => {
    expect(rules('DELETE FROM U&' + DQ + BSL + '006Digration' + DQ + '.history;')).toContain('unicode-escape');
    expect(rules('DELETE FROM U&' + DQ + BSL + '006Digration' + DQ + ' UESCAPE ' + SQ + '!' + SQ + '.history;')).toContain(
      'unicode-escape',
    );
    expect(rules('SELECT U&' + SQ + BSL + '0041' + SQ + ';')).toContain('unicode-escape');
    expect(rules('ALTER ROLE r U&' + DQ + BSL + '0062ypassrls' + DQ + ';')).toContain('unicode-escape');
  });
  it('does not take the tail of an identifier containing $ for a dollar quote', () => {
    expect(rules('CREATE TABLE identity.x$$q$ (a int); COMMIT; -- $q$')).toContain('transaction-control');
    expect(rules(NO_TRANSACTION_MARKER + NL + 'CREATE TABLE identity.x$$q$ (a int); SELECT 2; -- $q$')).toContain('multiple-statements');
  });
  it('still reads real dollar quotes', () => {
    expect(rules('DO $$ BEGIN PERFORM 1; END $$; SELECT $q$a;b$q$;')).toEqual([]);
  });
});

describe('migration security invariants (STACK-ADR-001 4.4)', () => {
  it('rejects disabling RLS and removing FORCE', () => {
    expect(rules('ALTER TABLE a.b DISABLE ROW LEVEL SECURITY;')).toContain('rls-disabled');
    expect(rules('ALTER TABLE a.b NO FORCE ROW LEVEL SECURITY;')).toContain('rls-unforced');
  });
  it('allows enabling and forcing RLS', () => {
    expect(rules('ALTER TABLE a.b ENABLE ROW LEVEL SECURITY; ALTER TABLE a.b FORCE ROW LEVEL SECURITY;')).toEqual([]);
  });
  it('rejects BYPASSRLS but not NOBYPASSRLS', () => {
    expect(rules('ALTER ROLE r BYPASSRLS;')).toContain('bypassrls');
    expect(rules('ALTER ROLE r NOBYPASSRLS;')).toEqual([]);
  });
  it('rejects role membership but not object grants', () => {
    expect(rules('GRANT cm_app TO cm_queue;')).toContain('role-membership');
    expect(rules('REVOKE cm_app FROM cm_queue;')).toContain('role-membership');
    expect(rules('GRANT USAGE ON SCHEMA a TO cm_app;')).toEqual([]);
  });
});
