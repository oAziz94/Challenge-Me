// The pre-publication scanner gate: a scanner that cannot find a canary, or real scans that do not use the same
// detection semantics and complete coverage, must never produce a trusted "clean".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_CONFIG,
  PINNED_VERSION,
  assertOutside,
  countCommitsWithAddedText,
  defaultGit,
  gateEnv,
  generateCanaries,
  expectedHistoryCommits,
  makeOwned,
  makeScannerRunner,
  parseBatch,
  parseBatchCheck,
  parseBytesScanned,
  parseCommitsScanned,
  parseFsckUnreachable,
  parseLsTreeZ,
  parseRefTips,
  parseRevListObjects,
  runPrepublicationGate,
  verifyScanner,
} from '../lib/scanner-gate.mjs';
import { makeRepo } from './repo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GATE_CLI = join(here, '..', 'scanner-gate.mjs');
const RULE_BY_FILE = {
  'canary-github.txt': 'github-pat',
  'canary-aws.txt': 'aws-access-token',
  'canary-anthropic.txt': 'anthropic-api-key',
  'canary-key.pem.txt': 'private-key',
};
const tempDirs = (prefix) => readdirSync(tmpdir()).filter((n) => n.startsWith(prefix)).length;
const failed = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);
const byName = (r, re) => r.checks.find((c) => re.test(c.name));

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push({ name, path: p, size: statSync(p).size, content: readFileSync(p, 'latin1') });
  }
  return out;
}

/** Non-merge commits with at least one added line, counted from `git log -p` (the rule observed for gitleaks 8.30.1). */
function addingCommits(dir) {
  const out = execFileSync('git', ['log', '--all', '--no-merges', '-p', '-U0', '--format=@@%H'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  let n = 0;
  let counted = false;
  for (const line of out.split('\n')) {
    if (/^@@[0-9a-f]{40}$/.test(line)) counted = false;
    else if (!counted && line.startsWith('+') && !line.startsWith('+++')) {
      counted = true;
      n += 1;
    }
  }
  return n;
}

/**
 * A fake scanner that behaves like a working one (detects canary file names and planted tokens, exits 1 on findings,
 * redacts, reports honest commit and byte counts), with switches that break exactly one property.
 */
function fakeScanner(o = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'version') return { code: 0, out: o.version ?? PINNED_VERSION };
    const mode = args[0];
    const path = mode === 'git' ? args[2] : args[1];
    const reportAt = args[args.indexOf('--report-path') + 1];
    const files = walk(path);
    const missed = new Set(o.miss ?? []);
    const findings = [];
    for (const f of files) {
      const rule = RULE_BY_FILE[f.name] ?? (/ghp_[A-Za-z0-9]{36}/.test(f.content) ? 'github-pat' : null);
      if (rule && !o.silentClean && !missed.has(rule)) findings.push({ RuleID: rule, File: f.name, Secret: 'REDACTED' });
    }
    writeFileSync(reportAt, JSON.stringify(findings));
    let bytes = files.reduce((s, f) => s + f.size, 0);
    const isBlobs = path.endsWith(`${sep}blobs`);
    if (isBlobs && o.blobBytes !== undefined) bytes = o.blobBytes;
    else if (isBlobs) bytes += o.blobDelta ?? 0;
    if (mode === 'dir' && !isBlobs && !path.includes('canary') && !path.includes('clean') && o.treeBytes !== undefined) bytes = o.treeBytes;
    const lines = [];
    if (mode === 'git') {
      const isCanary = path.includes('canary');
      // Canary history is two plain content commits: the scanner reports every commit. Real history: like gitleaks 8.30.1,
      // only NON-MERGE commits that add at least one line are counted (independent of the gate's own numstat logic).
      const real = isCanary
        ? Number(execFileSync('git', ['rev-list', '--all', '--count'], { cwd: path, encoding: 'utf8' }).trim())
        : addingCommits(path);
      if (!isCanary && o.commitLines) lines.push(...o.commitLines);
      else lines.push(`INF ${isCanary ? real : (o.commits ?? real)} commits scanned.`);
    }
    lines.push(`INF scanned ~${bytes} bytes (x) in 1ms`);
    lines.push(findings.length ? `WRN leaks found: ${findings.length}` : 'INF no leaks found');
    const leaked = o.leakValue && findings.length ? `\n${files.find((f) => RULE_BY_FILE[f.name]).content}` : '';
    return { code: findings.length ? (o.exitZero ? 0 : 1) : 0, out: lines.join('\n') + leaked };
  };
  return { run, calls };
}

function cleanRepo(extra = {}) {
  const repo = makeRepo();
  repo.commitFiles({ 'a.txt': 'alpha\n', 'b.txt': 'bravo\n', ...extra }, 'one');
  repo.commitFiles({ 'c.txt': 'charlie\n', 'sub/d.txt': 'delta\n' }, 'two');
  repo.commitFiles({ 'a.txt': 'alpha changed\n' }, 'three');
  return repo;
}
const withCleanRepo = (fn, extra) => {
  const repo = cleanRepo(extra);
  try {
    return fn(repo);
  } finally {
    repo.cleanup();
  }
};

// ---------------------------------------------------------------------------------------------
// Canary (unchanged behaviour) and metric parsing

test('canaries are random per run, correctly shaped, and never fixed strings', () => {
  const a = generateCanaries();
  const b = generateCanaries();
  assert.deepEqual(a.map((c) => c.rule), ['github-pat', 'aws-access-token', 'anthropic-api-key', 'private-key']);
  assert.match(a[0].secret, /^ghp_[A-Za-z0-9]{36}$/);
  assert.match(a[1].secret, /^AKIA[A-Z2-7]{16}$/);
  assert.match(a[2].secret, /^sk-ant-api03-[A-Za-z0-9_-]{93}AA$/);
  assert.ok(a.every((c, i) => c.secret !== b[i].secret));
  const source = readFileSync(join(here, '..', 'lib', 'scanner-gate.mjs'), 'utf8');
  assert.ok(!a.some((c) => source.includes(c.secret)), 'no canary value is written into the source');
});

test('metric parsing is anchored to whole summary lines and fails closed when ambiguous', () => {
  assert.equal(parseCommitsScanned('INF 7 commits scanned.'), 7);
  assert.equal(parseCommitsScanned('12:44PM INF 1 commits scanned.'), 1);
  assert.equal(parseCommitsScanned('\u001b[32mINF\u001b[0m 1 commit scanned.'), 1);
  assert.equal(parseCommitsScanned('INF 0 commits scanned.'), 0);
  assert.equal(parseCommitsScanned('nothing'), null);
  assert.equal(parseBytesScanned('12:44PM INF scanned ~2054744 bytes (2.05 MB) in 673ms'), 2054744);
  assert.equal(parseBytesScanned('INF scanned ~0 bytes (0) in 1.5ms'), 0);
  assert.equal(parseBytesScanned('nothing'), null);
  // unanchored text, embedded text and forged look-alikes are not metrics
  assert.equal(parseBytesScanned('see "scanned ~999 bytes (x) in 1ms" in a path'), null);
  assert.equal(parseCommitsScanned('ERR 5 commits scanned. and more'), null);
  assert.equal(parseCommitsScanned('WRN file name 9 commits scanned.'), null);
  // several conflicting values: ambiguous, so null; repeated identical values are fine
  assert.equal(parseCommitsScanned('INF 3 commits scanned.\nINF 4 commits scanned.'), null);
  assert.equal(parseBytesScanned('INF scanned ~10 bytes (10 bytes) in 1ms\nINF scanned ~11 bytes (11 bytes) in 1ms'), null);
  assert.equal(parseCommitsScanned('INF 3 commits scanned.\nINF 3 commits scanned.'), 3);
});

