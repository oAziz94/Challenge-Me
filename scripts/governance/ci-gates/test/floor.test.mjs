// The pending floor is immutable unless deliberately changed in code: every current pending gate, its exact prerequisite set and
// the prerequisite registry are pinned in catalogue.mjs, so a gate cannot be silently deleted, re-pointed at an invented OPEN
// prerequisite, parked as pending, or smuggled in. These tests run the REAL catalogue and the REAL workflows against the REAL floors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { FLOORS, IMPLEMENTED_FLOOR, PENDING_FLOOR, PREREQUISITE_FLOOR, checkCatalogue } from '../lib/catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const realCatalogue = () => JSON.parse(readFileSync(join(root, 'scripts/governance/ci-gates/gates.json'), 'utf8'));
const realWorkflows = () => {
  const dir = join(root, '.github/workflows');
  return Object.fromEntries(readdirSync(dir).map((f) => [`.github/workflows/${f}`, parse(readFileSync(join(dir, f), 'utf8'))]));
};
const run = (catalogue) => checkCatalogue({ catalogue, workflows: realWorkflows(), floors: FLOORS });
const has = (r, re) => r.errors.some((e) => re.test(e));
const pendingIds = Object.keys(PENDING_FLOOR);

test('the real catalogue satisfies the real floors, and required plus scheduled gates equal the implemented floor exactly', () => {
  const r = run(realCatalogue());
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.required, ...r.scheduled].sort(), Object.keys(IMPLEMENTED_FLOOR).sort());
  assert.deepEqual(r.pending.map((p) => p.id).sort(), pendingIds.sort());
});

test('the floors in code equal the pending gates and registry in gates.json (so the floor is the pin, not a copy that can drift)', () => {
  const cat = realCatalogue();
  const pending = cat.gates.filter((g) => g.state === 'pending');
  assert.deepEqual(pending.map((g) => g.id).sort(), pendingIds.sort());
  for (const g of pending) assert.deepEqual([...g.prerequisites].sort(), [...PENDING_FLOOR[g.id]].sort(), g.id);
  assert.deepEqual(Object.keys(cat.prerequisites).sort(), [...PREREQUISITE_FLOOR].sort());
  // every pinned prerequisite is used by at least one pinned pending gate
  const used = new Set(Object.values(PENDING_FLOOR).flat());
  for (const p of PREREQUISITE_FLOOR) assert.ok(used.has(p), `${p} is pinned but no pending gate waits on it`);
});

test('deleting migration-verification fails', () => {
  const c = realCatalogue();
  c.gates = c.gates.filter((g) => g.id !== 'migration-verification');
  assert.ok(has(run(c), /gate "migration-verification": missing from the catalogue/));
});

test('deleting pooled-connection-leak fails', () => {
  const c = realCatalogue();
  c.gates = c.gates.filter((g) => g.id !== 'pooled-connection-leak');
  assert.ok(has(run(c), /gate "pooled-connection-leak": missing from the catalogue/));
});

test('deleting another ordinary pending gate fails', () => {
  const c = realCatalogue();
  c.gates = c.gates.filter((g) => g.id !== 'sensitive-logging-canary');
  assert.ok(has(run(c), /gate "sensitive-logging-canary": missing from the catalogue/));
});

test('deleting ANY current pending gate fails', () => {
  for (const id of pendingIds) {
    const c = realCatalogue();
    c.gates = c.gates.filter((g) => g.id !== id);
    assert.ok(has(run(c), new RegExp(`gate "${id}": missing from the catalogue`)), id);
  }
});

test('replacing a legitimate prerequisite with an invented OPEN prerequisite fails, whether or not the invention is registered', () => {
  for (const id of pendingIds) {
    const legit = PENDING_FLOOR[id][0];
    // registered invention
    const c = realCatalogue();
    c.prerequisites['invented-open-prerequisite'] = {
      kind: 'decision',
      status: 'OPEN',
      summary: 'invented to keep the gate pending',
      source: 'nowhere',
    };
    const g = c.gates.find((x) => x.id === id);
    g.prerequisites = g.prerequisites.map((p) => (p === legit ? 'invented-open-prerequisite' : p));
    const r = run(c);
    assert.ok(has(r, new RegExp(`gate "${id}": prerequisites must be exactly`)), `${id}: substituted`);
    assert.ok(has(r, /prerequisite "invented-open-prerequisite": not in the prerequisite floor/), `${id}: invented registry entry`);
    // unregistered invention
    const c2 = realCatalogue();
    const g2 = c2.gates.find((x) => x.id === id);
    g2.prerequisites = g2.prerequisites.map((p) => (p === legit ? 'invented-open-prerequisite' : p));
    const r2 = run(c2);
    assert.ok(has(r2, /unknown prerequisite "invented-open-prerequisite"/), `${id}: unregistered`);
    assert.ok(has(r2, new RegExp(`gate "${id}": prerequisites must be exactly`)), `${id}: unregistered exact`);
  }
});

