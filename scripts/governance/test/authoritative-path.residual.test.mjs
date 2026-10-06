// Regression tests for Opus re-review residuals R-1 (exact file mapping), R-2 (follow-up fragment) and
// R-3 (pipe-less / indented §6.4 rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChangeSet } from '../lib/authoritative-path.mjs';
import { AUTH, DOC, ctxOf, scenario } from './fixtures.mjs';

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
// R-1 — exact authoritative file mapping
// =============================================================================================

const atPath = (path, extra = {}) => ({ path, changes: [{ path, status: 'M' }], ...extra });

test('R-1: the exact supported file passes', () => passes({}));

test('R-1: a new 01_* shadow file cannot borrow the Domain Model binding', () => {
  fails(atPath(`${AUTH}/01_Domain_Model_shadow.md`), /no supported artifact mapping/);
  fails({ ...atPath(`${AUTH}/01_Domain_Model_shadow.md`), status: 'A' }, /no supported artifact mapping/);
});

test('R-1: a nested path cannot borrow a binding', () => {
  fails(atPath(`${AUTH}/x/01_y.md`), /no supported artifact mapping/);
  fails(atPath(`${AUTH}/x/01_Domain_Model_and_Implementation_Contract_rev1.8.md`), /no supported artifact mapping/);
});

test('R-1: a case variant of the file or of the directory fails closed', () => {
  fails(atPath(`${AUTH}/01_domain_model_and_implementation_contract_rev1.8.md`), /no supported artifact mapping/);
  fails(atPath(`${AUTH}/01_DOMAIN_MODEL_AND_IMPLEMENTATION_CONTRACT_REV1.8.MD`), /no supported artifact mapping/);
  fails(
    atPath('Docs/Specifications/Authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md'),
    /no supported artifact mapping/,
  );
});

test('R-1: a shadow file in the same change set fails even beside the exact file', () => {
  const shadow = `${AUTH}/01_Domain_Model_copy.md`;
  const r = run({ changes: [{ path: DOC, status: 'M' }, { path: shadow, status: 'M' }] });
  assert.equal(r.ok, false);
  assert.match(r.failures.join('\n'), /01_Domain_Model_copy\.md: no supported artifact mapping/);
  assert.doesNotMatch(r.failures.join('\n'), /01_Domain_Model_and_Implementation_Contract_rev1\.8\.md:/);
});

test('R-1: a different numbered document with the same prefix, or an unlisted document, fails closed', () => {
  fails(atPath(`${AUTH}/01_Domain_Model_and_Implementation_Contract_rev1.9.md`), /no supported artifact mapping/);
  fails(atPath(`${AUTH}/04_Learning_Trajectory_Model_rev14.md`), /no supported artifact mapping/);
  fails(atPath(`${AUTH}/00_README_Index.md`), /no supported artifact mapping/);
});

// =============================================================================================
// R-2 — follow-up fragment boundary and conditional wording
// =============================================================================================

const followUp = (status) => ({
  note: '> Change-control revision 9.1 (2026-10-01): CR-90-F1 applied.',
  rows: [{ key: 'CR-90-F1' }],
  matrix: ['CR-90-F1'],
  records: { 'CR-90-parent.md': `| Status | ${status} |\n` },
});
const STATE_ERR = /no recognized state|negated or not yet in force|more than one state word|does not authorize/;

test('R-2: F1 cannot inherit another follow-up’s state', () => {
  fails(followUp('RESOLVED — CR-90-F1 superseded by CR-90-F2 ACCEPTED'), /no recognized state/);
  fails(followUp('RESOLVED — CR-90-F1 split into CR-90-F2 (RESOLVED)'), /no recognized state/);
  fails(followUp('RESOLVED — CR-90-F1 replaced by CR-90 ACCEPTED'), /no recognized state/);
});

test('R-2: conditional or not-yet-in-force wording after the state also fails', () => {
  for (const status of [
    'RESOLVED — CR-90-F1 ACCEPTED if counsel agrees',
    'RESOLVED — CR-90-F1 ACCEPTED, subject to confirmation',
    'RESOLVED — CR-90-F1 ACCEPTED unless counsel objects',
    'RESOLVED — CR-90-F1 ACCEPTED, pending sign-off',
    'RESOLVED — CR-90-F1 will be ACCEPTED',
    'RESOLVED — CR-90-F1 awaiting ACCEPTED',
    'RESOLVED — CR-90-F1 not ACCEPTED',
    'RESOLVED — CR-90-F1 not yet ACCEPTED',
    'RESOLVED — CR-90-F1 ACCEPTED, not final',
  ]) {
    fails(followUp(status), STATE_ERR);
  }
});

