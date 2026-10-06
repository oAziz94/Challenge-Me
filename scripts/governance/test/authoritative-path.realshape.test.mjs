// Real-shape regression for the Reconciliation Report (doc 16) §7 register.
// The real report has: an H1 heading "# 7. Change-Control Register (post-freeze)", a preamble paragraph, a blank
// line, the register table, a blank line, a "Source records" paragraph and a "Ratification" paragraph; its base
// form (the first commit) has NO §7 heading at all. Earlier synthetic fixtures had none of this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChangeSet } from '../lib/authoritative-path.mjs';
import { ADR, BASE_NOTE, ctxOf, recon, rec, scenario } from './fixtures.mjs';

const run = (o) => evaluateChangeSet(ctxOf(scenario(o)));
const passes = (o) => {
  const r = run(o);
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
};
const fails = (o, re) => {
  const r = run(o);
  assert.equal(r.ok, false);
  if (re) assert.match(r.failures.join('\n'), re);
};

// Multi-sentence, bold-wrapped cells in the shape of the real CR-1 row.
const REAL_ARTIFACTS =
  'ADR set V1.4 → **V1.4.1** (ADR-012 amendment "SystemActor purposes [CR-1]"; amendment index row). ' +
  'Reconciliation Report rev. 3 → **rev. 3.1** (this register; 2.2 row; 6.4 row). ' +
  'Domain Model rev. 1.8 and Wave 1: **unchanged**.';
const REAL_ROW = { key: 'CR-1', artifacts: REAL_ARTIFACTS, errata: 'Matrix row `CR-1` in 2.2; no errata row (no passage superseded)' };
const PREAMBLE =
  'Entries made under the change-control rule in 6.7: each change names the affected origin tags, bumps the artifact revision and regenerates the matrix. The frozen revisions in 6.8 remain the freeze baseline.';
const TRAILER = [
  '',
  'Source records: `docs/decisions/CR-1-example.md`; `docs/decisions/CR-2-example.md`.',
  '',
  '**Ratification (engineering authority — Example Person, 2026-10-04).** “RATIFIED — As engineering authority, I have reviewed and ratify the applied revisions.” It changes no contract text.',
];

/** Reshapes a fixture report so that §7 looks like the real one: preamble before the table, prose after it. */
function realShape(text) {
  const lines = text.split('\n');
  const h = lines.findIndex((l) => l.startsWith('# 7.'));
  const out = [...lines.slice(0, h + 1), '', PREAMBLE, '', ...lines.slice(h + 1)];
  const tail = out.findIndex((l, i) => i > h && l.startsWith('Source records:'));
  return [...out.slice(0, tail > 0 ? tail - 1 : out.length), ...TRAILER].join('\n');
}

const REAL = {
  path: ADR,
  note: '> Change-control revision V1.4.1 (2026-10-03): CR-1 applied by engineering-authority decision. CR-1-F1 remains OPEN.',
  records: {
    'CR-1-purposes.md': '| Status | RESOLVED (2026-10-03) — purpose set decided; follow-up item CR-1-F1 (permission matrix) remains OPEN |\n',
  },
  matrix: ['CR-1'],
  rows: [REAL_ROW],
};
const headText = () => recon({ rows: [REAL_ROW], matrix: ['CR-1'], notes: [] });
// The report as it stood before the register existed: no §7 heading, no CR rows, an ordinary §2.2 table.
const beforeRegister = () => recon({ rows: [], matrix: [] }).split('\n').slice(0, -7).join('\n');

test('real shape: heading, preamble, multi-sentence cells and trailing prose parse and pass', () => {
  passes({ ...REAL, reconText: realShape(headText()) });
});

test('real shape: the fixture really has the preamble and the Source records / Ratification text', () => {
  const t = realShape(headText());
  assert.match(t, /^# 7\. Change-Control Register \(post-freeze\)\n\nEntries made under/m);
  assert.match(t, /\| ---[^\n]*\n\| CR-1 +\|/);
  assert.match(t, /Source records:[\s\S]*Ratification/);
});

test('real shape: a merge-base report that predates the §7 register (no heading) gives an empty register', () => {
  const base = beforeRegister();
  assert.doesNotMatch(base, /^# 7\./m);
  passes({ ...REAL, reconText: realShape(headText()), baseReconText: base });
});

test('real shape: the same absence at the HEAD side fails closed', () => {
  fails({ ...REAL, reconText: beforeRegister() }, /§7 register table not found/);
});

test('real shape: a §7 heading with no table, or with a table missing a required column, still fails closed', () => {
  const noTable = `${beforeRegister()}\n# 7. Change-Control Register (post-freeze)\n\n${PREAMBLE}\n`;
  fails({ ...REAL, reconText: realShape(headText()), baseReconText: noTable }, /§7 register table not found/);
  fails({ ...REAL, reconText: noTable }, /§7 register table not found/);
  const noColumn = realShape(headText()).replace('Artifacts changed (revision)', 'Artifacts');
  fails({ ...REAL, reconText: noColumn }, /§7 register table not found/);
  fails({ ...REAL, reconText: realShape(headText()), baseReconText: noColumn }, /§7 register table not found/);
});

test('real shape: absence of §2.2 is tolerated at the merge base only', () => {
  const noMatrixBase = recon({ rows: [], matrix: [] })
    .split('\n')
    .filter((l, i, a) => {
      const start = a.findIndex((x) => x.startsWith('## 2.2'));
      const end = a.findIndex((x) => x.startsWith('## 2.3'));
      return i < start || i >= end;
    })
    .join('\n');
  assert.doesNotMatch(noMatrixBase, /^## 2\.2/m);
  passes({ ...REAL, reconText: realShape(headText()), baseReconText: noMatrixBase });
  fails({ ...REAL, reconText: noMatrixBase }, /§2\.2 matrix table not found/);
});

test('real shape: a pre-register base does not weaken freshness or any other rule', () => {
  const base = beforeRegister();
  // wrong token still does not bind
  fails({ ...REAL, reconText: realShape(headText()), baseReconText: base, note: '> Change-control revision V1.4.9 (2026-10-03): CR-1 applied.' }, /binds this artifact/);
  // record not final still fails
  fails({ ...REAL, reconText: realShape(headText()), baseReconText: base, records: { 'CR-1-purposes.md': rec('OPEN') } }, /does not authorize/);
  // the base header may not already carry the token
  fails({ ...REAL, reconText: realShape(headText()), baseReconText: base, baseNotes: [BASE_NOTE, '> Change-control revision V1.4.1 (2026-09-15): earlier.'] }, /already present in the base header/);
});
