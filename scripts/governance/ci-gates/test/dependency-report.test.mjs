// The dependency report: it identifies, per item, the current pin, the proposed target and vulnerability information,
// and only proposes. Network access is not tested here; the parsing and rendering are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPins, interpretOutdated, latestNodeOfMajor, parseAudit, parseOutdated, renderReport } from '../lib/dependency-report.mjs';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('pins are discovered from the real repository: runtime, package manager, libraries, CI tools and container images', () => {
  const dir = join(root, '.github', 'workflows');
  const workflows = Object.fromEntries(readdirSync(dir).map((f) => [`.github/workflows/${f}`, readFileSync(join(dir, f), 'utf8')]));
  const pins = collectPins({
    nodeVersionFile: readFileSync(join(root, '.node-version'), 'utf8'),
    packageJson: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    workflows,
    dockerfileText: readFileSync(join(root, 'Dockerfile'), 'utf8'),
  });
  const by = (name) => pins.filter((p) => p.name === name);
  assert.equal(by('Node.js')[0].current, '24.21.0');
  assert.match(by('pnpm')[0].current, /^\d+\.\d+\.\d+$/);
  assert.equal(by('typescript')[0].current, '6.0.3');
  assert.equal(by('gitleaks')[0].current, '8.30.1');
  assert.equal(by('trivy').length, 1);
  const images = pins.filter((p) => p.kind === 'container-image');
  assert.deepEqual(images.map((i) => i.name).sort(), ['node', 'postgres', 'postgres', 'postgres', 'postgres']);
  for (const i of images) assert.match(i.digest, /^sha256:[0-9a-f]{64}$/);
});

test('parseAudit reads advisories sorted by severity and fails closed on anything else', () => {
  const report = {
    advisories: {
      1: {
        module_name: 'a',
        severity: 'low',
        title: 'low one',
        vulnerable_versions: '<1',
        patched_versions: '>=1',
        url: 'https://example.invalid/1',
      },
      2: {
        module_name: 'b',
        severity: 'critical',
        title: 'bad',
        vulnerable_versions: '<2',
        patched_versions: '>=2',
        url: 'https://example.invalid/2',
      },
    },
  };
  assert.deepEqual(
    parseAudit(report).map((a) => a.package),
    ['b', 'a'],
  );
  assert.deepEqual(parseAudit({ advisories: {} }), []);
  for (const bad of ['not json', '{}', 'null', '[]']) assert.throws(() => parseAudit(bad), /unparseable|JSON/, bad);
});

test('parseOutdated reads current, wanted and latest; empty output means nothing is outdated', () => {
  const rows = parseOutdated('{"vitest":{"current":"5.0.3","wanted":"5.0.4","latest":"6.0.0"}}');
  assert.deepEqual(rows, [{ package: 'vitest', current: '5.0.3', wanted: '5.0.4', latest: '6.0.0' }]);
  assert.deepEqual(parseOutdated(''), []);
  assert.throws(() => parseOutdated('{bad'));
});

test('latestNodeOfMajor proposes only the pinned major', () => {
  const index = [{ version: 'v26.1.0' }, { version: 'v24.21.0' }, { version: 'v24.9.1' }, { version: 'v24.22.0' }, { version: 'v22.23.3' }];
  assert.equal(latestNodeOfMajor(index, 24), 'v24.22.0');
  assert.equal(latestNodeOfMajor(index, 25), null);
});

test('the rendered report names current pin, proposed target and vulnerability information, and states that it only proposes', () => {
  const md = renderReport({
    rows: [{ name: 'vitest', kind: 'npm-dependency', current: '^5.0.3', proposed: '5.0.4', vulnerability: 'high: example | pipe' }],
    audit: [
      { package: 'vitest', severity: 'high', title: 'example', vulnerable: '<5.0.4', patched: '>=5.0.4', url: 'https://example.invalid/a' },
    ],
  });
  assert.match(md, /Current pin/);
  assert.match(md, /Proposed target/);
  assert.match(md, /Vulnerability information/);
  assert.match(md, /\| vitest \| npm-dependency \| \^5\.0\.3 \| 5\.0\.4 \| high: example \\\| pipe \|/);
  assert.match(md, /proposes only\. It changes no file, opens no pull request and creates no commit/);
});

