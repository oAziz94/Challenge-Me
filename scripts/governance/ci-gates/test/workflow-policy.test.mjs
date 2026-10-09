// Workflow and Dockerfile policy: no privileged trigger, no write permission, no unpinned action or image, no secret
// reference, frozen-lockfile installs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDockerfile, checkInstallCommands, checkWorkflow, commandLines } from '../lib/workflow-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;

const BASE = `
name: t
on:
  pull_request:
    branches: [main]
permissions: {}
jobs:
  j:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - run: echo ok
`;
const check = (text, allowedActions = []) => checkWorkflow({ file: 'w.yml', text, allowedActions }).violations;
const has = (v, re) => v.some((x) => re.test(x));
const withJob = (extra) => BASE.replace('    steps:', `${extra}\n    steps:`);

test('the baseline workflow passes', () => {
  assert.deepEqual(check(BASE), []);
});

test('privileged and unreviewed triggers are rejected', () => {
  for (const t of ['pull_request_target', 'workflow_run', 'issue_comment', 'repository_dispatch', 'pull_request_review']) {
    const text = BASE.replace('on:\n  pull_request:\n    branches: [main]', `on:\n  pull_request:\n    branches: [main]\n  ${t}:`);
    assert.ok(has(check(text), new RegExp(`trigger "${t}" is not allowed`)), t);
  }
  assert.ok(has(check(BASE.replace('on:\n  pull_request:\n    branches: [main]', 'on: pull_request_target')), /pull_request_target/));
  assert.ok(has(check(BASE.replace('on:\n  pull_request:\n    branches: [main]', 'on: [push, workflow_run]')), /workflow_run/));
});

test('path filters on pull_request or push triggers are rejected (a required check that does not run never reports)', () => {
  assert.ok(has(check(BASE.replace('branches: [main]', 'branches: [main]\n    paths: [src/**]')), /must not filter by path/));
});

test('permissions must be {} at workflow level and declared at job level; write is rejected anywhere', () => {
  assert.ok(
    has(check(BASE.replace('permissions: {}\njobs', 'permissions:\n  contents: read\njobs')), /top-level permissions must be exactly \{\}/),
  );
  assert.ok(has(check(BASE.replace('permissions: {}\njobs', 'jobs')), /top-level permissions must be exactly \{\}/));
  assert.ok(has(check(BASE.replace('    permissions: {}\n', '')), /permissions are not declared explicitly/));
  assert.ok(has(check(BASE.replace('    permissions: {}\n', '    permissions:\n      contents: write\n')), /write permission "contents"/));
  assert.ok(has(check(BASE.replace('    permissions: {}\n', '    permissions: write-all\n')), /write permission/));
  assert.ok(
    has(check(BASE.replace('    permissions: {}\n', '    permissions:\n      pull-requests: write\n')), /write permission "pull-requests"/),
  );
});

test('every action must be a local path or pinned to a full SHA that is on the reviewed allow-list', () => {
  const step = (uses) => BASE.replace('- run: echo ok', `- uses: ${uses}`);
  for (const uses of [
    'actions/checkout@v4',
    'actions/checkout@main',
    'actions/checkout',
    'owner/repo@abc1234',
    `owner/repo@${'a'.repeat(39)}`,
    'docker://alpine:3',
  ]) {
    assert.ok(has(check(step(uses)), /not pinned to a full-length commit SHA/), uses);
  }
  assert.ok(has(check(step(`owner/repo@${SHA}`)), /not in the reviewed allowedActions list/));
  assert.deepEqual(check(step(`owner/repo@${SHA}`), [`owner/repo@${SHA}`]), []);
  assert.deepEqual(check(step('./.github/actions/local')), []);
  // a reusable workflow call is an action too
  assert.ok(has(check(withJob('    uses: owner/repo/.github/workflows/x.yml@main')), /not pinned/));
});

test('the secrets context is rejected in every form', () => {
  for (const s of [
    '${{ secrets.TOKEN }}',
    '${{ secrets.GITHUB_TOKEN }}',
    "${{ secrets['TOKEN'] }}",
    '${{ toJSON(secrets) }}',
    '${{ format("{0}", secrets) }}',
  ]) {
    const text = BASE.replace('- run: echo ok', `- run: echo ok\n        env:\n          X: '${s.replace(/'/g, "''")}'`);
    assert.ok(has(check(text), /references the secrets context/), s);
  }
  assert.ok(
    has(check(BASE.replace('- run: echo ok', '- run: echo ok\n        if: secrets.TOKEN != ""')), /references the secrets context/),
  );
  assert.ok(has(check(withJob('    secrets: inherit')), /passes secrets to a called workflow/));
});

