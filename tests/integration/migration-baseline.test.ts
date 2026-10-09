// The repository's own migrations on a fresh database, and the migration command (STACK-ADR-003 sections 9 and 10; STACK-ADR-001 4.4 A.6).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../../src/foundation/migrations/cli.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { REPOSITORY_MIGRATIONS, run } from './support/fixtures.ts';
import { rows } from './support/queries.ts';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.drop();
});

describe('fresh-database migration of the repository migrations', () => {
  const files = readdirSync(REPOSITORY_MIGRATIONS).sort();

  it('migrates a clean database from nothing to the current schema', async () => {
    const out = await run(db, REPOSITORY_MIGRATIONS);
    expect(out.error).toBeUndefined();
    expect(out.result?.applied).toEqual(files.map((_, i) => i + 1));
    const h = await rows(db, 'SELECT version, file_name, attribution, checksum, mode, state FROM migration.history ORDER BY version');
    expect(h.map((r) => r.file_name)).toEqual(files);
    for (const r of h) {
      const bytes = readFileSync(join(REPOSITORY_MIGRATIONS, String(r.file_name)));
      expect(r.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(r.state).toBe('complete');
    }
    expect(h[0]).toMatchObject({ version: 1, attribution: 'foundation', mode: 'transactional' });
  });

  it('migrating again changes nothing (idempotent re-run)', async () => {
    const before = await rows(db, 'SELECT * FROM migration.history ORDER BY version');
    const out = await run(db, REPOSITORY_MIGRATIONS);
    expect(out.result).toEqual({ applied: [], alreadyApplied: files.length });
    expect(await rows(db, 'SELECT * FROM migration.history ORDER BY version')).toEqual(before);
  });
});

describe('the migration command', () => {
  const url = (): string => {
    const c = db.config('cm_migrator');
    return `postgres://${c.user}:${c.password}@${c.host}:${c.port}/${c.database}`;
  };
  const capture = (): { out: string[]; err: string[]; io: { out: (l: string) => void; err: (l: string) => void } } => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
  };

  it('runs from the environment, prints only event JSON, and never prints the connection string', async () => {
    const c = capture();
    const code = await main(['--dir', REPOSITORY_MIGRATIONS], { CM_MIGRATOR_DATABASE_URL: url() }, c.io);
    expect(code).toBe(0);
    expect(c.err).toEqual([]);
    const all = c.out.join('\n');
    expect(all).not.toContain(String(db.config('cm_migrator').password));
    expect(all).not.toContain('postgres://');
    expect(c.out.map((l) => JSON.parse(l).event)).toContain('run.noop');
  });

  it('names only the configuration key when it is missing', async () => {
    const c = capture();
    expect(await main([], {}, c.io)).toBe(1);
    expect(c.err).toEqual([JSON.stringify({ error: 'CONFIGURATION', key: 'CM_MIGRATOR_DATABASE_URL' })]);
  });

  it('reports a failure by code only, with a non-zero exit, and does not leak the credential', async () => {
    const c = capture();
    const bad = url().replace('/' + db.name, '/' + db.name + '_missing');
    expect(await main(['--dir', REPOSITORY_MIGRATIONS], { CM_MIGRATOR_DATABASE_URL: bad }, c.io)).toBe(1);
    expect(JSON.parse(c.err[0] ?? '{}')).toMatchObject({ error: 'CONNECTION_FAILED' });
    expect(c.err.join('')).not.toContain(String(db.config('cm_migrator').password));
  });

  it('refuses a malformed resolve request without touching the database', async () => {
    const c = capture();
    expect(await main(['--resolve-started', '2', '--checksum', 'nothex'], { CM_MIGRATOR_DATABASE_URL: url() }, c.io)).toBe(1);
    expect(c.err).toEqual([JSON.stringify({ error: 'USAGE' })]);
  });
});
