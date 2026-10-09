// Foundation Task 2 gate-defining root files are self-modifying paths (STACK-ADR-002 6.3): a change to any of them can weaken
// the gate that judges it, so the notice "CI result is not authoritative; inspect the actual diff" must be printed for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASK2_GATE_DEFINING_FILES, classifyPath, evaluateChangeSet } from '../lib/authoritative-path.mjs';

const EXPECTED = [
  'package.json',
  '.prettierignore',
  '.prettierrc.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'tsconfig.json',
  '.dependency-cruiser.cjs',
  'Dockerfile',
  '.dockerignore',
  'pnpm-lock.yaml',
  '.node-version',
];
const evaluate = (changes) => evaluateChangeSet({ changes, readFile: () => null, readBase: () => null, listDir: () => [] });

test('the Task 2 gate-defining list is exactly the authorized set', () => {
  assert.deepEqual([...TASK2_GATE_DEFINING_FILES].sort(), [...EXPECTED].sort());
});

test('each gate-defining root path is classified self-modifying, and is not authoritative', () => {
  for (const path of EXPECTED) {
    const k = classifyPath(path);
    assert.equal(k.selfModifying, true, path);
    assert.equal(k.authoritative, false, path);
  }
});

test('each gate-defining root path produces the SELF_MODIFYING notice for every kind of change, and the check still passes', () => {
  for (const path of EXPECTED) {
    for (const status of ['A', 'M', 'D']) {
      const r = evaluate([{ path, status }]);
      assert.equal(r.ok, true, `${status} ${path}`);
      assert.deepEqual(
        r.notices.map((n) => n.path),
        [path],
        `${status} ${path}`,
      );
      assert.match(r.notices[0].kind, /^SELF_MODIFYING: CI result is not authoritative; inspect the actual diff$/);
    }
  }
});

test('the classification is exact: look-alikes and nested copies are not newly classified', () => {
  for (const path of ['sub/package.json', 'package.json.bak', 'Dockerfile.dev', 'docs/Dockerfile', 'tsconfig.build.json', 'src/.node-version', 'pnpm-lock.yaml.orig', 'sub/.prettierrc.json', '.prettierrc', '.prettierrc.yaml', '.prettierrc.json.bak', 'prettier.config.mjs']) {
    assert.equal(classifyPath(path).selfModifying, false, path);
  }
});

test('Task 1 classifications are unchanged', () => {
  for (const path of ['.github/workflows/ci.yml', 'scripts/governance/lib/x.mjs', 'docs/specifications/authoritative/a.md', '.claude/settings.json', '.gitignore', '.gitattributes', '.gitleaks.toml', 'CODEOWNERS', 'docs/CODEOWNERS']) {
    assert.equal(classifyPath(path).selfModifying, true, path);
  }
  for (const path of ['CLAUDE.md', 'AGENTS.md', 'docs/decisions/CR-1.md', 'docs/architecture/x.md']) {
    const k = classifyPath(path);
    assert.equal(k.selfModifying, false, path);
    assert.equal(k.governance, true, path);
  }
  assert.deepEqual(classifyPath('README.md'), { authoritative: false, selfModifying: false, governance: false });
});