test('containers and service containers must be pinned by digest', () => {
  const svc = (image) => withJob(`    services:\n      db:\n        image: ${image}`);
  assert.ok(has(check(svc('postgres:18')), /not pinned by digest/));
  assert.ok(has(check(svc('postgres:18@sha256:abc')), /not pinned by digest/));
  assert.deepEqual(check(svc(`postgres:18.6@${DIGEST}`)), []);
  assert.ok(has(check(withJob('    container: node:24')), /container image is not pinned by digest/));
  assert.ok(has(check(withJob('    container:\n      image: node:24')), /container image is not pinned by digest/));
  assert.deepEqual(check(withJob(`    container:\n      image: node:24@${DIGEST}`)), []);
});

test('artifact retention beyond 30 days is rejected', () => {
  const text = BASE.replace('- run: echo ok', `- uses: ./local\n        with:\n          retention-days: 90`);
  assert.ok(has(check(text), /retention-days 90 exceeds the 30-day retention/));
  assert.deepEqual(check(BASE.replace('- run: echo ok', `- uses: ./local\n        with:\n          retention-days: 30`)), []);
});

test('a gate cannot be made unfailable: continue-on-error, step-level if, missing timeout', () => {
  assert.ok(has(check(withJob('    continue-on-error: true')), /continue-on-error would let a gate fail/));
  assert.ok(has(check(BASE.replace('- run: echo ok', '- run: echo ok\n        continue-on-error: true')), /continue-on-error/));
  assert.ok(has(check(BASE.replace('- run: echo ok', '- if: false\n        run: echo ok')), /step-level "if"/));
  assert.ok(has(check(BASE.replace('    timeout-minutes: 5\n', '')), /timeout-minutes is not set/));
});

test('only frozen-lockfile, no-scripts pnpm installs are allowed; npm, yarn, npx, pnpm add and dlx are not', () => {
  const run = (cmd) => check(BASE.replace('echo ok', cmd));
  assert.deepEqual(run('corepack pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile'), []);
  assert.deepEqual(run('pnpm i --frozen-lockfile --ignore-scripts --ignore-pnpmfile'), []);
  assert.deepEqual(run('pnpm install --ignore-scripts --ignore-pnpmfile --frozen-lockfile'), []);
  assert.ok(has(run('pnpm install'), /without --frozen-lockfile/));
  assert.ok(has(run('pnpm install --ignore-scripts --ignore-pnpmfile'), /without --frozen-lockfile/));
  assert.ok(has(run('pnpm install --frozen-lockfile --ignore-pnpmfile'), /without --ignore-scripts/));
  assert.ok(has(run('pnpm install --no-frozen-lockfile --ignore-scripts --ignore-pnpmfile'), /without --frozen-lockfile/));
  assert.ok(has(run('pnpm install --frozen-lockfile=false --ignore-scripts --ignore-pnpmfile'), /without --frozen-lockfile/));
  assert.ok(has(run('pnpm install --frozen-lockfile --ignore-scripts=false --ignore-pnpmfile'), /without --ignore-scripts/));
  assert.deepEqual(run('pnpm install --frozen-lockfile=true --ignore-scripts --ignore-pnpmfile'), []);
  // N1: .pnpmfile hook code runs during install unless it is ignored
  assert.ok(has(run('pnpm install --frozen-lockfile --ignore-scripts'), /without --ignore-pnpmfile/));
  assert.ok(has(run('corepack pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile=false'), /without --ignore-pnpmfile/));
  assert.ok(has(run('pnpm i --frozen-lockfile --ignore-scripts'), /without --ignore-pnpmfile/));
  assert.deepEqual(run('corepack pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile=true'), []);
  assert.ok(has(run('npm install'), /only pnpm with the frozen lockfile/));
  assert.ok(has(run('npm ci'), /only pnpm with the frozen lockfile/));
  assert.ok(has(run('npx some-tool'), /only pnpm with the frozen lockfile/));
  assert.ok(has(run('yarn install'), /only pnpm with the frozen lockfile/));
  assert.ok(has(run('pnpm add left-pad'), /changes or fetches unpinned dependencies/));
  assert.ok(has(run('pnpm dlx cowsay'), /changes or fetches unpinned dependencies/));
  assert.ok(has(run('pnpm up'), /changes or fetches unpinned dependencies/));
  // a multi-line command is judged as one logical line
  const block = (cmd) => BASE.replace('- run: echo ok', `- run: |\n          ${cmd}`);
  assert.deepEqual(check(block('pnpm install \\\n          --frozen-lockfile \\\n          --ignore-scripts --ignore-pnpmfile')), []);
  assert.ok(has(check(block('pnpm install \\\n          --frozen-lockfile \\\n          --ignore-pnpmfile')), /without --ignore-scripts/));
});

