// Adversarial regression tests for the authoritative-path check (Opus findings F-01, F-04 .. F-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChangeSet } from '../lib/authoritative-path.mjs';
import { ADR, AUTH, DOC, NEW_NOTE, RECON, ctxOf, rec, recon, scenario } from './fixtures.mjs';

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

// =============================================================================================
// F-01 — artifact + revision + CR binding, and freshness between B and H
// =============================================================================================

const ROW_ARTIFACTS = 'Domain Model rev. 9.0 → rev. 9.1 (§3). Reconciliation Report rev. 3 → rev. 3.1';

test('F-01: a Domain Model edit cannot borrow the Reconciliation Report token', () => {
  fails({ note: '> Change-control revision 3.1 (2026-10-01): CR-90 applied.' }, /binds this artifact to this revision/);
});

test('F-01: the Reconciliation Report cannot borrow the Domain Model token', () => {
  fails({ path: RECON, note: NEW_NOTE }, /binds this artifact to this revision/);
});

test('F-01: another artifact (ADR) cannot borrow the Domain Model token, and vice versa', () => {
  fails({ path: ADR, note: NEW_NOTE }, /binds this artifact to this revision/);
  const adrRow = { key: 'CR-90', artifacts: 'ADR set V1.4 → **V1.4.1**. Domain Model rev. 1.8 → rev. 1.8.1' };
  fails({ path: DOC, note: '> Change-control revision V1.4.1 (2026-10-01): CR-90 applied.', rows: [adrRow] }, /binds this artifact/);
  fails({ path: ADR, note: '> Change-control revision 1.8.1 (2026-10-01): CR-90 applied.', rows: [adrRow] }, /binds this artifact/);
});

test('F-01: the correct same-artifact binding passes for each supported artifact', () => {
  passes({});
  passes({ path: RECON, note: '> Change-control revision 3.1 (2026-10-01): CR-90 applied.' });
  passes({
    path: ADR,
    note: '> Change-control revision V1.4.1 (2026-10-01): CR-90 applied.',
    rows: [{ key: 'CR-90', artifacts: 'ADR set V1.4 → **V1.4.1** (ADR-012 amendment)' }],
  });
  passes({
    path: ADR,
    note: '> Change-control revision V1.4.1 (2026-10-01): CR-90 applied.',
    rows: [{ key: 'CR-90', artifacts: 'Architecture Decision Records V1.4 → V1.4.1' }],
  });
});

test('F-01: an authoritative file with no supported artifact mapping fails closed', () => {
  const path = `${AUTH}/05_Spec_Kit_Wave_1_fixture.md`;
  fails({ path, changes: [{ path, status: 'M' }] }, /no supported artifact mapping/);
});

test('F-01: an "unchanged" segment, a token only inside a parenthetical, or a § reference does not bind', () => {
  for (const artifacts of [
    'Domain Model unchanged (rev. 9.0 → rev. 9.1)',
    'Domain Model rev. 9.0 → rev. 9.2 (mentions rev. 9.1 elsewhere)',
    'Domain Model rev. 9.0 → §9.1',
    'Domain Model rev. 9.1',
    'Domain Model rev. 9.0 → rev. 9.10',
  ]) {
    fails({ rows: [{ key: 'CR-90', artifacts }] }, /binds this artifact/);
  }
});

test('F-01: a segment is attributed by artifact name, not by a nearby token', () => {
  // The Reconciliation Report segment records 9.1; the Domain Model segment records 9.2.
  const artifacts = 'Domain Model rev. 9.0 → rev. 9.2. Reconciliation Report rev. 9.0 → rev. 9.1';
  fails({ rows: [{ key: 'CR-90', artifacts }] }, /binds this artifact/);
  passes({ path: RECON, rows: [{ key: 'CR-90', artifacts }] });
});

test('F-01 freshness: a §7 binding that already existed at the merge base fails', () => {
  fails({ baseRows: [{ key: 'CR-90', artifacts: ROW_ARTIFACTS }] }, /already existed at the merge base/);
});

test('F-01 freshness: extending an existing §7 row with a new artifact binding passes', () => {
  passes({ baseRows: [{ key: 'CR-90', artifacts: 'Domain Model rev. 8.0 → rev. 8.1' }] });
});

test('F-01 freshness: an unchanged §2.2 row fails; a changed or new one passes', () => {
  fails({ baseMatrix: ['CR-90'] }, /unchanged since the merge base/);
  passes({ baseMatrix: [{ id: 'CR-90', summary: 'older summary' }] });
  passes({ baseMatrix: [] });
});

test('F-01 freshness: Reconciliation Report unreadable at the merge base fails closed', () => {
  fails({ noBaseRecon: true }, /cannot be read at the merge base/);
});

test('F-01 freshness: the change record itself may predate the change (no B..H requirement)', () =>
  passes({ records: { 'CR-90-fixture.md': rec('RESOLVED (2026-01-01)') } }));

// =============================================================================================
// F-04 — parent / follow-up record lookup
// =============================================================================================

test('F-04: parent OPEN + follow-up file ACCEPTED must not make the parent authorize', () => {
  const records = { 'CR-90-parent.md': rec('OPEN — awaiting decision'), 'CR-90-F1-followup.md': rec('ACCEPTED') };
  fails({ records }, /OPEN does not authorize/);
  // and the reverse: a parent id never resolves to a follow-up-only file
  fails({ records: { 'CR-90-F1-followup.md': rec('ACCEPTED') } }, /no change record file/);
});

