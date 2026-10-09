// The meta-gate: a required gate that disappears cannot pass silently, and "pending by accepted prerequisite" is told
// apart from "missing unexpectedly".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPLEMENTED_FLOOR, checkCatalogue, cronAtLeastWeekly } from '../lib/catalogue.mjs';
import { clone, world } from './world.mjs';

const run = (w) => checkCatalogue({ catalogue: w.catalogue, workflows: w.workflows, floors: w.floors });
const has = (r, re) => r.errors.some((e) => re.test(e));

test('the baseline world is consistent, and pending gates are listed separately from required ones', () => {
  const r = run(world());
  assert.deepEqual(r.errors, []);
  assert.equal(r.pending.length, 3);
  assert.ok(r.pending.some((p) => p.id === 'some-pending-gate'));
  assert.ok(!r.required.includes('some-pending-gate'), 'a pending gate is never a required check');
  assert.ok(!r.scheduled.includes('some-pending-gate'));
  assert.equal(r.required.length + r.scheduled.length, Object.keys(IMPLEMENTED_FLOOR).length);
});

test('deleting any implemented gate from the catalogue fails the meta-gate', () => {
  for (const id of Object.keys(IMPLEMENTED_FLOOR)) {
    const w = world();
    w.catalogue.gates = w.catalogue.gates.filter((g) => g.id !== id);
    const r = run(w);
    assert.ok(has(r, new RegExp(`gate "${id}": missing from the catalogue`)), `deleted ${id}`);
  }
});

test('deleting the job (the real gate) while keeping the catalogue entry fails the meta-gate', () => {
  for (const g of world().catalogue.gates.filter((x) => x.state !== 'pending')) {
    const w = world();
    delete w.workflows[g.workflow].jobs[g.job];
    const r = run(w);
    assert.ok(has(r, new RegExp(`gate "${g.id}": job "${g.job}" is missing`)), `job ${g.job} removed`);
  }
});

test('deleting a whole workflow file fails the meta-gate', () => {
  const w = world();
  delete w.workflows['.github/workflows/ci.yml'];
  const r = run(w);
  assert.ok(has(r, /does not exist/));
});

test('a workflow that cannot be parsed fails the meta-gate', () => {
  const w = world();
  w.workflows['.github/workflows/ci.yml'] = null;
  assert.ok(has(run(w), /cannot be parsed/));
});

test('renaming a job (so the required check name changes) fails the meta-gate', () => {
  const w = world();
  const jobs = w.workflows['.github/workflows/ci.yml'].jobs;
  jobs['lint-renamed'] = jobs.lint;
  delete jobs.lint;
  const r = run(w);
  assert.ok(has(r, /gate "lint": job "lint" is missing/));
  assert.ok(has(r, /job "lint-renamed" is not in the gate catalogue/));
  const w2 = world();
  w2.workflows['.github/workflows/ci.yml'].jobs.lint.name = 'Lint (renamed)';
  assert.ok(has(run(w2), /would change the check name/));
});

test('a job that nobody catalogued is reported (coverage cannot change untracked)', () => {
  const w = world();
  w.workflows['.github/workflows/ci.yml'].jobs.surprise = clone(w.workflows['.github/workflows/ci.yml'].jobs.lint);
  assert.ok(has(run(w), /job "surprise" is not in the gate catalogue/));
});

test('an implemented gate cannot be demoted to pending, even with a plausible prerequisite', () => {
  const w = world();
  const g = w.catalogue.gates.find((x) => x.id === 'lint');
  Object.assign(g, { state: 'pending', prerequisites: ['open-thing'], reason: 'pretend' });
  for (const k of ['workflow', 'job']) delete g[k];
  delete w.workflows['.github/workflows/ci.yml'].jobs.lint;
  const r = run(w);
  assert.ok(has(r, /gate "lint": an implemented gate cannot be pending/));
  assert.ok(has(r, /gate "lint": must be required, found pending/));
  assert.ok(!r.required.includes('lint'));
});

test('an undeclared required gate cannot pass: pending needs a reason, a source, and a known open prerequisite', () => {
  const cases = [
    ['no prerequisite', (g) => (g.prerequisites = []), /names no prerequisite/],
    ['unknown prerequisite', (g) => (g.prerequisites = ['made-up']), /unknown prerequisite "made-up"/],
    ['no reason', (g) => delete g.reason, /needs a reason/],
    ['no source', (g) => delete g.source, /source citation is required/],
    ['pending with a job', (g) => (g.job = 'some-pending-gate'), /must not declare "job"/],
    ['pending with a workflow', (g) => (g.workflow = '.github/workflows/ci.yml'), /must not declare "workflow"/],
  ];
  for (const [label, mutate, re] of cases) {
    const w = world();
    mutate(w.catalogue.gates.find((g) => g.id === 'some-pending-gate'));
    assert.ok(has(run(w), re), label);
  }
});

