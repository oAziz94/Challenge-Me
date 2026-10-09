import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MigrationError } from './errors.ts';
import { loadMigrationFiles, staticFindings, type MigrationFile } from './files.ts';
import { checkIntegrity, type HistoryRow } from './runner.ts';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const sum = (c: string): string => c.repeat(64).slice(0, 64);

function file(version: number, name: string, c: string): MigrationFile {
  return {
    version,
    fileName: name,
    attribution: 'foundation',
    slug: 'x',
    mode: 'transactional',
    checksum: sum(c),
    bytes: new Uint8Array(),
  };
}
function row(version: number, name: string, c: string, state: HistoryRow['state'] = 'complete'): HistoryRow {
  return {
    version,
    fileName: name,
    attribution: 'foundation',
    checksum: sum(c),
    mode: state === 'started' ? 'no_transaction' : 'transactional',
    state,
  };
}

describe('integrity checks (STACK-ADR-003 section 9)', () => {
  const f1 = file(1, '0001_foundation__a.sql', 'a');
  const f2 = file(2, '0002_foundation__b.sql', 'b');
  it('passes when history is a prefix of the files with equal names and checksums', () => {
    expect(checkIntegrity([f1, f2], [row(1, f1.fileName, 'a')])).toBeUndefined();
    expect(checkIntegrity([f1, f2], [])).toBeUndefined();
  });
  it('fails on an unfinished started record, naming the version', () => {
    const e = checkIntegrity([f1], [row(1, f1.fileName, 'a', 'started')]);
    expect(e?.code).toBe('UNFINISHED_STARTED');
    expect(e?.versions).toEqual([1]);
  });
  it('fails on an applied version with no file', () => {
    expect(checkIntegrity([f1], [row(1, f1.fileName, 'a'), row(2, f2.fileName, 'b')])?.code).toBe('MISSING_APPLIED_FILE');
  });
  it('fails on a renamed applied file', () => {
    expect(checkIntegrity([f1], [row(1, '0001_foundation__old.sql', 'a')])?.code).toBe('RENAMED_APPLIED_FILE');
  });
  it('fails on a checksum mismatch', () => {
    expect(checkIntegrity([f1], [row(1, f1.fileName, 'c')])?.code).toBe('CHECKSUM_MISMATCH');
  });
  it('fails on an older pending file below the highest applied version', () => {
    const f3 = file(3, '0003_foundation__c.sql', 'c');
    const e = checkIntegrity([f1, f2, f3], [row(1, f1.fileName, 'a'), row(3, f3.fileName, 'c')]);
    expect(e?.code).toBe('OUT_OF_ORDER');
    expect(e?.versions).toEqual([2]);
  });
});

describe('errors carry no SQL text, parameters or driver details (STACK-ADR-003 section 10)', () => {
  it('builds the message from the code, versions, file names, SQLSTATE and rule names only, with no cause', () => {
    const e = new MigrationError('MIGRATION_FAILED', { version: 3, fileName: '0003_foundation__x.sql', sqlState: '23505' });
    expect(e.message).toBe('migration error MIGRATION_FAILED; version 3; file 0003_foundation__x.sql; sqlstate 23505');
    expect(e.cause).toBeUndefined();
  });
});

describe('runner write paths (STACK-ADR-003 section 8)', () => {
  const src = readFileSync(here('./runner.ts'), 'utf8');
  it('has exactly two INSERTs and one UPDATE on migration.history, and no delete, truncate or drop', () => {
    expect(src.match(/INSERT INTO [$][{]HISTORY[}]/g)).toHaveLength(2);
    expect(src.match(/UPDATE [$][{]HISTORY[}]/g)).toHaveLength(1);
    expect(src).not.toMatch(/DELETE FROM|TRUNCATE|DROP (TABLE|SCHEMA)|ALTER TABLE|CREATE SCHEMA/i);
  });
  it('never creates the schema and never splits or rewrites the SQL it sends', () => {
    expect(src).not.toMatch(/CREATE SCHEMA/i);
    expect(src).not.toMatch(/[.]split[(]|[.]replace[(]|replaceAll|normalize[(]/);
  });
  it('exports only the runner entry points, the integrity check and types', () => {
    const exported = [...src.matchAll(/^export (?:async )?(?:function|const|interface|type) (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        'HistoryRow',
        'MigrationLogEvent',
        'MigrationLogger',
        'ResolveOptions',
        'RunOptions',
        'RunResult',
        'checkIntegrity',
        'resolveStartedMigration',
        'runMigrations',
      ].sort(),
    );
  });
});

describe('the repository migrations directory', () => {
  const dir = here('../../../migrations');
  it('contains only well-formed, contiguous, rule-clean files', async () => {
    const files = await loadMigrationFiles(dir);
    expect(files.length).toBeGreaterThan(0);
    expect(staticFindings(files)).toEqual([]);
    expect(readdirSync(dir).every((n) => n.endsWith('.sql'))).toBe(true);
  });
  it('has the LF pin in .gitattributes', () => {
    const ga = readFileSync(here('../../../.gitattributes'), 'utf8');
    expect(ga).toContain('migrations/*.sql text eol=lf');
  });
  it('the first migration creates exactly the fifteen schemas, owned by cm_migrator, and nothing else', async () => {
    const [first] = await loadMigrationFiles(dir);
    const body = new TextDecoder()
      .decode(first?.bytes)
      .split('\n')
      .filter((l) => !l.startsWith('--') && l.trim() !== '');
    expect(body).toHaveLength(15);
    for (const l of body) expect(l).toMatch(/^CREATE SCHEMA [a-z]+ AUTHORIZATION cm_migrator;$/);
    const names = body.map((l) => l.split(' ')[2]);
    expect(names).not.toContain('foundation');
    expect(names).not.toContain('migration');
    expect(first?.attribution).toBe('foundation');
  });
});