test('a functioning scanner passes the canary and the temporary canaries are deleted', () => {
  const before = tempDirs('cm-canary-');
  const r = verifyScanner({ run: fakeScanner().run });
  assert.deepEqual(failed(r), []);
  assert.equal(r.ok, true);
  assert.equal(tempDirs('cm-canary-'), before, 'no canary directory is left behind');
});

test('canary failures: clean-for-canary, missed rule, exit 0, value echoed, zero commits, wrong version', () => {
  assert.equal(verifyScanner({ run: fakeScanner({ silentClean: true }).run }).ok, false);
  for (const rule of ['github-pat', 'aws-access-token', 'anthropic-api-key', 'private-key']) {
    assert.ok(failed(verifyScanner({ run: fakeScanner({ miss: [rule] }).run })).includes(`dir canary detected: ${rule}`), rule);
  }
  assert.ok(failed(verifyScanner({ run: fakeScanner({ exitZero: true }).run })).includes('dir canary exits non-zero (1)'));
  const leak = verifyScanner({ run: fakeScanner({ leakValue: true }).run });
  assert.ok(failed(leak).includes('dir canary output and report do not contain the canary value'));
  assert.doesNotMatch(JSON.stringify(leak), /ghp_[A-Za-z0-9]{36}|AKIA[A-Z2-7]{16}|sk-ant-api03-/);
  assert.ok(failed(verifyScanner({ run: fakeScanner({ version: '8.30.0' }).run })).includes('scanner version is the pinned version'));
});

test('the full gate runs no real scan when the canary fails', () => {
  withCleanRepo((repo) => {
    const { run, calls } = fakeScanner({ silentClean: true });
    const r = runPrepublicationGate({ run, repo: repo.dir });
    assert.equal(r.ok, false);
    assert.ok(failed(r).some((n) => /real scans skipped/.test(n)));
    assert.ok(!calls.some((a) => a.includes(repo.dir)), 'the real repository was never scanned');
  });
});

// ---------------------------------------------------------------------------------------------
// S-1: gate-owned settings on EVERY scanner invocation