test('a pending gate whose every prerequisite is RESOLVED must now be implemented; one still open keeps it pending', () => {
  const w = world();
  w.catalogue.prerequisites['open-thing'].status = 'RESOLVED';
  assert.ok(has(run(w), /every prerequisite is RESOLVED, so the gate must now be implemented/));

  // floor-pending-b waits on two prerequisites: one resolved, one still open, so it stays pending
  const w2 = world();
  w2.catalogue.prerequisites['floor-prereq-a'].status = 'RESOLVED';
  assert.ok(has(run(w2), /gate "floor-pending-a": every prerequisite is RESOLVED/));
  assert.ok(!has(run(w2), /gate "floor-pending-b": every prerequisite is RESOLVED/));
});

test('prerequisite registry entries are validated', () => {
  const w = world();
  w.catalogue.prerequisites['open-thing'] = { kind: 'opinion', status: 'MAYBE' };
  const r = run(w);
  assert.ok(has(r, /kind must be decision or task-delivery/));
  assert.ok(has(r, /status must be OPEN or RESOLVED/));
  assert.ok(has(r, /summary is required/));
  assert.ok(has(r, /source citation is required/));
});

test('duplicate ids, bad states and a non-1 schema version fail', () => {
  const w = world();
  w.catalogue.gates.push(clone(w.catalogue.gates[0]));
  assert.ok(has(run(w), /duplicate id/));
  const w2 = world();
  w2.catalogue.gates[0].state = 'optional';
  assert.ok(has(run(w2), /state must be required, scheduled or pending/));
  const w3 = world();
  w3.catalogue.schemaVersion = 2;
  assert.ok(has(run(w3), /schemaVersion must be 1/));
});

test('a required gate must run on pull requests and pushes to main, unconditionally', () => {
  const w = world();
  delete w.workflows['.github/workflows/ci.yml'].on.push;
  assert.ok(has(run(w), /does not trigger on push/));

  const w2 = world();
  w2.workflows['.github/workflows/ci.yml'].on.push = { branches: ['develop'] };
  assert.ok(has(run(w2), /push trigger must include branch main/));

  const w3 = world();
  w3.workflows['.github/workflows/ci.yml'].jobs.lint.if = 'false';
  assert.ok(has(run(w3), /could skip the gate/));

  const w4 = world();
  w4.workflows['.github/workflows/ci.yml'].jobs.lint.if = "github.event_name == 'pull_request'";
  assert.ok(has(run(w4), /could skip the gate/), 'a pull_request-only condition on a gate declared for push too');

  const w5 = world();
  delete w5.workflows['.github/workflows/governance.yml'].jobs['commit-identity'].if;
  assert.ok(has(run(w5), /declared pull_request-only but the job has no event condition/));
});

test('the scheduled gate must keep a schedule of at least weekly and no condition', () => {
  const w = world();
  w.workflows['.github/workflows/dependency-report-weekly.yml'].on = { workflow_dispatch: null };
  assert.ok(has(run(w), /has no schedule trigger/));
  const w2 = world();
  w2.workflows['.github/workflows/dependency-report-weekly.yml'].on.schedule = [{ cron: '0 0 1 * *' }];
  assert.ok(has(run(w2), /at least weekly/));
  const w3 = world();
  w3.workflows['.github/workflows/dependency-report-weekly.yml'].jobs['dependency-report-weekly'].if = 'false';
  assert.ok(has(run(w3), /must not carry a job condition/));
  assert.equal(cronAtLeastWeekly('17 5 * * 1'), true);
  assert.equal(cronAtLeastWeekly('0 3 * * *'), true);
  assert.equal(cronAtLeastWeekly('0 3 1 * *'), false);
  assert.equal(cronAtLeastWeekly('0 3 * 1 1'), false);
  assert.equal(cronAtLeastWeekly('garbage'), false);
});

test('the floor is independent of the catalogue file: emptying the catalogue reports every implemented gate missing', () => {
  const w = world();
  w.catalogue.gates = [];
  const r = run(w);
  assert.ok(has(r, /no gates/));
  for (const id of Object.keys(IMPLEMENTED_FLOOR)) assert.ok(has(r, new RegExp(`gate "${id}": missing`)), id);
});

test('a prerequisite owner, when given, must not be empty', () => {
  const w = world();
  w.catalogue.prerequisites['open-thing'].owner = ' ';
  assert.ok(has(run(w), /owner must not be empty/));
  const w2 = world();
  w2.catalogue.prerequisites['open-thing'].owner = 'engineering authority';
  assert.deepEqual(run(w2).errors, []);
});
