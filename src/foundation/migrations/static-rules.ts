// Static rules for migration SQL files (STACK-ADR-003 sections 4, 6 and 9; STACK-ADR-001 4.4 "Migration security invariants").
//
// This is a conservative lexical check, not a SQL parser. It never changes, splits or rewrites what the runner sends: the
// runner sends each file unchanged as one query. The lexer only finds statement boundaries and comment-free text so that
// rules can be stated precisely. Where the lexical view is ambiguous the rules fail closed. Acknowledged limit (as in
// STACK-ADR-001 4.7): SQL assembled dynamically (for example by string concatenation inside a DO block) cannot be proven
// free of a forbidden reference by a lexical scan; review and the catalogue assertions after migration cover that residue.
//
// Findings carry a rule name and a line number only - never SQL text (STACK-ADR-003 section 10, R16).

export type StaticRule =
  | 'bom'
  | 'carriage-return'
  | 'nul'
  | 'invalid-utf8'
  | 'unterminated-literal'
  | 'no-statement'
  | 'transaction-control'
  | 'multiple-statements'
  | 'schema-migration-reference'
  | 'rls-disabled'
  | 'rls-unforced'
  | 'bypassrls'
  | 'unicode-escape'
  | 'role-membership'
  | 'marker-misplaced'
  | 'marker-unknown';

export interface StaticFinding {
  readonly rule: StaticRule;
  /** 1-based line, when the rule has a position. */
  readonly line?: number;
}

export type MigrationMode = 'transactional' | 'no_transaction';

/** The only mode marker: the exact first line of the file. Everything else is transactional (the default). */
export const NO_TRANSACTION_MARKER = '-- cm:mode=no_transaction';

interface LexedStatement {
  readonly startLine: number;
  /** The statement text with comments replaced by spaces; string literals and dollar-quoted bodies are kept. */
  readonly code: string;
}

interface Lexed {
  readonly statements: readonly LexedStatement[];
  readonly terminated: boolean;
}

// PostgreSQL allows $ inside an identifier (x$$q$ is one identifier), so $ counts as an identifier character: a dollar quote cannot start right after one.
const IDENT_CHAR = /[A-Za-z0-9_$\u0080-\uffff]/;
const countNewlines = (s: string): number => (s.match(/\n/g) ?? []).length;

