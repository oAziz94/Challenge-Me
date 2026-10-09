// Every file of a repository checkout as repository-relative paths with forward slashes. The meta-gate passes each path
// through forbiddenFileReason, so the forbidden-file policy is applied to what is really on disk, not to a hand-written list.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

export function listRepositoryFiles(root, dir = '') {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir === '' ? entry.name : dir + '/' + entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) out.push(...listRepositoryFiles(root, rel));
    } else out.push(rel);
  }
  return out.sort();
}
