// The migration runner (STACK-ADR-003, ACCEPTED 2026-10-09). Foundation-owned, minimal, `pg` as its only runtime dependency.
//
//   - Plain forward-only SQL files; each file is sent UNCHANGED as one simple-protocol query. No splitter, no templating,
//     no normalization of line endings or encoding (section 4).
//   - A direct session connection (never a pooler) and a session-level advisory lock for the whole run (section 10).
//   - Preflight before any other action: connected role is cm_migrator and not a superuser; schema `migration` exists and is
//     owned by cm_migrator. The runner NEVER creates the schema (section 5); it creates and maintains only migration.history.
//   - Integrity checks before any new migration is applied (section 9); any failure stops the run.
//   - Transactional default; a no-transaction file has exactly one statement and follows the crash-safe started -> complete
//     protocol with no automatic retry (section 9).
//   - The only write paths to migration.history are the two INSERTs and the single started -> complete UPDATE below. There is
//     no delete and no general update path (section 8). Nothing here can bind the owner role at the database level; that
//     limit is acknowledged in section 8.
//   - Logs and errors carry versions, file names, timings and SQLSTATE only - never SQL text, parameter values or data.

import { Client, type ClientConfig } from 'pg';
import { MIGRATION_RUNNER_LOCK } from '../db/lock-registry.ts';
import { CM_MIGRATOR } from '../db/role-inventory.ts';
import { MIGRATION_SCHEMA } from '../db/schema-inventory.ts';
import { MigrationError, sqlStateOf, type MigrationErrorCode } from './errors.ts';
import { loadMigrationFiles, staticFindings, type MigrationFile } from './files.ts';

export type MigrationLogEvent = {
  readonly event:
    | 'run.start'
    | 'preflight.ok'
    | 'lock.acquired'
    | 'run.noop'
    | 'migration.start'
    | 'migration.complete'
    | 'migration.failed'
    | 'run.complete'
    | 'run.failed'
    | 'resolve.complete';
  readonly version?: number;
  readonly fileName?: string;
  readonly mode?: 'transactional' | 'no_transaction';
  readonly durationMs?: number;
  readonly sqlState?: string;
  readonly count?: number;
  readonly code?: MigrationErrorCode;
};
export type MigrationLogger = (event: MigrationLogEvent) => void;

export interface RunOptions {
  /** Connection settings for the cm_migrator session. Never logged. */
  readonly connection: ClientConfig;
  readonly directory: string;
  readonly log?: MigrationLogger;
  /** How long to wait for the advisory lock. Default 60000. */
  readonly lockTimeoutMs?: number;
}

export interface RunResult {
  readonly applied: readonly number[];
  readonly alreadyApplied: number;
}

export interface HistoryRow {
  readonly version: number;
  readonly fileName: string;
  readonly attribution: string;
  readonly checksum: string;
  readonly mode: 'transactional' | 'no_transaction';
  readonly state: 'started' | 'complete';
}

const HISTORY = `${MIGRATION_SCHEMA}.history`;

/** The history table (STACK-ADR-003 section 7). Created by the runner only; identity columns are never updated. */
const CREATE_HISTORY = `CREATE TABLE IF NOT EXISTS ${HISTORY} (
  version integer NOT NULL,
  file_name text NOT NULL,
  attribution text NOT NULL,
  checksum text NOT NULL,
  mode text NOT NULL,
  state text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT history_pkey PRIMARY KEY (version),
  CONSTRAINT history_file_name_key UNIQUE (file_name),
  CONSTRAINT history_version_positive CHECK (version > 0),
  CONSTRAINT history_checksum_sha256_hex CHECK (char_length(checksum) = 64 AND checksum !~ '[^0-9a-f]'),
  CONSTRAINT history_mode_known CHECK (mode IN ('transactional', 'no_transaction')),
  CONSTRAINT history_state_known CHECK (state IN ('started', 'complete')),
  CONSTRAINT history_completed_at_iff_complete CHECK ((state = 'complete') = (completed_at IS NOT NULL)),
  CONSTRAINT history_transactional_is_complete CHECK (mode <> 'transactional' OR state = 'complete')
)`;

const EXPECTED_COLUMNS: readonly (readonly [string, string, boolean])[] = [
  ['version', 'integer', true],
  ['file_name', 'text', true],
  ['attribution', 'text', true],
  ['checksum', 'text', true],
  ['mode', 'text', true],
  ['state', 'text', true],
  ['started_at', 'timestamp with time zone', true],
  ['completed_at', 'timestamp with time zone', false],
];

