// Supply-chain policy: exact toolchain pins, committed lockfile, no workspaces, no unreviewed install scripts, one Node.js version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_FILES, checkSupplyChain, lockfileBuildPackages } from '../lib/supply-chain.mjs';

const HEX = 'a'.repeat(128);
const DIGEST = `sha256:${'b'.repeat(64)}`;

function good() {
  return {
    packageJson: {
      engines: { node: '24.21.0' },
      packageManager: `pnpm@12.10.1+sha512.${HEX}`,
      devDependencies: { typescript: '6.0.3', vitest: '^5.0.3' },
      scripts: { lint: 'eslint .' },
    },
    lockText: "lockfileVersion: '9.0'\n\npackages:\n\n  'left-pad@1.3.0':\n    resolution: {integrity: sha512-x}\n",
    nodeVersionFile: '24.21.0\n',
    exceptions: { installScripts: [] },
    workflowEnv: { '.github/workflows/ci.yml': { NODE_VERSION: 'v24.21.0' }, '.github/workflows/other.yml': {} },
    dockerfileText: `FROM node:24.21.0-bookworm-slim@${DIGEST}\nUSER node\n`,
    existingFiles: ['Dockerfile', 'pnpm-lock.yaml'],
  };
}
const run = (mutate) => {
  const o = good();
  mutate?.(o);
  return checkSupplyChain(o);
};
const has = (v, re) => v.some((x) => re.test(x));

test('the baseline passes', () => {
  assert.deepEqual(run(), []);
});

test('pnpm must be pinned exactly with its integrity hash', () => {
  for (const pm of [
    'pnpm@12',
    'pnpm@^12.10.1',
    'pnpm@12.10.1',
    `pnpm@12.10.1+sha1.${'a'.repeat(40)}`,
    `npm@10.0.0+sha512.${HEX}`,
    undefined,
  ]) {
    assert.ok(
      has(
        run((o) => (o.packageJson.packageManager = pm)),
        /packageManager must pin pnpm exactly/,
      ),
      String(pm),
    );
  }
});

test('TypeScript must be pinned exactly; other libraries may use a range', () => {
  for (const range of ['^6.0.3', '~6.0.3', '6', '>=6', 'latest']) {
    assert.ok(
      has(
        run((o) => (o.packageJson.devDependencies.typescript = range)),
        /typescript must be pinned exactly/,
      ),
      range,
    );
  }
  assert.deepEqual(
    run((o) => (o.packageJson.devDependencies.vitest = '^5.0.3')),
    [],
  );
});

test('Node.js: one exact Node 24 version in .node-version, engines, every workflow and the Dockerfile', () => {
  assert.ok(
    has(
      run((o) => (o.nodeVersionFile = '24\n')),
      /one exact Node.js version/,
    ),
  );
  assert.ok(
    has(
      run((o) => (o.nodeVersionFile = '22.23.3\n')),
      /Node.js 24 is the accepted/,
    ),
  );
  assert.ok(
    has(
      run((o) => (o.packageJson.engines.node = '>=24')),
      /engines.node must equal .node-version/,
    ),
  );
  assert.ok(
    has(
      run((o) => (o.workflowEnv['.github/workflows/ci.yml'].NODE_VERSION = 'v24.20.0')),
      /differs from .node-version/,
    ),
  );
  assert.ok(
    has(
      run((o) => (o.dockerfileText = o.dockerfileText.replace('24.21.0', '24.20.0'))),
      /Dockerfile: base image Node.js 24.20.0 differs/,
    ),
  );
  assert.ok(
    has(
      run((o) => (o.dockerfileText = 'FROM node:24.21.0-slim\nUSER node\n')),
      /base image must be node/,
    ),
  );
});

test('a committed lockfile is required', () => {
  assert.ok(
    has(
      run((o) => (o.lockText = null)),
      /lockfile must be committed/,
    ),
  );
});

test('install scripts: a lockfile package that builds needs a reviewed, justified exception', () => {
  const lock =
    "packages:\n\n  'esbuild@0.99.0':\n    resolution: {integrity: sha512-x}\n    requiresBuild: true\n\n  'plain@1.0.0':\n    resolution: {integrity: sha512-y}\n";
  assert.deepEqual(lockfileBuildPackages(lock), ['esbuild@0.99.0']);
  assert.ok(
    has(
      run((o) => (o.lockText = lock)),
      /"esbuild@0.99.0" has an install script and no reviewed exception/,
    ),
  );
  const withException = (e) => run((o) => ((o.lockText = lock), (o.exceptions = { installScripts: [e] })));
  assert.deepEqual(
    withException({ package: 'esbuild@0.99.0', justification: 'platform binary check', reviewedBy: 'engineering authority' }),
    [],
  );
  assert.ok(has(withException({ package: 'esbuild@0.99.0', justification: '', reviewedBy: 'x' }), /no reviewed exception/));
  assert.ok(has(withException({ package: 'esbuild@0.99.0', justification: 'y' }), /no reviewed exception/));
  assert.ok(has(withException({ package: 'other@1.0.0', justification: 'y', reviewedBy: 'x' }), /no reviewed exception/));
  assert.ok(
    has(
      run((o) => (o.packageJson.pnpm = { onlyBuiltDependencies: ['esbuild'] })),
      /onlyBuiltDependencies must be empty/,
    ),
  );
});

test('root lifecycle scripts that run on install are rejected', () => {
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.ok(
      has(
        run((o) => (o.packageJson.scripts[hook] = 'node x.js')),
        new RegExp(`lifecycle script "${hook}"`),
      ),
      hook,
    );
  }
});

test('workspaces, monorepo tooling, other package managers and bot dependency updates are rejected', () => {
  assert.ok(
    has(
      run((o) => (o.packageJson.workspaces = ['packages/*'])),
      /workspaces are not allowed/,
    ),
  );
  for (const f of FORBIDDEN_FILES) {
    assert.ok(
      has(
        run((o) => o.existingFiles.push(f)),
        new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: not allowed`),
      ),
      f,
    );
  }
  assert.ok(FORBIDDEN_FILES.includes('.github/dependabot.yml') && FORBIDDEN_FILES.includes('renovate.json'));
});

test('non-registry dependency sources are rejected', () => {
  for (const spec of [
    'github:owner/repo',
    'git+https://example.invalid/x.git',
    'file:../x',
    'https://example.invalid/x.tgz',
    'workspace:*',
  ]) {
    assert.ok(
      has(
        run((o) => (o.packageJson.devDependencies.sneaky = spec)),
        /non-registry source/,
      ),
      spec,
    );
  }
});