test('no bot-authored dependency update is configured: the weekly workflow only reports', () => {
  const weekly = readFileSync(join(root, '.github', 'workflows', 'dependency-report-weekly.yml'), 'utf8');
  assert.match(weekly, /cron: '17 5 \* \* 1'/);
  assert.doesNotMatch(weekly, /git (?:commit|push)|gh pr|pull-requests:|contents: write/);
});

test('B3: pnpm outdated - empty output is "nothing outdated" only when pnpm exited 0', () => {
  assert.deepEqual(interpretOutdated({ status: 0, stdout: '', stderr: '' }), []);
  assert.deepEqual(interpretOutdated({ status: 0, stdout: '  \n', stderr: '' }), []);
  const rows = interpretOutdated({ status: 1, stdout: '{"vitest":{"current":"5.0.3","wanted":"5.0.4","latest":"6.0.0"}}', stderr: '' });
  assert.deepEqual(rows, [{ package: 'vitest', current: '5.0.3', wanted: '5.0.4', latest: '6.0.0' }]);
  assert.equal(interpretOutdated({ status: 0, stdout: '{"vitest":{"current":"5.0.3","wanted":"5.0.4","latest":"6.0.0"}}' }).length, 1);
});

test('B3: a non-zero pnpm outdated without a usable result fails the report (registry or network failure is never "none")', () => {
  const cases = [
    { status: 1, stdout: '', stderr: 'Error: ERR_PNPM_OUTDATED_REGISTRY_ERROR' },
    { status: 1, stdout: '   ', stderr: '' },
    { status: 1, stdout: '{}', stderr: '' },
    { status: 1, stdout: 'not json', stderr: 'boom' },
    { status: 2, stdout: '', stderr: '' },
    { status: 127, stdout: '', stderr: 'command not found' },
    { status: null, stdout: '', stderr: '' },
    { status: undefined, stdout: '', stderr: '' },
    { status: 0, stdout: 'not json', stderr: '' },
    { status: 0, stdout: '{bad', stderr: '' },
  ];
  for (const c of cases) assert.throws(() => interpretOutdated(c), /pnpm outdated|Unexpected|JSON|unparseable/, JSON.stringify(c));
  assert.throws(
    () => interpretOutdated({ status: 1, stdout: '', stderr: 'Error: ERR_PNPM_OUTDATED_REGISTRY_ERROR\nmore' }),
    /ERR_PNPM_OUTDATED_REGISTRY_ERROR/,
  );
});

test('B3 regression (the review probe): pnpm outdated --registry http://127.0.0.1:9/ cannot be reported as an empty healthy result', (t) => {
  const r = spawnSync('corepack', ['pnpm', 'outdated', '--format', 'json', '--registry', 'http://127.0.0.1:9/'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180000,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  if (r.error || r.status === null) {
    t.skip('pnpm could not be started here, so the registry-failure probe was NOT run (' + String(r.error?.code ?? 'no exit status') + ')');
    return;
  }
  assert.notEqual(r.status, 0, 'the probe really fails: ' + r.stderr);
  assert.equal(String(r.stdout).trim(), '', 'and prints no JSON, which the old code read as "nothing outdated"');
  assert.throws(() => interpretOutdated({ status: r.status, stdout: r.stdout, stderr: r.stderr }), /pnpm outdated failed/);
  assert.deepEqual(parseOutdated(r.stdout), [], 'the old behaviour: parseOutdated alone returns an empty healthy-looking result');
});

test('B3: a non-zero pnpm outdated whose JSON is not made of outdated rows is a failure, not a result', () => {
  for (const stdout of [
    '{"x":1}',
    '{"x":{}}',
    '{"x":{"current":"1.0.0","wanted":"1.0.1"}}',
    '{"x":{"current":1,"wanted":"1.0.1","latest":"2.0.0"}}',
    '{"x":null}',
    '{"x":{"current":"1.0.0","wanted":"1.0.1","latest":"2.0.0"},"y":"text"}',
    '{"error":"boom"}',
  ]) {
    assert.throws(() => interpretOutdated({ status: 1, stdout, stderr: '' }), /pnpm outdated failed \(exit 1\) /, stdout);
  }
  const row = '{"x":{"current":"1.0.0","wanted":"1.0.1","latest":"2.0.0","dependencyType":"devDependencies"}}';
  assert.deepEqual(interpretOutdated({ status: 1, stdout: row, stderr: '' }), [
    { package: 'x', current: '1.0.0', wanted: '1.0.1', latest: '2.0.0' },
  ]);
});
