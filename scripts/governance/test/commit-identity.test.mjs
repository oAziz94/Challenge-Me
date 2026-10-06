import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateCommit,
  evaluateCommits,
  HISTORICAL_EXEMPT,
  REQUIRED_EMAIL,
  REQUIRED_NAME,
} from '../lib/commit-identity.mjs';

const good = () => ({
  hash: 'a'.repeat(40),
  authorName: REQUIRED_NAME,
  authorEmail: REQUIRED_EMAIL,
  committerName: REQUIRED_NAME,
  committerEmail: REQUIRED_EMAIL,
  message: 'docs: ordinary change\n\nBody text.\n',
});

test('conforming metadata passes', () => {
  const r = evaluateCommit(good());
  assert.equal(r.ok, true);
  assert.equal(r.exempt, false);
});

test('wrong author name fails', () => {
  const r = evaluateCommit({ ...good(), authorName: 'Omar Abdulaziz' });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(), /author name/);
});

test('wrong author email fails (including the personal address)', () => {
  const r = evaluateCommit({ ...good(), authorEmail: 'someone@example.com' });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(), /author email/);
});

test('wrong committer email fails', () => {
  const r = evaluateCommit({ ...good(), committerEmail: 'noreply@github.com' });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(), /committer email/);
});

test('AI Co-Authored-By trailer fails (several spellings)', () => {
  for (const trailer of [
    'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>',
    'co-authored-by: Codex <codex@openai.com>',
    'Co-authored-by: dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    'Co-Authored-By: AI Assistant <assistant@example.com>',
  ]) {
    const r = evaluateCommit({ ...good(), message: `docs: x\n\n${trailer}\n` });
    assert.equal(r.ok, false, trailer);
    assert.match(r.violations.join(), /Co-Authored-By/);
  }
});

test('AI tool attribution footer fails', () => {
  const r = evaluateCommit({ ...good(), message: 'docs: x\n\nGenerated with Claude Code\n' });
  assert.equal(r.ok, false);
});

test('AI or bot committer name fails', () => {
  const r = evaluateCommit({ ...good(), committerName: 'github-actions[bot]' });
  assert.equal(r.ok, false);
});

test('a human Co-Authored-By trailer is not rejected by the AI rule', () => {
  const r = evaluateCommit({ ...good(), message: 'docs: x\n\nCo-authored-by: Jane Doe <jane@example.com>\n' });
  assert.equal(r.ok, true);
});

test('the four historical commits are exempt even with non-conforming metadata', () => {
  assert.deepEqual(
    HISTORICAL_EXEMPT.map((h) => h.slice(0, 7)),
    ['8b39463', 'dabaa0c', '3ab1174', '496c5c0'],
  );
  for (const hash of HISTORICAL_EXEMPT) {
    const r = evaluateCommit({
      hash,
      authorName: 'oAziz94',
      authorEmail: 'personal@example.com',
      committerName: 'oAziz94',
      committerEmail: 'personal@example.com',
      message: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    });
    assert.equal(r.exempt, true);
    assert.equal(r.ok, true);
  }
});

test('exemption is by full hash only: an abbreviated hash is not exempt', () => {
  const r = evaluateCommit({ ...good(), hash: '8b39463', authorName: 'x' });
  assert.equal(r.ok, false);
});

test('evaluateCommits fails when any one commit fails', () => {
  assert.equal(evaluateCommits([good(), { ...good(), authorName: 'x' }]).ok, false);
  assert.equal(evaluateCommits([good(), good()]).ok, true);
});

// --- end to end through the CLI against a throwaway repository ---------------------------------

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-commit-identity.mjs');

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cm-identity-'));
  const run = (args, env = {}) =>
    execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });
  run(['init', '-q', '-b', 'main']);
  const commit = (msg, a = {}, c = {}) =>
    run(['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', msg], {
      GIT_AUTHOR_NAME: a.name ?? REQUIRED_NAME,
      GIT_AUTHOR_EMAIL: a.email ?? REQUIRED_EMAIL,
      GIT_COMMITTER_NAME: c.name ?? REQUIRED_NAME,
      GIT_COMMITTER_EMAIL: c.email ?? REQUIRED_EMAIL,
    });
  return { dir, run, commit };
}

function runCli(dir, range) {
  try {
    const out = execFileSync('node', [cli, range], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: String(e.stdout) };
  }
}

test('CLI: conforming commit passes; wrong identity, wrong committer and AI trailer each fail', () => {
  const { dir, run, commit } = makeRepo();
  try {
    commit('docs: base');
    const base = run(['rev-parse', 'HEAD']).trim();

    commit('docs: ok');
    assert.equal(runCli(dir, `${base}..HEAD`).code, 0);

    commit('docs: bad author', { name: 'Someone Else' });
    assert.equal(runCli(dir, 'HEAD~1..HEAD').code, 1);

    commit('docs: bad committer', {}, { email: 'other@example.com' });
    assert.equal(runCli(dir, 'HEAD~1..HEAD').code, 1);

    commit('docs: trailer\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
    const r = runCli(dir, 'HEAD~1..HEAD');
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out, /anthropic/, 'output must not echo message content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: an unresolvable range is an error (exit 2), never a silent pass', () => {
  const { dir, commit } = makeRepo();
  try {
    commit('docs: base');
    assert.equal(runCli(dir, 'nonexistent..HEAD').code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
