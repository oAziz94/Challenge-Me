#!/usr/bin/env node
// The architecture job (Foundation Task 2; STACK-ADR-001 4.8 layer 1, 4.7): runs dependency-cruiser with the repository
// rules and proves the tool is able to fail. dependency-cruiser exits 0 with "0 modules cruised" when it is pointed at
// nothing, so a clean exit alone is not evidence. This script therefore requires BOTH:
//   1. self-test: the deliberately broken fixtures must produce the named violations (the gate can fail);
//   2. real scope: at least one module is cruised and there is no error-level violation.
// Module-boundary, SDK-outside-adapters and database-constructor rules are NOT enforced here: they need the module
// layout of a later task and are tracked as pending gates in gates.json (never as a pass).
// Exit 0 = both hold; 1 = a violation or an inconclusive result; 2 = the tool could not run.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const pkgJsonPath = join(root, 'node_modules', 'dependency-cruiser', 'package.json');
if (!existsSync(pkgJsonPath)) {
  console.error('architecture: dependency-cruiser is not installed (run the frozen-lockfile install first)');
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['depcruise'];
const bin = join(dirname(pkgJsonPath), binRel);

function cruise(paths) {
  const r = spawnSync(process.execPath, [bin, '--config', '.dependency-cruiser.cjs', '--output-type', 'json', ...paths], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (r.error) throw new Error(`cannot run dependency-cruiser (${r.error.code ?? 'error'})`);
  let result;
  try {
    result = JSON.parse(r.stdout);
  } catch {
    throw new Error(`dependency-cruiser produced no JSON (exit ${r.status}): ${String(r.stderr).split('\n')[0]}`);
  }
  const summary = result.summary ?? {};
  const violations = Array.isArray(summary.violations) ? summary.violations : [];
  return { status: r.status, cruised: summary.totalCruised ?? 0, violations };
}

try {
  let failed = false;

  const selfTest = cruise(['scripts/governance/ci-gates/architecture-selftest']);
  const rules = new Set(selfTest.violations.map((v) => v.rule?.name));
  for (const expected of ['no-circular', 'no-unresolvable']) {
    if (!rules.has(expected)) {
      console.log(`FAIL self-test: the broken fixtures did not trigger "${expected}": the architecture gate would not detect it`);
      failed = true;
    }
  }
  // The JSON reporter does not set the exit code from violations, so detection is judged from the reported rule names.
  if (!failed) console.log(`architecture self-test: ok (the gate detects ${[...rules].sort().join(', ')})`);

  const scope = ['src', 'tests', 'scripts/governance/ci-gates/harness'].filter((p) => existsSync(join(root, p)));
  const real = scope.length > 0 ? cruise(scope) : { cruised: 0, violations: [] };
  const errors = real.violations.filter((v) => v.rule?.severity === 'error');
  if (real.cruised < 1) {
    console.log('FAIL real scope: 0 modules were cruised, so "no violations" would prove nothing');
    failed = true;
  }
  for (const v of errors) console.log(`FAIL ${v.rule.name}: ${v.from} -> ${v.to}`);
  if (errors.length > 0) failed = true;
  console.log(
    `architecture real scope: ${real.cruised} module(s) cruised in ${scope.join(', ')}; ${errors.length} error-level violation(s)`,
  );

  console.log(
    failed ? 'architecture: FAIL' : 'architecture: PASS (layout-independent rules only; module-boundary gates are pending, not passed)',
  );
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(`architecture: cannot run (${String(e.message).split('\n')[0]})`);
  process.exit(2);
}
