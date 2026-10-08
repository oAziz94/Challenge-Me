// Pre-publication secret-scan gate (STACK-ADR-002 §6.8, E8, E9, E15; AGENTS §9).
//
// A clean scan result is trustworthy only if the scanner is shown to work AND the real scans run with the same
// detection semantics as the canary. Gitleaks has had upstream defects that report "no leaks found" with exit 0
// while scanning nothing (gitleaks/gitleaks#2129), `git log` based scans skip `-diff` and binary content, and
// repository or environment controls can suppress findings. Therefore:
//   1. EVERY scanner invocation (canary and real) uses gate-owned settings: an explicit `--config` containing only
//      the default rules, an explicit empty `--gitleaks-ignore-path`, and `--ignore-gitleaks-allow`. A repository
//      root `.gitleaksignore` is still read by the scanner whatever the flags say, so its presence fails the gate;
//   2. a CANARY must be detected (synthetic, non-live, random, outside the repository), never printed (redaction),
//      and a clean control must exit 0;
//   3. every reachable blob (history, refs/codex/** tree refs, unreachable) is enumerated from Git object data,
//      materialized by object id into a temporary directory and scanned in directory mode, with coverage and the
//      EXACT scanned byte count verified against sizes computed independently of the scanner;
//   4. the commit-history scan is kept, with a fail-closed cross-check of the scanner's "N commits scanned" against
//      count derived independently from Git (see `expectedHistoryCommits`); equality with `rev-list --all --count` cannot
//      hold for legitimate history (empty, deletion-only and merge commits are never counted by the scanner);
//   5. every temporary location is outside the repository and removed afterwards.
// Nothing here prints a secret value. The scanner and Git access are injected, so the gate is testable with fakes.
import { randomInt } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

export const PINNED_VERSION = '8.30.1';

// The gate-owned configuration: the default rules and nothing else (no allowlists, no extra paths).
export const GATE_CONFIG = '[extend]\nuseDefault = true\n';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const AWS_TAIL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B64 = ALNUM + '+/';
const URLSAFE = ALNUM + '_-';
const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('');

/**
 * Synthetic canaries for rules this project relies on. Values are random per run (never fixed strings in the
 * repository), are not credentials for anything, and live only in a temporary directory outside the repository.
 */
export function generateCanaries() {
  const pat = `ghp_${pick(ALNUM, 36)}`;
  const aws = `AKIA${pick(AWS_TAIL, 16)}`;
  const anthropic = `sk-ant-api03-${pick(URLSAFE, 93)}AA`;
  const keyBody = [pick(B64, 64), pick(B64, 64), pick(B64, 64)].join('\n');
  return [
    { rule: 'github-pat', file: 'canary-github.txt', secret: pat, body: `token = "${pat}"\n` },
    { rule: 'aws-access-token', file: 'canary-aws.txt', secret: aws, body: `aws_access_key_id = ${aws}\n` },
    { rule: 'anthropic-api-key', file: 'canary-anthropic.txt', secret: anthropic, body: `key: ${anthropic}\n` },
    {
      rule: 'private-key',
      file: 'canary-key.pem.txt',
      secret: keyBody.split('\n')[0],
      body: `-----BEGIN RSA PRIVATE KEY-----\n${keyBody}\n-----END RSA PRIVATE KEY-----\n`,
    },
  ];
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * One integer from an anchored summary line (optional timestamp, then "INF ..."), over all lines. Zero matches, or
 * several matches with different values, return null (fail closed): a finding or a file name cannot forge a
 * summary line because only whole lines of the exact shape count.
 */
function parseMetric(out, re) {
  const values = new Set();
  for (const line of stripAnsi(out).split('\n')) {
    const m = re.exec(line.replace(/\r$/, ''));
    if (m) values.add(Number(m[1]));
  }
  return values.size === 1 ? [...values][0] : null;
}
/** "N commits scanned" from scanner output, or null. */
export const parseCommitsScanned = (out) => parseMetric(out, /^(?:\S+\s+)?INF (\d+) commits? scanned\.\s*$/);
/** "scanned ~N bytes" from scanner output, or null. */
export const parseBytesScanned = (out) => parseMetric(out, /^(?:\S+\s+)?INF scanned ~(\d+) bytes \([^)]*\) in \S+\s*$/);
const saysNoLeaks = (out) => /^(?:\S+\s+)?INF no leaks found\s*$/m.test(stripAnsi(out));

