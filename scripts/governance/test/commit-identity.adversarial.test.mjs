// F-02: commit messages must never be able to act as framing for the commit-identity check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLI_IDENTITY, GOOD_EMAIL, makeRepo, runCli } from './repo.mjs';

const EXEMPT_HASH = '8b39463f3874cb52292d87aa7cb936e273f7ab7a';
const commitLines = (out) => out.split('\n').filter((l) => /^[0-9a-f]{12} /.test(l));

function withRepo(fn) {
  const repo = makeRepo();
  try {
    repo.commitFiles({ 'a.txt': 'base\n' }, 'base');
    return fn(repo, repo.head());
  } finally {
    repo.cleanup();
  }
}

test('F-02: a literal US (0x1F) before an AI trailer cannot hide it', () =>
  withRepo((repo, base) => {
    repo.commitMessage('docs: x\x1fCo-Authored-By: Claude <noreply@anthropic.com>\n');
    const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
    assert.equal(r.code, 1);
    assert.equal(commitLines(r.out).length, 1);
    assert.doesNotMatch(r.out, /anthropic/);
  }));

test('F-02: a trailer on its own line after control characters still fails', () =>
  withRepo((repo, base) => {
    repo.commitMessage('docs: x\n\x1e\x1f\nCo-authored-by: Codex <codex@openai.com>\n');
    assert.equal(runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir).code, 1);
  }));

test('F-02: a literal RS (0x1E) cannot forge an exempt record, and cannot hide a violating commit', () =>
  withRepo((repo, base) => {
    const forged = `docs: y\n\x1e${EXEMPT_HASH}\x1foAziz94\x1f${GOOD_EMAIL}\x1foAziz94\x1f${GOOD_EMAIL}\x1fok\n`;
    repo.commitMessage(forged, { a: { name: 'Someone Else' } });
    const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
    assert.equal(r.code, 1);
    assert.equal(commitLines(r.out).length, 1, 'exactly the one real commit is evaluated');
    assert.doesNotMatch(r.out, /EXEMPT/);
  }));

test('F-02: control characters alone are not a violation, and are not read as records', () =>
  withRepo((repo, base) => {
    repo.commitMessage(`docs: z\n\x1e${EXEMPT_HASH}\x1fignored\x1f\n`);
    const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
    assert.equal(r.code, 0, r.out);
    assert.equal(commitLines(r.out).length, 1);
    assert.doesNotMatch(r.out, /EXEMPT/);
  }));

test('F-02: an ordinary prohibited trailer still fails and an ordinary human message passes', () =>
  withRepo((repo, base) => {
    repo.commitMessage('docs: plain human message\n\nBody.\n');
    assert.equal(runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir).code, 0);
    repo.commitMessage('docs: with trailer\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
    assert.equal(runCli(CLI_IDENTITY, ['HEAD~1..HEAD'], repo.dir).code, 1);
  }));

test('F-02: every commit in a multi-commit range is evaluated individually', () =>
  withRepo((repo, base) => {
    repo.commitMessage('docs: one\n');
    repo.commitMessage('docs: two\n', { c: { email: 'other@example.com' } });
    repo.commitMessage('docs: three\n');
    const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
    assert.equal(r.code, 1);
    assert.equal(commitLines(r.out).length, 3);
    assert.equal(commitLines(r.out).filter((l) => l.includes('FAIL')).length, 1);
  }));

test('F-02: option-like or unresolvable ranges are errors (exit 2), never a pass', () =>
  withRepo((repo) => {
    assert.equal(runCli(CLI_IDENTITY, ['--all'], repo.dir).code, 2);
    assert.equal(runCli(CLI_IDENTITY, ['nonexistent..HEAD'], repo.dir).code, 2);
    assert.equal(runCli(CLI_IDENTITY, [], repo.dir).code, 2);
  }));

// =============================================================================================
// F-10 — Unicode / invisible-character obfuscation of prohibited AI attribution
// =============================================================================================

