// F-11: duplicate or malformed relevant §2.2 rows must never be ignored in favour of the first valid row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChangeSet } from '../lib/authoritative-path.mjs';
import { ctxOf, scenario } from './fixtures.mjs';

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

const ROW = (id, summary = 'summary') => `| ${id} | ${summary} | §3 | — | ADR-1 | applied |`;

// --- at H ---------------------------------------------------------------------------------------

test('F-11: duplicate relevant CR-90 rows at H fail', () => {
  fails({ matrixRaw: [ROW('CR-90')] }, /§2\.2 matrix evidence is duplicate/);
});

test('F-11: one valid and one conflicting CR-90 row at H fail', () => {
  fails({ matrixRaw: [ROW('CR-90', 'a conflicting summary')] }, /§2\.2 matrix evidence is duplicate/);
});

test('F-11: a malformed relevant CR-90 row at H fails (whatever else the table holds)', () => {
  fails({ matrixRaw: ['| CR-90 | only three cells | §3 |'] }, /§2\.2 matrix evidence is malformed/);
  fails({ matrixRaw: ['    | CR-90 | summary | §3 | — | ADR-1 | applied |'] }, /§2\.2 matrix evidence is malformed/);
  fails({ matrixRaw: ['Matrix row for CR-90 described in prose'] }, /§2\.2 matrix evidence is malformed/);
  // even when the only well-formed row is absent
  fails({ matrix: [], matrixRaw: ['| CR-90 | only three cells | §3 |'] }, /§2\.2 matrix evidence is malformed/);
});

test('F-11: malformed rows that mention only another CR do not fail CR-90', () => {
  passes({ matrixRaw: ['| CR-77 | too few |', 'Prose about CR-77', '    | CR-77 | summary | §3 | — | ADR-1 | applied |'] });
  passes({ matrixRaw: ['| CR-900 | too few |', '    | CR-900 | summary | §3 | — | ADR-1 | applied |', 'About CR-900.'] });
});

test('F-11: a duplicate for another CR, or a CR-900 well-formed row, does not fail CR-90', () => {
  passes({ matrixRaw: [ROW('CR-900'), ROW('CR-900', 'other')] });
  passes({ matrixRaw: [ROW('CR-77'), ROW('CR-77')] });
});

test('F-11: a row in a second §2.2 table counts as a duplicate', () => {
  const second = ['', 'More corrections.', '| ID | Decision (summary) | DM § | Part 1 | ADR | Status |', '| --- | --- | --- | --- | --- | --- |'];
  fails({ matrixRaw: [...second, ROW('CR-90')] }, /§2\.2 matrix evidence is duplicate/);
});

test('F-11: qualified and sibling keys keep the accepted key semantics', () => {
  const note = '> Change-control revision 9.1 (2026-10-01): CR-90-F1 applied.';
  const base = {
    note,
    rows: [{ key: 'CR-90-F1 2b', errata: 'Matrix row in 2.2; no errata row (no passage superseded)' }],
    records: { 'CR-90-parent.md': '| Status | RESOLVED — follow-up item CR-90-F1 RESOLVED (2026-10-04) |\n' },
  };
  // the row for the qualified key exists once; a sibling "CR-90-F1" row and a CR-90-F10 row are different keys
  passes({ ...base, matrix: ['CR-90-F1 2b', 'CR-90-F1', 'CR-90-F10'] });
  // a duplicate of the qualified key itself fails
  fails({ ...base, matrix: ['CR-90-F1 2b', 'CR-90-F1 2b'] }, /duplicate/);
  // malformed row mentioning CR-90-F1 fails; one mentioning CR-90-F10 does not
  fails({ ...base, matrix: ['CR-90-F1 2b'], matrixRaw: ['| CR-90-F1 | too few |'] }, /malformed/);
  passes({ ...base, matrix: ['CR-90-F1 2b'], matrixRaw: ['| CR-90-F10 | too few |'] });
});

// --- at B ---------------------------------------------------------------------------------------

test('F-11: duplicate relevant rows at the merge base fail closed', () => {
  fails({ baseMatrix: ['CR-90', 'CR-90'] }, /§2\.2 matrix evidence at the merge base is duplicate/);
  fails({ baseMatrix: [{ id: 'CR-90', summary: 'a' }, { id: 'CR-90', summary: 'b' }] }, /at the merge base is duplicate/);
});

test('F-11: a malformed relevant row at the merge base fails closed', () => {
  fails({ baseMatrixRaw: ['| CR-90 | too few |'] }, /§2\.2 matrix evidence at the merge base is malformed/);
  passes({ baseMatrixRaw: ['| CR-77 | too few |'] });
});

// --- freshness (unchanged behaviour) ------------------------------------------------------------

test('F-11: ordinary single new row passes', () => passes({}));

test('F-11: ordinary single changed row passes', () => {
  passes({ baseMatrix: [{ id: 'CR-90', summary: 'older summary' }] });
});

test('F-11: an unchanged single row fails', () => {
  fails({ baseMatrix: ['CR-90'] }, /unchanged since the merge base/);
});
