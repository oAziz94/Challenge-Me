// The architecture job: the real run passes and its self-test shows the gate can fail. dependency-cruiser exits 0 on an
// empty scope, so the script must also refuse an inconclusive (0 modules) result; that is checked on a copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const script = 'scripts/governance/ci-gates/architecture-check.mjs';
const run = (cwdRoot) => {
  const r = spawnSync(process.execPath, [join(cwdRoot, script)], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

test('the real run passes, and says the module-boundary gates are pending, not passed', () => {
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /self-test: ok \(the gate detects no-circular, no-unresolvable\)/);
  assert.match(r.out, /module-boundary gates are pending, not passed/);
});

function copy(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cm-arch-'));
  for (const rel of files) cpSync(join(root, rel), join(dir, rel), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
}
const BASE = [
  '.dependency-cruiser.cjs',
  'vitest.config.ts',
  'tsconfig.json',
  'package.json',
  script,
  'scripts/governance/ci-gates/architecture-selftest',
  'scripts/governance/ci-gates/harness',
];

test('a scope with no module is inconclusive and fails (dependency-cruiser alone would exit 0)', () => {
  assert.ok(existsSync(join(root, 'node_modules', 'dependency-cruiser')));
  const dir = copy(BASE.filter((f) => !f.endsWith('/harness')));
  try {
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /0 modules were cruised/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a self-test fixture set that no longer violates the rules fails (the gate would not detect a violation)', () => {
  const dir = copy(BASE);
  try {
    rmSync(join(dir, 'scripts/governance/ci-gates/architecture-selftest/cycle-b.mjs'));
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /did not trigger "no-circular"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a real violation in the real scope fails the gate', () => {
  const dir = copy(BASE);
  try {
    cpSync(
      join(root, 'scripts/governance/ci-gates/architecture-selftest/cycle-a.mjs'),
      join(dir, 'scripts/governance/ci-gates/harness/cycle-a.mjs'),
    );
    cpSync(
      join(root, 'scripts/governance/ci-gates/architecture-selftest/cycle-b.mjs'),
      join(dir, 'scripts/governance/ci-gates/harness/cycle-b.mjs'),
    );
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL no-circular/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
