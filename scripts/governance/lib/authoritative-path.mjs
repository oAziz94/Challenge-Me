// Authoritative-path governance evidence check.
// Source: STACK-ADR-002 §6.3 (default blocked; evidence route; limit of CI as evidence), E4, E11;
// Reconciliation Report (doc 16) §2.2 matrix, §6.4 errata, §6.7 change control, §7 change-control register.
//
// The check VALIDATES EVIDENCE. It does not authorize, cannot prove who wrote the evidence, and
// cannot prove its own integrity. Whether a body change truly supersedes earlier text is the
// engineering authority's human diff review, never a text search. There is deliberately no label,
// keyword, flag or environment switch.
//
// Pure: callers supply the change set and readers for the base (merge base B) and head (H) commits.

export const AUTHORITATIVE_PREFIX = 'docs/specifications/authoritative/';
const DECISIONS_DIR = 'docs/decisions';
const AUTHORITATIVE_DIR = 'docs/specifications/authoritative';

// Exact root paths that define the Task 2 CI gates (scripts, lint/format/type/test/architecture scope, image and dependency pins).
export const TASK2_GATE_DEFINING_FILES = Object.freeze([
  'package.json',
  '.prettierignore',
  '.prettierrc.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'tsconfig.json',
  '.dependency-cruiser.cjs',
  'Dockerfile',
  '.dockerignore',
  'pnpm-lock.yaml',
  '.node-version',
]);

// Paths whose changes CI cannot judge on its own: the change may rewrite the check that judges it.
// STACK-ADR-002 §6.3 "Self-modifying changes". Notice only; a notice is not proof of safety.
const SELF_MODIFYING = [
  (p) => p.startsWith('.github/'),
  (p) => p.startsWith('scripts/governance/'),
  (p) => p.startsWith(AUTHORITATIVE_PREFIX),
  (p) => p === '.claude/settings.json',
  (p) => p === '.gitignore' || p === '.gitattributes' || p === '.gitleaks.toml',
  (p) => /(^|\/)CODEOWNERS$/.test(p),
  // Foundation Task 2 gate-defining root files (extension authorized by the engineering authority): they define what the
  // CI gates run, lint, format, type-check, test, ignore, install or build.
  (p) => TASK2_GATE_DEFINING_FILES.includes(p),
];
// STACK-ADR-002 §6.3 "Governance and CI files": reported so the engineering authority sees them.
const GOVERNANCE = [
  (p) => p === 'CLAUDE.md' || p === 'AGENTS.md',
  (p) => p.startsWith('docs/engineering/'),
  (p) => p.startsWith('.claude/'),
  (p) => p.startsWith('docs/decisions/'),
  (p) => p.startsWith('docs/architecture/'),
  (p) => p.startsWith('.github/'),
];

// Fixed, fail-closed map from the EXACT authoritative file (path relative to the authoritative directory,
// case-sensitive, no nesting) to the artifact names its §7 "Artifacts changed (revision)" segment must use
// (names as written in Reconciliation Report §7). Any other file under the directory (a shadow copy, a
// nested path, a case variant, another document) cannot borrow an artifact's revision token and fails closed.
const ARTIFACT_FILES = {
  '01_Domain_Model_and_Implementation_Contract_rev1.8.md': ['domain model'],
  '02_Architecture_Decision_Records_V1.4.md': ['adr set', 'architecture decision records'],
  '03_Spec_Kit_Part1_Core_Journey_reconciled.md': ['spec kit part 1'],
  '16_Reconciliation_Report_rev3.md': ['reconciliation report'],
};
const RECON_FILE = '16_Reconciliation_Report_rev3.md';
// Every artifact name that can start a segment of a §7 "Artifacts changed (revision)" cell.
const SEGMENT_START =
  /Architecture Decision Records|ADR set|Domain Model|Spec Kit Part [12]|Learning Trajectory Model|Reconciliation Report|Implementation Architecture|Remediation Report|Foundation brief|Wave \d+/gi;