// Write path 1 of 3: a transactional file is recorded directly as complete, in the same transaction as the file.
const INSERT_COMPLETE = `INSERT INTO ${HISTORY} (version, file_name, attribution, checksum, mode, state, completed_at)
VALUES ($1, $2, $3, $4, 'transactional', 'complete', clock_timestamp())`;
// Write path 2 of 3: a no-transaction file is recorded as started, committed durably BEFORE its statement is sent.
const INSERT_STARTED = `INSERT INTO ${HISTORY} (version, file_name, attribution, checksum, mode, state)
VALUES ($1, $2, $3, $4, 'no_transaction', 'started')`;
// Write path 3 of 3: the single lifecycle transition started -> complete, once, setting completed_at.
const UPDATE_COMPLETE = `UPDATE ${HISTORY} SET state = 'complete', completed_at = clock_timestamp()
WHERE version = $1 AND checksum = $2 AND state = 'started'`;

const SELECT_HISTORY = `SELECT version, file_name, attribution, checksum, mode, state FROM ${HISTORY} ORDER BY version`;

const now = (): number => Date.now();

async function guard<T>(code: MigrationErrorCode, details: { version?: number; fileName?: string }, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    const sqlState = sqlStateOf(error);
    throw new MigrationError(code, { ...details, ...(sqlState !== undefined ? { sqlState } : {}) });
  }
}

/** Pure integrity checks (STACK-ADR-003 section 9). Duplicate versions and gaps among files are rejected when the files are loaded. */
export function checkIntegrity(files: readonly MigrationFile[], history: readonly HistoryRow[]): MigrationError | undefined {
  const started = history.filter((h) => h.state === 'started');
  if (started.length > 0) return new MigrationError('UNFINISHED_STARTED', { versions: started.map((h) => h.version) });

  const byVersion = new Map(files.map((f) => [f.version, f]));
  const missing = history.filter((h) => !byVersion.has(h.version));
  if (missing.length > 0) return new MigrationError('MISSING_APPLIED_FILE', { versions: missing.map((h) => h.version) });

  for (const h of history) {
    const f = byVersion.get(h.version);
    if (f && f.fileName !== h.fileName) return new MigrationError('RENAMED_APPLIED_FILE', { version: h.version, fileName: f.fileName });
  }
  for (const h of history) {
    const f = byVersion.get(h.version);
    if (f && f.checksum !== h.checksum) return new MigrationError('CHECKSUM_MISMATCH', { version: h.version, fileName: f.fileName });
  }

  const highest = history.reduce((m, h) => Math.max(m, h.version), 0);
  const applied = new Set(history.map((h) => h.version));
  const older = files.filter((f) => !applied.has(f.version) && f.version < highest);
  if (older.length > 0) return new MigrationError('OUT_OF_ORDER', { versions: older.map((f) => f.version) });
  return undefined;
}

const noop = (): void => undefined;

/**
 * Opens the cm_migrator session and performs, in this order: connection, role assertion, schema preflight, advisory lock,
 * history-table creation and shape check. Runs fn, then always releases the lock and closes the connection.
 */
async function withSession<T>(options: RunOptions, fn: (client: Client) => Promise<T>): Promise<T> {
  const log = options.log ?? noop;
  const client = new Client(options.connection);
  client.on('error', noop);
  await guard('CONNECTION_FAILED', {}, () => client.connect());
  let locked = false;
  try {
    await assertRole(client);
    await preflightSchema(client);
    log({ event: 'preflight.ok' });
    await acquireLock(client, options.lockTimeoutMs ?? 60000);
    locked = true;
    log({ event: 'lock.acquired' });
    await ensureHistory(client);
    return await fn(client);
  } finally {
    if (locked) {
      await client
        .query('SELECT pg_advisory_unlock($1::int, $2::int)', [MIGRATION_RUNNER_LOCK.namespace, MIGRATION_RUNNER_LOCK.key])
        .catch(noop);
    }
    await client.end().catch(noop);
  }
}

/** The runner executes only as cm_migrator and never as a superuser (STACK-ADR-001 4.4 test-harness privileges; R10). */
async function assertRole(client: Client): Promise<void> {
  const r = await guard('WRONG_ROLE', {}, () =>
    client.query<{ cu: string; su: string; is_super: boolean | null }>(
      'SELECT current_user AS cu, session_user AS su, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super',
    ),
  );
  const row = r.rows[0];
  if (!row || row.cu !== CM_MIGRATOR || row.su !== CM_MIGRATOR || row.is_super !== false) throw new MigrationError('WRONG_ROLE');
}

