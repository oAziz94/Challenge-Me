// Regression against the REAL repository material (read-only): the committed authoritative documents,
// the real change records, and the real Reconciliation Report in its real merge-base form.
// Synthetic fixtures alone missed that the real base report predates the §7 register; this file must not.
// Skipped (never failed) when the repository history is not available (for example a shallow checkout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { evaluateChangeSet } from '../lib/authoritative-path.mjs';

const DIR = 'docs/specifications/authoritative';
const FILES = {
  '01': `${DIR}/01_Domain_Model_and_Implementation_Contract_rev1.8.md`,
  '02': `${DIR}/02_Architecture_Decision_Records_V1.4.md`,
  '16': `${DIR}/16_Reconciliation_Report_rev3.md`,
};
// The first commit: the real Reconciliation Report there has no §7 register at all.
const ORIGIN = '8b39463f3874cb52292d87aa7cb936e273f7ab7a';

function tryGit(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r/g, '');
  } catch {
    return null;
  }
}

const root = tryGit('rev-parse', '--show-toplevel')?.trim() ?? null;
const git = (...args) => (root ? tryGit('-C', root, ...args) : null);
const readHead = (p) => git('show', `HEAD:${p}`);
const listDir = (d) => (git('ls-tree', '--name-only', 'HEAD', `${d}/`) ?? '').split('\n').filter(Boolean).map((p) => p.slice(d.length + 1));
const originRecon = git('show', `${ORIGIN}:${FILES['16']}`);
const headRecon = readHead(FILES['16']);
const available = Boolean(root && originRecon && headRecon && FILES['01'] && readHead(FILES['01']) && readHead(FILES['02']));

// The register rows removed: every CR binding becomes fresh (used where the changed file is the report itself).
const withoutCrRows = (t) => t.split('\n').filter((l) => !/^\| CR-\d/.test(l)).join('\n');
const NOTE = /^>\s*(Change-control revision|Revision)\s+\S*\d+\.\d/i;
const tokenOf = (n) => /(V?\d+(\.\d+)+)/.exec(n)[1];

function evaluateOneRevision(fileKey, note) {
  const path = FILES[fileKey];
  const head = readHead(path);
  const minus = head.split('\n').filter((l) => l !== note).join('\n');
  const readBase = (p) => {
    if (p === path) return fileKey === '16' ? withoutCrRows(minus) : minus;
    if (p === FILES['16']) return originRecon; // the REAL merge-base form: no §7 register
    return null;
  };
  return evaluateChangeSet({ changes: [{ path, status: 'M' }], readFile: readHead, readBase, listDir });
}

const replayNotes = [];
if (available) {
  for (const key of ['01', '02', '16']) {
    for (const note of readHead(FILES[key]).split('\n').filter((l) => NOTE.test(l) && /CR-/.test(l))) {
      replayNotes.push([key, note]);
    }
  }
}

test('real repository material is available for the real-shape regression', (t) => {
  if (!available) return t.skip('repository history is not available');
  assert.ok(replayNotes.length >= 16, `expected at least the 16 ratified revisions, found ${replayNotes.length}`);
  assert.ok(!/^# 7\./m.test(originRecon), 'the real merge-base report predates the §7 register');
  assert.match(headRecon, /^# 7\. Change-Control Register/m);
});

for (const [key, note] of replayNotes) {
  test(`real replay: ${key} revision ${tokenOf(note)} passes against the real records`, (t) => {
    if (!available) return t.skip('repository history is not available');
    const r = evaluateOneRevision(key, note);
    assert.deepEqual(r.failures, []);
    assert.equal(r.ok, true);
  });
}

function borrowed(fileKey, token, cr) {
  const path = FILES[fileKey];
  const head = readHead(path);
  const note = `> Change-control revision ${token} (2026-10-07): ${cr} applied by engineering-authority decision.`;
  const lines = head.split('\n');
  lines.splice(lines.findIndex((l) => l.startsWith('>')), 0, note, '>');
  const edited = lines.join('\n');
  return evaluateChangeSet({
    changes: [{ path, status: 'M' }],
    readFile: (p) => (p === path ? edited : readHead(p)),
    readBase: (p) => (p === path ? head : p === FILES['16'] ? withoutCrRows(headRecon) : null),
    listDir,
  });
}

for (const [label, fileKey, token, cr] of [
  ['Domain Model borrowing a Reconciliation Report token', '01', '3.3', 'CR-3'],
  ['Domain Model borrowing an ADR token', '01', 'V1.4.5', 'CR-5'],
  ['ADR borrowing a Domain Model token', '02', '1.8.3', 'CR-5'],
  ['ADR borrowing a Reconciliation Report token', '02', '3.5', 'CR-5'],
  ['Reconciliation Report borrowing a Domain Model token', '16', '1.8.3', 'CR-5'],
  ['Reconciliation Report borrowing an ADR token', '16', 'V1.4.5', 'CR-5'],
]) {
  test(`real cross-artifact attack fails: ${label}`, (t) => {
    if (!available) return t.skip('repository history is not available');
    const r = borrowed(fileKey, token, cr);
    assert.equal(r.ok, false);
    assert.match(r.failures.join('\n'), /binds this artifact to this revision/);
  });
}