const CR_ID = /\bCR-\d+(?:-F\d+)?\b/g;
const STATE_WORDS = ['ACCEPTED', 'RESOLVED', 'REJECTED', 'WITHDRAWN', 'OPEN', 'DRAFT', 'SUBMITTED', 'CLOSED', 'PENDING'];
const STATE_RE = new RegExp(`\\b(${STATE_WORDS.join('|')})\\b`, 'gi');
// ADR-002 §6.3 item 2: only these human-decided final states can authorize; everything else cannot.
const AUTHORIZING_STATES = new Set(['ACCEPTED', 'RESOLVED']);
// Negated, conditional or future wording anywhere in a follow-up's fragment means the state is not (yet) in force.
const NOT_IN_FORCE = /\b(not|never|no longer|yet|until|awaiting|await|to be|will|once|if|unless|before|pending|subject to|provided|conditional|conditionally)\b/i;
// Governance roles used by the repository (AGENTS §6; AIW §10; 16 §6.5). A bare personal name is not a role.
const HUMAN_ROLE = /\b(engineering authority|product owner|counsel|gate owner)\b/i;
// Agents never decide (AGENTS §3; AIW §10). Any such attribution makes the cell unacceptable.
const NON_HUMAN = /\b(claude|codex|fable|opus|sonnet|haiku|gpt|gemini|copilot|agent|bot|AI|drafting|drafted)\b/i;

const NOTE_PREFIX = /^>\s*(?:Change-control revision|Revision)\b/i;
const NOTE_TOKEN = /^>\s*(?:Change-control revision|Revision)\s+(V?\d+(?:\.\d+)*)/i;
const POSITIVE_6_4 = /(?<![\d.])6\.4(?!\d)/;

const lf = (s) => s.replace(/\r\n/g, '\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idBounded = (id) => new RegExp(`(?<![\\w-])${esc(id)}(?![\\w-])`, 'gi');
const normToken = (t) => t.trim().toLowerCase();

export function classifyPath(path) {
  return {
    // Case-insensitive on purpose: a case variant of the directory aliases it on case-insensitive filesystems.
    authoritative: path.toLowerCase().startsWith(AUTHORITATIVE_PREFIX),
    selfModifying: SELF_MODIFYING.some((f) => f(path)),
    governance: GOVERNANCE.some((f) => f(path)),
  };
}

// ---------------------------------------------------------------------------------------------
// Markdown tables (columns are located by NAME, never by position; escaped pipes are honoured)

const indentOf = (line) => /^ */.exec(line)[0].length;

/**
 * Cells of a GFM table line: leading/trailing pipes are optional, a pipe-less row is a row, an escaped
 * pipe (\|) is literal. Returns null for a line indented 4 or more spaces (not a table row in GFM; it is
 * treated conservatively as unparseable by the callers).
 */
function cells(line) {
  if (indentOf(line) > 3) return null;
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (/(?<!\\)\|$/.test(body)) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function sectionLines(text, startRe, endRe) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (endRe.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

const DELIMITER_ROW = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Every GFM table in the lines: [{ header:[lower-cased names], rows:[{cells|null, ok, raw}] }].
 * A table is a header line followed by a delimiter line with the same cell count. Its rows are every
 * following line up to a blank line or a heading, whether or not the line has pipes or is indented.
 * A row that cannot be parsed into the header's structure has ok=false, so callers can fail closed on it.
 */
function parseTables(lines) {
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === '' || indentOf(lines[i]) > 3 || !DELIMITER_ROW.test(lines[i + 1])) continue;
    const header = cells(lines[i]).map((c) => c.toLowerCase());
    if (header.length !== cells(lines[i + 1]).length) continue;
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim() !== '' && !/^ {0,3}#/.test(lines[j]); j++) {
      const c = cells(lines[j]);
      rows.push({ cells: c, ok: c !== null && c.length === header.length, raw: lines[j] });
    }
    tables.push({ header, rows, span: [i, j] });
    i = j - 1;
  }
  return tables;
}


const colIndex = (table, name) => table.header.indexOf(name.toLowerCase());

// ---------------------------------------------------------------------------------------------
// Header revision notes

