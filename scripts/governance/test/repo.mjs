// Throwaway Git repositories for CLI-level tests. Everything lives under the OS temp directory.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOOD_NAME = 'oAziz94';
export const GOOD_EMAIL = '30234485+oAziz94@users.noreply.github.com';
const here = dirname(fileURLToPath(import.meta.url));
export const CLI_IDENTITY = join(here, '..', 'check-commit-identity.mjs');
export const CLI_PATH = join(here, '..', 'check-authoritative-path.mjs');

export function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cm-gov-'));
  const env = (a = {}, c = {}) => ({
    ...process.env,
    GIT_AUTHOR_NAME: a.name ?? GOOD_NAME,
    GIT_AUTHOR_EMAIL: a.email ?? GOOD_EMAIL,
    GIT_COMMITTER_NAME: c.name ?? GOOD_NAME,
    GIT_COMMITTER_EMAIL: c.email ?? GOOD_EMAIL,
  });
  const git = (args, { input, a, c, cwd } = {}) =>
    execFileSync('git', args, { cwd: cwd ?? dir, env: env(a, c), input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'core.autocrlf', 'false']); // quotePath is deliberately left at its default

  const repo = {
    dir,
    git,
    head: () => git(['rev-parse', 'HEAD']).trim(),
    /** Writes files (path -> text; null deletes), stages everything and commits. */
    commitFiles(files, msg = 'test commit', opts = {}) {
      for (const [p, text] of Object.entries(files)) {
        const full = join(dir, p);
        if (text === null) rmSync(full, { force: true });
        else {
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, text);
        }
      }
      git(['add', '-A']);
      git(['commit', '-q', '--allow-empty', '-m', msg], opts);
      return repo.head();
    },
    /** Adds a blob at a path through the index only (names the filesystem cannot hold) and commits. */
    commitIndexOnly(path, text, msg = 'test commit') {
      const sha = git(['hash-object', '-w', '--stdin'], { input: text }).trim();
      // protectNTFS is disabled for this throwaway repository only, so Git for Windows accepts the names.
      git(['-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${sha},${path}`]);
      git(['-c', 'core.protectNTFS=false', 'commit', '-q', '-m', msg]);
      return repo.head();
    },
    /** Commits with an exact (verbatim) message, including control characters. */
    commitMessage(message, opts = {}) {
      git(['commit', '-q', '--allow-empty', '--cleanup=verbatim', '-F', '-'], { input: message, ...opts });
      return repo.head();
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
  return repo;
}

/** Runs a CLI under the active Node; returns { code, out } (stdout + stderr). Never throws. */
export function runCli(script, args, cwd) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
