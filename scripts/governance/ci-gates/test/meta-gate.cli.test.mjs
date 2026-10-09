// The meta-gate CLI against copies of the real repository files: the unmodified copy passes and prints its pending gates;
// each tampering that would let coverage disappear silently makes it fail. The copy gets a junction to node_modules so
// the copied script resolves its `yaml` dependency; the real repository is never modified.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const COPY = [
  '.github',
  'scripts/governance/ci-gates',
  'package.json',
  'pnpm-lock.yaml',
  '.node-version',
  'Dockerfile',
  '.prettierignore',
  '.prettierrc.json',
  'eslint.config.mjs',
  'vitest.config.ts',
];
const dirs = [];

before(() => {
  assert.ok(existsSync(join(root, 'node_modules', 'yaml')), 'run the frozen-lockfile install first');
});
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cm-gates-'));
  dirs.push(dir);
  for (const rel of COPY) cpSync(join(root, rel), join(dir, rel), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
}
const gate = (dir, ...args) => {
  const r = spawnSync(process.execPath, [join(dir, 'scripts/governance/ci-gates/check-gates.mjs'), ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), 'utf8')));
const editJson = (dir, rel, fn) => edit(dir, rel, (t) => JSON.stringify(fn(JSON.parse(t)), null, 2));

test('the unmodified repository passes; every pending gate is listed and none is reported as passed', () => {
  const dir = copyRepo();
  const r = gate(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PENDING gates \(NOT implemented/);
  assert.match(r.out, /cross-tenant-endpoint-suite {2}<- fb20-task-4/);
  assert.doesNotMatch(r.out, /migration-verification {2}<-/, 'migration-verification is implemented, not pending');
  assert.match(r.out, /pooled-connection-leak {2}<- fb20-task-4, decision-test-only-pooler/);
  assert.match(r.out, /NOT passed gates/);
  const gates = JSON.parse(readFileSync(join(dir, 'scripts/governance/ci-gates/gates.json'), 'utf8')).gates;
  const pending = gates.filter((g) => g.state === 'pending').map((g) => g.id);
  assert.ok(pending.length >= 20);
  const ci = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8');
  for (const id of pending) assert.doesNotMatch(ci, new RegExp(`^ {2}${id}:`, 'm'), `${id}: a pending gate has no job`);
});

test('--list-required-checks prints exactly the required gates (for registering them on main)', () => {
  const r = gate(copyRepo(), '--list-required-checks');
  assert.equal(r.code, 0, r.out);
  const names = r.out.trim().split('\n');
  for (const n of [
    'commit-identity',
    'authoritative-path',
    'secret-scan',
    'install-frozen',
    'lint',
    'format',
    'typecheck',
    'unit',
    'architecture',
    'integration-skeleton',
    'migration-verification',
    'integration-real-roles',
    'table-category-registry-vs-rls',
    'dependency-scan',
    'image-build',
    'image-scan',
    'gate-catalogue',
  ]) {
    assert.ok(names.includes(n), n);
  }
  assert.ok(!names.includes('pooled-connection-leak'), 'pending gates are not required checks');
  assert.ok(!names.includes('dependency-report-weekly'), 'the scheduled gate is not a pull-request check');
});

test('deleting a required job from the workflow fails (a required gate disappeared)', () => {
  const dir = copyRepo();
  edit(dir, '.github/workflows/ci.yml', (t) => {
    const a = t.indexOf('\n  lint:\n');
    const b = t.indexOf('\n  format:\n');
    return t.slice(0, a) + t.slice(b);
  });
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /gate "lint": job "lint" is missing/);
});

test('deleting the Task 1 secret-scan job from governance.yml fails (the existing scan stays intact)', () => {
  const dir = copyRepo();
  edit(dir, '.github/workflows/governance.yml', (t) => t.slice(0, t.indexOf('\n  secret-scan:\n')) + '\n');
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /gate "secret-scan": job "secret-scan" is missing/);
});

test('deleting a gate from the catalogue file fails', () => {
  const dir = copyRepo();
  editJson(dir, 'scripts/governance/ci-gates/gates.json', (c) => ({ ...c, gates: c.gates.filter((g) => g.id !== 'image-scan') }));
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /gate "image-scan": missing from the catalogue/);
  assert.match(r.out, /job "image-scan" is not in the gate catalogue/);
});

