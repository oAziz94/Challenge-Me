// Migration command (STACK-ADR-003 section 10; STACK-ADR-001 4.12 "fourth image command"). The same code runs in CI, locally and,
// once a production bootstrap exists, in the pipeline.
//
//   migrate                                   apply pending migrations from ./migrations
//   migrate --resolve-started <v> --checksum <sha256>
//                                             record a human-completed unfinished no-transaction migration (reviewed procedure)
//
// The cm_migrator connection string is read from CM_MIGRATOR_DATABASE_URL only. Locally it comes from the untracked
// .env.local via `node --env-file-if-exists=.env.local` (STACK-ADR-001 4.10). It is never printed or logged.
// Output: one JSON object per event on stdout; on failure one JSON object with the error code on stderr, exit code 1.

import { pathToFileURL } from 'node:url';
import { MigrationError } from './errors.ts';
import { resolveStartedMigration, runMigrations, type MigrationLogEvent } from './runner.ts';

const ENV_KEY = 'CM_MIGRATOR_DATABASE_URL';

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

function option(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: readonly string[], env: NodeJS.ProcessEnv, io: CliIo): Promise<number> {
  const url = env[ENV_KEY];
  if (url === undefined || url === '') {
    // Configuration errors name keys only (STACK-ADR-001 4.10).
    io.err(JSON.stringify({ error: 'CONFIGURATION', key: ENV_KEY }));
    return 1;
  }
  const directory = option(args, '--dir') ?? 'migrations';
  const log = (e: MigrationLogEvent): void => io.out(JSON.stringify(e));
  try {
    const resolveVersion = option(args, '--resolve-started');
    if (resolveVersion !== undefined) {
      const checksum = option(args, '--checksum') ?? '';
      const version = Number(resolveVersion);
      if (!Number.isInteger(version) || !/^[0-9a-f]{64}$/.test(checksum)) {
        io.err(JSON.stringify({ error: 'USAGE' }));
        return 1;
      }
      await resolveStartedMigration({ connection: { connectionString: url }, directory, log, version, checksum });
    } else {
      await runMigrations({ connection: { connectionString: url }, directory, log });
    }
    return 0;
  } catch (error) {
    if (error instanceof MigrationError) {
      io.err(JSON.stringify({ error: error.code, message: error.message }));
    } else {
      io.err(JSON.stringify({ error: 'UNEXPECTED' }));
    }
    return 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2), process.env, {
    out: (l) => console.log(l),
    err: (l) => console.error(l),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
