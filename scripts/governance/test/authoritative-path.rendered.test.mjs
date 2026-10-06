// F11-R1: rendered duplicates and disguised or unparsed §2.2 rows must not escape the ambiguity check.
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
const QUOTED = '> | CR-90 | summary | §3 | — | ADR-1 | applied |';
const QUOTED_6 = '> | CR-90 | summary | §3 | — | applied |'; // six cells once the quote marker counts as the id cell

const disguised = [
  ['bold', [ROW('**CR-90**')]],
  ['code span', [ROW('`CR-90`')]],
  ['lower case', [ROW('cr-90')]],
  ['italic and padded', [ROW('  _CR-90_  ')]],
  ['bold code', [ROW('**`CR-90`**')]],
  ['full-width letters', [ROW('ＣＲ-90')]],
  ['zero-width noise', [ROW('CR​-90')]],
  ['unassigned ignorable noise', [ROW('CR⁥-90')]],
  ['blockquoted table row inside the table', [QUOTED]],
  ['blockquoted row with the right cell count', [QUOTED_6]],
  ['blockquoted row after a blank line (outside any table)', ['', QUOTED]],
  ['HTML-wrapped id', [ROW('<b>CR-90</b>')]],
];

for (const [label, raw] of disguised) {
  test(`F11-R1: a valid CR-90 row plus a disguised row (${label}) fails at H`, () => {
    fails({ matrixRaw: raw }, /§2\.2 matrix evidence is (duplicate|malformed)/);
  });
  test(`F11-R1: the same disguised row (${label}) beside a valid row at B fails closed`, () => {
    fails({ baseMatrix: ['CR-90'], baseMatrixRaw: raw }, /at the merge base is (duplicate|malformed)/);
  });
}

test('F11-R1: two rendered copies of the same id are a duplicate even when neither is the plain form', () => {
  fails({ matrix: [], matrixRaw: [ROW('**CR-90**'), ROW('`CR-90`')] }, /duplicate/);
});

test('F11-R1: CR-900 variants of every disguise do not fail CR-90', () => {
  passes({
    matrixRaw: [
      ROW('**CR-900**'),
      ROW('`CR-900`'),
      ROW('cr-900'),
      '> | CR-900 | summary | §3 | — | ADR-1 | applied |',
      '> | CR-900 | summary | §3 | — | applied |',
      ROW('<b>CR-900</b>'),
      '',
      '> | CR-900 | summary | §3 | — | ADR-1 | applied |',
    ],
  });
});

const F1 = {
  note: '> Change-control revision 9.1 (2026-10-01): CR-90-F1 applied.',
  records: { 'CR-90-parent.md': '| Status | RESOLVED — follow-up item CR-90-F1 RESOLVED (2026-10-04) |\n' },
};

test('F11-R1: CR-90-F10 variants do not fail CR-90-F1; CR-90-F1 variants do', () => {
  const base = { ...F1, rows: [{ key: 'CR-90-F1' }], matrix: ['CR-90-F1'] };
  passes({
    ...base,
    matrixRaw: [ROW('**CR-90-F10**'), ROW('`CR-90-F10`'), ROW('cr-90-f10'), '> | CR-90-F10 | s | §3 | — | A | applied |'],
  });
  fails({ ...base, matrixRaw: [ROW('**CR-90-F1**')] }, /duplicate/);
  fails({ ...base, matrixRaw: [ROW('cr-90-f1')] }, /duplicate/);
  fails({ ...base, matrixRaw: ['> | CR-90-F1 | s | §3 | — | A | applied |'] }, /malformed/);
});

test('F11-R1: the legitimate qualified key CR-90-F1 2b still works, plainly and with wrappers', () => {
  const base = {
    ...F1,
    rows: [{ key: 'CR-90-F1 2b', errata: 'Matrix row in 2.2; no errata row (no passage superseded)' }],
  };
  passes({ ...base, matrix: ['CR-90-F1 2b'] });
  passes({ ...base, matrix: ['**CR-90-F1 2b**'] });
  passes({ ...base, matrix: ['CR-90-F1 2b', 'CR-90-F1', 'CR-90-F10'] }); // siblings are different keys
  fails({ ...base, matrix: ['CR-90-F1 2b', '`CR-90-F1 2b`'] }, /duplicate/);
  fails({ ...base, matrix: ['CR-90-F1 2b', 'CR-90-F1  2B'] }, /duplicate/);
});

test('F11-R1: a single normal row and the three freshness outcomes are unchanged', () => {
  passes({});
  passes({ baseMatrix: [{ id: 'CR-90', summary: 'older summary' }] });
  fails({ baseMatrix: ['CR-90'] }, /unchanged since the merge base/);
  passes({ matrix: ['**CR-90**'] }); // a single wrapped row is evidence like any other
});

test('F11-R1: unrelated pipe-containing prose and non-CR rows do not fail CR-90', () => {
  passes({ matrixRaw: ['| X1 | DM §3: unrelated correction | §3 | — | ADR-1 | applied |', '', 'A note with a | pipe but no CR id.'] });
  passes({ matrixRaw: ['| X2 | refers to CR-77 only | §3 | — | ADR-1 | applied |'] });
});