test('demoting an implemented gate to pending fails', () => {
  const dir = copyRepo();
  editJson(dir, 'scripts/governance/ci-gates/gates.json', (c) => ({
    ...c,
    gates: c.gates.map((g) =>
      g.id === 'image-scan' ? { id: g.id, state: 'pending', source: g.source, prerequisites: ['fb20-task-3'], reason: 'pretend' } : g,
    ),
  }));
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /gate "image-scan": an implemented gate cannot be pending/);
});

test('a pending gate whose prerequisites are all resolved fails until it is implemented', () => {
  const dir = copyRepo();
  editJson(dir, 'scripts/governance/ci-gates/gates.json', (c) => {
    c.prerequisites['fb20-task-6'].status = 'RESOLVED';
    return c;
  });
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /gate "processed-event-convention": every prerequisite is RESOLVED/);
});

test('policy violations in a workflow fail the meta-gate: privileged trigger, write permission, unpinned action, secret, unpinned service image', () => {
  const cases = [
    [
      'pull_request_target',
      (t) => t.replace('on:\n  pull_request:', 'on:\n  pull_request_target:\n    branches: [main]\n  pull_request:'),
      /trigger "pull_request_target" is not allowed/,
    ],
    [
      'workflow_run',
      (t) => t.replace('on:\n  pull_request:', 'on:\n  workflow_run:\n    workflows: [x]\n  pull_request:'),
      /trigger "workflow_run" is not allowed/,
    ],
    [
      'write permission',
      (t) =>
        t.replace(
          '  lint:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    permissions: {}',
          '  lint:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    permissions:\n      contents: write',
        ),
      /write permission "contents"/,
    ],
    [
      'unpinned action',
      (t) => t.replace('      - name: Lint\n        run: corepack pnpm run lint', '      - uses: actions/checkout@v4'),
      /not pinned to a full-length commit SHA/,
    ],
    ['secret', (t) => t.replace('CI: ' + "'true'", 'CI: ${{ secrets.TOKEN }}'), /references the secrets context/],
    ['unpinned service image', (t) => t.replace(/image: postgres:18\.6@sha256:[0-9a-f]{64}/, 'image: postgres:18'), /not pinned by digest/],
    [
      'non-frozen install',
      (t) =>
        t.replace(
          'ci-setup.sh --install\n      - name: Lint',
          'ci-setup.sh --install\n      - run: corepack pnpm install\n      - name: Lint',
        ),
      /pnpm install without --frozen-lockfile/,
    ],
  ];
  for (const [label, mutate, re] of cases) {
    const dir = copyRepo();
    edit(dir, '.github/workflows/ci.yml', mutate);
    const r = gate(dir);
    assert.equal(r.code, 1, `${label}: ${r.out}`);
    assert.match(r.out, re, label);
  }
});

test('supply-chain violations fail the meta-gate: workspace, bot updates, Node.js drift, base image without digest, lockfile removed', () => {
  const cases = [
    ['workspace file', (d) => writeFileSync(join(d, 'pnpm-workspace.yaml'), 'packages: []\n'), /pnpm-workspace.yaml: not allowed/],
    ['dependabot', (d) => writeFileSync(join(d, '.github/dependabot.yml'), 'version: 2\n'), /dependabot.yml: not allowed/],
    ['npm lockfile', (d) => writeFileSync(join(d, 'package-lock.json'), '{}\n'), /package-lock.json: not allowed/],
    ['Node.js drift', (d) => edit(d, '.node-version', () => '24.20.0\n'), /differs from .node-version/],
    ['base image digest removed', (d) => edit(d, 'Dockerfile', (t) => t.replace(/@sha256:[0-9a-f]{64}/, '')), /not pinned by digest/],
    ['lockfile removed', (d) => rmSync(join(d, 'pnpm-lock.yaml')), /lockfile must be committed/],
    [
      'unreviewed install script',
      (d) => edit(d, 'pnpm-lock.yaml', (t) => t.replace(/(\n {2}'?[^\n]+'?:\n {4}resolution:[^\n]+\n)/, '$1    requiresBuild: true\n')),
      /has an install script and no reviewed exception/,
    ],
  ];
  for (const [label, mutate, re] of cases) {
    const dir = copyRepo();
    mutate(dir);
    const r = gate(dir);
    assert.equal(r.code, 1, `${label}: ${r.out}`);
    assert.match(r.out, re, label);
  }
});

