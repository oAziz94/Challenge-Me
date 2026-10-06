import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, evaluateChangeSet } from '../lib/authoritative-path.mjs';
import { ADR, AUTH, BASE_NOTE, DOC, HUMAN, NEW_NOTE, RECON, ctxOf, doc, recon, rec, scenario } from './fixtures.mjs';

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

// --- baseline behaviour -----------------------------------------------------------------------

test('ordinary non-authoritative change passes with no notice', () => {
  const r = run({ changes: [{ path: 'docs/notes/readme.md', status: 'M' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.notices, []);
  assert.deepEqual(r.authoritativeTouched, []);
});

test('well-formed ACCEPTED evidence passes', () => passes({}));

test('RESOLVED record passes (the record may predate the change)', () =>
  passes({ records: { 'CR-90-fixture.md': rec('RESOLVED (2026-10-03) — decided and reconciled') } }));

test('template-form "State:" line is read', () =>
  passes({ records: { 'CR-90-fixture.md': '# CR-90: x\nState: ACCEPTED\n' } }));

test('authoritative change with no added header note fails by default', () =>
  fails({ headDoc: doc([BASE_NOTE]) }, /no revision note added/));

for (const state of ['REJECTED', 'WITHDRAWN', 'OPEN — awaiting decision', 'DRAFT', 'SUBMITTED', 'PENDING', 'CLOSED (no new decision)']) {
  test(`authorizing record in state ${state.split(' ')[0]} fails`, () =>
    fails({ records: { 'CR-90-fixture.md': rec(state) } }, /does not authorize/));
}

test('unparseable or missing authorizing record fails closed', () => {
  fails({ records: { 'CR-90-fixture.md': '# CR-90\nno status here\n' } }, /Status|State/);
  fails({ records: { 'CR-90-fixture.md': rec('Maybe later') } }, /not a recognized state/);
  fails({ records: {} }, /no change record file/);
});

// --- authorizing CR vs descriptive mention ----------------------------------------------------

test('1. authorizing CR plus a descriptive OPEN follow-up in the same note passes', () =>
  passes({
    note: `${NEW_NOTE} Follow-up CR-90-F1 remains OPEN.`,
    records: {
      'CR-90-fixture.md': `| Status | ACCEPTED — follow-up item CR-90-F1 remains OPEN |\n`,
    },
  }));

test('2. a note citing only an OPEN follow-up fails (no §7 binding)', () =>
  fails(
    {
      note: '> Change-control revision 9.1 (2026-10-01): CR-90-F1 is described as open.',
      records: { 'CR-90-fixture.md': `| Status | ACCEPTED — follow-up item CR-90-F1 remains OPEN |\n` },
    },
    /binds this artifact to this revision/,
  ));

test('3. real-shape V1.4.1 regression: CR-1 authorizes, CR-1-F1 mentioned as OPEN', () =>
  passes({
    path: ADR,
    headDoc: doc([
      BASE_NOTE,
      '> Change-control revision V1.4.1 (2026-10-03): CR-1 applied by engineering-authority decision — amendment. CR-1-F1 (the permission matrix) remains OPEN and is outside this revision.',
    ]),
    baseDoc: doc([BASE_NOTE]),
    records: {
      'CR-1-purposes.md': '| Status | RESOLVED (2026-10-03) — purpose set decided; follow-up item CR-1-F1 (permission matrix) remains OPEN |\n',
    },
    rows: [{ key: 'CR-1', artifacts: 'ADR set V1.4 → **V1.4.1** (ADR-012 amendment). Reconciliation Report rev. 3 → **rev. 3.1**', errata: 'Matrix row `CR-1` in 2.2; errata row "ADR-012" in 6.4' }],
    matrix: ['CR-1'],
    errata: ['CR-1 (engineering-authority decision, 2026-10-03)'],
  }));

test('4. CR-4-shaped record: RESOLVED but no §7 revision -> fails as non-binding, not as an invalid state', () => {
  const r = run({
    note: '> Change-control revision 9.1 (2026-10-01): CR-4 applied.',
    records: { 'CR-4-prereq.md': rec('RESOLVED (2026-10-03) — decided; no amendment to documents 00–18') },
    rows: [{ key: 'CR-90' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(), /binds this artifact to this revision/);
  assert.doesNotMatch(r.failures.join(), /state|RESOLVED/i);
});

test('5. cited CR whose §7 row names a different revision fails (an old CR is not borrowed)', () =>
  fails(
    { rows: [{ key: 'CR-90', artifacts: 'Domain Model rev. 8.0 → rev. 8.1' }] },
    /binds this artifact to this revision/,
  ));

test('5b. the OLD side of an arrow does not bind', () =>
  fails({ rows: [{ key: 'CR-90', artifacts: 'Domain Model rev. 9.1 → rev. 9.2' }] }, /binds this artifact to this revision/));

// --- header / revision rules ------------------------------------------------------------------

test('6. revision token already present in the base header fails', () =>
  fails(
    { baseNotes: [BASE_NOTE, '> Change-control revision 9.1 (2026-09-15): CR-80 applied.'] },
    /already present in the base header/,
  ));

test('7. revision note only in the body fails', () =>
  fails({ bodyNote: NEW_NOTE }, /no revision note added/));

test('note without a revision token fails', () =>
  fails({ note: '> Revision note: CR-90 applied.' }, /no revision token/));

test('note citing no CR id fails', () =>
  fails({ note: '> Change-control revision 9.1 (2026-10-01): tidy wording.' }, /cites no change record/));

test('8. deleted authoritative file fails', () => fails({ status: 'D' }, /deleted/));

test('9. renamed authoritative file fails (rename or any non-A/M status)', () => {
  fails({ status: 'R' }, /renamed, copied or type-changed/);
  fails({ status: 'C' }, /renamed, copied or type-changed/);
});

test('a newly added authoritative file needs the same evidence', () => {
  passes({ status: 'A', headDoc: doc([NEW_NOTE]) });
  fails({ status: 'A', headDoc: doc([]) }, /no revision note added/);
});

// --- §7 keys and prefix collisions ------------------------------------------------------------

const fnote = (id) => `> Change-control revision 9.1 (2026-10-01): ${id} applied.`;
const fRec = (parent) => ({ [`${parent}-parent.md`]: `| Status | RESOLVED — follow-up item ${parent}-F1 RESOLVED (2026-10-04) |\n` });

test('10. qualified §7 key "CR-90-F1 2b" matches id CR-90-F1', () =>
  passes({
    note: fnote('CR-90-F1'),
    records: fRec('CR-90'),
    rows: [{ key: 'CR-90-F1 2b', errata: 'Matrix row `CR-90-F1 2b` in 2.2; no errata row (no passage superseded)' }],
    matrix: ['CR-90-F1 2b'],
  }));

test('11. prefix collisions: CR-90 does not match CR-900; CR-90-F1 does not match CR-90-F10', () => {
  fails({ rows: [{ key: 'CR-900' }], matrix: ['CR-900'] }, /binds this artifact to this revision/);
  fails({
    note: fnote('CR-90-F1'),
    records: fRec('CR-90'),
    rows: [{ key: 'CR-90-F10' }],
    matrix: ['CR-90-F10'],
  }, /binds this artifact to this revision/);
  // and CR-1 must not pick up CR-10's record file
  fails({ note: fnote('CR-1'), records: { 'CR-10-other.md': rec('ACCEPTED') }, rows: [{ key: 'CR-1' }], matrix: ['CR-1'] }, /no change record file/);
});

test('follow-up takes its OWN state from the parent record, not the parent’s state', () => {
  const open = fRec('CR-90');
  open['CR-90-parent.md'] = '| Status | RESOLVED — follow-up item CR-90-F1 (matrix) remains OPEN |\n';
  fails({ note: fnote('CR-90-F1'), records: open, rows: [{ key: 'CR-90-F1' }], matrix: ['CR-90-F1'] }, /OPEN does not authorize/);
  passes({ note: fnote('CR-90-F1'), records: fRec('CR-90'), rows: [{ key: 'CR-90-F1' }], matrix: ['CR-90-F1'] });
});

// --- human decider ----------------------------------------------------------------------------

test('12. human decider cell', () => {
  for (const ok of ['Engineering authority', 'Omar Abdulaziz (engineering authority)', 'product owner', 'Counsel', 'Gate owner']) {
    passes({ rows: [{ key: 'CR-90', decider: ok }] });
  }
  for (const bad of ['Omar Abdulaziz', 'Engineering authority (drafted by Claude)', 'Claude Fable 5.1 (drafting agent)', 'Codex', '', '—', '-']) {
    fails({ rows: [{ key: 'CR-90', decider: bad }] }, /human governance role/);
  }
});

// --- §2.2 matrix ------------------------------------------------------------------------------

test('13. missing §2.2 matrix row fails; a prefix-colliding row does not count', () => {
  fails({ matrix: [] }, /§2\.2/);
  fails({ matrix: ['CR-900'] }, /§2\.2/);
});

// --- errata (§7 "Matrix / errata" is the determinant) -----------------------------------------

test('14. negative declaration with no §6.4 row passes ("superseded" inside it is harmless)', () =>
  passes({ rows: [{ key: 'CR-90', errata: 'Matrix row in 2.2; no errata row (no passage superseded)' }] }));

test('15. positive declaration (cites 6.4) with a matching §6.4 row passes', () =>
  passes({
    rows: [{ key: 'CR-90', errata: 'Matrix row in 2.2; errata row "old wording" in 6.4' }],
    errata: ['CR-90 (engineering-authority decision)'],
  }));

test('16. positive declaration without a §6.4 row fails', () =>
  fails({ rows: [{ key: 'CR-90', errata: 'errata row in 6.4' }] }, /none cites it/));

test('17. negative declaration but a §6.4 row exists fails', () =>
  fails({ errata: ['CR-90 (decision)'] }, /declares no errata but a §6\.4 row/));

test('18. empty / dash / matrix-only errata cell fails closed', () => {
  for (const errata of ['', '—', 'Matrix row `CR-90` in 2.2']) {
    fails({ rows: [{ key: 'CR-90', errata }] }, /no explicit errata declaration/);
  }
});

test('19. "superseded" in the §7 Decision text is human-review territory, not a machine trigger', () =>
  passes({ rows: [{ key: 'CR-90', decision: 'The old wording is superseded by the new wording.' }] }));

test('21. "Superseded by" entry "CR-90-F1 Decision 2b" satisfies CR-90-F1; CR-900 and CR-90-F10 do not', () => {
  const base = {
    note: fnote('CR-90-F1'),
    records: fRec('CR-90'),
    rows: [{ key: 'CR-90-F1', errata: 'Matrix row in 2.2; errata row in 6.4' }],
    matrix: ['CR-90-F1'],
  };
  passes({ ...base, errata: ['CR-90-F1 Decision 2b (engineering-authority decision)'] });
  fails({ ...base, errata: ['CR-900 (decision)'] }, /none cites it/);
  fails({ ...base, errata: ['CR-90-F10 Decision 2b'] }, /none cites it/);
});

test('sibling qualified rows: an errata row for "CR-90-F1 Decision 2b" does not satisfy the unqualified CR-90-F1 row', () => {
  const rows = [
    { key: 'CR-90-F1 2b', errata: 'errata row in 6.4', artifacts: 'Domain Model rev. 8.0 → rev. 8.1' },
    { key: 'CR-90-F1', errata: 'Matrix row; no errata row (no passage superseded)' },
  ];
  // Unqualified row declares no errata; the only §6.4 row belongs to the "2b" sibling -> PASS.
  passes({ note: fnote('CR-90-F1'), records: fRec('CR-90'), rows, matrix: ['CR-90-F1', 'CR-90-F1 2b'], errata: ['CR-90-F1 Decision 2b'] });
});

// --- malformed register -----------------------------------------------------------------------

test('missing or malformed §7 / §6.4 fails closed', () => {
  fails({ reconText: '# Reconciliation fixture\n## 6.4 Errata\n' }, /§7 register/);
  const noCol = recon({ rows: [{ key: 'CR-90' }], matrix: ['CR-90'] }).replace('Matrix / errata', 'Something else');
  fails({ reconText: noCol }, /required column/);
  const noErrataTable = recon({ rows: [{ key: 'CR-90' }], matrix: ['CR-90'] }).replace('| Superseded by |', '| Replaced by |');
  fails({ reconText: noErrataTable }, /§6\.4/);
});

test('columns are located by name: reordering §7 columns still works', () => {
  let inRegister = false;
  const t = recon({ rows: [{ key: 'CR-90' }], matrix: ['CR-90'] })
    .split('\n')
    .map((l) => {
      if (l.startsWith('# 7.')) inRegister = true;
      if (!inRegister || !l.startsWith('| ')) return l;
      const c = l.split('|').slice(1, -1).map((s) => s.trim());
      const [a, b, d, e, f, g, h, i] = c; // CR, Date, Decided by, Decision, tags, artifacts, errata, follow-up
      return `| ${[h, a, g, b, d, e, f, i].join(' | ')} |`;
    })
    .join('\n');
  passes({ reconText: t });
});

// --- no bypass, notices -----------------------------------------------------------------------

test('22. no bypass: skip/label/override text does not switch the check off', () =>
  fails({
    headDoc: doc([BASE_NOTE], '[skip governance]\ngovernance-override: approved\nlabels: governance-exempt\n'),
  }, /no revision note added/));

test('notices: self-modifying and governance paths are reported but do not fail', () => {
  const r = evaluateChangeSet({
    changes: [
      { path: '.github/workflows/ci.yml', status: 'M' },
      { path: 'scripts/governance/check-commit-identity.mjs', status: 'M' },
      { path: 'CLAUDE.md', status: 'M' },
      { path: 'docs/decisions/CR-99-x.md', status: 'A' },
    ],
    readFile: () => null,
    readBase: () => null,
    listDir: () => [],
  });
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.notices.map((n) => [n.path, n.kind]));
  assert.match(by['.github/workflows/ci.yml'], /SELF_MODIFYING/);
  assert.match(by['scripts/governance/check-commit-identity.mjs'], /SELF_MODIFYING/);
  assert.match(by['CLAUDE.md'], /GOVERNANCE/);
  assert.match(by['docs/decisions/CR-99-x.md'], /GOVERNANCE/);
});

test('classifyPath', () => {
  assert.equal(classifyPath(`${AUTH}/x.md`).authoritative, true);
  assert.equal(classifyPath('docs/specifications/other.md').authoritative, false);
  assert.equal(classifyPath('src/index.ts').selfModifying, false);
});

// --- header-note errata corroboration (the §7 cell stays the determinant) ---------------------

const NEG_CELL = 'Matrix row `CR-90` in 2.2; no errata row (no passage superseded)';
const POS_CELL = 'Matrix row `CR-90` in 2.2; errata row in 6.4';
const POS = { rows: [{ key: 'CR-90', errata: POS_CELL }], errata: ['CR-90 (engineering-authority decision)'] };
const rev = (text) => `> Change-control revision 9.1 (2026-10-01): ${text}`;

test('H1. negative Domain Model §6.4 citation; negative cell, no row -> pass', () =>
  passes({
    note: rev('CR-90 applied — §6.4 paragraph "X [CR-90]" (resolver). No other text changed. Recorded in the Reconciliation Report §7.'),
  }));

test('H2. V1.4.6-like negative -> pass', () =>
  passes({
    note: rev('CR-90 applied (resolver contracts; read columns in Domain Model §6.4). No other text changed; no passage superseded. Recorded in the Reconciliation Report §7.'),
  }));

test('H3/H4. positive recorded clause: passes with the §6.4 row, fails without it', () => {
  const note = rev('CR-90 applied. Recorded in the Reconciliation Report §7 and §6.4.');
  passes({ ...POS, note });
  fails({ note, rows: POS.rows }, /none cites it|header note records errata/);
  // the header alone must not rescue a §7 cell that declares no errata
  fails({ note }, /header note records errata; §7\/§6\.4 do not/);
});

test('H5. explicit errata-register wording -> pass with row', () =>
  passes({ ...POS, note: rev('CR-90 applied. Recorded in the change-control register (§7) and errata register (§6.4).') }));

test('H6. Reconciliation-report style "errata row (6.4)" -> pass with row', () =>
  passes({ ...POS, note: rev('CR-90 recorded — change-control register entry (Section 7); matrix row CR-90 (2.2); errata row (6.4). All other content unchanged.') }));

test('H7/H8. explicit negative: passes without a §6.4 row, fails with one', () => {
  const note = rev('CR-90 applied. No passage is superseded, so no errata row.');
  passes({ note });
  const r = run({ note, errata: ['CR-90 (decision)'] });
  assert.equal(r.ok, false); // the negative §7 cell already conflicts with the row
  const r2 = run({ note, rows: [{ key: 'CR-90', errata: 'Matrix row in 2.2; no errata row' }], errata: ['CR-90 (decision)'] });
  assert.equal(r2.ok, false);
});

test('H8b. header declares no errata but §7 is positive with a row -> fails on the header', () => {
  const r = run({ ...POS, note: rev('CR-90 applied. No passage is superseded, so no errata row.') });
  assert.equal(r.ok, false);
  assert.match(r.failures.join('\n'), /header note declares no errata; §6\.4 names the record/);
});

test('H9. mixed note: a Domain Model §6.4 citation plus the recorded clause citing §6.4 -> pass', () =>
  passes({ ...POS, note: rev('CR-90 applied — §6.4 paragraph "X [CR-90]". Recorded in the Reconciliation Report §7 and §6.4.') }));

test('H10. contradictory note (positive recorded clause and "no passage superseded") fails', () =>
  fails(
    { ...POS, note: rev('CR-90 applied. No passage is superseded. Recorded in the Reconciliation Report §7 and §6.4.') },
    /header note contradicts itself/,
  ));

test('H11. note with neither claim imposes no extra condition (valid §7/§6.4 passes)', () => {
  passes({ note: rev('CR-90 applied.') });
  passes({ ...POS, note: rev('CR-90 applied.') });
});

test('H12. a bare 6.4 / §6.4 outside the recorded clause is not an errata claim', () => {
  passes({ note: rev('CR-90 applied — Domain Model §6.4 and Wave 1 6.4 cited.') });
  passes({ ...POS, note: rev('CR-90 applied — Domain Model §6.4.') });
});

test('only the LAST "Recorded in the Reconciliation Report" clause is read', () =>
  passes({
    note: rev('CR-90 applied. Recorded in the Reconciliation Report §6.4 earlier. Recorded in the Reconciliation Report §7.'),
  }));
