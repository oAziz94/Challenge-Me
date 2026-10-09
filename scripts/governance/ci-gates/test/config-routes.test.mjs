// Alternate configuration routes (second Opus re-review: B1, B4, N1). Nothing here adds lint, format or scan policy: it proves that
// the approved root configuration cannot be shadowed or replaced, that the execution context of a workflow cannot be changed,
// and that scanner or package-manager policy cannot be injected through files or environment names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_SCRIPTS, checkGateDefinitions } from '../lib/catalogue.mjs';
import { SHADOW_CONFIGS, checkSupplyChain, forbiddenFileReason } from '../lib/supply-chain.mjs';
import { checkWorkflow } from '../lib/workflow-policy.mjs';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (v, re) => v.some((x) => re.test(x));

// ---------------------------------------------------------------------------------------------------- B4: workflows
const FULL = [
  'name: t',
  'on:',
  '  push:',
  '    branches: [main]',
  'permissions: {}',
  'jobs:',
  '  j:',
  '    runs-on: ubuntu-latest',
  '    timeout-minutes: 5',
  '    permissions: {}',
  '    steps:',
  '      - run: "true"',
  '',
].join('\n');
const full = (text) => checkWorkflow({ file: 'w.yml', text, allowedActions: [] }).violations;

test('B4: the baseline workflow used by these probes is clean', () => {
  assert.deepEqual(full(FULL), []);
});

test('B4: defaults (workflow and job level), step shell and step working-directory are rejected', () => {
  assert.ok(has(full(FULL.replace('jobs:\n', 'defaults:\n  run:\n    shell: bash\njobs:\n')), /workflow-level "defaults"/));
  assert.ok(has(full(FULL.replace('jobs:\n', 'defaults:\n  run:\n    working-directory: sub\njobs:\n')), /workflow-level "defaults"/));
  const jobDefaults = FULL.replace(
    '    permissions: {}\n    steps:',
    '    permissions: {}\n    defaults:\n      run:\n        shell: bash\n    steps:',
  );
  assert.ok(has(full(jobDefaults), /job "j": job-level "defaults"/));
  assert.ok(has(full(FULL.replace('      - run: "true"\n', '      - run: "true"\n        shell: bash\n')), /step 1: step-level "shell"/));
  const wd = FULL.replace('      - run: "true"\n', '      - run: "true"\n        working-directory: scripts\n');
  assert.ok(has(full(wd), /step 1: step-level "working-directory"/));
});

test('B4: a TRIVY_* name in any string field - not only a run command - is rejected', () => {
  const variants = [
    FULL.replace('      - run: "true"\n', '      - name: use TRIVY_SEVERITY here\n        run: "true"\n'),
    FULL.replace('      - run: "true"\n', '      - run: "true"\n        env:\n          X: ${{ env.TRIVY_IGNORE_UNFIXED }}\n'),
    FULL.replace('name: t\n', 'name: t\nenv:\n  TRIVY_SKIP_DB_UPDATE: "true"\n'),
    FULL.replace('      - run: "true"\n', '      - run: "true"\n        env:\n          note: "$TRIVY_SEVERITY"\n'),
    FULL.replace('name: t\n', 'name: trivy_exit_code_is_TRIVY_EXIT_CODE\n'),
  ];
  for (const text of variants) assert.ok(has(full(text), /a TRIVY_\* variable can encode scanner policy/), text);
  assert.ok(has(full(FULL.replace('run: "true"', 'run: "TRIVY_SEVERITY=CRITICAL true"')), /a TRIVY_\* variable/));
});

test('B4: npm_config_* and pnpm_config_* environment keys are rejected at workflow, job and step scope, case-insensitively', () => {
  for (const key of [
    'npm_config_registry',
    'NPM_CONFIG_AUDIT_LEVEL',
    'pnpm_config_audit_level',
    'PNPM_CONFIG_REGISTRY',
    'Npm_Config_Foo',
  ]) {
    const cases = {
      workflow: FULL.replace('jobs:\n', 'env:\n  ' + key + ': x\njobs:\n'),
      job: FULL.replace('    permissions: {}\n    steps:', '    permissions: {}\n    env:\n      ' + key + ': x\n    steps:'),
      step: FULL.replace('      - run: "true"\n', '      - run: "true"\n        env:\n          ' + key + ': x\n'),
    };
    for (const [scope, text] of Object.entries(cases)) {
      assert.ok(
        has(full(text), new RegExp('environment variable ' + key + ' can change package-manager or registry configuration')),
        scope + ' ' + key,
      );
    }
  }
});