test('an install-script exception that is reviewed and justified lets the same lockfile pass', () => {
  const dir = copyRepo();
  edit(dir, 'pnpm-lock.yaml', (t) => t.replace(/(\n {2}'?([^\n]+?)'?:\n {4}resolution:[^\n]+\n)/, '$1    requiresBuild: true\n'));
  const failing = gate(dir);
  assert.equal(failing.code, 1, failing.out);
  const name = /"([^"]+)" has an install script/.exec(failing.out)?.[1];
  assert.ok(name, failing.out);
  editJson(dir, 'scripts/governance/ci-gates/install-script-exceptions.json', () => ({
    installScripts: [{ package: name, justification: 'test-only exception', reviewedBy: 'test reviewer' }],
  }));
  assert.equal(gate(dir).code, 0);
});

test('the gate fails closed when it cannot run (missing catalogue): exit 2, never a pass', () => {
  const dir = copyRepo();
  rmSync(join(dir, 'scripts/governance/ci-gates/gates.json'));
  const r = gate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /cannot run/);
});

test('the OPEN findings-policy decision and the idempotency row are listed as PENDING in every run, and cannot be silently dropped', () => {
  const dir = copyRepo();
  const ok = gate(dir);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /vulnerability-findings-policy {2}<- decision-vulnerability-findings-policy/);
  assert.match(ok.out, /idempotency-key-convention {2}<- fb20-no-assigned-task-owner/);
  for (const id of ['vulnerability-findings-policy', 'idempotency-key-convention']) {
    const d = copyRepo();
    editJson(d, 'scripts/governance/ci-gates/gates.json', (c) => ({ ...c, gates: c.gates.filter((g) => g.id !== id) }));
    const r = gate(d);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`gate "${id}": missing from the catalogue`));
  }
});

test('adding a severity, fixability or exit-code threshold to a scan, or an ignore file, fails the meta-gate', () => {
  for (const flag of ['--severity HIGH,CRITICAL', '--ignore-unfixed', '--exit-code 1']) {
    const dir = copyRepo();
    edit(dir, '.github/workflows/ci.yml', (t) => t.replace('--scanners vuln --no-progress', `--scanners vuln ${flag} --no-progress`));
    const r = gate(dir);
    assert.equal(r.code, 1, `${flag}: ${r.out}`);
    assert.match(r.out, /Trivy command must be exactly an allowed line/);
  }
  const dir = copyRepo();
  writeFileSync(join(dir, '.trivyignore'), 'CVE-0000-0000\n');
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\.trivyignore: not allowed/);
});

test('B1: weakening a pinned package.json script, a final run command or the .prettierignore scope fails the meta-gate', () => {
  const cases = [
    [
      'lint script',
      (d) => editJson(d, 'package.json', (j) => ({ ...j, scripts: { ...j.scripts, lint: 'true' } })),
      /script "lint" must be exactly/,
    ],
    [
      'check:gates script',
      (d) => editJson(d, 'package.json', (j) => ({ ...j, scripts: { ...j.scripts, 'check:gates': 'node -e 0' } })),
      /script "check:gates" must be exactly/,
    ],
    [
      'test:unit script',
      (d) => editJson(d, 'package.json', (j) => ({ ...j, scripts: { ...j.scripts, 'test:unit': 'echo ok' } })),
      /script "test:unit" must be exactly/,
    ],
    [
      'lint final run',
      (d) => edit(d, '.github/workflows/ci.yml', (t) => t.replace('run: corepack pnpm run lint', 'run: "true"')),
      /job "lint": step last must run exactly/,
    ],
    [
      'gate-catalogue final run',
      (d) => edit(d, '.github/workflows/ci.yml', (t) => t.replace('run: corepack pnpm run check:gates', 'run: node -e 0')),
      /job "gate-catalogue": step last must run exactly/,
    ],
    [
      'governance suite run',
      (d) => edit(d, '.github/workflows/ci.yml', (t) => t.replace('run: corepack pnpm run test:governance', 'run: "true"')),
      /job "governance-tests": step -2 must run exactly/,
    ],
    ['prettierignore *', (d) => edit(d, '.prettierignore', (t) => t + '\n*\n'), /\.prettierignore: unexpected pattern "\*"/],
    ['prettierignore removed', (d) => rmSync(join(d, '.prettierignore')), /\.prettierignore: missing/],
  ];
  for (const [label, mutate, re] of cases) {
    const dir = copyRepo();
    mutate(dir);
    const r = gate(dir);
    assert.equal(r.code, 1, label + ': ' + r.out);
    assert.match(r.out, re, label);
  }
});

