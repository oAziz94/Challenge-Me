// A minimal in-memory "world" for the meta-gate tests: a catalogue that satisfies the implemented floor, workflow
// documents with the matching jobs, and one open prerequisite with a pending gate. Tests mutate deep copies.
import { IMPLEMENTED_FLOOR } from '../lib/catalogue.mjs';

export const clone = (v) => structuredClone(v);

/** Generic floors for the rule tests; the real floors are exercised against the real catalogue in floor.test.mjs. */
export const TEST_PENDING = Object.freeze({
  'some-pending-gate': ['open-thing'],
  'floor-pending-a': ['floor-prereq-a'],
  'floor-pending-b': ['floor-prereq-a', 'floor-prereq-b'],
});
export const TEST_PREREQUISITES = Object.freeze(['open-thing', 'floor-prereq-a', 'floor-prereq-b']);
const floors = () => ({ implemented: IMPLEMENTED_FLOOR, pending: TEST_PENDING, prerequisites: TEST_PREREQUISITES });

const PR_ONLY = new Set(['commit-identity', 'authoritative-path']);
const GOVERNANCE = new Set(['commit-identity', 'authoritative-path', 'secret-scan']);

export function world() {
  const gates = [];
  const jobsCi = {};
  const jobsGov = {};
  const jobsWeekly = {};
  for (const [id, state] of Object.entries(IMPLEMENTED_FLOOR)) {
    const workflow = GOVERNANCE.has(id)
      ? '.github/workflows/governance.yml'
      : state === 'scheduled'
        ? '.github/workflows/dependency-report-weekly.yml'
        : '.github/workflows/ci.yml';
    const gate = { id, state, workflow, job: id, source: 'test' };
    if (PR_ONLY.has(id)) gate.runsOn = ['pull_request'];
    gates.push(gate);
    const job = { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 5, permissions: {}, steps: [{ run: 'true' }] };
    if (PR_ONLY.has(id)) job.if = "github.event_name == 'pull_request'";
    (GOVERNANCE.has(id) ? jobsGov : state === 'scheduled' ? jobsWeekly : jobsCi)[id] = job;
  }
  for (const [id, prerequisites] of Object.entries(TEST_PENDING)) {
    gates.push({ id, state: 'pending', source: 'test', prerequisites: [...prerequisites], reason: 'waits for an open prerequisite' });
  }
  const catalogue = {
    schemaVersion: 1,
    allowedActions: [],
    prerequisites: Object.fromEntries(
      TEST_PREREQUISITES.map((id) => [id, { kind: 'decision', status: 'OPEN', summary: 'an open prerequisite', source: 'test' }]),
    ),
    gates,
  };
  const triggers = { pull_request: { branches: ['main'] }, push: { branches: ['main'] } };
  const workflows = {
    '.github/workflows/ci.yml': { name: 'ci', on: triggers, permissions: {}, jobs: jobsCi },
    '.github/workflows/governance.yml': { name: 'governance', on: clone(triggers), permissions: {}, jobs: jobsGov },
    '.github/workflows/dependency-report-weekly.yml': {
      name: 'weekly',
      on: { schedule: [{ cron: '17 5 * * 1' }], workflow_dispatch: null },
      permissions: {},
      jobs: jobsWeekly,
    },
  };
  return { catalogue, workflows, floors: floors() };
}
