// The reviewer-visible schema output of migration-verification (STACK-ADR-003 section 10; STACK-ADR-001 4.4 A.8).
// Static assertions over the real workflow and script: the dump is produced after verification, surfaced in the log and the job
// summary, uses PostgreSQL 18 tooling, dumps no role password hashes, and needs no artifact and no action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const script = readFileSync(join(root, 'scripts/governance/ci-gates/schema-review-dump.sh'), 'utf8');
const workflowText = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const job = parse(workflowText).jobs['migration-verification'];

test('the dump is the last step of migration-verification, after the verification tests', () => {
  const steps = job.steps;
  assert.equal(steps.at(-2).run.trim(), 'corepack pnpm run test:migration');
  assert.equal(steps.at(-1).run.trim(), 'bash scripts/governance/ci-gates/schema-review-dump.sh');
});

test('the script dumps the schema and the roles, without role password hashes', () => {
  assert.match(script, /pg_dump --schema-only --create/);
  assert.match(script, /pg_dumpall --roles-only --no-role-passwords/);
  assert.match(script, /grep -qi 'PASSWORD'/, 'defensive check that no password clause is printed');
});

test('the output goes to the job log and to GITHUB_STEP_SUMMARY', () => {
  assert.match(script, /emit \| tee -a "\$summary"/);
  assert.match(script, /GITHUB_STEP_SUMMARY/);
});

test('it uses the PostgreSQL 18 tools of the service container and asserts the major', () => {
  assert.match(script, /docker exec/);
  assert.match(script, /\(PostgreSQL\) 18/);
  assert.match(script, /18\?\?\?\?/);
});

test('no credential or connection string is printed, and the generated password is masked and checked', () => {
  assert.match(script, /::add-mask::/);
  assert.match(script, /grep -qF "\$pw"/);
  assert.match(script, /grep -q 'postgres:\/\/'/);
  assert.doesNotMatch(script, /echo[^\n]*CM_MIGRATOR_DATABASE_URL/);
  assert.doesNotMatch(script, /set -x|xtrace/);
});

test('no artifact upload or download, and no action, is used by the workflow', () => {
  assert.doesNotMatch(workflowText, /upload-artifact|download-artifact|actions\/|^\s*uses:/m);
  assert.doesNotMatch(script.replace(/^\s*#.*$/gm, ''), /upload|artifact/i);
});

test('cm_resolver is not created by the review bootstrap', () => {
  assert.doesNotMatch(script.replace(/^#.*$/gm, ''), /cm_resolver/);
});