test('B4: TRIVY_* variables, a changed scan command, pnpm audit in a workflow, pnpm.auditConfig and a .npmrc fail the meta-gate', () => {
  const ci = '.github/workflows/ci.yml';
  const scan = '--scanners vuln --no-progress';
  const cases = [
    [
      'TRIVY_SEVERITY env',
      (d) => edit(d, ci, (t) => t.replace("CI: 'true'", "CI: 'true'\n  TRIVY_SEVERITY: CRITICAL")),
      /environment variable TRIVY_SEVERITY can encode scanner policy/,
    ],
    [
      'TRIVY_SKIP_DB_UPDATE env',
      (d) => edit(d, ci, (t) => t.replace("CI: 'true'", "CI: 'true'\n  TRIVY_SKIP_DB_UPDATE: 'true'")),
      /environment variable TRIVY_SKIP_DB_UPDATE/,
    ],
    ['-s CRITICAL', (d) => edit(d, ci, (t) => t.replace(scan, '-s CRITICAL ' + scan)), /Trivy command must be exactly an allowed line/],
    [
      '--ignore-status',
      (d) => edit(d, ci, (t) => t.replace(scan, '--ignore-status fixed ' + scan)),
      /Trivy command must be exactly an allowed line/,
    ],
    [
      '--pkg-types os',
      (d) => edit(d, ci, (t) => t.replace(scan, '--pkg-types os ' + scan)),
      /Trivy command must be exactly an allowed line/,
    ],
    [
      'pnpm audit --ignore-unfixable',
      (d) =>
        edit(d, ci, (t) =>
          t.replace(
            'run: node scripts/governance/ci-gates/vulnerability-report.mjs dependency',
            'run: corepack pnpm audit --ignore-unfixable',
          ),
        ),
      /pnpm audit may only be run by vulnerability-report\.mjs/,
    ],
    [
      'pnpm.auditConfig',
      (d) => editJson(d, 'package.json', (j) => ({ ...j, pnpm: { auditConfig: { ignoreCves: ['CVE-2024-1'] } } })),
      /pnpm\.auditConfig can encode a findings policy/,
    ],
    ['.npmrc', (d) => writeFileSync(join(d, '.npmrc'), 'audit-level=critical\n'), /\.npmrc: not allowed/],
  ];
  for (const [label, mutate, re] of cases) {
    const dir = copyRepo();
    mutate(dir);
    const r = gate(dir);
    assert.equal(r.code, 1, label + ': ' + r.out);
    assert.match(r.out, re, label);
  }
});

test('B4: unrelated commands such as git diff --exit-code are not rejected, and the setup script uses it', () => {
  const dir = copyRepo();
  assert.match(
    readFileSync(join(dir, 'scripts/governance/ci-gates/ci-setup.sh'), 'utf8'),
    /git diff --exit-code -- pnpm-lock\.yaml package\.json/,
  );
  edit(dir, '.github/workflows/ci.yml', (t) =>
    t.replace('run: corepack pnpm run lint', 'run: |\n          git diff --exit-code\n          corepack pnpm run lint'),
  );
  const r = gate(dir);
  assert.doesNotMatch(r.out, /findings-based|Trivy command/);
});

// ---------------------------------------------------------------------------------------------------- second re-review: B1 / B4 / N1
import { FORBIDDEN_BASENAMES, FORBIDDEN_FILES, SHADOW_CONFIGS, forbiddenFileReason } from '../lib/supply-chain.mjs';
import { listRepositoryFiles } from '../lib/repo-files.mjs';
import { mkdirSync } from 'node:fs';

/** One concrete, forbidden path per policy entry, at the root and nested - generated from the policy itself, never listed by hand here. */
function forbiddenExamples() {
  const examples = new Set([...FORBIDDEN_FILES]);
  for (const base of FORBIDDEN_BASENAMES) {
    examples.add(base);
    examples.add('nested/dir/' + base);
  }
  const concrete = {
    'eslint.config.': 'js',
    '.prettierrc': '',
    'prettier.config.': 'js',
    'vitest.config.': 'js',
    'vite.config.': 'ts',
    '.pnpmfile.': 'cjs',
    'package.yaml': '',
    '.editorconfig': '',
    'package.json': '',
  };
  for (const { pattern, approved } of SHADOW_CONFIGS) {
    const stem = Object.keys(concrete).find((s) => pattern.test(s + concrete[s]));
    assert.ok(stem, 'a rule has no example here - add it to the table above: ' + pattern);
    if (approved !== stem + concrete[stem]) examples.add(stem + concrete[stem]); // an approved root file is not an example of a forbidden one
    examples.add('nested/dir/' + stem + concrete[stem]);
  }
  for (const { approved } of SHADOW_CONFIGS) if (approved) examples.add('nested/dir/' + approved); // the approved name is only approved at the root
  return [...examples];
}