test('S-1: the gate-owned config is exactly the default rules, with an empty ignore location', () => {
  assert.equal(GATE_CONFIG, '[extend]\nuseDefault = true\n');
  const root = mkdtempSync(join(tmpdir(), 'cm-owned-test-'));
  try {
    const o = makeOwned(root);
    assert.equal(readFileSync(o.cfg, 'utf8'), GATE_CONFIG);
    assert.deepEqual(readdirSync(o.ign), []);
    assert.deepEqual(o.args.slice(0, 3), ['--redact=100', '--no-banner', '--no-color']);
    assert.ok(o.args.includes('--ignore-gitleaks-allow'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('S-1: every scan, canary and real, carries the same gate-owned --config, --gitleaks-ignore-path and --ignore-gitleaks-allow, outside the repository', () => {
  const before = tempDirs('cm-gate-');
  withCleanRepo((repo) => {
    const { run, calls } = fakeScanner();
    const r = runPrepublicationGate({ run, repo: repo.dir });
    assert.deepEqual(failed(r), []);
    const scans = calls.filter((a) => a[0] === 'dir' || a[0] === 'git');
    assert.ok(scans.length >= 6, 'canary dir, canary git, clean control, tree, history, blobs');
    const value = (a, flag) => a[a.indexOf(flag) + 1];
    const cfgs = new Set(scans.map((a) => value(a, '--config')));
    const ignores = new Set(scans.map((a) => value(a, '--gitleaks-ignore-path')));
    assert.equal(cfgs.size, 1, 'one gate-owned config for every scan');
    assert.equal(ignores.size, 1, 'one gate-owned ignore location for every scan');
    for (const a of scans) {
      assert.ok(a.includes('--ignore-gitleaks-allow'), a.join(' '));
      assert.ok(a.includes('--redact=100'));
      assert.ok(value(a, '--config'));
      assert.ok(value(a, '--gitleaks-ignore-path'));
    }
    for (const p of [...cfgs, ...ignores]) assert.ok(!p.startsWith(repo.dir), 'gate-owned assets are outside the repository');
    // the real-repository scans are among them
    assert.ok(scans.some((a) => a[0] === 'dir' && a[1] === repo.dir));
    assert.ok(scans.some((a) => a[0] === 'git' && a[2] === repo.dir));
  });
  assert.equal(tempDirs('cm-gate-'), before, 'temporary assets are removed');
});

test('S-1: a repository .gitleaksignore (working tree or tracked, any directory) fails the gate even though the scanner would honour it', () => {
  withCleanRepo((repo) => {
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.deepEqual(failed(r), []);
  });
  withCleanRepo(
    (repo) => {
      const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
      assert.ok(failed(r).includes('repository has no .gitleaksignore (working tree or tracked)'));
    },
    { '.gitleaksignore': 'fingerprint\n' },
  );
  withCleanRepo(
    (repo) => {
      const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
      assert.ok(failed(r).includes('repository has no .gitleaksignore (working tree or tracked)'));
    },
    { 'deep/er/.gitleaksignore': 'fingerprint\n' },
  );
});

test('S-1: gate-owned setup that cannot be created fails closed', () => {
  assert.throws(() => makeOwned(join(tmpdir(), 'cm-does-not-exist-xyz', 'nested')));
});

// ---------------------------------------------------------------------------------------------
// Temp-path safety

test('temp safety: assertOutside rejects a location inside the repository', () => {
  withCleanRepo((repo) => {
    mkdirSync(join(repo.dir, 'inner'));
    assert.throws(() => assertOutside(repo.dir, join(repo.dir, 'inner')));
    assert.throws(() => assertOutside(repo.dir, repo.dir));
    assert.doesNotThrow(() => assertOutside(repo.dir, tmpdir()));
  });
});

test('temp safety: a gate whose temporary root would be inside the repository fails closed and scans nothing', () => {
  const { run, calls } = fakeScanner();
  const r = runPrepublicationGate({ run, repo: tmpdir() });
  assert.equal(r.ok, false);
  assert.ok(failed(r).includes('temporary location is outside the repository'));
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// S-2: object enumeration parsers fail closed

test('S-2: enumeration parsers accept only the exact shapes', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  assert.deepEqual([...parseRevListObjects(`${A}\n${B} path with spaces/file.txt\n`)], [A, B]);
  assert.throws(() => parseRevListObjects('garbage line\n'));
  assert.throws(() => parseRevListObjects(`${'a'.repeat(64)} sha256-style\n`));
  assert.throws(() => parseRevListObjects(`${A}x extra\n`));

  assert.deepEqual(parseRefTips(`${A} tree refs/codex/turn-diffs/x\n${B} commit refs/codex/y\n`), [
    { id: A, type: 'tree' },
    { id: B, type: 'commit' },
  ]);
  assert.throws(() => parseRefTips(`${A} tree refs/heads/main\n`));
  assert.throws(() => parseRefTips('junk\n'));

  assert.deepEqual(parseLsTreeZ(`100644 blob ${A}\ta.txt\x00160000 commit ${B}\tsub\x00`), [A]);
  assert.throws(() => parseLsTreeZ(`040000 tree ${A}\tdir\0`));
  assert.throws(() => parseLsTreeZ('junk\0'));

  assert.deepEqual(parseFsckUnreachable(`unreachable blob ${A}\nunreachable tree ${B}\n`), [A]);
  assert.throws(() => parseFsckUnreachable(`dangling blob ${A}\n`));
  assert.throws(() => parseFsckUnreachable(`unreachable blob ${'a'.repeat(64)}\n`));

  assert.equal(parseBatchCheck(`${A} blob 5\n`, [A]).get(A).size, 5);
  assert.throws(() => parseBatchCheck(`${A} missing\n`, [A]));
  assert.throws(() => parseBatchCheck(`${A} blob 5\n`, [A, B]));
  assert.throws(() => parseBatchCheck(`${B} blob 5\n`, [A]));

  const ok = Buffer.concat([Buffer.from(`${A} blob 3\n`), Buffer.from([0, 255, 1]), Buffer.from('\n')]);
  assert.equal(parseBatch(ok, [A]).get(A).content.length, 3);
  assert.throws(() => parseBatch(Buffer.from(`${A} blob 9\nabc\n`), [A]));
  assert.throws(() => parseBatch(Buffer.concat([ok, Buffer.from('extra')]), [A]));
  assert.throws(() => parseBatch(Buffer.from(`${A} missing\n`), [A]));
});

// ---------------------------------------------------------------------------------------------
// S-2: gate behaviour on a throwaway repository

test('S-2: a normal repository passes with exact byte equality and full source-set accounting', () => {
  withCleanRepo((repo) => {
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.deepEqual(failed(r), []);
    const cov = byName(r, /^blob coverage/);
    assert.match(cov.detail, /history \d+, refs\/codex refs \d+, refs\/codex \d+, unreachable objects \d+, unreachable \d+, union \d+, missing 0, uncovered 0/);
    const eq = byName(r, /scanned bytes equal/);
    const m = /expected (\d+), scanner reported (\d+)/.exec(eq.detail);
    assert.equal(m[1], m[2]);
  });
});

test('S-2: expected bytes greater or smaller than the scanner-reported bytes fails', () => {
  withCleanRepo((repo) => {
    for (const blobDelta of [-1, 1, -1000, 7]) {
      const r = runPrepublicationGate({ run: fakeScanner({ blobDelta }).run, repo: repo.dir });
      assert.equal(r.ok, false, `delta ${blobDelta}`);
      assert.ok(failed(r).some((n) => /scanned bytes equal/.test(n)));
    }
  });
});

const HISTORY_CHECK = 'history: scanner commit count equals the independently derived expected count';

test('S-2: a history scan that reports 0 commits, too few, or more than exist fails', () => {
  withCleanRepo((repo) => {
    // three commits that each add content: expected count 3, total 3
    for (const commits of [0, 1, 2, 4, 99]) {
      const r = runPrepublicationGate({ run: fakeScanner({ commits }).run, repo: repo.dir });
      assert.equal(r.ok, false, `commits ${commits}`);
      assert.ok(failed(r).includes(HISTORY_CHECK));
    }
    const ok = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.equal(ok.ok, true);
    assert.match(byName(ok, /^history: scanner commit count/).detail, /expected 3, total 3, scanner reported 3/);
  });
});

test('S-2: missing, ambiguous or unusable history evidence fails closed', () => {
  withCleanRepo((repo) => {
    const cases = {
      'no summary line at all': [],
      'two different summary lines': ['INF 3 commits scanned.', 'INF 2 commits scanned.'],
      'summary not anchored to a whole line': ['WRN seen 3 commits scanned. here'],
      'summary with trailing text': ['INF 3 commits scanned. and more'],
      'zero commits (the silent no-op report) for a repository with content': ['INF 0 commits scanned.'],
    };
    for (const [label, commitLines] of Object.entries(cases)) {
      const r = runPrepublicationGate({ run: fakeScanner({ commitLines }).run, repo: repo.dir });
      assert.equal(r.ok, false, label);
      assert.ok(failed(r).includes(HISTORY_CHECK), label);
    }
  });
});

test('S-2: a scanner that scanned a different (smaller) repository than the requested one fails', () => {
  withCleanRepo((repo) => {
    const r = runPrepublicationGate({ run: fakeScanner({ commits: 1 }).run, repo: repo.dir });
    assert.equal(r.ok, false);
    assert.match(byName(r, /^history: scanner commit count/).detail, /expected 3, total 3, scanner reported 1/);
  });
});

// ---------------------------------------------------------------------------------------------
// History shapes for which exact equality with `git rev-list --all --count` is impossible (gitleaks never counts empty,
// deletion-only or merge commits), each followed by an ordinary content commit

const ignoreExit = (fn) => {
  try {
    fn();
  } catch {
    /* a conflicting merge exits non-zero by design */
  }
};
const SHAPES = {
  'empty commit': (r) => r.commitFiles({}, 'empty'),
  'deletion-only commit': (r) => r.commitFiles({ 'b.txt': null }, 'delete b'),
  'clean two-parent merge': (r) => {
    r.git(['checkout', '-q', '-b', 'side']);
    r.commitFiles({ 's.txt': 'side\n' }, 'side work');
    r.git(['checkout', '-q', 'main']);
    r.commitFiles({ 'm.txt': 'main\n' }, 'main work');
    r.git(['merge', '-q', '--no-ff', '-m', 'merge side', 'side']);
  },
  'merge with conflict-resolution content': (r) => {
    r.commitFiles({ 'c.txt': 'base\n' }, 'c base');
    r.git(['checkout', '-q', '-b', 'side']);
    r.commitFiles({ 'c.txt': 'side\n' }, 'c side');
    r.git(['checkout', '-q', 'main']);
    r.commitFiles({ 'c.txt': 'main\n' }, 'c main');
    ignoreExit(() => r.git(['merge', '-q', '--no-ff', 'side']));
    r.commitFiles({ 'c.txt': 'resolved\n' }, 'merge with resolution');
  },
};
function shapedRepo(shape) {
  const repo = makeRepo();
  repo.commitFiles({ 'a.txt': 'alpha\n', 'b.txt': 'bravo\n' }, 'one');
  repo.commitFiles({ 'd.txt': 'delta\n' }, 'two');
  SHAPES[shape](repo);
  repo.commitFiles({ 'later.txt': 'later content\n' }, 'ordinary commit after the shape');
  return repo;
}
const counts = (r) => /expected (\d+), total (\d+), scanner reported (\d+)/.exec(byName(r, /^history: scanner commit count/).detail).slice(1).map(Number);

for (const shape of Object.keys(SHAPES)) {
  test(`history shape (${shape}, then an ordinary commit): the gate passes although the scanner count is below the commit count`, () => {
    const repo = shapedRepo(shape);
    try {
      const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
      assert.deepEqual(failed(r), []);
      const [expected, total, reported] = counts(r);
      assert.ok(reported < total, `equality with the commit count would have rejected this history (${reported} vs ${total})`);
      assert.equal(reported, expected);
      const zero = runPrepublicationGate({ run: fakeScanner({ commits: 0 }).run, repo: repo.dir });
      assert.ok(failed(zero).includes(HISTORY_CHECK), 'a scanner that scanned nothing still fails');
      const few = runPrepublicationGate({ run: fakeScanner({ commits: expected - 1 }).run, repo: repo.dir });
      assert.ok(failed(few).includes(HISTORY_CHECK), 'one commit fewer than expected still fails');
      // expected < expected + 1 <= total: a value inside the old range, below the total commit count, must still fail
      assert.ok(expected + 1 <= total);
      const plusOne = runPrepublicationGate({ run: fakeScanner({ commits: expected + 1 }).run, repo: repo.dir });
      assert.ok(failed(plusOne).includes(HISTORY_CHECK), 'one commit more than expected fails although it does not exceed the total');
      const many = runPrepublicationGate({ run: fakeScanner({ commits: total + 1 }).run, repo: repo.dir });
      assert.ok(failed(many).includes(HISTORY_CHECK), 'more commits than exist still fails');
    } finally {
      repo.cleanup();
    }
  });
}

test('history shape: a repository whose every commit is empty has expected count 0, and the scanner must still report a summary', () => {
  const repo = makeRepo();
  repo.commitFiles({}, 'empty one');
  repo.commitFiles({}, 'empty two');
  try {
    const ok = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.ok(!failed(ok).includes(HISTORY_CHECK), 'an all-empty history is accepted by the history check (the empty tree is rejected by the separate tree check)');
    assert.deepEqual(counts(ok), [0, 2, 0]);
    const silent = runPrepublicationGate({ run: fakeScanner({ commitLines: [] }).run, repo: repo.dir });
    assert.ok(failed(silent).includes(HISTORY_CHECK), 'no summary line fails');
    const tooMany = runPrepublicationGate({ run: fakeScanner({ commits: 3 }).run, repo: repo.dir });
    assert.ok(failed(tooMany).includes(HISTORY_CHECK));
    const plusOne = runPrepublicationGate({ run: fakeScanner({ commits: 1 }).run, repo: repo.dir });
    assert.ok(failed(plusOne).includes(HISTORY_CHECK), 'expected 0, total 2: a count of 1 fails although it is below the total');
  } finally {
    repo.cleanup();
  }
});

test('history expectation: renames, binary and deletion-only commits are not counted; one per commit, not per file', () => {
  const h = (n) => `@@${String(n).repeat(40)}`;
  assert.equal(countCommitsWithAddedText(''), 0);
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n${h(2)}\n`), 0, 'empty commits');
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n0\t3\tb.txt\n`), 0, 'deletion only');
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n-\t-\tx.bin\n`), 0, 'binary only');
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n0\t0\told.txt => new.txt\n`), 0, 'pure rename');
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n2\t1\ta.txt\n4\t0\tb.txt\n${h(2)}\n\n1\t0\tc.txt\n`), 2, 'one per commit');
  assert.equal(countCommitsWithAddedText(`${h(1)}\n\n-\t-\tx.bin\n1\t0\ty.txt\n`), 1, 'mixed commit');
});

test('history expectation: unparseable git log output fails closed', () => {
  const h = `@@${'a'.repeat(40)}`;
  for (const bad of ['2\t1\ta.txt\n', `${h}\nnot a record\n`, `${h}\n1\t1\n`, `${h}\n1 2 a.txt\n`, `@@${'a'.repeat(64)}\n`, `${h}\n\n+1\t0\ta.txt\n`]) {
    assert.throws(() => countCommitsWithAddedText(bad), /unparseable/, JSON.stringify(bad));
  }
  // a path that imitates a commit header cannot create one: records start with digits or '-', then a tab
  assert.equal(countCommitsWithAddedText(`${h}\n\n0\t1\t@@${'b'.repeat(40)}\n`), 0);
  assert.throws(() => expectedHistoryCommits(() => 'x'), /unparseable commit count/);
  assert.throws(() => expectedHistoryCommits((a) => (a[0] === 'rev-list' ? '1\n' : `${h}\n1\t0\ta\n@@${'c'.repeat(40)}\n1\t0\tb\n`)), /inconsistent/);
});

test('S-2: a current-tree scan that reports 0 bytes fails', () => {
  withCleanRepo((repo) => {
    const r = runPrepublicationGate({ run: fakeScanner({ treeBytes: 0 }).run, repo: repo.dir });
    assert.ok(failed(r).includes('current tree: scanned a non-zero number of bytes'));
  });
});

test('S-2: refs/codex and unreachable blobs are materialized, accounted for, and a 0-byte scan of them fails', () => {
  withCleanRepo((repo) => {
    const tree = repo.git(['rev-parse', 'HEAD^{tree}']).trim();
    repo.git(['update-ref', 'refs/codex/turn-diffs/test', tree]);
    const unreachable = repo.git(['hash-object', '-w', '--stdin'], { input: 'unreachable content\n' }).trim();
    const ok = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.deepEqual(failed(ok), []);
    const detail = byName(ok, /^blob coverage/).detail;
    assert.match(detail, /refs\/codex [1-9]/);
    assert.match(detail, /unreachable [1-9]/);
    assert.ok(unreachable.length === 40);
    const zero = runPrepublicationGate({ run: fakeScanner({ blobBytes: 0 }).run, repo: repo.dir });
    assert.equal(zero.ok, false);
    assert.ok(failed(zero).some((n) => /scanned bytes equal/.test(n)));
  });
});

test('S-2: a planted secret in any blob source (history, refs/codex only, unreachable only) fails the blob scan', () => {
  const token = `ghp_${'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bD1fH3jL5'.slice(0, 36)}`;
  withCleanRepo((repo) => {
    // history: committed then removed again
    repo.commitFiles({ 'leak.txt': `token = "${token}"\n` }, 'add');
    repo.commitFiles({ 'leak.txt': null }, 'remove');
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'));
  });
  withCleanRepo((repo) => {
    // unreachable only
    repo.git(['hash-object', '-w', '--stdin'], { input: `token = "${token}"\n` });
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'));
  });
  withCleanRepo((repo) => {
    // refs/codex tree only
    const blob = repo.git(['hash-object', '-w', '--stdin'], { input: `token = "${token}"\n` }).trim();
    repo.git(['-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},leak.txt`]);
    const tree = repo.git(['write-tree']).trim();
    repo.git(['reset', '-q', '--mixed', 'HEAD']);
    repo.git(['update-ref', 'refs/codex/turn-diffs/leak', tree]);
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'));
    assert.match(byName(r, /^blob coverage/).detail, /refs\/codex [1-9]/);
  });
});

