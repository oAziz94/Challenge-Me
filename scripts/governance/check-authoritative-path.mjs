#!/usr/bin/env node
// Usage: node scripts/governance/check-authoritative-path.mjs <base-ref> <head-ref>
// Compares the merge-base B of the two refs with <head-ref> H. Evidence is read at H; freshness is judged B..H.
// Exit 0 = pass (notices may be printed); 1 = authoritative-path evidence missing; 2 = usage/git/parse error.
// No bypass: there is no flag, label, keyword or environment variable that skips the check.
//
// Pathnames come from NUL-delimited (-z) Git output, relative to the repository root, so Git's path quoting
// cannot change how a path is classified.
import { execFileSync } from 'node:child_process';
import { evaluateChangeSet } from './lib/authoritative-path.mjs';
import { parseNameStatusZ, parseNulList } from './lib/git-parse.mjs';

const [base, head] = process.argv.slice(2);
if (!base || !head || base.startsWith('-') || head.startsWith('-')) {
  console.error('usage: check-authoritative-path.mjs <base-ref> <head-ref>');
  process.exit(2);
}

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let root;
let mergeBase;
let changes;
try {
  root = run(undefined, 'rev-parse', '--show-toplevel').trim();
  const git = (...args) => run(root, ...args);
  mergeBase = git('merge-base', base, head).trim();
  // --no-renames: a rename shows as delete + add; the parser also accepts R/C records and fails them closed.
  changes = parseNameStatusZ(
    git('diff', '--no-renames', '--no-relative', '-z', '--name-status', mergeBase, head, '--'),
  );
} catch (e) {
  console.error(`authoritative-path check: cannot determine the change set (${e.message.split('\n')[0]})`);
  process.exit(2);
}

const git = (...args) => run(root, ...args);
const show = (rev) => (path) => {
  try {
    return git('show', `${rev}:${path}`);
  } catch {
    return null;
  }
};
const listDir = (dir) => {
  try {
    return parseNulList(git('ls-tree', '-z', '--name-only', head, `${dir}/`)).map((p) => p.slice(dir.length + 1));
  } catch {
    return [];
  }
};

const result = evaluateChangeSet({ changes, readFile: show(head), readBase: show(mergeBase), listDir });
// Paths are printed JSON-escaped so a hostile filename cannot forge output lines.
for (const n of result.notices) console.log(`NOTICE ${JSON.stringify(n.path)} — ${n.kind}`);
for (const f of result.failures) console.log(`FAIL ${f.replace(/[\r\n]/g, ' ')}`);
if (result.authoritativeTouched.length === 0) console.log('authoritative path: not touched');
console.log(result.ok ? 'authoritative-path check: PASS' : 'authoritative-path check: FAIL');
process.exit(result.ok ? 0 : 1);