const obfuscated = [
  ['zero-width space inside Codex (trailer)', 'docs: x\n\nCo-Authored-By: C\u200Bodex <codex@example.com>\n'],
  ['zero-width space inside Codex (footer)', 'docs: x\n\nGenerated with C\u200Bodex\n'],
  ['zero-width joiner inside Claude', 'docs: x\n\nCo-Authored-By: Cl\u200Daude <noreply@example.com>\n'],
  ['zero-width non-joiner', 'docs: x\n\nCo-Authored-By: Co\u200Cdex <x@example.com>\n'],
  ['word joiner', 'docs: x\n\nCo-Authored-By: Cod\u2060ex <x@example.com>\n'],
  ['BOM inside the name', 'docs: x\n\nCo-Authored-By: Cla\uFEFFude <x@example.com>\n'],
  ['soft hyphen', 'docs: x\n\nCo-Authored-By: Cod\u00ADex <x@example.com>\n'],
  ['no-break space inside Codex', 'docs: x\n\nCo-Authored-By: C\u00A0odex <x@example.com>\n'],
  ['em space inside Codex', 'docs: x\n\nCo-Authored-By: C\u2003odex <x@example.com>\n'],
  ['ideographic space inside Claude', 'docs: x\n\nCo-Authored-By: Cl\u3000aude <x@example.com>\n'],
  ['line separator inside Codex', 'docs: x\n\nCo-Authored-By: Co\u2028dex <x@example.com>\n'],
  ['tab inside Codex', 'docs: x\n\nCo-Authored-By: Co\tdex <x@example.com>\n'],
  ['unusual space then no boundary (Codex + NBSP + Bot)', 'docs: x\n\nCo-Authored-By: Codex\u00A0Bot <x@example.com>\n'],
  ['combining grapheme joiner', 'docs: x\n\nCo-Authored-By: C\u034Fodex <x@example.com>\n'],
  ['variation selector', 'docs: x\n\nCo-Authored-By: Codex\uFE0F <x@example.com>\n'],
  ['full-width letters', 'docs: x\n\nCo-Authored-By: \uFF23\uFF4F\uFF44\uFF45\uFF58 <x@example.com>\n'],
  ['invisible filler', 'docs: x\n\nCo-Authored-By: Co\u3164dex <x@example.com>\n'],
  ['obfuscated trailer key', 'docs: x\n\nCo\u200B-Authored\u200D-By: Codex <x@example.com>\n'],
  ['footer with an unusual space', 'docs: x\n\nGenerated\u00A0with Claude Code\n'],
];

for (const [label, message] of obfuscated) {
  test(`F-10: ${label} fails end to end and the message is not echoed`, () =>
    withRepo((repo, base) => {
      repo.commitMessage(message);
      const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
      assert.equal(r.code, 1, r.out);
      assert.equal(commitLines(r.out).length, 1);
      assert.doesNotMatch(r.out, /odex|laude|example\.com|Generated/i);
    }));
}

test('F-10: legitimate human co-authors and ordinary messages are still allowed', () =>
  withRepo((repo, base) => {
    for (const message of [
      'docs: ordinary\n\nBody text with unicode: café, naïve, 日本語, emoji 🙂.\n',
      'docs: human co-author\n\nCo-authored-by: Jane Doe <jane@example.com>\n',
      'docs: accented human co-author\n\nCo-authored-by: José Müller <jose@example.com>\n',
      'docs: human with zero-width noise\n\nCo-authored-by: Jane\u200B Doe <jane@example.com>\n',
      'docs: nbsp in a human name\n\nCo-authored-by: Jane\u00A0Doe <jane@example.com>\n',
    ]) {
      repo.commitMessage(message);
      const r = runCli(CLI_IDENTITY, ['HEAD~1..HEAD'], repo.dir);
      assert.equal(r.code, 0, `${message}\n${r.out}`);
    }
    assert.equal(runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir).code, 0);
  }));

test('F-10: the 0x1E / 0x1F adversarial cases still hold together with Unicode obfuscation', () =>
  withRepo((repo, base) => {
    repo.commitMessage('docs: x\x1fCo-Authored-By: C\u200Bodex <x@example.com>\n');
    const r = runCli(CLI_IDENTITY, [`${base}..HEAD`], repo.dir);
    assert.equal(r.code, 1);
    assert.equal(commitLines(r.out).length, 1);
  }));
