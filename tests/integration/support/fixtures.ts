// Helpers for runner tests: temporary migration directories and a log collector.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MigrationError } from '../../../src/foundation/migrations/errors.ts';
import { runMigrations, type MigrationLogEvent, type RunResult } from '../../../src/foundation/migrations/runner.ts';
import type { TestDatabase } from './database.ts';

export const NO_TX = '-- cm:mode=no_transaction\n';

export class TempMigrations {
  private dirs: string[] = [];
  async make(files: Record<string, string | Uint8Array>): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'cm-mig-'));
    this.dirs.push(d);
    await this.write(d, files);
    return d;
  }
  async write(dir: string, files: Record<string, string | Uint8Array>): Promise<void> {
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  }
  async cleanup(): Promise<void> {
    while (this.dirs.length > 0) await rm(this.dirs.pop() as string, { recursive: true, force: true });
  }
}

export interface Outcome {
  readonly result?: RunResult;
  readonly error?: MigrationError;
  readonly events: MigrationLogEvent[];
}

/** Runs the runner against db and returns its result or its MigrationError (a raw error fails the test), with the log events. */
export async function run(db: TestDatabase, directory: string, extra: { lockTimeoutMs?: number } = {}): Promise<Outcome> {
  const events: MigrationLogEvent[] = [];
  try {
    const result = await runMigrations({ connection: db.config('cm_migrator'), directory, log: (e) => events.push(e), ...extra });
    return { result, events };
  } catch (e) {
    if (!(e instanceof MigrationError)) throw e;
    return { error: e, events };
  }
}

/** The repository's own migrations directory (the first migration and any later one). */
export const REPOSITORY_MIGRATIONS = fileURLToPath(new URL('../../../migrations', import.meta.url));

export async function migrateRepository(db: TestDatabase): Promise<RunResult> {
  const out = await run(db, REPOSITORY_MIGRATIONS);
  if (out.error || !out.result) throw out.error ?? new Error('migration produced no result');
  return out.result;
}