/** True when text contains any canary value in full or any 16-character window of it. */
function leaksSecret(text, canaries) {
  return canaries.some((c) => {
    if (text.includes(c.secret)) return true;
    for (let i = 0; i + 16 <= c.secret.length; i += 4) if (text.includes(c.secret.slice(i, i + 16))) return true;
    return false;
  });
}

function readReport(path) {
  try {
    const text = readFileSync(path, 'utf8');
    return { text, findings: JSON.parse(text) };
  } catch {
    return { text: '', findings: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Temporary locations and gate-owned scanner settings

/** Throws unless `path` resolves outside the repository root. */
export function assertOutside(repo, path) {
  const r = realpathSync(repo);
  const p = realpathSync(path);
  if (p === r || p.startsWith(r.endsWith(sep) ? r : r + sep)) throw new Error('a temporary location resolves inside the repository');
}

/** Creates the gate-owned config and empty ignore location under `root`; fails closed if they cannot be proven in place. */
export function makeOwned(root) {
  const cfg = join(root, 'gate-gitleaks.toml');
  const ign = join(root, 'gate-ignore');
  writeFileSync(cfg, GATE_CONFIG);
  mkdirSync(ign);
  if (readFileSync(cfg, 'utf8') !== GATE_CONFIG) throw new Error('gate-owned config could not be written');
  if (readdirSync(ign).length !== 0) throw new Error('gate-owned ignore location is not empty');
  return {
    cfg,
    ign,
    args: ['--redact=100', '--no-banner', '--no-color', '--config', cfg, '--gitleaks-ignore-path', ign, '--ignore-gitleaks-allow'],
  };
}

const rep = (path) => ['--report-format', 'json', '--report-path', path];

/**
 * The environment of EVERY child process the gate starts (Git and the scanner): a copy of `base` (never process.env
 * itself is modified) from which all GIT_* variables (repository, work tree, object directory, alternates, replace
 * ref base, config injection, ...) and all GITLEAKS_* variables are removed, with GIT_NO_REPLACE_OBJECTS=1 and the gate-owned
 * config entry core.useReplaceRefs=false set. The
 * gate, not the caller's ambient Git environment, decides which repository, object database and replacement
 * behaviour is inspected. A replacement object would otherwise make the gate read content that a normal push does
 * not publish in place of the original object.
 */
export function gateEnv(base = process.env) {
  const env = Object.fromEntries(Object.entries(base).filter(([k]) => !/^(GIT_|GITLEAKS_)/i.test(k)));
  env.GIT_NO_REPLACE_OBJECTS = '1';
  // GIT_NO_REPLACE_OBJECTS alone is overridden by core.useReplaceRefs=true from repository, user or system config
  // (observed on Git 2.37.1); a gate-owned command-scope config entry outranks all of those.
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.useReplaceRefs';
  env.GIT_CONFIG_VALUE_0 = 'false';
  return env;
}

/**
 * A scanner runner for `runPrepublicationGate` / `verifyScanner`: runs `bin` with the gate environment (no GITLEAKS_*,
 * no ambient Git redirection, GIT_NO_REPLACE_OBJECTS=1, because git mode invokes Git internally).
 */
export function makeScannerRunner(bin, base = process.env) {
  return (args, opts = {}) => {
    const r = spawnSync(bin, args, { cwd: opts.cwd, env: gateEnv(base), encoding: 'utf8', maxBuffer: 1 << 30 });
    if (r.error) throw new Error(`cannot execute the scanner (${r.error.code ?? 'error'})`);
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
}

// Every Git command is explicitly rooted (`-C`) at the repository it is meant for, with the gate environment.
export function gitIn(cwd, args, { input, buffer = false, env = process.env } = {}) {
  const opts = { input: input === undefined ? undefined : Buffer.from(input), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 30, env: gateEnv(env) };
  return execFileSync('git', ['-C', cwd, ...args], buffer ? opts : { ...opts, encoding: 'utf8' });
}
export const defaultGit = (repo, env = process.env) => (args, o) => gitIn(repo, args, { ...o, env });

const sameDir = (a, b) => {
  const [x, y] = [realpathSync(a), realpathSync(b)];
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

// ---------------------------------------------------------------------------------------------
// Canary

function canaryChecks({ run, version, owned, root, add, env = process.env }) {
  const canaries = generateCanaries();
  const v = run(['version']);
  const got = stripAnsi(v.out).trim();
  add('scanner version is the pinned version', v.code === 0 && got === version, `expected ${version}, got ${got.slice(0, 40)}`);

  const dirPath = join(root, 'canary-dir');
  mkdirSync(dirPath);
  for (const c of canaries) writeFileSync(join(dirPath, c.file), c.body);
  const dirReport = join(root, 'dir-report.json');
  const d = run(['dir', dirPath, ...owned.args, ...rep(dirReport)]);
  const dr = readReport(dirReport);
  const dirRules = new Set((dr.findings ?? []).map((f) => f.RuleID));
  for (const c of canaries) add(`dir canary detected: ${c.rule}`, dirRules.has(c.rule), '');
  add('dir canary exits non-zero (1)', d.code === 1, `exit ${d.code}`);
  add('dir canary output and report do not contain the canary value', !leaksSecret(d.out, canaries) && !leaksSecret(dr.text, canaries), '');

  const repoPath = join(root, 'canary-repo');
  mkdirSync(repoPath);
  const g = (args) => gitIn(repoPath, ['-c','user.name=canary', '-c', 'user.email=canary@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { env });
  g(['init', '-q', '-b', 'main']);
  writeFileSync(join(repoPath, 'readme.txt'), 'nothing secret here\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'clean']);
  for (const c of canaries) writeFileSync(join(repoPath, c.file), c.body);
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'canary']);
  const expectedCommits = Number(g(['rev-list', '--all', '--count']).trim());
  const gitReport = join(root, 'git-report.json');
  const gr = run(['git', '--log-opts=--all', repoPath, ...owned.args, ...rep(gitReport)]);
  const grr = readReport(gitReport);
  const gitRules = new Set((grr.findings ?? []).map((f) => f.RuleID));
  for (const c of canaries) add(`git canary detected: ${c.rule}`, gitRules.has(c.rule), '');
  add('git canary exits non-zero (1)', gr.code === 1, `exit ${gr.code}`);
  add('git canary output and report do not contain the canary value', !leaksSecret(gr.out, canaries) && !leaksSecret(grr.text, canaries), '');
  add('git canary scanned every commit', parseCommitsScanned(gr.out) === expectedCommits, `expected ${expectedCommits}, scanner reported ${parseCommitsScanned(gr.out)}`);

  const cleanPath = join(root, 'clean-dir');
  mkdirSync(cleanPath);
  writeFileSync(join(cleanPath, 'note.txt'), 'ordinary text with no secret\n');
  const cl = run(['dir', cleanPath, ...owned.args, ...rep(join(root, 'clean-report.json'))]);
  add('clean control exits 0 and reports no leaks', cl.code === 0 && saysNoLeaks(cl.out), `exit ${cl.code}`);
}

/**
 * Proves the scanner works, under the gate-owned settings, before any result is trusted.
 * @param {{ run: (args:string[]) => {code:number|null, out:string}, version?:string }} o
 * @returns {{ ok:boolean, checks:{name:string, ok:boolean, detail:string}[] }}
 */
export function verifyScanner({ run, version = PINNED_VERSION, env = process.env }) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
  const root = mkdtempSync(join(tmpdir(), 'cm-canary-'));
  try {
    canaryChecks({ run, version, owned: makeOwned(root), root, add, env });
  } catch (e) {
    add('canary procedure ran to completion', false, String(e.message).split('\n')[0]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------------------------------------
// History scan: the exact expected "N commits scanned"
//
// `gitleaks git` walks `git log -p`. Characterized with the pinned gitleaks 8.30.1: the reported N equals the number of
// NON-MERGE commits that ADD at least one text line. Empty commits, deletion-only commits, mode-only or pure-rename
// commits, binary-only (or `-diff`) commits and merge commits are never counted, so N < `git rev-list --all --count` for
// legitimate history and equality with that count cannot be required. The gate instead derives, from Git alone:
//   expected = non-merge commits whose `git log --numstat` (same defaults as the scanner's own `git log -p`, no extra
//              rename or copy options) shows at least one added text line;
//   total    = every commit reachable from any ref (`rev-list --all --count`), a sanity condition only
//              (total > 0 and expected <= total);
// and requires N, parsed from exactly one anchored summary line, to EQUAL `expected`. Because the scanner is pinned, a
// different count (higher or lower) contradicts the characterized behaviour and fails. A missing, ambiguous or unparseable
// summary fails. This count check is separate from the repository-identity and invocation controls; it does not by
// itself prove which repository was scanned. A change of the pinned version requires re-characterizing this rule.

/**
 * Counts commits with at least one added text line in `git log --numstat --format=@@<sha>` output (no merges).
 * Anything that is not a commit header, a blank line or a numstat record throws (fail closed).
 */
export function countCommitsWithAddedText(text) {
  let commits = 0;
  let current = false;
  let counted = false;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    if (/^@@[0-9a-f]{40}$/.test(line)) {
      current = true;
      counted = false;
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t.+$/.exec(line);
    if (!current || !m) throw new Error('unparseable git log --numstat output');
    if (m[1] !== '-' && Number(m[1]) > 0 && !counted) {
      counted = true;
      commits += 1;
    }
  }
  return commits;
}

/** The independently derived expected scanner count and the total commit count described above, from Git only. */
export function expectedHistoryCommits(git) {
  const raw = git(['rev-list', '--all', '--count']).trim();
  if (!/^\d+$/.test(raw)) throw new Error('unparseable commit count');
  const total = Number(raw);
  const expected = countCommitsWithAddedText(git(['log', '--all', '--no-merges', '--numstat', '--format=@@%H']));
  if (expected > total) throw new Error('inconsistent commit counts');
  return { expected, total };
}

// ---------------------------------------------------------------------------------------------
// Object enumeration (SHA-1 object ids only; anything else fails closed)

const OID = /^[0-9a-f]{40}$/;

/** `git rev-list --all --objects`: every line is an object id optionally followed by a path. */
export function parseRevListObjects(out) {
  const ids = new Set();
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const m = /^([0-9a-f]{40})(?: .*)?$/.exec(line);
    if (!m) throw new Error('unparseable line in rev-list --objects output');
    ids.add(m[1]);
  }
  return ids;
}

/** `git for-each-ref --format="%(objectname) %(objecttype) %(refname)" refs/codex`. */
export function parseRefTips(out) {
  const tips = [];
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const m = /^([0-9a-f]{40}) (commit|tree|blob|tag) (refs\/codex\/.+)$/.exec(line);
    if (!m) throw new Error('unparseable line in for-each-ref output');
    tips.push({ id: m[1], type: m[2] });
  }
  return tips;
}

/** `git ls-tree -r -z`: records "<mode> <type> <id>\t<path>"; gitlinks (commit) are not blobs of this repository. */
export function parseLsTreeZ(out) {
  const ids = [];
  for (const rec of out.split('\0')) {
    if (rec === '') continue;
    const m = /^(\d{6}) (blob|commit) ([0-9a-f]{40})\t/.exec(rec);
    if (!m) throw new Error('unparseable record in ls-tree output');
    if (m[2] === 'blob') ids.push(m[3]);
  }
  return ids;
}

/** `git fsck --unreachable --no-reflogs`: only "unreachable <type> <id>" lines are accepted. */
export function parseFsckUnreachable(out) {
  const blobs = [];
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    const m = /^unreachable (blob|tree|commit|tag) ([0-9a-f]{40})$/.exec(t);
    if (!m) throw new Error('unparseable line in fsck output');
    if (m[1] === 'blob') blobs.push(m[2]);
  }
  return blobs;
}

/** `git cat-file --batch-check` output: exactly one "<id> <type> <size>" line per requested id, in order. */
export function parseBatchCheck(out, ids) {
  const lines = out.split('\n').filter((l) => l !== '');
  if (lines.length !== ids.length) throw new Error('cat-file --batch-check did not answer every object');
  const meta = new Map();
  lines.forEach((line, i) => {
    const m = /^([0-9a-f]{40}) (blob|tree|commit|tag) (\d+)$/.exec(line);
    if (!m || m[1] !== ids[i]) throw new Error('unparseable or unexpected line in cat-file --batch-check output');
    meta.set(m[1], { type: m[2], size: Number(m[3]) });
  });
  return meta;
}

/** `git cat-file --batch` output (binary): "<id> <type> <size>\n<content>\n" per object, in request order. */
export function parseBatch(buf, ids) {
  const out = new Map();
  let pos = 0;
  for (const id of ids) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) throw new Error('truncated cat-file --batch output');
    const m = /^([0-9a-f]{40}) (blob|tree|commit|tag) (\d+)$/.exec(buf.subarray(pos, nl).toString('latin1'));
    if (!m || m[1] !== id) throw new Error('unexpected header in cat-file --batch output');
    const size = Number(m[3]);
    const start = nl + 1;
    if (start + size + 1 > buf.length || buf[start + size] !== 0x0a) throw new Error('truncated cat-file --batch content');
    out.set(id, { type: m[2], size, content: buf.subarray(start, start + size) });
    pos = start + size + 1;
  }
  if (pos !== buf.length) throw new Error('unexpected trailing cat-file --batch output');
  return out;
}

/**
 * Enumerates every blob from the three required sources and materializes each once, by object id, into `dir`.
 * Returns the source-set accounting and the independently computed total size.
 */
function materializeAllBlobs(git, dir) {
  const history = parseRevListObjects(git(['rev-list', '--all', '--objects']));
  const codex = new Set();
  const tips = parseRefTips(git(['for-each-ref', '--format=%(objectname) %(objecttype) %(refname)', 'refs/codex']));
  for (const tip of tips) {
    if (tip.type === 'blob') codex.add(tip.id);
    else for (const id of parseLsTreeZ(git(['ls-tree', '-r', '-z', tip.id]))) codex.add(id);
  }
  const fsckOut = git(['fsck', '--unreachable', '--no-reflogs']);
  const unreachable = new Set(parseFsckUnreachable(fsckOut));
  const unreachableObjects = fsckOut.split('\n').filter((l) => l.trim() !== '').length;

  const candidates = [...new Set([...history, ...codex, ...unreachable])];
  const meta = candidates.length ? parseBatchCheck(git(['cat-file', '--batch-check'], { input: `${candidates.join('\n')}\n` }), candidates) : new Map();
  const isBlob = (id) => meta.get(id)?.type === 'blob';
  // refs/codex and unreachable entries were listed as blobs: the object type must agree.
  for (const id of [...codex, ...unreachable]) if (!isBlob(id)) throw new Error('an object listed as a blob is not a blob');
  const historyBlobs = new Set([...history].filter(isBlob));
  const union = new Set([...historyBlobs, ...codex, ...unreachable]);

  const ids = [...union];
  const missing = [];
  let materialized = 0;
  let bytesOnDisk = 0;
  if (ids.length > 0) {
    const batch = parseBatch(git(['cat-file', '--batch'], { input: `${ids.join('\n')}\n`, buffer: true }), ids);
    for (const id of ids) {
      const got = batch.get(id);
      if (!got || got.type !== 'blob' || got.size !== meta.get(id).size || got.content.length !== got.size) {
        missing.push(id);
        continue;
      }
      writeFileSync(join(dir, id), got.content);
      materialized += 1;
      bytesOnDisk += statSync(join(dir, id)).size;
    }
  }
  const expectedBytes = ids.reduce((s, id) => s + meta.get(id).size, 0);
  const onDisk = new Set(readdirSync(dir));
  const uncovered = ids.filter((id) => !onDisk.has(id)).length + [...onDisk].filter((n) => !union.has(n)).length;
  return {
    counts: { history: historyBlobs.size, codexRefs: tips.length, codex: codex.size, unreachableObjects, unreachable: unreachable.size, union: union.size },
    expectedBytes,
    bytesOnDisk,
    materialized,
    missing: missing.length,
    uncovered,
  };
}

// ---------------------------------------------------------------------------------------------
// The full gate

/**
 * @param {{ run: Function, repo: string, version?: string, git?: (repo:string) => Function }} o
 */
export function runPrepublicationGate({ run, repo, version = PINNED_VERSION, git: gitFactory, env = process.env }) {
  gitFactory ??= (r) => defaultGit(r, env);
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
  const stage = (name, fn) => {
    try {
      fn();
    } catch (e) {
      add(`${name}: could not be completed (fail closed)`, false, String(e.message).split('\n')[0]);
    }
  };
  let root;
  try {
    root = mkdtempSync(join(tmpdir(), 'cm-gate-'));
    assertOutside(repo, root);
  } catch (e) {
    if (root) rmSync(root, { recursive: true, force: true });
    add('temporary location is outside the repository', false, String(e.message).split('\n')[0]);
    return { ok: false, checks };
  }
  try {
    let owned;
    try {
      owned = makeOwned(root);
    } catch (e) {
      add('gate-owned scanner config and ignore location', false, String(e.message).split('\n')[0]);
      return { ok: false, checks };
    }
    const canaryRoot = join(root, 'canary');
    mkdirSync(canaryRoot);
    stage('canary', () => canaryChecks({ run, version, owned, root: canaryRoot, add, env }));
    if (checks.some((c) => !c.ok)) {
      add('real scans skipped: the scanner failed its canary, so no clean result can be trusted', false, '');
      return { ok: false, checks };
    }

    const git = gitFactory(repo);

    // Repository identity: every later Git command (-C <repo>) must resolve to the repository that was asked for.
    stage('repository identity', () => {
      const top = git(['rev-parse', '--show-toplevel']).trim();
      const bare = git(['rev-parse', '--is-bare-repository']).trim();
      add('repository identity: Git resolves the requested path as its own work tree root', top !== '' && bare === 'false' && sameDir(top, repo), '');
    });
    if (checks.some((c) => !c.ok)) {
      add('real scans skipped: the repository target cannot be proven', false, '');
      return { ok: false, checks };
    }
    // A replacement ref makes ordinary Git read other content than the object a push publishes. All Git and scanner
    // children run with GIT_NO_REPLACE_OBJECTS=1 regardless (GIT_REPLACE_REF_BASE could hide refs from this listing);
    // this refusal is defense in depth and tells the operator. Nothing is deleted or rewritten.
    stage('replace refs', () => {
      const refs = git(['for-each-ref', '--format=%(refname)', 'refs/replace']).split('\n').filter((l) => l.trim() !== '');
      add('repository has no refs/replace/** replacement refs', refs.length === 0, `refs/replace ${refs.length}`);
    });
    // The scans below still run (under GIT_NO_REPLACE_OBJECTS=1) so the operator also sees what the original objects hold.

    // A repository-root .gitleaksignore is read by the scanner whatever --gitleaks-ignore-path says.
    stage('ignore-file check', () => {
      let rootIgnore = false;
      try {
        lstatSync(join(repo, '.gitleaksignore'));
        rootIgnore = true;
      } catch {
        /* absent */
      }
      const tracked = git(['ls-files', '-z']).split('\0').filter((p) => p === '.gitleaksignore' || p.endsWith('/.gitleaksignore'));
      add('repository has no .gitleaksignore (working tree or tracked)', !rootIgnore && tracked.length === 0, rootIgnore || tracked.length ? 'present' : '');
    });

    stage('current tree', () => {
      const t = run(['dir', repo, ...owned.args, ...rep(join(root, 'tree.json'))]);
      const tb = parseBytesScanned(t.out);
      add('current tree: no leaks, exit 0', t.code === 0 && saysNoLeaks(t.out), `exit ${t.code}`);
      add('current tree: scanned a non-zero number of bytes', tb !== null && tb > 0, `bytes ${tb}`);
    });

    stage('history', () => {
      const { expected, total } = expectedHistoryCommits(git);
      const h = run(['git', '--log-opts=--all', repo, ...owned.args, ...rep(join(root, 'hist.json'))]);
      const reported = parseCommitsScanned(h.out);
      add('history: no leaks, exit 0', h.code === 0 && saysNoLeaks(h.out), `exit ${h.code}`);
      add(
        'history: scanner commit count equals the independently derived expected count',
        total > 0 && reported !== null && reported === expected,
        `expected ${expected}, total ${total}, scanner reported ${reported}`,
      );
    });

    stage('blob coverage', () => {
      const dir = join(root, 'blobs');
      mkdirSync(dir);
      const m = materializeAllBlobs(git, dir);
      const c = m.counts;
      add(
        'blob coverage: every enumerated blob materialized exactly once',
        m.missing === 0 && m.uncovered === 0 && m.materialized === c.union && m.bytesOnDisk === m.expectedBytes,
        `history ${c.history}, refs/codex refs ${c.codexRefs}, refs/codex ${c.codex}, unreachable objects ${c.unreachableObjects}, unreachable ${c.unreachable}, union ${c.union}, missing ${m.missing}, uncovered ${m.uncovered}`,
      );
      const b = run(['dir', dir, ...owned.args, ...rep(join(root, 'blobs.json'))]);
      const reported = parseBytesScanned(b.out);
      add('blob scan: no leaks, exit 0', b.code === 0 && saysNoLeaks(b.out), `exit ${b.code}, ${c.union} blob(s)`);
      add(
        'blob scan: scanned bytes equal the independently computed size of the materialized blobs',
        reported !== null && reported === m.expectedBytes,
        `expected ${m.expectedBytes}, scanner reported ${reported}`,
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