/** Lexical pass: comments, single-quoted and E-strings, double-quoted identifiers, dollar-quoted bodies, and the semicolon boundary. */
function lex(text: string): Lexed {
  const statements: LexedStatement[] = [];
  let stmt = '';
  let stmtLine = 1;
  let stmtHasContent = false;
  let line = 1;
  let i = 0;
  const n = text.length;
  let terminated = true;

  const markContent = (): void => {
    if (!stmtHasContent) {
      stmtHasContent = true;
      stmtLine = line;
    }
  };
  const literal = (end: number): void => {
    markContent();
    const chunk = text.slice(i, end);
    stmt += chunk;
    line += countNewlines(chunk);
    i = end;
  };
  const SQ = String.fromCharCode(39);
  const DQ = String.fromCharCode(34);
  const BSL = String.fromCharCode(92);
  const NL = String.fromCharCode(10);

  while (i < n) {
    const c = text.charAt(i);
    const c2 = text.charAt(i + 1);
    if (c === '-' && c2 === '-') {
      let j = i;
      while (j < n && text.charAt(j) !== NL) j++;
      stmt += ' ';
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (text.charAt(j) === '/' && text.charAt(j + 1) === '*') {
          depth++;
          j += 2;
        } else if (text.charAt(j) === '*' && text.charAt(j + 1) === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      if (depth > 0) terminated = false;
      const chunk = text.slice(i, j);
      stmt += chunk.replace(/[^\n]/g, ' ');
      line += countNewlines(chunk);
      i = j;
      continue;
    }
    if (c === SQ) {
      const prev = i >= 1 ? text.charAt(i - 1) : '';
      const beforePrev = i >= 2 ? text.charAt(i - 2) : '';
      const escapeString = (prev === 'E' || prev === 'e') && !IDENT_CHAR.test(beforePrev);
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const d = text.charAt(j);
        if (escapeString && d === BSL) {
          j += 2;
          continue;
        }
        if (d === SQ) {
          if (text.charAt(j + 1) === SQ) {
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        j++;
      }
      if (!closed) terminated = false;
      literal(Math.min(j, n));
      continue;
    }
    if (c === DQ) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (text.charAt(j) === DQ) {
          if (text.charAt(j + 1) === DQ) {
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        j++;
      }
      if (!closed) terminated = false;
      literal(Math.min(j, n));
      continue;
    }
    if (c === '$' && !(i > 0 && IDENT_CHAR.test(text.charAt(i - 1)))) {
      const m = DOLLAR_TAG.exec(text.slice(i, i + 128));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        if (end === -1) terminated = false;
        literal(end === -1 ? n : end + tag.length);
        continue;
      }
    }
    if (c === ';') {
      if (stmtHasContent) statements.push({ startLine: stmtLine, code: stmt });
      stmt = '';
      stmtHasContent = false;
      i++;
      continue;
    }
    if (c === NL) line++;
    else if (!/\s/.test(c)) markContent();
    stmt += c;
    i++;
  }
  if (stmtHasContent) statements.push({ startLine: stmtLine, code: stmt });
  return { statements, terminated };
}

const DOLLAR_TAG = /^\$([A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/;

const leadWords = (code: string): string[] =>
  code
    .trim()
    .split(/[\s(]+/)
    .filter((w) => w !== '')
    .slice(0, 2)
    .map((w) => w.toUpperCase());

/** Statement-leading forms that open, close or nest a transaction (STACK-ADR-003 section 9). */
function isTransactionControl(code: string): boolean {
  const [first, second] = leadWords(code);
  switch (first) {
    case 'BEGIN':
    case 'COMMIT':
    case 'END':
    case 'ROLLBACK':
    case 'ABORT':
    case 'SAVEPOINT':
    case 'RELEASE':
      return true;
    case 'START':
    case 'PREPARE':
      return second === 'TRANSACTION';
    default:
      return false;
  }
}

/** Reads the mode from the first line only. A migration is transactional unless the exact marker is its first line. */
export function readMode(bytes: Uint8Array): MigrationMode {
  const text = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes);
  const firstLine = text.split('\n', 1)[0] ?? '';
  return firstLine === NO_TRANSACTION_MARKER ? 'no_transaction' : 'transactional';
}

const SCHEMA_MIGRATION_WORD = /(^|[^A-Za-z0-9_$])migration(?![A-Za-z0-9_$])/i;
// U&"..." and U&'...' spell identifiers and strings with escapes (U&"\006Digration" is migration). The lexical rules cannot see through them, so they are rejected outright.
const UNICODE_ESCAPE = /(^|[^A-Za-z0-9_$])U&["']/i;
const BYPASSRLS_WORD = /(^|[^A-Za-z0-9_$])BYPASSRLS(?![A-Za-z0-9_$])/i;

/**
 * Runs every static rule over the exact bytes of one migration file.
 * Byte-level rules (BOM, CR, NUL, UTF-8) come first; the lexical rules run only on valid, CR-free text.
 */
export function checkMigrationBytes(bytes: Uint8Array): StaticFinding[] {
  const findings: StaticFinding[] = [];
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) findings.push({ rule: 'bom', line: 1 });

  let line = 1;
  let crLine: number | undefined;
  let nulLine: number | undefined;
  for (const b of bytes) {
    if (b === 0x0a) line++;
    else if (b === 0x0d && crLine === undefined) crLine = line;
    else if (b === 0x00 && nulLine === undefined) nulLine = line;
  }
  if (crLine !== undefined) findings.push({ rule: 'carriage-return', line: crLine });
  if (nulLine !== undefined) findings.push({ rule: 'nul', line: nulLine });

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    findings.push({ rule: 'invalid-utf8' });
    return findings;
  }
  if (findings.length > 0) return findings;

  const mode = readMode(bytes);
  text.split('\n').forEach((l, idx) => {
    if (!/^\s*--\s*cm:/.test(l)) return;
    if (idx === 0 && l === NO_TRANSACTION_MARKER) return;
    findings.push({ rule: idx === 0 ? 'marker-unknown' : 'marker-misplaced', line: idx + 1 });
  });

  const lexed = lex(text);
  if (!lexed.terminated) findings.push({ rule: 'unterminated-literal' });
  if (lexed.statements.length === 0) findings.push({ rule: 'no-statement' });
  if (mode === 'no_transaction' && lexed.statements.length > 1) findings.push({ rule: 'multiple-statements' });

  let migrationRefLine: number | undefined;
  for (const s of lexed.statements) {
    const at = s.startLine;
    if (isTransactionControl(s.code)) findings.push({ rule: 'transaction-control', line: at });
    if (/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(s.code)) findings.push({ rule: 'rls-disabled', line: at });
    if (/\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(s.code)) findings.push({ rule: 'rls-unforced', line: at });
    if (UNICODE_ESCAPE.test(s.code)) findings.push({ rule: 'unicode-escape', line: at });
    if (BYPASSRLS_WORD.test(s.code)) findings.push({ rule: 'bypassrls', line: at });
    // GRANT/REVOKE without ON is role membership (GRANT role TO role); the contract authorizes none in a migration.
    if (/^\s*(GRANT|REVOKE)\b/i.test(s.code) && !/\bON\b/i.test(s.code)) findings.push({ rule: 'role-membership', line: at });
    // Ordinary migration SQL may not reference schema migration at all (STACK-ADR-003 section 6). Any whole-word occurrence
    // of the identifier outside comments is rejected, quoted or not, so a table or column called migration is rejected too.
    if (migrationRefLine === undefined && SCHEMA_MIGRATION_WORD.test(s.code)) migrationRefLine = at;
  }
  if (migrationRefLine !== undefined) findings.push({ rule: 'schema-migration-reference', line: migrationRefLine });
  return findings;
}