test('adding an invented OPEN prerequisite to a gate (keeping the legitimate ones), or dropping one, fails', () => {
  const c = realCatalogue();
  c.prerequisites['invented-open-prerequisite'] = { kind: 'decision', status: 'OPEN', summary: 'extra', source: 'nowhere' };
  c.gates.find((g) => g.id === 'migration-verification').prerequisites.push('invented-open-prerequisite');
  assert.ok(has(run(c), /gate "migration-verification": prerequisites must be exactly/));

  const c2 = realCatalogue();
  c2.gates.find((g) => g.id === 'migration-verification').prerequisites = ['decision-migration-runner'];
  assert.ok(has(run(c2), /gate "migration-verification": prerequisites must be exactly/));
});

test('adding an unpinned prerequisite to the registry, or deleting a pinned one, fails', () => {
  const c = realCatalogue();
  c.prerequisites['invented-open-prerequisite'] = { kind: 'decision', status: 'OPEN', summary: 'x', source: 'x' };
  assert.ok(has(run(c), /prerequisite "invented-open-prerequisite": not in the prerequisite floor/));
  const c2 = realCatalogue();
  delete c2.prerequisites['decision-test-only-pooler'];
  const r2 = run(c2);
  assert.ok(has(r2, /prerequisite "decision-test-only-pooler": missing from the registry/));
  assert.ok(has(r2, /gate "pooled-connection-leak": unknown prerequisite "decision-test-only-pooler"/));
});

test('promoting a pending gate to required fails; promoting it and then deleting it from the catalogue fails too', () => {
  const promoted = realCatalogue();
  const g = promoted.gates.find((x) => x.id === 'migration-verification');
  Object.assign(g, { state: 'required', workflow: '.github/workflows/ci.yml', job: 'migration-verification' });
  delete g.prerequisites;
  delete g.reason;
  const r = run(promoted);
  assert.ok(has(r, /gate "migration-verification": not in the implemented floor/));
  assert.ok(has(r, /gate "migration-verification": job "migration-verification" is missing/));
  assert.ok(has(r, /gate "migration-verification": must stay pending/));

  const deleted = realCatalogue();
  deleted.gates = deleted.gates.filter((x) => x.id !== 'migration-verification');
  assert.ok(has(run(deleted), /gate "migration-verification": missing from the catalogue/));
});

test('resolving every legitimate prerequisite makes the pending state invalid and forces implementation', () => {
  for (const id of pendingIds) {
    const c = realCatalogue();
    for (const p of PENDING_FLOOR[id]) c.prerequisites[p].status = 'RESOLVED';
    assert.ok(has(run(c), new RegExp(`gate "${id}": every prerequisite is RESOLVED, so the gate must now be implemented`)), id);
  }
  // resolving only some of them keeps the gate pending
  const c = realCatalogue();
  c.prerequisites['fb20-task-3'].status = 'RESOLVED';
  const r = run(c);
  assert.ok(!has(r, /gate "migration-verification": every prerequisite is RESOLVED/));
  assert.ok(
    has(r, /gate "integration-real-roles": every prerequisite is RESOLVED/),
    'a gate that waited only on that task must now be implemented',
  );
});

test('a gate that is in neither floor cannot be added, as pending or as required', () => {
  const c = realCatalogue();
  c.gates.push({ id: 'smuggled-pending', state: 'pending', source: 's', prerequisites: ['fb20-task-3'], reason: 'r' });
  assert.ok(has(run(c), /gate "smuggled-pending": not in the pending floor/));
  const c2 = realCatalogue();
  c2.gates.push({
    id: 'smuggled-required',
    state: 'required',
    workflow: '.github/workflows/ci.yml',
    job: 'smuggled-required',
    source: 's',
  });
  const r2 = run(c2);
  assert.ok(has(r2, /gate "smuggled-required": not in the implemented floor/));
});

test('demoting an implemented gate to pending fails even when its prerequisite set looks plausible', () => {
  for (const id of Object.keys(IMPLEMENTED_FLOOR)) {
    const c = realCatalogue();
    const idx = c.gates.findIndex((g) => g.id === id);
    c.gates[idx] = { id, state: 'pending', source: 's', prerequisites: ['fb20-task-3'], reason: 'pretend' };
    const r = run(c);
    assert.ok(has(r, new RegExp(`gate "${id}": an implemented gate cannot be pending`)), id);
    assert.ok(!r.required.includes(id) && !r.scheduled.includes(id), id);
  }
});

test('the two special pending gates keep their meaning: the findings-policy decision stays OPEN and idempotency maps to no task', () => {
  assert.deepEqual([...PENDING_FLOOR['vulnerability-findings-policy']], ['decision-vulnerability-findings-policy']);
  assert.deepEqual([...PENDING_FLOOR['idempotency-key-convention']], ['fb20-no-assigned-task-owner']);
  for (const [id, p] of Object.entries(PENDING_FLOOR)) {
    if (id !== 'idempotency-key-convention') assert.ok(!p.includes('fb20-no-assigned-task-owner'), `${id} borrows the placeholder`);
  }
});