test('forbidden-file policy and file scan cannot drift: every policy entry, root or nested, is found on disk and fails the real meta-gate', () => {
  const dir = copyRepo();
  const examples = forbiddenExamples();
  for (const rel of examples) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), 'x\n');
  }
  // the scan sees exactly what is on disk
  const scanned = listRepositoryFiles(dir);
  for (const rel of examples) assert.ok(scanned.includes(rel), rel + ' is scanned');
  assert.ok(!scanned.some((p) => p.startsWith('node_modules/')), 'node_modules is not scanned');
  const r = gate(dir);
  assert.equal(r.code, 1, r.out);
  for (const rel of examples) {
    assert.ok(forbiddenFileReason(rel), rel + ' is forbidden by the policy');
    assert.ok(r.out.includes('FAIL ' + rel + ': not allowed'), rel + ' is reported by the meta-gate');
  }
});

test('the approved root configuration files are accepted by the real meta-gate; the same names nested are not', () => {
  const dir = copyRepo();
  assert.equal(gate(dir).code, 0, 'the copy contains eslint.config.mjs, .prettierrc.json and vitest.config.ts at the root');
  for (const approved of ['eslint.config.mjs', '.prettierrc.json', 'vitest.config.ts']) {
    const d = copyRepo();
    mkdirSync(join(d, 'sub'), { recursive: true });
    writeFileSync(join(d, 'sub', approved), 'x\n');
    const r = gate(d);
    assert.equal(r.code, 1, approved);
    assert.match(r.out, new RegExp('FAIL sub/' + approved.replace(/\./g, '\\.') + ': not allowed'));
  }
});

test('the forbidden-file list is not duplicated in check-gates.mjs (one source of truth)', () => {
  const src = readFileSync(join(root, 'scripts/governance/ci-gates/check-gates.mjs'), 'utf8');
  assert.match(src, /listRepositoryFiles\(root\)/);
  assert.match(src, /existingFiles: listRepositoryFiles\(root\)/);
  for (const needle of ['topLevel', 'trivyignore', 'dependabot', 'renovate', 'pnpm-workspace', '.npmrc', '.pnpmfile']) {
    assert.ok(!src.includes(needle), 'check-gates.mjs must not carry its own list: ' + needle);
  }
});

test('N1: the setup script and the Dockerfile must pass --ignore-pnpmfile; removing it fails the real meta-gate', () => {
  const setup = 'scripts/governance/ci-gates/ci-setup.sh';
  assert.match(readFileSync(join(root, setup), 'utf8'), /pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile/);
  assert.match(readFileSync(join(root, 'Dockerfile'), 'utf8'), /pnpm install --prod --frozen-lockfile --ignore-scripts --ignore-pnpmfile/);

  const a = copyRepo();
  edit(a, setup, (t) => t.replace(' --ignore-pnpmfile', ''));
  const ra = gate(a);
  assert.equal(ra.code, 1, ra.out);
  assert.match(ra.out, /ci-setup\.sh: pnpm install without --ignore-pnpmfile/);

  const b = copyRepo();
  edit(b, 'Dockerfile', (t) => t.replace(' --ignore-pnpmfile', ''));
  const rb = gate(b);
  assert.equal(rb.code, 1, rb.out);
  assert.match(rb.out, /Dockerfile: pnpm install without --ignore-pnpmfile/);

  const c = copyRepo();
  edit(c, '.github/workflows/ci.yml', (t) =>
    t.replace(
      'run: corepack pnpm run lint',
      'run: |\n          corepack pnpm install --frozen-lockfile --ignore-scripts\n          corepack pnpm run lint',
    ),
  );
  const rc = gate(c);
  assert.equal(rc.code, 1, rc.out);
  assert.match(rc.out, /pnpm install without --ignore-pnpmfile/);
});