test('B4: npm_config_* and pnpm_config_* injected in run text are rejected', () => {
  for (const cmd of [
    'npm_config_registry=http://127.0.0.1:9 node scripts/governance/ci-gates/vulnerability-report.mjs dependency',
    'export PNPM_CONFIG_AUDIT_LEVEL=critical',
    'env pnpm_config_registry=http://x true',
    'echo "npm_config_audit_level=critical" >> "$GITHUB_ENV"',
  ]) {
    assert.ok(has(full(FULL.replace('run: "true"', 'run: ' + JSON.stringify(cmd))), /an npm_config_\* or pnpm_config_\* name/), cmd);
  }
});

test('B4: unrelated commands such as git diff --exit-code, and the real workflows, are still accepted', () => {
  assert.deepEqual(full(FULL.replace('run: "true"', 'run: "git diff --exit-code"')), []);
  assert.deepEqual(full(FULL.replace('run: "true"', 'run: "git diff --exit-code -- pnpm-lock.yaml package.json"')), []);
  for (const f of readdirSync(join(root, '.github/workflows'))) {
    const text = readFileSync(join(root, '.github/workflows', f), 'utf8');
    const { violations } = checkWorkflow({ file: f, text, allowedActions: [] });
    assert.deepEqual(violations, [], f);
    const doc = parse(text);
    assert.equal('defaults' in doc, false, f);
    for (const job of Object.values(doc.jobs)) {
      assert.equal('defaults' in job, false, f);
      for (const step of job.steps) assert.ok(!('shell' in step) && !('working-directory' in step), f);
    }
  }
});

// ---------------------------------------------------------------------------------------------------- B1 / B4 / N1: files
const good = () => ({
  packageJson: {
    engines: { node: '24.21.0' },
    packageManager: 'pnpm@12.10.1+sha512.' + 'a'.repeat(128),
    devDependencies: { typescript: '6.0.3' },
  },
  lockText: "lockfileVersion: '9.0'\n",
  nodeVersionFile: '24.21.0\n',
  exceptions: { installScripts: [] },
  workflowEnv: {},
  dockerfileText: 'FROM node:24.21.0-bookworm-slim@sha256:' + 'b'.repeat(64) + '\nUSER node\n',
  existingFiles: [],
});
const withFile = (path) => checkSupplyChain({ ...good(), existingFiles: [path] });
const withPackage = (fn) => {
  const o = good();
  fn(o.packageJson);
  return checkSupplyChain(o);
};

test('the approved root configuration files are allowed', () => {
  for (const path of ['eslint.config.mjs', '.prettierrc.json', 'vitest.config.ts', 'tsconfig.json', '.prettierignore', 'package.json']) {
    assert.equal(forbiddenFileReason(path), null, path);
  }
  assert.deepEqual(checkSupplyChain({ ...good(), existingFiles: ['eslint.config.mjs', '.prettierrc.json', 'vitest.config.ts'] }), []);
});

test('B1: files that can shadow or override an approved root configuration are rejected at any depth', () => {
  const rejected = [
    // ESLint: anything but the exact root eslint.config.mjs
    ...['js', 'cjs', 'ts', 'mts', 'cts'].map((e) => 'eslint.config.' + e),
    'sub/eslint.config.mjs',
    'a/b/eslint.config.js',
    'src/eslint.config.mjs',
    // Prettier: anything but the exact root .prettierrc.json
    ...['', '.json5', '.yaml', '.yml', '.toml', '.js', '.cjs', '.mjs'].map((e) => '.prettierrc' + e),
    'sub/.prettierrc',
    'sub/.prettierrc.json',
    'a/b/.prettierrc.yaml',
    ...['js', 'mjs', 'cjs', 'ts'].map((e) => 'prettier.config.' + e),
    'sub/prettier.config.mjs',
    // Vitest / Vite: anything but the exact root vitest.config.ts; no vite.config.* at all
    'vitest.config.js',
    'vitest.config.mjs',
    'vitest.config.mts',
    'sub/vitest.config.ts',
    'tests/vitest.config.ts',
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'sub/vite.config.ts',
  ];
  for (const path of rejected) {
    assert.ok(forbiddenFileReason(path), path);
    assert.ok(has(withFile(path), new RegExp(esc(path) + ': not allowed')), path);
  }
});