test('S-2: a blob that cannot be materialized as a blob fails the coverage check', () => {
  withCleanRepo((repo) => {
    // The answer to `cat-file --batch` mislabels the second blob; sizes and framing stay valid.
    const git = (root) => (args, o) => {
      const out = execFileSync('git', args, { cwd: root, input: o?.input === undefined ? undefined : Buffer.from(o.input), ...(o?.buffer ? {} : { encoding: 'utf8' }), maxBuffer: 1 << 30 });
      if (args[0] === 'cat-file' && args[1] === '--batch') {
        const text = out.toString('latin1');
        const at = text.indexOf(' blob ', text.indexOf(' blob ') + 1);
        return Buffer.from(`${text.slice(0, at)} tree ${text.slice(at + 6)}`, 'latin1');
      }
      return out;
    };
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, git });
    assert.equal(r.ok, false);
    assert.ok(failed(r).includes('blob coverage: every enumerated blob materialized exactly once'));
  });
});

test('S-2: a Git command that fails or returns unparseable data fails closed, for every enumeration command', () => {
  withCleanRepo((repo) => {
    repo.git(['update-ref', 'refs/codex/turn-diffs/t', repo.git(['rev-parse', 'HEAD^{tree}']).trim()]);
    const real = (root) => (args, o) =>
      execFileSync('git', args, { cwd: root, input: o?.input === undefined ? undefined : Buffer.from(o.input), ...(o?.buffer ? {} : { encoding: 'utf8' }), maxBuffer: 1 << 30 });
    const wrap = (match, effect) => (root) => {
      const g = real(root);
      return (args, o) => (match(args) ? effect(args, o, g) : g(args, o));
    };
    const failing = () => {
      throw new Error('simulated git failure');
    };
    const cases = [
      ['rev-list --count fails', (a) => a[0] === 'rev-list' && a.includes('--count'), failing],
      ['log --numstat fails', (a) => a[0] === 'log', failing],
      ['log --numstat unparseable', (a) => a[0] === 'log', () => 'garbage\n'],
      ['log --numstat returns an orphan numstat record', (a) => a[0] === 'log', () => '1\t1\ta.txt\n'],
      ['rev-list --objects fails', (a) => a[0] === 'rev-list' && a.includes('--objects'), failing],
      ['cat-file --batch-check fails', (a) => a[0] === 'cat-file' && a[1] === '--batch-check', failing],
      ['cat-file --batch fails', (a) => a[0] === 'cat-file' && a[1] === '--batch', failing],
      ['for-each-ref fails', (a) => a[0] === 'for-each-ref', failing],
      ['ls-tree fails', (a) => a[0] === 'ls-tree', failing],
      ['fsck fails', (a) => a[0] === 'fsck', failing],
      ['ls-files fails', (a) => a[0] === 'ls-files', failing],
      ['rev-list --count unparseable', (a) => a[0] === 'rev-list' && a.includes('--count'), () => 'not a number\n'],
      ['rev-list --objects unparseable', (a) => a[0] === 'rev-list' && a.includes('--objects'), () => 'garbage line\n'],
      ['rev-list --objects with a sha256-style id', (a) => a[0] === 'rev-list' && a.includes('--objects'), () => `${'a'.repeat(64)} file\n`],
      ['for-each-ref unparseable', (a) => a[0] === 'for-each-ref', () => 'junk\n'],
      ['ls-tree unparseable', (a) => a[0] === 'ls-tree', () => 'junk\0'],
      ['fsck unparseable', (a) => a[0] === 'fsck', () => 'something unexpected\n'],
      ['cat-file --batch-check unparseable', (a) => a[0] === 'cat-file' && a[1] === '--batch-check', () => 'junk\n'],
      ['cat-file --batch unparseable', (a) => a[0] === 'cat-file' && a[1] === '--batch', () => Buffer.from('junk\n')],
    ];
    for (const [label, match, effect] of cases) {
      const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, git: wrap(match, effect) });
      assert.equal(r.ok, false, label);
      assert.ok(failed(r).some((n) => /fail closed|independently derived expected count|no \.gitleaksignore/.test(n)), label);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Real scanner: only when its location is supplied, never required

const REAL = process.env.GITLEAKS_BIN;
const skipUnlessReal = (t) => {
  if (!REAL) {
    t.skip('set GITLEAKS_BIN to the pinned gitleaks binary to run this');
    return true;
  }
  return false;
};
// The real scanner is run exactly as the CLI runs it: through makeScannerRunner (sanitized child environment).
const realRun = (extraEnv = {}) => makeScannerRunner(REAL, { ...process.env, ...extraEnv });
// An ordinary scanner call with the caller's environment untouched, for proving that an attack works on a naive scan.
const rawRun = (extraEnv = {}) => (args) => {
  const r = spawnSync(REAL, args, { encoding: 'utf8', env: { ...process.env, ...extraEnv }, maxBuffer: 1 << 30 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const plantedToken = () => generateCanaries()[0].secret; // random, synthetic, non-live
const SUPPRESS_ALL = "[extend]\nuseDefault = true\n[allowlist]\npaths = ['''.*''']\n";
/** An ordinary (non-gate) scan with the scanner's own defaults: what a suppression attempt is meant to fool. */
function plainScan(path, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cm-raw-'));
  try {
    return rawRun(env)(['dir', path, '--redact=100', '--no-banner', '--no-color', '--report-format', 'json', '--report-path', join(dir, 'r.json')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function throwaway(files, afterCommit) {
  const repo = makeRepo();
  repo.commitFiles({ 'readme.txt': 'hello\n' }, 'base');
  repo.commitFiles(files, 'content');
  if (afterCommit) afterCommit(repo);
  return repo;
}

test('real scanner passes the canary and the full pre-publication gate on the current repository', (t) => {
  if (skipUnlessReal(t)) return;
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).stdout.trim();
  if (!repo) return t.skip('not inside a git repository');
  const gate = runPrepublicationGate({ run: realRun(), repo });
  assert.deepEqual(failed(gate), []);
});

test('real scanner: a normal throwaway repository passes with exact byte equality', (t) => {
  if (skipUnlessReal(t)) return;
  const repo = throwaway({ 'a.txt': 'alpha\n', 'dir/b.txt': 'bravo\n' });
  try {
    const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
    assert.deepEqual(failed(gate), []);
    const m = /expected (\d+), scanner reported (\d+)/.exec(byName(gate, /scanned bytes equal/).detail);
    assert.equal(m[1], m[2]);
  } finally {
    repo.cleanup();
  }
});

test('S-1 real: suppression attempts that make an ordinary scan CLEAN are still detected by the gate', (t) => {
  if (skipUnlessReal(t)) return;
  const attempts = [
    ['repository .gitleaks.toml', (token) => ({ '.gitleaks.toml': SUPPRESS_ALL, 'k.txt': `token = "${token}"\n` }), {}],
    ['inline gitleaks:allow', (token) => ({ 'k.txt': `token = "${token}" # gitleaks:allow\n` }), {}],
  ];
  for (const [label, files, env] of attempts) {
    const token = plantedToken();
    const repo = throwaway(files(token));
    try {
      assert.equal(plainScan(repo.dir, env).code, 0, `${label}: the attack works on an ordinary scan (so this test is meaningful)`);
      const gate = runPrepublicationGate({ run: realRun(env), repo: repo.dir });
      assert.equal(gate.ok, false, label);
      assert.ok(failed(gate).includes('history: no leaks, exit 0'), `${label}: history scan detects`);
      assert.ok(failed(gate).includes('current tree: no leaks, exit 0'), `${label}: tree scan detects`);
      assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), `${label}: blob scan detects`);
      assert.doesNotMatch(JSON.stringify(gate), new RegExp(token.slice(0, 16)));
    } finally {
      repo.cleanup();
    }
  }
});

test('S-1 real: GITLEAKS_CONFIG in the parent environment cannot suppress the gate', (t) => {
  if (skipUnlessReal(t)) return;
  const suppress = join(mkdtempSync(join(tmpdir(), 'cm-envcfg-')), 'suppress.toml');
  writeFileSync(suppress, SUPPRESS_ALL);
  const token = plantedToken();
  const repo = throwaway({ 'k.txt': `token = "${token}"\n` });
  try {
    const env = { GITLEAKS_CONFIG: suppress };
    assert.equal(plainScan(repo.dir, env).code, 0, 'the attack works on an ordinary scan');
    // the gate's own invocations override it even when the caller passes the environment straight through
    const gate = runPrepublicationGate({ run: realRun(env), repo: repo.dir });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('history: no leaks, exit 0'));
    // and through the public CLI, which also drops GITLEAKS_* from the scanner's environment
    const cli = spawnSync(process.execPath, [GATE_CLI, REAL, repo.dir], { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(cli.status, 1, cli.stdout);
    assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
    rmSync(dirname(suppress), { recursive: true, force: true });
  }
});

test('S-1 real: a repository .gitleaksignore (which the flags cannot neutralize) fails the gate and the blob scan still detects', (t) => {
  if (skipUnlessReal(t)) return;
  const token = plantedToken();
  const repo = throwaway({ 'k.txt': `token = "${token}"\n` });
  try {
    // learn the real fingerprints from an unsuppressed scan, then ignore them in the repository
    const raw = join(mkdtempSync(join(tmpdir(), 'cm-fp-')), 'fp.json');
    rawRun()(['git', '--log-opts=--all', repo.dir, '--redact=100', '--no-banner', '--no-color', '--report-format', 'json', '--report-path', raw]);
    const fingerprints = JSON.parse(readFileSync(raw, 'utf8')).map((f) => f.Fingerprint);
    assert.ok(fingerprints.length > 0);
    repo.commitFiles({ '.gitleaksignore': `${fingerprints.join('\n')}\n` }, 'ignore');
    const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('repository has no .gitleaksignore (working tree or tracked)'));
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), 'the materialized blobs carry no ignore file, so the secret is still found');
    rmSync(dirname(raw), { recursive: true, force: true });
  } finally {
    repo.cleanup();
  }
});

test('S-2 real: a -diff file in a mixed commit, later deleted, is a clean history scan with a matching commit count, but the blob scan detects it', (t) => {
  if (skipUnlessReal(t)) return;
  const token = plantedToken();
  const repo = makeRepo();
  try {
    repo.commitFiles({ '.gitattributes': 'secret.txt -diff\n', 'secret.txt': `token = "${token}"\n`, 'normal.txt': 'normal\n' }, 'mixed');
    repo.commitFiles({ 'secret.txt': null, 'later.txt': 'later content\n' }, 'delete secret, add later');
    const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
    assert.equal(gate.ok, false);
    assert.ok(!failed(gate).includes('history: no leaks, exit 0'), 'the git-log based history scan misses it (the reproduced gap)');
    assert.ok(!failed(gate).includes(HISTORY_CHECK), 'and the commit count equals the expected count');
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), 'complete blob materialization detects it');
    assert.doesNotMatch(JSON.stringify(gate), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
  }
});

test('S-2 real: a binary (NUL-containing) historical blob is materialized, scanned with exact byte equality, and detected', (t) => {
  if (skipUnlessReal(t)) return;
  const token = plantedToken();
  const repo = makeRepo();
  try {
    repo.commitFiles({ 'readme.txt': 'hello\n' }, 'base');
    writeFileSync(join(repo.dir, 'blob.bin'), Buffer.concat([Buffer.from([0, 0, 1, 2]), Buffer.from(`token = "${token}"\n`), Buffer.from([0, 255])]));
    repo.git(['add', '-A']);
    repo.git(['commit', '-q', '-m', 'binary']);
    const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), 'the binary blob is scanned and the secret found');
    assert.ok(!failed(gate).some((n) => /scanned bytes equal/.test(n)), 'every byte of every blob, including the binary one, was scanned');
    assert.ok(existsSync(repo.dir));
  } finally {
    repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------
// F-1 / F-2: replacement objects and the ambient Git environment

/** Runs real Git in `dir` with a test-local environment (process.env is never modified). */
const gx = (dir, args, env = {}, input) =>
  execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...env }, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

/** Commit 1 holds a synthetic token, commit 2 deletes it; a replacement shows ordinary Git a clean blob instead. */
function replacedRepo(env = {}) {
  const token = plantedToken();
  const repo = makeRepo();
  repo.commitFiles({ 'keep.txt': 'keep\n', 'secret.txt': `token = "${token}"\n` }, 'one');
  const secretId = repo.git(['rev-parse', 'HEAD:secret.txt']).trim();
  repo.commitFiles({ 'secret.txt': null }, 'two');
  const cleanId = gx(repo.dir, ['hash-object', '-w', '--stdin'], env, 'clean replacement content\n').trim();
  gx(repo.dir, ['replace', secretId, cleanId], env);
  return { repo, token, secretId, cleanId };
}
const showsToken = (text, token) => text.includes(token);

test('F-2: gateEnv drops every GIT_* and GITLEAKS_* variable, forces GIT_NO_REPLACE_OBJECTS=1 and leaves its input untouched', () => {
  const base = {
    PATH: '/usr/bin',
    HOME: '/home/x',
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_OBJECT_DIRECTORY: '/elsewhere/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/alt',
    GIT_REPLACE_REF_BASE: 'refs/hidden/',
    GIT_CONFIG: '/c',
    GIT_CONFIG_GLOBAL: '/g',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.bare',
    GIT_CONFIG_VALUE_0: 'true',
    GIT_CONFIG_PARAMETERS: "'core.bare'='true'",
    GIT_NO_REPLACE_OBJECTS: '0',
    git_index_file: '/i',
    GITLEAKS_CONFIG: '/suppress.toml',
    gitleaks_ignore_path: '/x',
  };
  const snapshot = JSON.stringify(base);
  const env = gateEnv(base);
  assert.deepEqual(Object.keys(env).sort(), ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_NO_REPLACE_OBJECTS', 'HOME', 'PATH']);
  assert.deepEqual([env.GIT_CONFIG_COUNT, env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0], ['1', 'core.useReplaceRefs', 'false']);
  assert.equal(env.GIT_NO_REPLACE_OBJECTS, '1');
  assert.equal(JSON.stringify(base), snapshot, 'the input environment is not mutated');
  assert.equal(gateEnv({}).GIT_NO_REPLACE_OBJECTS, '1');
});

test('F-1: the scanner child environment has no GITLEAKS_*, no Git redirection, and GIT_NO_REPLACE_OBJECTS=1', () => {
  const probe = 'console.log(JSON.stringify(Object.entries(process.env).filter(([k]) => /^(GIT|GITLEAKS)_/i.test(k))))';
  const run = makeScannerRunner(process.execPath, {
    ...process.env,
    GITLEAKS_CONFIG: 'x',
    GIT_DIR: 'y',
    GIT_OBJECT_DIRECTORY: 'z',
    GIT_REPLACE_REF_BASE: 'refs/h/',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.useReplaceRefs',
    GIT_CONFIG_VALUE_0: 'true',
    git_config_parameters: 'x',
    GIT_NO_REPLACE_OBJECTS: '0',
  });
  const r = run(['-e', probe]);
  assert.equal(r.code, 0);
  assert.deepEqual(Object.fromEntries(JSON.parse(r.out)), { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.useReplaceRefs', GIT_CONFIG_VALUE_0: 'false', GIT_NO_REPLACE_OBJECTS: '1' });
  assert.match(readFileSync(GATE_CLI, 'utf8'), /makeScannerRunner\(bin\)/, 'the CLI builds its runner the same way');
});

test('F-1: every Git child of the gate reads the ORIGINAL object, even when the caller disables the protection', () => {
  const { repo, token, secretId } = replacedRepo();
  try {
    // attack precondition (token never printed): ordinary Git resolves the secret blob to the clean replacement
    assert.equal(showsToken(gx(repo.dir, ['cat-file', '-p', secretId]), token), false);
    assert.equal(showsToken(gx(repo.dir, ['cat-file', '-p', secretId], { GIT_NO_REPLACE_OBJECTS: '1' }), token), true);
    // the gate's default Git execution layer, with a hostile ambient value, evaluates the original
    const git = defaultGit(repo.dir, { ...process.env, GIT_NO_REPLACE_OBJECTS: '0' });
    assert.equal(showsToken(git(['cat-file', '-p', secretId]), token), true);
    const batch = git(['cat-file', '--batch'], { input: `${secretId}\n`, buffer: true });
    assert.equal(showsToken(batch.toString('latin1'), token), true);
  } finally {
    repo.cleanup();
  }
});

test('F-1: a repository with refs/replace/** fails the gate, and the blob scan still evaluates the original object', () => {
  const { repo, token } = replacedRepo();
  try {
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir });
    assert.equal(r.ok, false);
    assert.ok(failed(r).includes('repository has no refs/replace/** replacement refs'));
    assert.match(byName(r, /refs\/replace/).detail, /refs\/replace 1/);
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'), 'the original (secret-bearing) object is the one scanned');
    assert.doesNotMatch(JSON.stringify(r), new RegExp(token.slice(0, 16)));
    assert.ok(gx(repo.dir, ['for-each-ref', 'refs/replace']).trim() !== '', 'the gate neither deleted nor rewrote the replacement');
  } finally {
    repo.cleanup();
  }
});

test('F-1: with GIT_REPLACE_REF_BASE hiding the replacement from refs/replace, the original object is still scanned', () => {
  const env = { GIT_REPLACE_REF_BASE: 'refs/hidden/' };
  const { repo, token, secretId } = replacedRepo(env);
  try {
    assert.equal(gx(repo.dir, ['for-each-ref', 'refs/replace']).trim(), '', 'a refs/replace listing cannot see it');
    assert.equal(showsToken(gx(repo.dir, ['cat-file', '-p', secretId], env), token), false, 'ordinary Git (with this variable) reads the clean replacement');
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, env: { ...process.env, ...env } });
    assert.equal(r.ok, false);
    assert.ok(!failed(r).includes('repository has no refs/replace/** replacement refs'), 'the refusal cannot see it, so the environment control carries this case');
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'), 'the original object is the one scanned: no false clean');
    assert.doesNotMatch(JSON.stringify(r), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
  }
});

test('F-2: ambient GIT_DIR, GIT_WORK_TREE, object directory, alternates and config injection cannot redirect the scan', () => {
  const baseline = withCleanRepo((repo) => JSON.stringify(runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir }).checks));
  const other = makeRepo();
  other.commitFiles({ 'x.txt': 'other\n' }, 'only commit');
  const emptyObjects = mkdtempSync(join(tmpdir(), 'cm-emptyobj-'));
  const altBlob = gx(other.dir, ['hash-object', '-w', '--stdin'], {}, 'only in the alternate store\n').trim();
  let replacedId;
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  try {
    const cases = [
      ['GIT_DIR', { GIT_DIR: join(other.dir, '.git') }, (dir, env) => gx(dir, ['rev-list', '--all', '--count'], env).trim() === '1'],
      ['GIT_WORK_TREE', { GIT_WORK_TREE: other.dir }, (dir, env) => gx(dir, ['rev-parse', '--show-toplevel'], env).trim() !== gx(dir, ['rev-parse', '--show-toplevel']).trim()],
      ['GIT_OBJECT_DIRECTORY', { GIT_OBJECT_DIRECTORY: emptyObjects }, (dir, env) => throws(() => gx(dir, ['rev-list', '--all', '--objects'], env))],
      ['GIT_ALTERNATE_OBJECT_DIRECTORIES', { GIT_ALTERNATE_OBJECT_DIRECTORIES: join(other.dir, '.git', 'objects') }, (dir, env) => !throws(() => gx(dir, ['cat-file', '-e', altBlob], env)) && throws(() => gx(dir, ['cat-file', '-e', altBlob]))],
      [
        'GIT_REPLACE_REF_BASE',
        { GIT_REPLACE_REF_BASE: 'refs/hidden/' },
        (dir, env) => gx(dir, ['cat-file', '-p', replacedId], env) !== gx(dir, ['cat-file', '-p', replacedId]),
        (repo) => {
          // an existing blob is replaced by another existing blob, under the moved base, so the object sets do not change
          const ids = repo.git(['ls-tree', '-r', 'HEAD']).split('\n').filter(Boolean).map((l) => l.split(/\s+/)[2]);
          replacedId = ids[0];
          gx(repo.dir, ['replace', '-f', ids[0], ids.find((i) => i !== ids[0])], { GIT_REPLACE_REF_BASE: 'refs/hidden/' });
        },
      ],
      ['GIT_CONFIG_COUNT/KEY/VALUE', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true' }, (dir, env) => gx(dir, ['config', '--get', 'core.bare'], env).trim() === 'true'],
      ['GIT_CONFIG_PARAMETERS', { GIT_CONFIG_PARAMETERS: "'core.bare'='true'" }, (dir, env) => gx(dir, ['config', '--get', 'core.bare'], env).trim() === 'true'],
    ];
    for (const [label, env, precondition, setup] of cases) {
      withCleanRepo((repo) => {
        setup?.(repo);
        assert.ok(precondition(repo.dir, env), `${label}: the variable really does alter ordinary Git behaviour here`);
        const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, env: { ...process.env, ...env } });
        assert.deepEqual(failed(r), [], label);
        assert.equal(JSON.stringify(r.checks), baseline, `${label}: identical to the un-redirected run`);
      });
    }
  } finally {
    other.cleanup();
    rmSync(emptyObjects, { recursive: true, force: true });
  }
});

test('F-2: a path that Git does not resolve as its own work tree root (a subdirectory) fails closed before any scan', () => {
  withCleanRepo((repo) => {
    const scanner = fakeScanner();
    const r = runPrepublicationGate({ run: scanner.run, repo: join(repo.dir, 'sub') });
    assert.equal(r.ok, false);
    assert.ok(failed(r).some((n) => /repository identity/.test(n)));
    assert.ok(failed(r).some((n) => /real scans skipped/.test(n)));
    assert.ok(!scanner.calls.some((a) => a[0] === 'git' && a[2] === join(repo.dir, 'sub')), 'nothing was scanned');
  });
});

test('F-1/F-2 real: a git replace of a secret blob is refused, and the gate evaluates the original', (t) => {
  if (skipUnlessReal(t)) return;
  const { repo, token } = replacedRepo();
  try {
    const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('repository has no refs/replace/** replacement refs'));
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), 'the original blob (not the clean replacement) is materialized and scanned');
    assert.doesNotMatch(JSON.stringify(gate), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
  }
});

