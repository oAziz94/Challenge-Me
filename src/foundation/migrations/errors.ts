// Migration runner errors (STACK-ADR-003 section 10: logs and errors carry the file version and name, timings and database
// error codes - never SQL text, parameter values or migrated data).
//
// A MigrationError has a stable code and a fixed message built only from the code, version numbers and file names. It never
// wraps the database driver error (no `cause`), because driver errors can carry SQL fragments and row data.

export type MigrationErrorCode =
  | 'CONNECTION_FAILED'
  | 'WRONG_ROLE'
  | 'SCHEMA_MISSING'
  | 'SCHEMA_OWNER'
  | 'HISTORY_SHAPE'
  | 'LOCK_TIMEOUT'
  | 'INVALID_FILE_NAME'
  | 'DIRECTORY_UNREADABLE'
  | 'DUPLICATE_VERSION'
  | 'VERSION_GAP'
  | 'STATIC_RULE_VIOLATION'
  | 'UNFINISHED_STARTED'
  | 'MISSING_APPLIED_FILE'
  | 'RENAMED_APPLIED_FILE'
  | 'CHECKSUM_MISMATCH'
  | 'OUT_OF_ORDER'
  | 'TRANSACTION_CONTROL_DETECTED'
  | 'MIGRATION_FAILED'
  | 'HISTORY_WRITE_FAILED'
  | 'RESOLVE_REFUSED';

export interface MigrationErrorDetails {
  readonly version?: number;
  readonly fileName?: string;
  readonly versions?: readonly number[];
  /** PostgreSQL SQLSTATE of the underlying failure, when there is one. */
  readonly sqlState?: string;
  /** Static rule names (never SQL text). */
  readonly rules?: readonly string[];
}

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly version: number | undefined;
  readonly fileName: string | undefined;
  readonly versions: readonly number[] | undefined;
  readonly sqlState: string | undefined;
  readonly rules: readonly string[] | undefined;

  constructor(code: MigrationErrorCode, details: MigrationErrorDetails = {}) {
    const parts: string[] = [`migration error ${code}`];
    if (details.version !== undefined) parts.push(`version ${details.version}`);
    if (details.fileName !== undefined) parts.push(`file ${details.fileName}`);
    if (details.versions !== undefined && details.versions.length > 0) parts.push(`versions ${details.versions.join(',')}`);
    if (details.sqlState !== undefined) parts.push(`sqlstate ${details.sqlState}`);
    if (details.rules !== undefined && details.rules.length > 0) parts.push(`rules ${details.rules.join(',')}`);
    super(parts.join('; '));
    this.name = 'MigrationError';
    this.code = code;
    this.version = details.version;
    this.fileName = details.fileName;
    this.versions = details.versions;
    this.sqlState = details.sqlState;
    this.rules = details.rules;
  }
}

/** SQLSTATE of a driver error, if it has the well-formed five-character shape; nothing else is ever taken from the error. */
export function sqlStateOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}
