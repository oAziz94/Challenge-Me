import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MigrationError } from './errors.ts';
import { loadMigrationFiles, parseMigrationFileName, sha256Hex, staticFindings } from './files.ts';

const dirs: string[] = [];
async function dirWith(files: Record<string, string | Uint8Array>): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cm-mig-'));
  dirs.push(d);
  for (const [name, content] of Object.entries(files)) await writeFile(join(d, name), content);
  return d;
}
afterEach(async () => {
  while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true });
});

const codeOf = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof MigrationError ? e.code : 'NOT_A_MIGRATION_ERROR';
  }
};

describe('file names', () => {
  it('accepts NNNN_attribution__slug.sql for a module schema or foundation', () => {
    expect(parseMigrationFileName('0001_foundation__database_baseline.sql')).toEqual({
      version: 1,
      attribution: 'foundation',
      slug: 'database_baseline',
    });
    expect(parseMigrationFileName('0042_identity__add_user.sql')?.attribution).toBe('identity');
  });
  it('rejects unknown attribution, bad shape, version zero', () => {
    for (const n of [
      '0001_nosuch__x.sql',
      '1_foundation__x.sql',
      '0001_foundation_x.sql',
      '0001_foundation__X.sql',
      '0000_foundation__x.sql',
      '0001_foundation__x.SQL',
      '0001_foundation__x.sql.bak',
    ]) {
      expect(parseMigrationFileName(n)).toBeUndefined();
    }
  });
});

describe('loading', () => {
  it('computes SHA-256 over the exact bytes and performs no normalization', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('SELECT 1;'), 0x20, 0x09]);
    const d = await dirWith({ '0001_foundation__a.sql': bytes });
    const [f] = await loadMigrationFiles(d);
    expect(f?.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(f?.checksum).toBe(sha256Hex(bytes));
    expect(Buffer.from(f?.bytes ?? []).equals(Buffer.from(bytes))).toBe(true);
  });
  it('one changed byte changes the checksum; CRLF is not folded into LF', async () => {
    const a = sha256Hex(new TextEncoder().encode('SELECT 1;\n'));
    expect(sha256Hex(new TextEncoder().encode('SELECT 1; \n'))).not.toBe(a);
    expect(sha256Hex(new TextEncoder().encode('SELECT 1;\r\n'))).not.toBe(a);
  });
  it('returns files ordered by version', async () => {
    const d = await dirWith({ '0002_foundation__b.sql': 'SELECT 2;', '0001_foundation__a.sql': 'SELECT 1;' });
    expect((await loadMigrationFiles(d)).map((f) => f.version)).toEqual([1, 2]);
  });
  it('rejects a duplicate version', async () => {
    const d = await dirWith({ '0001_foundation__a.sql': 'SELECT 1;', '0001_identity__b.sql': 'SELECT 2;' });
    expect(await codeOf(loadMigrationFiles(d))).toBe('DUPLICATE_VERSION');
  });
  it('rejects a gap in versions', async () => {
    const d = await dirWith({ '0001_foundation__a.sql': 'SELECT 1;', '0003_foundation__c.sql': 'SELECT 3;' });
    expect(await codeOf(loadMigrationFiles(d))).toBe('VERSION_GAP');
  });
  it('rejects a first version other than 1', async () => {
    const d = await dirWith({ '0002_foundation__a.sql': 'SELECT 1;' });
    expect(await codeOf(loadMigrationFiles(d))).toBe('VERSION_GAP');
  });
  it('rejects any stray entry, including a directory', async () => {
    const d = await dirWith({ '0001_foundation__a.sql': 'SELECT 1;', 'README.md': 'x' });
    expect(await codeOf(loadMigrationFiles(d))).toBe('INVALID_FILE_NAME');
    const d2 = await dirWith({ '0001_foundation__a.sql': 'SELECT 1;' });
    await mkdir(join(d2, '0002_foundation__b.sql'));
    expect(await codeOf(loadMigrationFiles(d2))).toBe('INVALID_FILE_NAME');
  });
  it('reports static findings per file without SQL text', async () => {
    const d = await dirWith({ '0001_foundation__a.sql': 'SELECT 1;', '0002_foundation__b.sql': 'COMMIT;' });
    const found = staticFindings(await loadMigrationFiles(d));
    expect(found.map((x) => x.file.version)).toEqual([2]);
    expect(JSON.stringify(found[0]?.findings)).not.toContain('COMMIT');
  });
});