test('F-1/F-2 real: replacements moved by GIT_REPLACE_REF_BASE cannot hide the original from the gate', (t) => {
  if (skipUnlessReal(t)) return;
  const env = { GIT_REPLACE_REF_BASE: 'refs/hidden/' };
  const { repo, token } = replacedRepo(env);
  try {
    const raw = join(mkdtempSync(join(tmpdir(), 'cm-rawrep-')), 'r.json');
    const ordinary = rawRun(env)(['git', '--log-opts=--all', repo.dir, '--redact=100', '--no-banner', '--no-color', '--report-format', 'json', '--report-path', raw]);
    rmSync(dirname(raw), { recursive: true, force: true });
    const gate = runPrepublicationGate({ run: realRun(env), repo: repo.dir, env: { ...process.env, ...env } });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), `no false clean (an ordinary scan exited ${ordinary.code})`);
    assert.doesNotMatch(JSON.stringify(gate), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
  }
});

test('F-2 real: ambient Git redirection cannot make the real gate scan another repository', (t) => {
  if (skipUnlessReal(t)) return;
  const other = makeRepo();
  other.commitFiles({ 'x.txt': 'other\n' }, 'only commit');
  const repo = cleanRepo();
  try {
    const env = { GIT_DIR: join(other.dir, '.git'), GIT_WORK_TREE: other.dir, GIT_REPLACE_REF_BASE: 'refs/hidden/' };
    const gate = runPrepublicationGate({ run: realRun(env), repo: repo.dir, env: { ...process.env, ...env } });
    assert.deepEqual(failed(gate), []);
    assert.match(byName(gate, /^history: scanner commit count/).detail, /expected 3, total 3, scanner reported 3/);
  } finally {
    repo.cleanup();
    other.cleanup();
  }
});