test('B4: workflow execution-context and environment bypasses fail the real meta-gate', () => {
  const ci = '.github/workflows/ci.yml';
  const cases = [
    ['workflow defaults', (t) => t.replace('\njobs:\n', '\ndefaults:\n  run:\n    shell: bash\njobs:\n'), /workflow-level "defaults"/],
    [
      'TRIVY_ in a non-run field',
      (t) => t.replace('jobs:\n', 'x-note: TRIVY_SEVERITY\njobs:\n'),
      /a TRIVY_\* variable can encode scanner policy/,
    ],
    [
      'npm_config env',
      (t) => t.replace("CI: 'true'", "CI: 'true'\n  npm_config_registry: http://127.0.0.1:9"),
      /environment variable npm_config_registry can change package-manager/,
    ],
    [
      'PNPM_CONFIG env',
      (t) => t.replace("CI: 'true'", "CI: 'true'\n  PNPM_CONFIG_AUDIT_LEVEL: critical"),
      /environment variable PNPM_CONFIG_AUDIT_LEVEL can change package-manager/,
    ],
    [
      'pnpm_config in run',
      (t) =>
        t.replace(
          'run: node scripts/governance/ci-gates/vulnerability-report.mjs dependency',
          'run: pnpm_config_registry=http://x node scripts/governance/ci-gates/vulnerability-report.mjs dependency',
        ),
      /an npm_config_\* or pnpm_config_\* name/,
    ],
  ];
  for (const [label, mutate, re] of cases) {
    const dir = copyRepo();
    edit(dir, ci, mutate);
    const r = gate(dir);
    assert.equal(r.code, 1, label + ': ' + r.out);
    assert.match(r.out, re, label);
  }
});