function headerLines(text) {
  const lines = lf(text).split('\n');
  const first = lines.slice(0, 10).findIndex((l) => l.startsWith('>'));
  if (first < 0) return [];
  const out = [];
  for (let i = first; i < lines.length; i++) {
    if (lines[i].startsWith('>')) {
      out.push(lines[i].trimEnd());
    } else if (lines[i].trim() === '') {
      // A blank line stays inside the header only if the next non-blank line continues the quote block.
      const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
      if (!next.startsWith('>')) break;
    } else {
      break;
    }
  }
  return out;
}

const headerNotes = (text) => (text === null ? [] : headerLines(text).filter((l) => NOTE_PREFIX.test(l)));

// ---------------------------------------------------------------------------------------------
// Change records

/**
 * Structurally exact record lookup. A parent id (CR-90) resolves only its own file and never a
 * follow-up file (CR-90-F1-*.md); a follow-up id resolves its own file if one exists, otherwise its
 * parent's file, where the follow-up's state is read from the parent's Status. Ambiguity fails closed.
 */
function findChangeRecord(id, names) {
  const files = names.filter((n) => n.endsWith('.md'));
  const m = /^(CR-\d+)(-F\d+)?$/.exec(id);
  if (!m) return { error: 'not a change record id' };
  const parentFiles = files.filter((n) => n.startsWith(`${m[1]}-`) && !/^CR-\d+-F\d+-/.test(n));
  if (!m[2]) {
    if (parentFiles.length === 0) return { error: 'no change record file at head' };
    if (parentFiles.length > 1) return { error: 'ambiguous change record files' };
    return { file: parentFiles[0], followUp: false };
  }
  const own = files.filter((n) => n.startsWith(`${id}-`));
  if (own.length > 1) return { error: 'ambiguous change record files' };
  if (own.length === 1) return { file: own[0], followUp: false };
  if (parentFiles.length === 0) return { error: 'no change record file at head' };
  if (parentFiles.length > 1) return { error: 'ambiguous change record files' };
  return { file: parentFiles[0], followUp: true };
}

function statusCell(text) {
  const m = /^\|\s*Status\s*\|\s*(.+?)\s*\|?\s*$/im.exec(text) ?? /^State:\s*(.+)$/im.exec(text);
  return m ? m[1] : null;
}

const statesIn = (s) => [...new Set([...s.matchAll(STATE_RE)].map((x) => x[1].toUpperCase()))];

/** State of a record; for a follow-up item, ITS OWN state from the parent's Status (never the parent's). */
function recordState(id, text, followUp) {
  const cell = statusCell(text);
  if (cell === null) return { error: 'no Status/State field' };
  if (!followUp) {
    const first = /^[A-Za-z_]+/.exec(cell.replace(/^\W+/, ''))?.[0]?.toUpperCase();
    return first && STATE_WORDS.includes(first) ? { state: first } : { error: 'Status is not a recognized state' };
  }
  const hits = [...cell.matchAll(idBounded(id))];
  if (hits.length !== 1) return { error: 'follow-up item must be named exactly once in the parent record Status' };
  const start = hits[0].index + id.length;
  let fragment = cell.slice(start);
  const stops = [fragment.search(/;/), fragment.search(/(?<![\w-])CR-\d+(?:-F\d+)?(?![\w-])/i)].filter((x) => x >= 0);
  if (stops.length > 0) fragment = fragment.slice(0, Math.min(...stops));
  const states = statesIn(fragment);
  if (states.length === 0) return { error: 'follow-up item has no recognized state' };
  if (states.length > 1) return { error: 'follow-up item has more than one state word' };
  if (NOT_IN_FORCE.test(fragment)) return { error: 'follow-up state is negated or not yet in force' };
  return { state: states[0] };
}