test('R-2: exactly one id occurrence, exactly one state, no parent inheritance are still required', () => {
  fails(followUp('ACCEPTED — see CR-90-F1 and CR-90-F1 again RESOLVED'), /exactly once/);
  fails(followUp('ACCEPTED — follow-up item CR-90-F1 previously ACCEPTED, now OPEN'), /more than one state word/);
  fails(followUp('ACCEPTED — follow-up item CR-90-F1 (matrix) is being worked'), /no recognized state/);
});

test('R-2: ordinary prose after the state, and the real follow-up shapes, still authorize', () => {
  // CR-3-F1 shape
  passes(followUp('RESOLVED (2026-10-03) — decided; follow-up item CR-90-F1 RESOLVED (2026-10-04): Decisions 1, 2a, 2b, 3 and 4 by the engineering authority; Decision 2b reconciled in documents 01 (rev. 1.8.2), 02 (V1.4.4)'));
  // a later, separate CR id ends the fragment
  passes(followUp('ACCEPTED — follow-up item CR-90-F1 RESOLVED, see CR-91 for the open question'));
  // CR-1-F1 shape is OPEN and therefore never authorizes, but is parsed as OPEN
  fails(followUp('RESOLVED (2026-10-03) — purpose set decided; follow-up item CR-90-F1 (permission matrix) remains OPEN'), /OPEN does not authorize/);
});

// =============================================================================================
// R-3 — pipe-less and indented §6.4 table rows
// =============================================================================================

const POS_ROW = { key: 'CR-90', errata: 'Matrix row in 2.2; errata row in 6.4' };
const NEG_ERR = /declares no errata but a §6\.4 row/;

test('R-3: a pipe-less row is detected', () => {
  passes({ rows: [POS_ROW], errataRaw: ['Doc | passage | CR-90 (decision) | DM'] });
  fails({ errataRaw: ['Doc | passage | CR-90 (decision) | DM'] }, NEG_ERR);
});

test('R-3: rows indented by 1 and 3 spaces are detected', () => {
  for (const indent of [' ', '   ']) {
    passes({ rows: [POS_ROW], errataRaw: [`${indent}| Doc | passage | CR-90 (decision) | DM |`] });
    fails({ errataRaw: [`${indent}| Doc | passage | CR-90 (decision) | DM |`] }, NEG_ERR);
  }
});

test('R-3: a row indented 4 spaces is not a table row and fails closed when it mentions the CR', () => {
  fails({ rows: [POS_ROW], errataRaw: ['    | Doc | passage | CR-90 (decision) | DM |'] }, /malformed §6\.4 row/);
  fails({ errataRaw: ['    | Doc | passage | CR-90 (decision) | DM |'] }, /malformed §6\.4 row/);
});

test('R-3: a malformed relevant row (cell count, no pipes) fails closed', () => {
  fails({ errataRaw: ['Doc | passage | CR-90 (decision)'] }, /malformed §6\.4 row/);
  fails({ rows: [POS_ROW], errataRaw: ['See CR-90 for the details of the amendment'] }, /malformed §6\.4 row/);
  fails({ errataRaw: ['| Doc | passage | CR-90 (decision) | DM | extra |'] }, /malformed §6\.4 row/);
});

test('R-3: malformed rows for other CRs do not deny an unrelated CR', () => {
  passes({
    errataRaw: ['Doc | passage | CR-77 (decision)', '    | Doc | passage | CR-900 (decision) | DM |', 'prose about CR-9000'],
  });
  passes({
    rows: [POS_ROW],
    errataRaw: ['Doc | p | CR-90 (decision) | DM', 'Doc | passage | CR-77 (decision)', '    | x | CR-900 | y |'],
  });
});

test('R-3: an escaped pipe in a pipe-less row is honoured', () => {
  passes({ rows: [POS_ROW], errataRaw: ['Doc | passage with a \\| pipe | CR-90 (decision) | DM'] });
});

test('R-3: a blank line ends the table; a later line is prose, not a row, and is not evidence', () => {
  fails({ rows: [POS_ROW], errataRaw: ['', 'Doc | passage | CR-90 (decision) | DM'] }, /none cites it/);
});

test('R-3: every table in §6.4 is still inspected, including a pipe-less second table', () => {
  const second = ['', 'Continued.', 'Closed document | Passage | Superseded by | Governing text', '--- | --- | --- | ---'];
  passes({ rows: [POS_ROW], errataRaw: [...second, 'Doc | p | CR-90 (decision) | DM'] });
  fails({ errataRaw: [...second, 'Doc | p | CR-90 (decision) | DM'] }, NEG_ERR);
});