// ---- real tools: a second configuration route really can override the approved one (so rejecting it is not theoretical)
const EXE = process.execPath;
const prettier = (cwd, ...files) => {
  const r = spawnSync(EXE, [join(root, 'node_modules/prettier/bin/prettier.cjs'), '--check', ...files], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const eslint = (cwd, ...files) => {
  const r = spawnSync(EXE, [join(root, 'node_modules/eslint/bin/eslint.js'), ...files], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
function toolProject() {
  const dir = mkdtempSync(join(tmpdir(), 'cm-tools-'));
  dirs.push(dir);
  for (const f of ['.prettierrc.json', 'eslint.config.mjs']) cpSync(join(root, f), join(dir, f));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
  mkdirSync(join(dir, 'sub'));
  // formatted per the approved .prettierrc.json (single quotes); has a lint error (unused variable)
  for (const f of ['a.mjs', 'sub/b.mjs']) writeFileSync(join(dir, f), "export const x = 'single';\nconst unused = 1;\n");
  return dir;
}
const gateRejects = (relPath) => {
  const d = copyRepo();
  mkdirSync(dirname(join(d, relPath)), { recursive: true });
  writeFileSync(join(d, relPath), 'x\n');
  const r = gate(d);
  assert.equal(r.code, 1, relPath + ': ' + r.out);
  assert.ok(r.out.includes('FAIL ' + relPath + ': not allowed'), relPath + ': ' + r.out);
};

test('B1 (real Prettier): a root .prettierrc overrides .prettierrc.json - and the meta-gate rejects it', () => {
  const dir = toolProject();
  assert.equal(prettier(dir, 'a.mjs').code, 0, 'approved configuration alone: the file is formatted');
  writeFileSync(join(dir, '.prettierrc'), '{ "singleQuote": false }\n');
  assert.notEqual(prettier(dir, 'a.mjs').code, 0, 'the root .prettierrc really overrides .prettierrc.json');
  gateRejects('.prettierrc');
});

test('B1 (real Prettier): a nested .prettierrc alters format behaviour - and the meta-gate rejects it', () => {
  const dir = toolProject();
  assert.equal(prettier(dir, 'sub/b.mjs').code, 0);
  writeFileSync(join(dir, 'sub', '.prettierrc'), '{ "singleQuote": false }\n');
  assert.notEqual(prettier(dir, 'sub/b.mjs').code, 0, 'the nested .prettierrc really changes the result');
  assert.equal(prettier(dir, 'a.mjs').code, 0, 'files outside the nested directory are unaffected');
  gateRejects('sub/.prettierrc');
});

test('B1 (real ESLint): a root eslint.config.js overrides eslint.config.mjs - and the meta-gate rejects it', () => {
  const dir = toolProject();
  assert.equal(eslint(dir, 'a.mjs').code, 1, 'approved configuration alone: the unused variable is reported');
  writeFileSync(join(dir, 'eslint.config.js'), 'module.exports = [{ ignores: ["**"] }];\n');
  const shadowed = eslint(dir, 'a.mjs');
  assert.equal(shadowed.code, 0, 'the root eslint.config.js really takes precedence and suppresses linting: ' + shadowed.out);
  gateRejects('eslint.config.js');
});

test('B1 (real ESLint): a nested eslint.config.mjs suppresses linting for its directory - and the meta-gate rejects it', () => {
  const dir = toolProject();
  assert.equal(eslint(dir, 'sub/b.mjs').code, 1);
  writeFileSync(join(dir, 'sub', 'eslint.config.mjs'), 'export default [{ ignores: ["**"] }];\n');
  const nested = eslint(dir, 'sub/b.mjs');
  assert.equal(nested.code, 0, 'the nested configuration really takes effect for files below it: ' + nested.out);
  gateRejects('sub/eslint.config.mjs');
});

// ---- residual B1: Prettier also reads package manifests and .editorconfig
const SPACED = "export function f() {\n  return 'a';\n}\n";
test('B1 (real Prettier): a root package.yaml with a prettier key affects Prettier - and the meta-gate rejects it', () => {
  const dir = toolProject();
  writeFileSync(join(dir, 'e.mjs'), SPACED);
  assert.equal(prettier(dir, 'e.mjs').code, 0, 'approved configuration alone');
  writeFileSync(join(dir, 'package.yaml'), 'prettier:\n  singleQuote: false\n');
  assert.notEqual(prettier(dir, 'e.mjs').code, 0, 'the package.yaml prettier key really changes the result');
  gateRejects('package.yaml');
});

test('B1 (real Prettier): a nested package.yaml with a prettier key is rejected', () => {
  const dir = toolProject();
  writeFileSync(join(dir, 'sub', 'e.mjs'), SPACED);
  writeFileSync(join(dir, 'sub', 'package.yaml'), 'prettier:\n  singleQuote: false\n');
  assert.notEqual(prettier(dir, 'sub/e.mjs').code, 0, 'the nested package.yaml really changes the result');
  gateRejects('sub/package.yaml');
});

test('B1 (real Prettier): a nested package.json with a "prettier" key affects Prettier - and the meta-gate rejects it', () => {
  const dir = toolProject();
  writeFileSync(join(dir, 'sub', 'e.mjs'), SPACED);
  assert.equal(prettier(dir, 'sub/e.mjs').code, 0);
  writeFileSync(join(dir, 'sub', 'package.json'), JSON.stringify({ name: 'x', prettier: { singleQuote: false } }));
  assert.notEqual(prettier(dir, 'sub/e.mjs').code, 0, 'the nested package.json really changes the result');
  gateRejects('sub/package.json');
});

test('B1 (real Prettier): a root and a nested .editorconfig affect Prettier - and the meta-gate rejects both', () => {
  const dir = toolProject();
  writeFileSync(join(dir, 'e.mjs'), SPACED);
  writeFileSync(join(dir, 'sub', 'e.mjs'), SPACED);
  assert.equal(prettier(dir, 'e.mjs', 'sub/e.mjs').code, 0);
  writeFileSync(join(dir, 'sub', '.editorconfig'), '[*]\nindent_style = tab\n');
  assert.notEqual(prettier(dir, 'sub/e.mjs').code, 0, 'the nested .editorconfig really changes the result');
  assert.equal(prettier(dir, 'e.mjs').code, 0, 'outside the nested directory nothing changed');
  writeFileSync(join(dir, '.editorconfig'), 'root = true\n[*]\nindent_style = tab\n');
  assert.notEqual(prettier(dir, 'e.mjs').code, 0, 'the root .editorconfig really changes the result');
  gateRejects('.editorconfig');
  gateRejects('sub/.editorconfig');
});

test('the approved root package.json and .prettierrc.json stay allowed, and the existing layout passes the real meta-gate', () => {
  assert.equal(forbiddenFileReason('package.json'), null);
  assert.equal(forbiddenFileReason('.prettierrc.json'), null);
  assert.ok(listRepositoryFiles(root).includes('package.json') && listRepositoryFiles(root).includes('.prettierrc.json'));
  const r = gate(copyRepo());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Gate catalogue: 19 required, 1 scheduled, 21 pending\./);
});