test('look-alike names that are not configuration routes are not rejected', () => {
  for (const path of [
    'docs/eslint-config.md',
    'my.prettierrc.md',
    'prettierrc.json',
    'vitest.configs.ts',
    'vite.configuration.md',
    'pnpmfile.cjs.md',
    'sub/.prettierignore',
    'trivy.yaml.md',
    'trivyignore',
    'sub/.trivyignore.bak',
  ]) {
    assert.equal(forbiddenFileReason(path), null, path);
  }
});

test('every shadow-config rule names its approved root file, and only that exact file is accepted', () => {
  for (const { pattern, approved } of SHADOW_CONFIGS) {
    if (approved === null) continue;
    assert.ok(pattern.test(approved), approved + ' matches its own rule');
    assert.equal(forbiddenFileReason(approved), null, approved);
    assert.ok(forbiddenFileReason('nested/' + approved), 'nested/' + approved);
  }
});

test('B1: package.json keys "prettier" and "eslintConfig" are rejected as second configuration routes', () => {
  assert.ok(
    has(
      withPackage((p) => (p.prettier = { semi: false })),
      /"prettier" is a second configuration route/,
    ),
  );
  assert.ok(
    has(
      withPackage((p) => (p.prettier = '@org/prettier-config')),
      /"prettier" is a second configuration route/,
    ),
  );
  assert.ok(
    has(
      withPackage((p) => (p.eslintConfig = { rules: {} })),
      /"eslintConfig" is a second configuration route/,
    ),
  );
  assert.deepEqual(
    withPackage(() => {}),
    [],
  );
});

test('B4: scanner configuration and ignore files are rejected at any depth, root or nested', () => {
  for (const name of ['trivy.yaml', '.trivy.yaml', '.trivyignore', '.trivyignore.yaml']) {
    for (const path of [name, 'sub/' + name, 'a/b/c/' + name, '.github/' + name]) {
      assert.ok(
        withFile(path).some((v) => v.startsWith(path + ': not allowed')),
        path,
      );
    }
  }
});

test('N1: .pnpmfile.* is rejected at the root and at any depth', () => {
  for (const path of ['.pnpmfile.cjs', '.pnpmfile.mjs', '.pnpmfile.js', 'sub/.pnpmfile.cjs', 'a/b/.pnpmfile.mjs']) {
    assert.ok(has(withFile(path), new RegExp(esc(path) + ': not allowed \\(a pnpmfile executes code')), path);
  }
});

// ---------------------------------------------------------------------------------------------------- optional: hooks
test('pre/post hooks around a pinned gate script are rejected; unrelated hooks are not', () => {
  const world = () => ({
    packageJson: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    workflows: Object.fromEntries(
      readdirSync(join(root, '.github/workflows')).map((f) => [
        `.github/workflows/${f}`,
        parse(readFileSync(join(root, '.github/workflows', f), 'utf8')),
      ]),
    ),
    prettierIgnoreText: readFileSync(join(root, '.prettierignore'), 'utf8'),
  });
  for (const name of Object.keys(EXPECTED_SCRIPTS)) {
    for (const hook of ['pre' + name, 'post' + name]) {
      const w = world();
      w.packageJson.scripts[hook] = 'echo hook';
      assert.ok(has(checkGateDefinitions(w), new RegExp('script "' + esc(hook) + '" would run around the pinned gate script')), hook);
    }
  }
  const w = world();
  w.packageJson.scripts.prebuild = 'echo not a pinned gate script';
  assert.deepEqual(checkGateDefinitions(w), []);
});