test('F-04: a follow-up resolves its own file when present; two parent files are ambiguous', () => {
  const note = '> Change-control revision 9.1 (2026-10-01): CR-90-F1 applied.';
  passes({
    note,
    rows: [{ key: 'CR-90-F1' }],
    matrix: ['CR-90-F1'],
    records: { 'CR-90-parent.md': rec('OPEN'), 'CR-90-F1-x.md': rec('ACCEPTED') },
  });
  fails({ records: { 'CR-90-a.md': rec('ACCEPTED'), 'CR-90-b.md': rec('ACCEPTED') } }, /ambiguous/);
});

// =============================================================================================
// F-05 — follow-up state parsing
// =============================================================================================

const followUp = (status) => ({
  note: '> Change-control revision 9.1 (2026-10-01): CR-90-F1 applied.',
  rows: [{ key: 'CR-90-F1' }],
  matrix: ['CR-90-F1'],
  records: { 'CR-90-parent.md': `| Status | ${status} |\n` },
});

test('F-05: lower-case "open" does not authorize; negated or future ACCEPTED does not authorize', () => {
  fails(followUp('RESOLVED — follow-up item CR-90-F1 remains open'), /OPEN does not authorize/);
  fails(followUp('RESOLVED — follow-up item CR-90-F1 not yet ACCEPTED'), /negated or not yet in force/);
  fails(followUp('RESOLVED — follow-up item CR-90-F1 will be ACCEPTED later'), /negated or not yet in force/);
  fails(followUp('RESOLVED — follow-up item CR-90-F1 awaiting RESOLVED status'), /negated or not yet in force/);
});

test('F-05: more than one distinct state word, or none, fails; the parent state is never inherited', () => {
  fails(followUp('ACCEPTED — follow-up item CR-90-F1 remains open, parent RESOLVED'), /more than one state word/);
  fails(followUp('ACCEPTED — follow-up item CR-90-F1 previously ACCEPTED, now OPEN'), /more than one state word/);
  fails(followUp('ACCEPTED — follow-up item CR-90-F1 (matrix) is being worked'), /no recognized state/);
  fails(followUp('ACCEPTED — decided; CR-90-F1 is mentioned in passing'), /no recognized state/);
  fails(followUp('ACCEPTED — see CR-90-F1 and CR-90-F1 again RESOLVED'), /exactly once/);
});

test('F-05: the fragment stops at ";" and at the next CR id, and the real follow-up shapes parse', () => {
  passes(followUp('RESOLVED — decided; follow-up item CR-90-F1 RESOLVED (2026-10-04): Decisions 1 and 2 by the engineering authority; Decision 2b reconciled'));
  passes(followUp('ACCEPTED — follow-up item CR-90-F1 resolved; parent remains OPEN'));
  passes(followUp('ACCEPTED — follow-up item CR-90-F1 RESOLVED, unlike CR-91 which remains OPEN'));
  fails(followUp('RESOLVED — follow-up item CR-90-F1 (permission matrix) remains OPEN'), /OPEN does not authorize/);
});

// =============================================================================================
// F-06 — ambiguous Matrix / errata cell
// =============================================================================================

test('F-06: a cell that both cites 6.4 and says "no errata" fails closed', () => {
  fails({ rows: [{ key: 'CR-90', errata: 'errata row in 6.4 to follow; no errata row yet' }] }, /contradictory/);
  fails({ rows: [{ key: 'CR-90', errata: 'no errata row (see 6.4)' }], errata: ['CR-90 (decision)'] }, /contradictory/);
});

// =============================================================================================
// F-07 — §6.4 malformed rows and multiple tables
// =============================================================================================

const POS_ROW = { key: 'CR-90', errata: 'Matrix row in 2.2; errata row in 6.4' };
const SECOND_TABLE = [
  '',
  'Additional errata (continued).',
  '| Closed document | Passage | Superseded by | Governing text |',
  '| --- | --- | --- | --- |',
];

test('F-07: a malformed §6.4 row that mentions the CR fails closed', () => {
  fails({ errataRaw: ['| Doc | passage | CR-90 (decision) |'] }, /malformed §6\.4 row/);
  fails({ rows: [POS_ROW], errataRaw: ['| Doc | passage | CR-90 (decision) | DM | extra |'] }, /malformed §6\.4 row/);
  // a malformed row that does NOT mention the CR is irrelevant
  passes({ errataRaw: ['| Doc | passage | CR-77 (decision) |'] });
});

test('F-07: a relevant row in a second table is detected', () => {
  fails({ errataRaw: [...SECOND_TABLE, '| Doc | p | CR-90 (decision) | DM |'] }, /declares no errata but a §6\.4 row/);
  passes({ rows: [POS_ROW], errataRaw: [...SECOND_TABLE, '| Doc | p | CR-90 (decision) | DM |'] });
});

test('F-07: an escaped pipe does not hide the relevant row, and id matching stays bounded', () => {
  passes({ rows: [POS_ROW], errataRaw: ['| Doc | passage with a \\| pipe | CR-90 (decision) | DM |'] });
  fails({ rows: [POS_ROW], errataRaw: ['| Doc | p | CR-900 (decision) | DM |'] }, /none cites it/);
});

test('F-07: a §6.4 section with no "Superseded by" table fails closed', () => {
  const noTable = recon({ rows: [{ key: 'CR-90' }], matrix: ['CR-90'] }).replace('| Superseded by |', '| Replaced by |');
  fails({ reconText: noTable }, /§6\.4 errata table not found/);
});