/** Preflight (STACK-ADR-003 section 5): schema migration exists and is owned by cm_migrator; otherwise stop. Creates nothing. */
async function preflightSchema(client: Client): Promise<void> {
  const r = await guard('SCHEMA_MISSING', {}, () =>
    client.query<{ owner: string }>('SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1', [MIGRATION_SCHEMA]),
  );
  const row = r.rows[0];
  if (!row) throw new MigrationError('SCHEMA_MISSING');
  if (row.owner !== CM_MIGRATOR) throw new MigrationError('SCHEMA_OWNER');
}

/** Session-level advisory lock held for the whole run (STACK-ADR-003 section 10). The wait is bounded by lock_timeout. */
async function acquireLock(client: Client, timeoutMs: number): Promise<void> {
  const ms = Math.max(1, Math.floor(timeoutMs));
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = ${ms}`);
    await client.query('SELECT pg_advisory_lock($1::int, $2::int)', [MIGRATION_RUNNER_LOCK.namespace, MIGRATION_RUNNER_LOCK.key]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(noop);
    const sqlState = sqlStateOf(error);
    throw new MigrationError(sqlState === '55P03' ? 'LOCK_TIMEOUT' : 'CONNECTION_FAILED', sqlState ? { sqlState } : {});
  }
}

/** Creates migration.history if absent, then proves it has exactly the contracted columns and owner. */
async function ensureHistory(client: Client): Promise<void> {
  await guard('HISTORY_SHAPE', {}, async () => {
    await client.query(CREATE_HISTORY);
  });
  const cols = await guard('HISTORY_SHAPE', {}, () =>
    client.query<{ attname: string; type: string; attnotnull: boolean }>(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull
         FROM pg_attribute a
        WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [HISTORY],
    ),
  );
  const actual = cols.rows.map((c) => `${c.attname}:${c.type}:${c.attnotnull}`);
  const expected = EXPECTED_COLUMNS.map(([n, t, nn]) => `${n}:${t}:${nn}`);
  if (actual.join('|') !== expected.join('|')) throw new MigrationError('HISTORY_SHAPE');
  const owner = await guard('HISTORY_SHAPE', {}, () =>
    client.query<{ owner: string }>('SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = $1::regclass', [HISTORY]),
  );
  if (owner.rows[0]?.owner !== CM_MIGRATOR) throw new MigrationError('HISTORY_SHAPE');
}

async function readHistory(client: Client): Promise<HistoryRow[]> {
  const r = await guard('HISTORY_WRITE_FAILED', {}, () =>
    client.query<{
      version: number;
      file_name: string;
      attribution: string;
      checksum: string;
      mode: HistoryRow['mode'];
      state: HistoryRow['state'];
    }>(SELECT_HISTORY),
  );
  return r.rows.map((x) => ({
    version: x.version,
    fileName: x.file_name,
    attribution: x.attribution,
    checksum: x.checksum,
    mode: x.mode,
    state: x.state,
  }));
}

const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

async function applyTransactional(client: Client, file: MigrationFile): Promise<void> {
  const id = { version: file.version, fileName: file.fileName };
  await guard('MIGRATION_FAILED', id, async () => {
    await client.query('BEGIN');
  });
  try {
    const t0 = await guard('MIGRATION_FAILED', id, () => client.query<{ t: string }>('SELECT transaction_timestamp()::text AS t'));
    // The file, unchanged, as one simple-protocol query.
    await guard('MIGRATION_FAILED', id, () => client.query(decode(file.bytes)));
    // A file that ended or restarted the transaction is a failure (STACK-ADR-003 section 9). The static check rejects
    // transaction-control statements; this is the runtime backstop.
    const t1 = await guard('TRANSACTION_CONTROL_DETECTED', id, async () => {
      await client.query('SAVEPOINT cm_runner_probe');
      await client.query('RELEASE SAVEPOINT cm_runner_probe');
      return client.query<{ t: string }>('SELECT transaction_timestamp()::text AS t');
    });
    if (t0.rows[0]?.t !== t1.rows[0]?.t) throw new MigrationError('TRANSACTION_CONTROL_DETECTED', id);
    await guard('HISTORY_WRITE_FAILED', id, () =>
      client.query(INSERT_COMPLETE, [file.version, file.fileName, file.attribution, file.checksum]),
    );
    await guard('MIGRATION_FAILED', id, async () => {
      await client.query('COMMIT');
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(noop);
    throw error;
  }
}

async function applyNoTransaction(client: Client, file: MigrationFile): Promise<void> {
  const id = { version: file.version, fileName: file.fileName };
  // 1. Durable started record, committed on its own, before the statement is sent.
  await guard('HISTORY_WRITE_FAILED', id, () =>
    client.query(INSERT_STARTED, [file.version, file.fileName, file.attribution, file.checksum]),
  );
  // 2. The single statement, outside any transaction block. On failure the row stays `started`: no retry, human resolution.
  await guard('MIGRATION_FAILED', id, () => client.query(decode(file.bytes)));
  // 3. started -> complete, once.
  await markComplete(client, file.version, file.checksum);
}

async function markComplete(client: Client, version: number, checksum: string): Promise<void> {
  const r = await guard('HISTORY_WRITE_FAILED', { version }, () => client.query(UPDATE_COMPLETE, [version, checksum]));
  if (r.rowCount !== 1) throw new MigrationError('HISTORY_WRITE_FAILED', { version });
}

/**
 * Applies every pending migration in order (STACK-ADR-003 section 9). With nothing pending and every check passing it exits
 * normally and writes nothing. Throws MigrationError; never throws a raw driver error.
 */
export async function runMigrations(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? noop;
  const started = now();
  log({ event: 'run.start' });
  try {
    const result = await withSession(options, async (client) => {
      const files = await loadMigrationFiles(options.directory);
      const history = await readHistory(client);
      const failure = checkIntegrity(files, history);
      if (failure) throw failure;

      const appliedVersions = new Set(history.map((h) => h.version));
      const pending = files.filter((f) => !appliedVersions.has(f.version));
      const violations = staticFindings(pending);
      const first = violations[0];
      if (first) {
        const rules = [...new Set(first.findings.map((f) => f.rule))];
        throw new MigrationError('STATIC_RULE_VIOLATION', { version: first.file.version, fileName: first.file.fileName, rules });
      }
      if (pending.length === 0) {
        log({ event: 'run.noop', count: history.length });
        return { applied: [] as number[], alreadyApplied: history.length };
      }

      const applied: number[] = [];
      for (const file of pending) {
        const t = now();
        log({ event: 'migration.start', version: file.version, fileName: file.fileName, mode: file.mode });
        try {
          if (file.mode === 'transactional') await applyTransactional(client, file);
          else await applyNoTransaction(client, file);
        } catch (error) {
          const sqlState = error instanceof MigrationError ? error.sqlState : undefined;
          log({
            event: 'migration.failed',
            version: file.version,
            fileName: file.fileName,
            durationMs: now() - t,
            ...(sqlState !== undefined ? { sqlState } : {}),
          });
          throw error;
        }
        // Session state a file set (a plain SET) must not leak into the next file or into the runner's own statements.
        await guard('MIGRATION_FAILED', { version: file.version, fileName: file.fileName }, async () => {
          await client.query('RESET ALL');
        });
        applied.push(file.version);
        log({ event: 'migration.complete', version: file.version, fileName: file.fileName, mode: file.mode, durationMs: now() - t });
      }
      return { applied, alreadyApplied: history.length };
    });
    log({ event: 'run.complete', count: result.applied.length, durationMs: now() - started });
    return result;
  } catch (error) {
    const err = error instanceof MigrationError ? error : new MigrationError('CONNECTION_FAILED');
    log({
      event: 'run.failed',
      code: err.code,
      durationMs: now() - started,
      ...(err.sqlState !== undefined ? { sqlState: err.sqlState } : {}),
    });
    throw err;
  }
}

export interface ResolveOptions extends RunOptions {
  readonly version: number;
  /** The checksum of the file as recorded; the human confirms it so that a wrong version cannot be resolved by accident. */
  readonly checksum: string;
}

/**
 * The reviewed procedure for an unfinished no-transaction migration (STACK-ADR-003 section 9). A human first inspects the
 * database and completes the effect by hand. This function then records that outcome through the same single
 * started -> complete transition the runner itself uses; there is no other path. It refuses unless the row is `started`,
 * the on-disk file still has the recorded checksum, and the supplied checksum matches both.
 */
export async function resolveStartedMigration(options: ResolveOptions): Promise<void> {
  const log = options.log ?? noop;
  await withSession(options, async (client) => {
    const files = await loadMigrationFiles(options.directory);
    const history = await readHistory(client);
    const row = history.find((h) => h.version === options.version);
    const file = files.find((f) => f.version === options.version);
    const refuse = (): never => {
      throw new MigrationError('RESOLVE_REFUSED', { version: options.version });
    };
    if (!row || !file || row.state !== 'started' || row.mode !== 'no_transaction') refuse();
    if (row?.checksum !== options.checksum || file?.checksum !== options.checksum || file?.fileName !== row?.fileName) refuse();
    await markComplete(client, options.version, options.checksum);
    log({ event: 'resolve.complete', version: options.version });
  });
}
