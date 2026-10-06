#!/usr/bin/env node
// Usage: node scripts/governance/check-commit-identity.mjs <base>..<head>   (any `git rev-list` revision range)
// Exit 0 = every non-exempt commit conforms; 1 = violation; 2 = usage/git/parse error (never a pass).
// Output names commit hashes and rule violations only; it never prints message bodies.
//
// Framing: the commit list comes from `git rev-list` (hashes only), and each commit is then read as its own
// object with `git cat-file commit`. No byte of a commit message is ever used as a delimiter.
import { execFileSync } from 'node:child_process';
import { evaluateCommits } from './lib/commit-identity.mjs';
import { parseCommitObject, parseRevList } from './lib/git-parse.mjs';

const range = process.argv[2];
if (!range || range.startsWith('-')) {
  console.error('usage: check-commit-identity.mjs <revision-range>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let commits;
try {
  const ids = parseRevList(git('rev-list', range, '--'));
  commits = ids.map((id) => parseCommitObject(id, git('cat-file', 'commit', id)));
} catch (e) {
  console.error(`commit identity: cannot read the requested range (${e.message.split('\n')[0]})`);
  process.exit(2);
}

const { ok, results } = evaluateCommits(commits);
for (const r of results) {
  const label = r.exempt ? 'EXEMPT (historical)' : r.ok ? 'ok' : 'FAIL';
  console.log(`${r.hash.slice(0, 12)} ${label}`);
  for (const v of r.violations) console.log(`  - ${v}`);
}
console.log(ok ? `commit identity: PASS (${results.length} commit(s))` : 'commit identity: FAIL');
process.exit(ok ? 0 : 1);