function checkRecord(id, ctx) {
  const rec = findChangeRecord(id, ctx.listDir(DECISIONS_DIR));
  if (rec.error) return rec.error;
  const text = ctx.readFile(`${DECISIONS_DIR}/${rec.file}`);
  if (text === null) return 'change record file unreadable at head';
  const st = recordState(id, lf(text), rec.followUp);
  if (st.error) return st.error;
  if (!AUTHORIZING_STATES.has(st.state)) return `state ${st.state} does not authorize`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Reconciliation Report

/** §7 register, by column name. Returns { rows } or { error }. */
function parseRegister(recon, { baseSide = false } = {}) {
  const lines = sectionLines(recon, /^#\s+7\.\s/, /^#\s/);
  // At the merge base only, a report that predates the register has no §7 heading at all: no rows, so every
  // binding is fresh. A heading with a missing or malformed table, and any absence at the head, still fail closed.
  if (baseSide && lines === null) return { rows: [] };
  const table = lines && parseTables(lines).find((t) => colIndex(t, 'CR') >= 0 && colIndex(t, 'Artifacts changed (revision)') >= 0);
  if (!table) return { error: 'Reconciliation Report §7 register table not found' };
  const idx = {
    key: colIndex(table, 'CR'),
    decidedBy: colIndex(table, 'Decided by'),
    artifacts: colIndex(table, 'Artifacts changed (revision)'),
    errata: colIndex(table, 'Matrix / errata'),
  };
  if (Object.values(idx).some((i) => i < 0)) return { error: 'Reconciliation Report §7 register lacks a required column' };
  return {
    rows: table.rows.map((r) => ({
      key: r.cells?.[idx.key] ?? '',
      decidedBy: r.cells?.[idx.decidedBy] ?? '',
      artifacts: r.cells?.[idx.artifacts] ?? '',
      errata: r.cells?.[idx.errata] ?? '',
      ok: r.ok,
    })),
  };
}

/**
 * Comparison form of an identifier cell or text: Unicode-normalized, default-ignorable characters removed,
 * ordinary inline Markdown wrappers (bold, emphasis, code span, strike) removed, whitespace collapsed,
 * upper-cased. "**CR-90**", "`CR-90`", "cr-90" and "CR-90" are the same rendered id.
 */
const normKey = (s) =>
  s
    .normalize('NFKC')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
// An id cell that is not plain text after normalization (a quote marker, HTML, stray symbols) cannot be trusted as a key.
const PLAIN_KEY = /^[A-Z0-9][A-Z0-9 .\-/]*$/;

/**
 * §2.2 matrix: every row of every table in the section, malformed rows included (so that filtering can never
 * erase evidence before ambiguity is judged), plus every pipe-containing line outside any parsed table
 * (a blockquoted or otherwise unparsed table-like row). { rows:[{key|null, text|null, raw}] } or { error }.
 * A row whose id cell is not plain text has key null: it is unusable as evidence but still counts as
 * relevant to any CR it mentions.
 */
function parseMatrix(recon, { baseSide = false } = {}) {
  const lines = sectionLines(recon, /^##\s+2\.2\b/, /^##\s/);
  if (baseSide && lines === null) return { rows: [] }; // same rule as the register: absent at the merge base only
  const tables = lines ? parseTables(lines) : [];
  if (!tables.some((t) => colIndex(t, 'ID') >= 0)) return { error: 'Reconciliation Report §2.2 matrix table not found' };
  const rows = [];
  for (const t of tables) {
    const idx = colIndex(t, 'ID');
    for (const r of t.rows) {
      const cell = r.ok && idx >= 0 ? normKey(r.cells[idx]) : null;
      const good = cell !== null && PLAIN_KEY.test(cell);
      rows.push({ key: good ? cell : null, text: good ? r.cells.join('|') : null, raw: r.raw });
    }
  }
  lines.forEach((line, n) => {
    if (line.includes('|') && !tables.some((t) => n >= t.span[0] && n < t.span[1])) {
      rows.push({ key: null, text: null, raw: line });
    }
  });
  return { rows };
}

/**
 * The single §2.2 row that represents a §7 key, or a reason it cannot be used. Relevant rows are the
 * well-formed rows whose normalized key equals the normalized §7 key, plus any unusable row that mentions the
 * CR id (id-bounded and case-insensitive: CR-90 does not match CR-900, CR-90-F1 does not match CR-90-F10).
 * Duplicate or unusable relevant evidence fails closed.
 */
function matrixEvidence(matrix, id, key) {
  const want = normKey(key);
  const mentions = (raw) => new RegExp(idBounded(id)).test(raw.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, ''));
  const relevant = matrix.rows.filter((r) => (r.key === null ? mentions(r.raw) : r.key === want));
  if (relevant.some((r) => r.key === null)) return { error: 'malformed' };
  if (relevant.length > 1) return { error: 'duplicate' };
  return relevant.length === 1 ? { row: relevant[0] } : { row: null };
}

/** §6.4: every table in the section. { rows:[{raw, cells|null, supersededBy|null}] } or { error }. */
function parseErrata(recon) {
  const lines = sectionLines(recon, /^##\s+6\.4\b/, /^##\s/);
  const tables = lines ? parseTables(lines) : [];
  if (!tables.some((t) => colIndex(t, 'Superseded by') >= 0)) {
    return { error: 'Reconciliation Report §6.4 errata table not found' };
  }
  const rows = [];
  for (const t of tables) {
    const idx = colIndex(t, 'Superseded by');
    for (const r of t.rows) {
      rows.push({ raw: r.raw, supersededBy: r.ok && idx >= 0 ? r.cells[idx] : null });
    }
  }
  return { rows };
}

/** A §7 / §2.2 key such as "CR-3-F1 2b" belongs to id "CR-3-F1"; "CR-30" and "CR-3-F10" do not. */
const keyMatchesId = (key, id) => key === id || (key.startsWith(id) && /^\s/.test(key.slice(id.length)));

/**
 * Does the §7 "Artifacts changed (revision)" cell bind the changed artifact to the new revision token?
 * A segment binds iff it starts at the mapped artifact's name, is not an "unchanged" statement, has an
 * arrow, and the FIRST version token after the LAST arrow equals the token (digit/dot bounded; a "§"
 * section reference never matches). Another artifact's segment never binds this artifact.
 */
function bindsArtifactRevision(cell, artifactNames, token) {
  const want = normToken(token);
  const starts = [...cell.matchAll(SEGMENT_START)];
  return starts.some((m, i) => {
    if (!artifactNames.includes(m[0].toLowerCase())) return false;
    const seg = cell.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : cell.length);
    const arrow = seg.lastIndexOf('→');
    if (arrow < 0) return false;
    const firstArrow = seg.indexOf('→');
    if (/\bunchanged\b/i.test(seg.slice(0, firstArrow))) return false;
    const t = /^[\s*]*(?:rev(?:ision|\.)?\s*)?[\s*]*(V?\d+(?:\.\d+)*)(?![\d])/i.exec(seg.slice(arrow + 1));
    return t !== null && normToken(t[1]) === want;
  });
}

function errataVerdict(cell) {
  const neg = /\bno errata\b/i.test(cell);
  const posSignal = POSITIVE_6_4.test(cell);
  return { neg, pos: !neg && posSignal, contradictory: neg && posSignal };
}

/**
 * Header-note CORROBORATION of the errata determination (never the determinant). A bare "6.4" or "§6.4"
 * outside the recording clause may cite another artifact's section (for example Domain Model §6.4) and
 * is ignored; neither the section sign nor any "supersed" substring is used as a discriminator.
 */
function noteErrataClaims(note) {
  const at = note.toLowerCase().lastIndexOf('recorded in the reconciliation report');
  let recClause = '';
  if (at >= 0) {
    const rest = note.slice(at);
    const end = rest.search(/\.(?!\d)/); // a period that is not inside a number such as 6.4
    recClause = end < 0 ? rest : rest.slice(0, end + 1);
  }
  const neg = /no errata|no passage superseded|no passage is superseded/i.test(note);
  const pos = (/errata/i.test(note) && !neg) || recClause.includes('6.4');
  return { pos, neg };
}

// ---------------------------------------------------------------------------------------------

/**
 * @param {{
 *   changes: {path:string, status:string}[],   // A | M | D | R | C | T ... (anything but A/M fails for authoritative files)
 *   readFile: (path:string) => string|null,    // content at the pull request head H
 *   readBase: (path:string) => string|null,    // content at the merge base B
 *   listDir: (dir:string) => string[],         // entry names at H
 * }} ctx
 */
export function evaluateChangeSet(ctx) {
  const notices = [];
  const failures = [];
  const authoritative = ctx.changes.filter((c) => classifyPath(c.path).authoritative);

  for (const c of ctx.changes) {
    const k = classifyPath(c.path);
    if (k.selfModifying) notices.push({ path: c.path, kind: 'SELF_MODIFYING: CI result is not authoritative; inspect the actual diff' });
    else if (k.governance) notices.push({ path: c.path, kind: 'GOVERNANCE: review before merge' });
  }

  if (authoritative.length > 0) {
    // Doc 16 at head H and at merge base B. Both are required: freshness is judged between them.
    const reconPath = ctx.listDir(AUTHORITATIVE_DIR).includes(RECON_FILE) ? `${AUTHORITATIVE_DIR}/${RECON_FILE}` : null;
    const headRaw = reconPath ? ctx.readFile(reconPath) : null;
    const baseRaw = reconPath ? ctx.readBase(reconPath) : null;
    const env = { error: null };
    if (headRaw === null) env.error = 'Reconciliation Report not found at head';
    else if (baseRaw === null) env.error = 'Reconciliation Report cannot be read at the merge base';
    else {
      const head = lf(headRaw);
      const base = lf(baseRaw);
      env.reg = parseRegister(head);
      env.matrix = parseMatrix(head);
      env.errata = parseErrata(head);
      env.baseReg = parseRegister(base, { baseSide: true });
      env.baseMatrix = parseMatrix(base, { baseSide: true });
      env.error = env.reg.error ?? env.matrix.error ?? env.errata.error ?? env.baseReg.error ?? env.baseMatrix.error ?? null;
    }

    /** §6.4 evidence for a §7 row: does a "Superseded by" cell cite it, and is any relevant row malformed? */
    const errataScan = (id, row) => {
      const qualifier = row.key.slice(id.length).trim();
      const siblings = [
        ...new Set(
          env.reg.rows
            .filter((r) => r.key !== row.key && keyMatchesId(r.key, id))
            .map((r) => r.key.slice(id.length).trim())
            .filter(Boolean),
        ),
      ];
      const claimed = (q, tail) => new RegExp(`^\\s+(?:Decision\\s+)?${esc(q)}(?![\\w-])`, 'i').test(tail);
      let present = false;
      let malformed = false;
      for (const r of env.errata.rows) {
        if (r.supersededBy === null) {
          if (idBounded(id).test(r.raw)) malformed = true;
          continue;
        }
        for (const m of r.supersededBy.matchAll(idBounded(id))) {
          const tail = r.supersededBy.slice(m.index + id.length);
          if (qualifier ? claimed(qualifier, tail) : !siblings.some((q) => claimed(q, tail))) present = true;
        }
      }
      return { present, malformed };
    };

    for (const file of authoritative) {
      const fail = (msg) => failures.push(`${file.path}: ${msg}`);

      if (file.status !== 'A' && file.status !== 'M') {
        fail(`authoritative file ${file.status === 'D' ? 'deleted' : 'renamed, copied or type-changed'}; this never self-authorizes`);
        continue;
      }
      const rel = file.path.startsWith(AUTHORITATIVE_PREFIX) ? file.path.slice(AUTHORITATIVE_PREFIX.length) : null;
      const artifactNames = rel !== null && Object.hasOwn(ARTIFACT_FILES, rel) ? ARTIFACT_FILES[rel] : null;
      if (!artifactNames) {
        fail('no supported artifact mapping for this authoritative file; revision tokens are never borrowed');
        continue;
      }
      const head = ctx.readFile(file.path);
      if (head === null) {
        fail('authoritative file unreadable at head');
        continue;
      }
      const base = file.status === 'A' ? null : ctx.readBase(file.path);
      const baseNotes = new Set(headerNotes(base).map((l) => l.trim()));
      const baseTokens = new Set([...baseNotes].map((l) => NOTE_TOKEN.exec(l)?.[1]).filter(Boolean).map(normToken));
      const added = headerNotes(head).filter((l) => !baseNotes.has(l.trim()));
      if (added.length === 0) {
        fail('no revision note added to the artifact header');
        continue;
      }
      if (env.error) {
        fail(env.error);
        continue;
      }

      const boundAll = [];
      for (const note of added) {
        const token = NOTE_TOKEN.exec(note)?.[1];
        if (!token) {
          fail('revision note has no revision token');
          continue;
        }
        if (baseTokens.has(normToken(token))) {
          fail(`revision ${token} is already present in the base header; the revision was not bumped`);
          continue;
        }
        const ids = [...new Set(note.match(CR_ID) ?? [])];
        if (ids.length === 0) {
          fail(`revision ${token}: note cites no change record`);
          continue;
        }

        // Authorizing set: cited CRs whose §7 row binds THIS artifact to THIS revision. Others are descriptive only.
        const bound = [];
        let malformed = false;
        for (const id of ids) {
          for (const row of env.reg.rows.filter((r) => keyMatchesId(r.key, id))) {
            if (!row.ok) {
              fail(`revision ${token}: ${id}: malformed §7 row`);
              malformed = true;
            } else if (bindsArtifactRevision(row.artifacts, artifactNames, token)) bound.push({ id, row });
          }
        }
        if (malformed) continue;
        if (bound.length === 0) {
          fail(`revision ${token}: no cited change record binds this artifact to this revision in §7`);
          continue;
        }

        for (const { id, row } of bound) {
          const where = `revision ${token}: ${id}`;

          // Freshness (B..H): pre-existing evidence cannot pre-authorize a later edit.
          const rowAtBase = env.baseReg.rows.find((r) => r.key === row.key);
          if (rowAtBase && bindsArtifactRevision(rowAtBase.artifacts, artifactNames, token)) {
            fail(`${where}: the §7 binding for this artifact and revision already existed at the merge base`);
            continue;
          }
          const atHead = matrixEvidence(env.matrix, id, row.key);
          if (atHead.error) {
            fail(`${where}: §2.2 matrix evidence is ${atHead.error}`);
            continue;
          }
          const matrixRow = atHead.row;
          if (!matrixRow) {
            fail(`${where}: no matching §2.2 matrix row`);
            continue;
          }
          const atBase = matrixEvidence(env.baseMatrix, id, row.key);
          if (atBase.error) {
            fail(`${where}: §2.2 matrix evidence at the merge base is ${atBase.error}`);
            continue;
          }
          const matrixAtBase = atBase.row;
          if (matrixAtBase && matrixAtBase.text === matrixRow.text) {
            fail(`${where}: the §2.2 matrix row is unchanged since the merge base`);
            continue;
          }

          const recErr = checkRecord(id, ctx);
          if (recErr) {
            fail(`${where}: ${recErr}`);
            continue;
          }
          if (!row.decidedBy || NON_HUMAN.test(row.decidedBy) || !HUMAN_ROLE.test(row.decidedBy)) {
            fail(`${where}: §7 "Decided by" does not identify an acceptable human governance role`);
            continue;
          }
          const { neg, pos, contradictory } = errataVerdict(row.errata);
          if (contradictory) {
            fail(`${where}: §7 "Matrix / errata" is contradictory (cites 6.4 and says no errata)`);
            continue;
          }
          if (!neg && !pos) {
            fail(`${where}: §7 "Matrix / errata" has no explicit errata declaration`);
            continue;
          }
          const { present, malformed: badRow } = errataScan(id, row);
          if (badRow) {
            fail(`${where}: a malformed §6.4 row mentions this record`);
            continue;
          }
          if (pos && !present) {
            fail(`${where}: §7 declares a §6.4 errata row but none cites it`);
            continue;
          }
          if (neg && present) {
            fail(`${where}: §7 declares no errata but a §6.4 row cites it`);
            continue;
          }
          boundAll.push({ id, row });
        }
      }

      // Header-note corroboration over the concatenated added note(s); the §7 cell remains the determinant.
      if (boundAll.length > 0) {
        const { pos, neg } = noteErrataClaims(added.join(' '));
        if (pos && neg) {
          fail('header note contradicts itself');
        } else if (pos) {
          const ok = boundAll.some(({ id, row }) => errataVerdict(row.errata).pos && errataScan(id, row).present);
          if (!ok) fail('header note records errata; §7/§6.4 do not');
        } else if (neg && boundAll.some(({ id, row }) => errataScan(id, row).present)) {
          fail('header note declares no errata; §6.4 names the record');
        }
      }
    }
  }

  return { ok: failures.length === 0, authoritativeTouched: authoritative.map((c) => c.path), notices, failures };
}