for (const shape of Object.keys(SHAPES)) {
  test(`history shape real (${shape}, then an ordinary commit): the real gate passes where exact count equality failed`, (t) => {
    if (skipUnlessReal(t)) return;
    const repo = shapedRepo(shape);
    try {
      const gate = runPrepublicationGate({ run: realRun(), repo: repo.dir });
      assert.deepEqual(failed(gate), []);
      const [expected, total, reported] = counts(gate);
      assert.ok(reported < total, `the old equality would have failed: scanner ${reported}, rev-list ${total}`);
      assert.equal(reported, expected, 'gitleaks 8.30.1 counts exactly the non-merge commits that add a line');
    } finally {
      repo.cleanup();
    }
  });
}

test('history shape real: an all-empty history reports 0 commits and the history check accepts it; a secret added after an uncounted commit is still found', (t) => {
  if (skipUnlessReal(t)) return;
  const empty = makeRepo();
  empty.commitFiles({}, 'empty one');
  empty.commitFiles({}, 'empty two');
  const planted = shapedRepo('deletion-only commit');
  try {
    const gate = runPrepublicationGate({ run: realRun(), repo: empty.dir });
    assert.ok(!failed(gate).includes(HISTORY_CHECK), 'an all-empty history is accepted by the history check (the empty tree is rejected by the separate tree check)');
    assert.deepEqual(counts(gate), [0, 2, 0]);
    planted.commitFiles({ 'leak.txt': `token = "${plantedToken()}"\n` }, 'plant after the shape');
    const bad = runPrepublicationGate({ run: realRun(), repo: planted.dir });
    assert.ok(failed(bad).includes('history: no leaks, exit 0'), 'the history scan still detects content added after an uncounted commit');
    assert.ok(!failed(bad).includes(HISTORY_CHECK));
  } finally {
    empty.cleanup();
    planted.cleanup();
  }
});