test('images may only be built locally and run as challenge-me:ci; pulling, pushing, tagging and logging in are rejected', () => {
  const run = (cmd) => check(BASE.replace('echo ok', cmd));
  assert.deepEqual(run('docker build --tag challenge-me:ci .'), []);
  assert.deepEqual(run('docker run --rm challenge-me:ci'), []);
  assert.ok(has(run('docker run --rm alpine:3 sh'), /may only use the locally built challenge-me:ci image/));
  assert.ok(has(run('docker pull alpine'), /docker pull\/push\/login\/tag is not allowed/));
  assert.ok(has(run('docker push ghcr.io/x/y:z'), /docker pull\/push\/login\/tag is not allowed/));
  assert.ok(has(run('docker login ghcr.io'), /docker pull\/push\/login\/tag is not allowed/));
  assert.ok(has(run('docker tag challenge-me:ci ghcr.io/x/y'), /docker pull\/push\/login\/tag is not allowed/));
});

test('unparseable YAML, a non-mapping and duplicate keys fail closed', () => {
  assert.ok(has(check('a: [unclosed'), /cannot be parsed as YAML/));
  assert.ok(has(check('- just\n- a list\n'), /not a YAML mapping/));
  assert.ok(has(check(BASE.replace('permissions: {}\njobs', 'permissions: {}\npermissions: {}\njobs')), /cannot be parsed as YAML/));
  assert.ok(has(check('name: only a name\n'), /no trigger found/));
});

test('Dockerfile: every FROM pinned by digest, non-root final user, no secret-like arguments, no .env', () => {
  const ok = `FROM node:24.21.0-bookworm-slim@${DIGEST}\nRUN corepack pnpm install --prod --frozen-lockfile --ignore-scripts --ignore-pnpmfile\nUSER node\n`;
  const d = (text) => checkDockerfile({ file: 'Dockerfile', text });
  assert.deepEqual(d(ok), []);
  assert.ok(has(d(ok.replace(`@${DIGEST}`, '')), /not pinned by digest/));
  assert.ok(has(d(ok.replace('USER node\n', '')), /non-root/));
  assert.ok(has(d(ok.replace('USER node', 'USER root')), /non-root/));
  assert.ok(has(d(ok.replace('USER node', 'USER 0:0')), /non-root/));
  assert.ok(has(d(ok.replace('--frozen-lockfile --ignore-scripts --ignore-pnpmfile', '')), /without --frozen-lockfile/));
  assert.ok(has(d(ok.replace(' --ignore-pnpmfile', '')), /without --ignore-pnpmfile/));
  assert.ok(has(d(`${ok}ARG NPM_TOKEN\n`), /secret-like build argument/));
  assert.ok(has(d(`${ok}ENV API_KEY=x\n`), /secret-like build argument/));
  assert.ok(has(d(`${ok}COPY .env /app/.env\n`), /copies an .env file/));
  assert.ok(has(d('USER node\n'), /no FROM instruction/));
  // a multi-stage build may start a later stage from an earlier stage by name; the first stage still needs a digest
  const multi = `FROM node:24@${DIGEST} AS build\nFROM build\nUSER node\n`;
  assert.deepEqual(d(multi), []);
  assert.ok(has(d('FROM node:24 AS build\nFROM build\nUSER node\n'), /not pinned by digest/));
});

test('the repository workflows and Dockerfile satisfy the policy, with no privileged trigger, write permission, action or secret', () => {
  const dir = join(root, '.github', 'workflows');
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes('ci.yml') && files.includes('governance.yml') && files.includes('dependency-report-weekly.yml'));
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    const { violations, doc } = checkWorkflow({ file: f, text, allowedActions: [] });
    assert.deepEqual(violations, [], f);
    const triggers = Object.keys(doc.on);
    for (const t of triggers) assert.ok(['pull_request', 'push', 'schedule', 'workflow_dispatch'].includes(t), `${f}: ${t}`);
    assert.deepEqual(doc.permissions, {}, f);
    for (const [id, job] of Object.entries(doc.jobs)) assert.deepEqual(job.permissions, {}, `${f} ${id}`);
    assert.doesNotMatch(text, /^\s*-?\s*uses:/m, `${f}: no step uses an action`);
    assert.doesNotMatch(text, /\bsecrets\s*[.[]/, `${f}: no secrets context`);
    assert.doesNotMatch(text, /pull_request_target|workflow_run/, `${f}: no privileged trigger`);
  }
  assert.deepEqual(checkDockerfile({ file: 'Dockerfile', text: readFileSync(join(root, 'Dockerfile'), 'utf8') }), []);
});

test('the repository shell scripts also install only from the frozen lockfile without scripts', () => {
  const dir = join(root, 'scripts', 'governance', 'ci-gates');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sh'))) {
    assert.deepEqual(checkInstallCommands(commandLines(readFileSync(join(dir, f), 'utf8')), f), [], f);
  }
});
