// Synthetic fixtures for the authoritative-path tests. No real authoritative or change-record file is read.
export const AUTH = 'docs/specifications/authoritative';
export const DOC = `${AUTH}/01_Domain_Model_and_Implementation_Contract_rev1.8.md`;
export const ADR = `${AUTH}/02_Architecture_Decision_Records_V1.4.md`;
export const RECON = `${AUTH}/16_Reconciliation_Report_rev3.md`;
export const HUMAN = 'Engineering authority';

export const BASE_NOTE = '> Change-control revision 9.0 (2026-09-01): CR-89 applied.';
export const NEW_NOTE = '> Change-control revision 9.1 (2026-10-01): CR-90 applied by engineering-authority decision.';

// Adding a §7 row changes doc 16 itself, so a real change set carries doc 16's own revision note.
export const RECON_NOTE = '> Change-control revision 3.1 (2026-10-01): CR-90 recorded in the change-control register and matrix.';

export const doc = (notes, body = '') =>
  ['# Domain Model fixture', '', '> Status: fixture.', '>', ...notes.flatMap((n) => [n, '>']), '', '## 1. Body', body, ''].join('\n');

export const rec = (status) => `# CR-90: fixture\n\n| Field | Value |\n|---|---|\n| ID | CR-90 |\n| Status | ${status} |\n`;

const DEFAULT_ARTIFACTS = 'Domain Model rev. 9.0 → rev. 9.1 (§3). Reconciliation Report rev. 3 → rev. 3.1';

export const row = (o) =>
  `| ${o.key} | 2026-10-01 | ${o.decider ?? HUMAN} | ${o.decision ?? 'A routine decision.'} | tags | ${
    o.artifacts ?? DEFAULT_ARTIFACTS
  } | ${o.errata ?? 'Matrix row `CR-90` in 2.2; no errata row (no passage superseded)'} | None. |`;

const matrixRow = (m) => {
  const { id, summary } = typeof m === 'string' ? { id: m, summary: 'summary' } : m;
  return `| ${id} | ${summary} | §3 | — | ADR-1 | applied |`;
};

/** Reconciliation Report fixture. `errataRaw` lines are appended verbatim inside §6.4 (extra/malformed tables). */
export function recon({ rows = [], matrix = [], matrixRaw = [], errata = [], errataRaw = [], notes = [] }) {
  return [
    '# Reconciliation fixture',
    '',
    ...(notes.length ? ['> Status: fixture.', '>', ...notes.flatMap((n) => [n, '>']), ''] : []),
    '## 2.2 Domain Model corrections',
    '| ID | Decision (summary) | DM § | Part 1 | ADR | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...matrix.map(matrixRow),
    ...matrixRaw,
    '## 2.3 Wave 2',
    '| x |',
    '## 6.4 Errata register',
    '| Closed document | Passage | Superseded by | Governing text |',
    '| --- | --- | --- | --- |',
    ...errata.map((s) => `| Doc | passage | ${s} | DM §3 |`),
    ...errataRaw,
    '## 6.5 Gate register',
    '| g |',
    '# 7. Change-Control Register (post-freeze)',
    '| CR | Date | Decided by | Decision | Affected origin tags | Artifacts changed (revision) | Matrix / errata | Open follow-up |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row),
    '',
    'Source records: fixture.',
  ].join('\n');
}

/**
 * Describes a change between a base commit B and a head commit H as two file maps plus the change list.
 * Defaults model a well-formed change to a Domain Model file with fresh CR-90 evidence.
 */
export function scenario(o = {}) {
  const path = o.path ?? DOC;
  const status = o.status ?? 'M';
  const records = o.records ?? { 'CR-90-fixture.md': rec('ACCEPTED') };
  const note = o.note ?? NEW_NOTE;
  const reconIsChanged = path === RECON;

  const headRecon =
    o.reconText ??
    recon({
      rows: o.rows ?? [{ key: 'CR-90' }],
      matrix: o.matrix ?? ['CR-90'],
      matrixRaw: o.matrixRaw ?? [],
      errata: o.errata ?? [],
      errataRaw: o.errataRaw ?? [],
      notes: reconIsChanged ? [BASE_NOTE, ...(o.notes ?? [note])] : [RECON_NOTE],
    });
  const baseRecon =
    o.baseReconText ??
    recon({
    rows: o.baseRows ?? [],
    matrix: o.baseMatrix ?? [],
    matrixRaw: o.baseMatrixRaw ?? [],
    notes: reconIsChanged ? [BASE_NOTE] : [],
  });

  const headFiles = new Map([[RECON, headRecon]]);
  const baseFiles = o.noBaseRecon ? new Map() : new Map([[RECON, baseRecon]]);
  for (const [n, t] of Object.entries(records)) {
    headFiles.set(`docs/decisions/${n}`, t);
    baseFiles.set(`docs/decisions/${n}`, t);
  }
  if (!reconIsChanged) {
    const headDoc =
      o.headDoc ?? (o.bodyNote ? doc([BASE_NOTE], o.bodyNote) : doc([BASE_NOTE, ...(o.notes ?? [note])]));
    if (status !== 'D') headFiles.set(path, headDoc);
    if (status !== 'A') baseFiles.set(path, o.baseDoc ?? doc(o.baseNotes ?? [BASE_NOTE]));
  }
  return { headFiles, baseFiles, changes: o.changes ?? [{ path, status }] };
}

/** In-memory evaluation context for a scenario. */
export function ctxOf(s) {
  return {
    changes: s.changes,
    readFile: (p) => s.headFiles.get(p) ?? null,
    readBase: (p) => s.baseFiles.get(p) ?? null,
    listDir: (d) =>
      [...s.headFiles.keys()].filter((p) => p.startsWith(`${d}/`)).map((p) => p.slice(d.length + 1)),
  };
}
