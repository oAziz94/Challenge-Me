// CLI-level tests for check-authoritative-path.mjs against throwaway Git repositories (F-03, F-08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { AUTH, BASE_NOTE, DOC, doc, scenario } from './fixtures.mjs';
import { CLI_PATH, makeRepo, runCli } from './repo.mjs';

/** Commits the scenario's base files, then its head files; returns the two commit ids. */
function materialize(repo, s) {
  const base = repo.commitFiles(Object.fromEntries(s.baseFiles), 'base');
  const headFiles = Object.fromEntries(s.headFiles);
  for (const p of s.baseFiles.keys()) if (!s.headFiles.has(p)) headFiles[p] = null;
  const head = repo.commitFiles(headFiles, 'head');
  return { base, head };
}

function withScenario(o, fn) {
  const repo = makeRepo();
  try {
    const ids = materialize(repo, scenario(o));
    return fn(repo, ids);
  } finally {
    repo.cleanup();
  }
}

const UNICODE_DOC = `${AUTH}/01_Dömain_Mödel_日本 x.md`;

test('CLI: well-formed fresh evidence passes (exit 0)', () =>
  withScenario({}, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /authoritative-path check: PASS/);
  }));

test('CLI: an authoritative change with no evidence fails (exit 1)', () =>
  withScenario({ headDoc: doc([BASE_NOTE], 'edited body') }, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /no revision note added/);
  }));

test('CLI: a non-authoritative change passes and reports the path as untouched', () => {
  const repo = makeRepo();
  try {
    const base = repo.commitFiles({ 'README.md': 'one\n' }, 'base');
    const head = repo.commitFiles({ 'README.md': 'two\n' }, 'head');
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 0);
    assert.match(r.out, /authoritative path: not touched/);
  } finally {
    repo.cleanup();
  }
});

// A non-ASCII name can never be an exactly-mapped authoritative file, so it must be classified as
// authoritative (by its real name, not Git's quoted form) and then fail the exact-mapping rule.
test('F-03: a non-ASCII authoritative filename is classified by its real name and fails closed', () =>
  withScenario({ path: UNICODE_DOC, headDoc: doc([BASE_NOTE], 'edited'), changes: [] }, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no supported artifact mapping/);
  }));

test('F-03: a non-ASCII authoritative filename fails closed even with otherwise valid evidence', () =>
  withScenario({ path: UNICODE_DOC, changes: [] }, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no supported artifact mapping/);
  }));

test('F-03: the result does not depend on the working directory (repository-root relative)', () =>
  withScenario({ headDoc: doc([BASE_NOTE], 'edited body') }, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], join(repo.dir, 'docs', 'specifications'));
    assert.equal(r.code, 1, r.out);
  }));

test('F-03: deleting an authoritative file fails', () =>
  withScenario({ status: 'D' }, (repo, { base, head }) => {
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /deleted/);
  }));

test('F-03: renaming an authoritative file fails (delete + add, or R/C records)', () => {
  const repo = makeRepo();
  try {
    const base = repo.commitFiles({ [DOC]: doc([BASE_NOTE]) }, 'base');
    repo.git(['mv', DOC, `${AUTH}/01_Domain_Model_renamed.md`]);
    repo.git(['commit', '-q', '-m', 'rename']);
    const r = runCli(CLI_PATH, [base, 'HEAD'], repo.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /deleted|renamed/);
  } finally {
    repo.cleanup();
  }
});

test('F-03: pathnames with quotes, tabs and newlines are classified by their real names and cannot forge output', (t) => {
  const repo = makeRepo();
  try {
    const base = repo.commitFiles({ 'README.md': 'one\n' }, 'base');
    let head;
    try {
      repo.commitIndexOnly(`${AUTH}/01_a"q"\tb\nc.md`, 'edited\n', 'authoritative hostile name');
      repo.commitIndexOnly('.github/wor\tk\nflow.yml', 'x\n', 'governance hostile name');
      head = repo.head();
    } catch {
      t.skip('this platform/Git refuses such pathnames in the index');
      return;
    }
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL .*no supported artifact mapping/);
    // Hostile names are printed JSON-escaped: one NOTICE line per path, no forged verdict lines.
    const lines = r.out.split('\n');
    assert.equal(lines.filter((l) => l.startsWith('NOTICE ')).length, 2);
    assert.equal(lines.filter((l) => /^authoritative-path check: /.test(l)).length, 1);
    assert.match(r.out, /NOTICE ".*\.github\/wor\\tk\\nflow\.yml"/);
  } finally {
    repo.cleanup();
  }
});

test('CLI: unresolvable or option-like refs are errors (exit 2), never a pass', () => {
  const repo = makeRepo();
  try {
    repo.commitFiles({ 'README.md': 'one\n' }, 'base');
    assert.equal(runCli(CLI_PATH, ['nonexistent', 'HEAD'], repo.dir).code, 2);
    assert.equal(runCli(CLI_PATH, ['--all', 'HEAD'], repo.dir).code, 2);
    assert.equal(runCli(CLI_PATH, ['HEAD'], repo.dir).code, 2);
  } finally {
    repo.cleanup();
  }
});

test('CLI: Reconciliation Report evidence already present at the base cannot pre-authorize a later edit', () => {
  // Same evidence committed in B: the head edit gets no fresh §7 binding.
  const repo = makeRepo();
  try {
    const s = scenario({ baseRows: [{ key: 'CR-90' }], baseMatrix: ['CR-90'] });
    const { base, head } = materialize(repo, s);
    const r = runCli(CLI_PATH, [base, head], repo.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /already existed at the merge base/);
  } finally {
    repo.cleanup();
  }
});