test('history shape real: a real scanner whose history summary is zeroed, removed, ambiguous or inflated (the #2129 failure mode) fails closed', (t) => {
  if (skipUnlessReal(t)) return;
  const repo = shapedRepo('clean two-parent merge');
  try {
    const tamper = (rewrite) => (args, opts) => {
      const r = realRun()(args, opts);
      return args[0] === 'git' && args[2] === repo.dir ? { ...r, out: rewrite(r.out) } : r;
    };
    const variants = {
      zeroed: (o) => o.replace(/INF \d+ commits scanned\./, 'INF 0 commits scanned.'),
      removed: (o) => o.replace(/^.*commits scanned\..*$/m, ''),
      ambiguous: (o) => `${o}\nINF 1 commits scanned.`,
      inflated: (o) => o.replace(/INF \d+ commits scanned\./, 'INF 99 commits scanned.'),
    };
    for (const [label, rewrite] of Object.entries(variants)) {
      const gate = runPrepublicationGate({ run: tamper(rewrite), repo: repo.dir });
      assert.ok(failed(gate).includes(HISTORY_CHECK), label);
    }
  } finally {
    repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------
// R-1: core.useReplaceRefs=true defeats GIT_NO_REPLACE_OBJECTS alone; the gate injects core.useReplaceRefs=false

const HOSTILE_CONFIG = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.useReplaceRefs', GIT_CONFIG_VALUE_0: 'true' };

/** A replaced repository whose own config sets core.useReplaceRefs=true. */
function replacedRepoWithConfig() {
  const r = replacedRepo();
  gx(r.repo.dir, ['config', 'core.useReplaceRefs', 'true']);
  return r;
}

test('R-1: ordinary Git reads the replacement under core.useReplaceRefs=true; the gate environment reads the original whatever the Git version does with the environment control alone', () => {
  const { repo, token, secretId } = replacedRepoWithConfig();
  try {
    // attack precondition (token never printed): ordinary Git reads the replacement and does not show the original
    assert.equal(showsToken(gx(repo.dir, ['cat-file', '-p', secretId]), token), false);
    // Whether GIT_NO_REPLACE_OBJECTS=1 alone beats core.useReplaceRefs=true is Git-version behaviour: older Git (2.37) lets the
    // configuration win, newer Git (the GitHub Linux runner) lets the environment win. The invariant does not depend on it: the
    // gate environment below reads the original in both cases. The observed behaviour is recorded, not asserted.
    const envOnlyShowsOriginal = showsToken(gx(repo.dir, ['cat-file', '-p', secretId], { GIT_NO_REPLACE_OBJECTS: '1' }), token);
    assert.equal(typeof envOnlyShowsOriginal, 'boolean');
    // the gate-owned environment reads the original, whatever the caller injects
    for (const ambient of [{}, HOSTILE_CONFIG, { GIT_NO_REPLACE_OBJECTS: '0', ...HOSTILE_CONFIG }]) {
      const git = defaultGit(repo.dir, { ...process.env, ...ambient });
      assert.equal(showsToken(git(['cat-file', '-p', secretId]), token), true, JSON.stringify(Object.keys(ambient)));
      assert.equal(showsToken(git(['cat-file', '--batch'], { input: `${secretId}\n`, buffer: true }).toString('latin1'), token), true);
      const check = git(['cat-file', '--batch-check'], { input: `${secretId}\n` });
      assert.equal(Number(check.trim().split(' ')[2]), Buffer.byteLength(`token = "${token}"\n`), 'batch-check reports the original object size');
    }
  } finally {
    repo.cleanup();
  }
});

test('R-1: with core.useReplaceRefs=true the gate fails on the refusal AND the content scan itself sees the original', () => {
  const { repo, token } = replacedRepoWithConfig();
  try {
    for (const ambient of [{}, HOSTILE_CONFIG]) {
      const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, env: { ...process.env, ...ambient } });
      assert.equal(r.ok, false);
      assert.ok(failed(r).includes('repository has no refs/replace/** replacement refs'));
      assert.ok(failed(r).includes('blob scan: no leaks, exit 0'), 'the content scan fails on the original secret-bearing object, not only the refusal');
      assert.doesNotMatch(JSON.stringify(r), new RegExp(token.slice(0, 16)));
    }
  } finally {
    repo.cleanup();
  }
});

test('R-1: replacement hidden by GIT_REPLACE_REF_BASE plus core.useReplaceRefs=true in a redirected config file is still not trusted', () => {
  const env = { GIT_REPLACE_REF_BASE: 'refs/hidden/' };
  const { repo, token } = replacedRepo(env);
  const cfgDir = mkdtempSync(join(tmpdir(), 'cm-gcfg-'));
  try {
    const cfg = join(cfgDir, 'gitconfig');
    writeFileSync(cfg, '[core]\n\tuseReplaceRefs = true\n');
    const ambient = { ...env, GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_SYSTEM: cfg, GIT_CONFIG: cfg };
    const r = runPrepublicationGate({ run: fakeScanner().run, repo: repo.dir, env: { ...process.env, ...ambient } });
    assert.equal(r.ok, false);
    assert.ok(failed(r).includes('blob scan: no leaks, exit 0'));
    assert.doesNotMatch(JSON.stringify(r), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
    rmSync(cfgDir, { recursive: true, force: true });
  }
});

test('R-1 real: a replacement-aware ordinary scan is clean, the gate-environment scanner detects the original', (t) => {
  if (skipUnlessReal(t)) return;
  const { repo, token } = replacedRepoWithConfig();
  try {
    const report = join(mkdtempSync(join(tmpdir(), 'cm-r1-')), 'r.json');
    const scan = (run, env) => run(['git', '--log-opts=--all', repo.dir, '--redact=100', '--no-banner', '--no-color', '--report-format', 'json', '--report-path', report]);
    // precondition: an ordinary replacement-aware scan (the caller's environment untouched) finds nothing
    assert.equal(scan(rawRun()).code, 0, 'the ordinary scan is fooled by the replacement');
    // GIT_NO_REPLACE_OBJECTS=1 alone may or may not defeat core.useReplaceRefs=true depending on the Git version; either result is valid
    assert.ok([0, 1].includes(scan(rawRun({ GIT_NO_REPLACE_OBJECTS: '1' })).code));
    // the gate-owned child environment makes the same scanner read the original object, even against hostile caller values
    assert.equal(scan(realRun()).code, 1);
    assert.equal(scan(realRun(HOSTILE_CONFIG)).code, 1);
    rmSync(dirname(report), { recursive: true, force: true });
    const gate = runPrepublicationGate({ run: realRun(HOSTILE_CONFIG), repo: repo.dir, env: { ...process.env, ...HOSTILE_CONFIG } });
    assert.equal(gate.ok, false);
    assert.ok(failed(gate).includes('repository has no refs/replace/** replacement refs'));
    assert.ok(failed(gate).includes('history: no leaks, exit 0'), 'the history scan itself detects the original');
    assert.ok(failed(gate).includes('blob scan: no leaks, exit 0'), 'the blob scan itself detects the original');
    assert.doesNotMatch(JSON.stringify(gate), new RegExp(token.slice(0, 16)));
  } finally {
    repo.cleanup();
  }
});

test('R-2 real: lowercase Git variables and a redirected config file cannot redirect the CLI', (t) => {
  if (skipUnlessReal(t)) return;
  const other = makeRepo();
  other.commitFiles({ 'x.txt': 'other\n' }, 'only commit');
  const repo = cleanRepo();
  const cfgDir = mkdtempSync(join(tmpdir(), 'cm-gcfg-'));
  try {
    const cfg = join(cfgDir, 'gitconfig');
    writeFileSync(cfg, '[core]\n\tbare = true\n\tuseReplaceRefs = true\n');
    const env = { ...process.env, git_dir: join(other.dir, '.git'), git_work_tree: other.dir, GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_SYSTEM: cfg };
    const cli = spawnSync(process.execPath, [GATE_CLI, REAL, repo.dir], { encoding: 'utf8', env });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /history: scanner commit count equals the independently derived expected count {2}\(expected 3, total 3, scanner reported 3\)/);
  } finally {
    repo.cleanup();
    other.cleanup();
    rmSync(cfgDir, { recursive: true, force: true });
  }
});
