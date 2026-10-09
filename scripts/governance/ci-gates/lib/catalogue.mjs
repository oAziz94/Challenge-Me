// The CI gate catalogue and its meta-gate (STACK-ADR-002 section 8, Foundation brief section 20 task 2:
// "failing on missing required gates").
//
// The catalogue (gates.json) lists every gate with an explicit state:
//   required  - implemented now. A workflow job with exactly that id exists, runs on the declared events, is not
//               disabled, and is a required status check on main.
//   scheduled - implemented now; runs on a schedule (weekly at most), is not a pull-request check.
//   pending   - NOT implemented, by an accepted prerequisite that is itself recorded in the catalogue registry with
//               status OPEN. A pending gate has no job, is never a required check, and is never reported as passed.
//
// "Present but pending by accepted prerequisite" and "missing unexpectedly" are told apart mechanically:
//   - a gate that is absent from the catalogue, or whose job is absent from the workflow, FAILS the meta-gate;
//   - a gate in the implemented floor (below) cannot be moved to pending;
//   - a pending gate whose prerequisites are all RESOLVED FAILS (the work it waited for is delivered: implement it);
//   - a pending gate naming an unknown prerequisite, or none, FAILS.
// Moving a prerequisite from OPEN to RESOLVED is a human-reviewed change to this directory (STACK-ADR-002 6.3).

/**
 * Gates that are implemented now. They can never be pending and can never be removed: deleting one of them from the
 * catalogue is detected here, in code that is independent of the catalogue file. (Both are protection-mechanism files;
 * a change to either needs human inspection of the diff.)
 */
export const IMPLEMENTED_FLOOR = Object.freeze({
  'commit-identity': 'required',
  'authoritative-path': 'required',
  'secret-scan': 'required',
  'install-frozen': 'required',
  lint: 'required',
  format: 'required',
  typecheck: 'required',
  unit: 'required',
  'governance-tests': 'required',
  architecture: 'required',
  'integration-skeleton': 'required',
  'migration-verification': 'required',
  'integration-real-roles': 'required',
  'table-category-registry-vs-rls': 'required',
  'dependency-scan': 'required',
  'image-build': 'required',
  'image-scan': 'required',
  'dependency-report': 'required',
  'gate-catalogue': 'required',
  'dependency-report-weekly': 'scheduled',
});

/**
 * Every pending gate and its EXACT prerequisite set. Pending is not a place to park a gate: deleting a pending gate, changing its
 * prerequisites (including swapping a legitimate one for an invented OPEN one) or adding a gate that is in no floor fails the
 * meta-gate. Implementing a gate, or changing what it waits for, is a reviewed change of THIS file (STACK-ADR-002 6.3).
 */
export const PENDING_FLOOR = Object.freeze({
  'cross-tenant-endpoint-suite': Object.freeze(['fb20-task-4']),
  'pooled-connection-leak': Object.freeze(['decision-test-only-pooler', 'fb20-task-4']),
  'job-tenant-mismatch': Object.freeze(['cr-10-tenantless-job-envelope', 'fb20-task-7']),
  'resolver-ids-only-audited': Object.freeze(['fb20-task-4a']),
  'resolver-boundary-closed-set': Object.freeze(['fb20-task-4a']),
  'resolver-privilege-assertions': Object.freeze(['cr-7-resolver-privileges', 'fb20-task-4a']),
  'resolver-search-path-regression': Object.freeze(['fb20-task-4a']),
  'student-dto-canary-harness': Object.freeze(['fb20-task-11']),
  'purge-handler-registration-gate': Object.freeze(['fb20-task-11', 'fb20-task-12']),
  'sensitive-logging-canary': Object.freeze(['fb20-task-5']),
  'queue-discipline-and-leases': Object.freeze(['cr-10-tenantless-job-envelope', 'fb20-task-7']),
  'no-transaction-across-io': Object.freeze(['fb20-task-7']),
  'admission-control-contention': Object.freeze(['fb20-task-7']),
  'audit-append-only-same-transaction': Object.freeze(['fb20-task-5']),
  'storage-download-link-contract': Object.freeze(['fb20-task-8']),
  'deletion-ledger-write-once-contract': Object.freeze(['fb20-task-8']),
  'provider-contract-tests': Object.freeze(['fb20-task-8', 'fb20-task-9']),
  'processed-event-convention': Object.freeze(['fb20-task-6']),
  'idempotency-key-convention': Object.freeze(['fb20-no-assigned-task-owner']),
  'architecture-module-boundary-tests': Object.freeze(['fb20-task-11']),
  'vulnerability-findings-policy': Object.freeze(['decision-vulnerability-findings-policy']),
});

/** The prerequisite registry, by id. A prerequisite cannot be added to or removed from gates.json without changing this list. */
export const PREREQUISITE_FLOOR = Object.freeze([
  'cr-10-tenantless-job-envelope',
  'cr-7-resolver-privileges',
  'decision-migration-runner',
  'decision-test-only-pooler',
  'decision-vulnerability-findings-policy',
  'fb20-no-assigned-task-owner',
  'fb20-task-11',
  'fb20-task-12',
  'fb20-task-3',
  'fb20-task-4',
  'fb20-task-4a',
  'fb20-task-5',
  'fb20-task-6',
  'fb20-task-7',
  'fb20-task-8',
  'fb20-task-9',
]);

/** The floors checkCatalogue enforces by default; tests may pass smaller ones to exercise the generic rules. */
export const FLOORS = Object.freeze({ implemented: IMPLEMENTED_FLOOR, pending: PENDING_FLOOR, prerequisites: PREREQUISITE_FLOOR });

const STATES = new Set(['required', 'scheduled', 'pending']);
const PREREQ_STATUS = new Set(['OPEN', 'RESOLVED']);
const PREREQ_KIND = new Set(['decision', 'task-delivery']);
const ID = /^[a-z][a-z0-9-]*$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/** Weekly or more frequent: day-of-month and month are wildcards and the cron is one expression. */
export function cronAtLeastWeekly(cron) {
  const f = String(cron).trim().split(/\s+/);
  if (f.length !== 5) return false;
  const [min, hour, dom, mon, dow] = f;
  if (![min, hour].every((x) => /^[\d*/,-]+$/.test(x))) return false;
  if (dom !== '*' || mon !== '*') return false;
  return /^(?:\*|[0-7](?:[,-][0-7])*|\*\/\d+)$/.test(dow);
}

/**
 * @param {{catalogue:any, workflows: Record<string, any>, floors?: typeof FLOORS}} o  workflows: file -> parsed workflow document (or null)
 * @returns {{errors:string[], required:string[], scheduled:string[], pending:{id:string, prerequisites:string[], reason:string}[]}}
 */
export function checkCatalogue({ catalogue, workflows, floors = FLOORS }) {
  const IMPLEMENTED = floors.implemented;
  const PENDING = floors.pending;
  const errors = [];
  const out = { errors, required: [], scheduled: [], pending: [] };
  const err = (m) => errors.push(m);

  if (!isObject(catalogue) || catalogue.schemaVersion !== 1) {
    err('catalogue: schemaVersion must be 1');
    return out;
  }
  const prereqs = isObject(catalogue.prerequisites) ? catalogue.prerequisites : {};
  const gates = Array.isArray(catalogue.gates) ? catalogue.gates : [];
  if (!isObject(catalogue.prerequisites)) err('catalogue: prerequisites registry is missing');
  if (gates.length === 0) err('catalogue: no gates');

  for (const [id, p] of Object.entries(prereqs)) {
    if (!ID.test(id)) err(`prerequisite "${id}": invalid id`);
    if (!isObject(p)) {
      err(`prerequisite "${id}": not an object`);
      continue;
    }
    if (!PREREQ_KIND.has(p.kind)) err(`prerequisite "${id}": kind must be decision or task-delivery`);
    if (!PREREQ_STATUS.has(p.status)) err(`prerequisite "${id}": status must be OPEN or RESOLVED`);
    if (!nonEmpty(p.summary)) err(`prerequisite "${id}": summary is required`);
    if (!nonEmpty(p.source)) err(`prerequisite "${id}": source citation is required`);
    if ('owner' in p && !nonEmpty(p.owner)) err(`prerequisite "${id}": owner must not be empty when present`);
  }

  const seen = new Set();
  const checks = new Set();
  const jobsClaimed = new Map(); // "file#job" -> gate id
  for (const g of gates) {
    if (!isObject(g) || !ID.test(String(g.id))) {
      err(`gate ${JSON.stringify(g?.id)}: invalid id`);
      continue;
    }
    if (seen.has(g.id)) err(`gate "${g.id}": duplicate id`);
    seen.add(g.id);
    if (!STATES.has(g.state)) {
      err(`gate "${g.id}": state must be required, scheduled or pending`);
      continue;
    }
    if (!nonEmpty(g.source)) err(`gate "${g.id}": source citation is required`);

    if (g.state === 'pending') {
      if (g.id in IMPLEMENTED) err(`gate "${g.id}": an implemented gate cannot be pending`);
      else if (!(g.id in PENDING)) {
        err(`gate "${g.id}": not in the pending floor (adding a gate is a deliberate change of catalogue.mjs)`);
      }
      for (const forbidden of ['workflow', 'job', 'runsOn', 'schedule']) {
        if (forbidden in g) err(`gate "${g.id}": a pending gate must not declare "${forbidden}" (it has no job and is never a check)`);
      }
      if (!nonEmpty(g.reason)) err(`gate "${g.id}": pending gate needs a reason`);
      const list = Array.isArray(g.prerequisites) ? g.prerequisites : [];
      if (list.length === 0) err(`gate "${g.id}": pending gate names no prerequisite, so it is not "pending by accepted prerequisite"`);
      const unknown = list.filter((p) => !(p in prereqs));
      for (const p of unknown) err(`gate "${g.id}": unknown prerequisite "${p}"`);
      const known = list.filter((p) => p in prereqs);
      if (unknown.length === 0 && known.length > 0 && known.every((p) => prereqs[p]?.status === 'RESOLVED')) {
        err(`gate "${g.id}": every prerequisite is RESOLVED, so the gate must now be implemented, not pending`);
      }
      out.pending.push({ id: g.id, prerequisites: list, reason: String(g.reason ?? '') });
      continue;
    }

    // required | scheduled
    if (!(g.id in IMPLEMENTED)) err(`gate "${g.id}": not in the implemented floor (adding a gate is a deliberate change of catalogue.mjs)`);
    else if (IMPLEMENTED[g.id] !== g.state) err(`gate "${g.id}": must be ${IMPLEMENTED[g.id]}, found ${g.state}`);
    if ('prerequisites' in g) err(`gate "${g.id}": only a pending gate has prerequisites`);
    if (!nonEmpty(g.workflow) || !nonEmpty(g.job)) {
      err(`gate "${g.id}": workflow and job are required`);
      continue;
    }
    if (g.job !== g.id) err(`gate "${g.id}": the job id must equal the gate id (the check name is the job id)`);
    if (checks.has(g.job)) err(`gate "${g.id}": check name "${g.job}" is not unique`);
    checks.add(g.job);
    const key = `${g.workflow}#${g.job}`;
    jobsClaimed.set(key, g.id);

    const wf = workflows[g.workflow];
    if (wf === undefined) {
      err(`gate "${g.id}": workflow ${g.workflow} does not exist`);
      continue;
    }
    if (wf === null) {
      err(`gate "${g.id}": workflow ${g.workflow} cannot be parsed`);
      continue;
    }
    const job = isObject(wf.jobs) ? wf.jobs[g.job] : undefined;
    if (!isObject(job)) {
      err(`gate "${g.id}": job "${g.job}" is missing from ${g.workflow} (a required gate disappeared)`);
      continue;
    }
    if ('name' in job && job.name !== g.job) err(`gate "${g.id}": job name "${job.name}" would change the check name`);
    if (!Array.isArray(job.steps) || job.steps.length === 0) err(`gate "${g.id}": job has no steps`);
    const on = isObject(wf.on) ? wf.on : {};

    if (g.state === 'required') {
      const runsOn = Array.isArray(g.runsOn) ? g.runsOn : ['pull_request', 'push'];
      if (!runsOn.every((e) => e === 'pull_request' || e === 'push') || runsOn.length === 0)
        err(`gate "${g.id}": runsOn must list pull_request and/or push`);
      for (const e of runsOn) if (!(e in on)) err(`gate "${g.id}": ${g.workflow} does not trigger on ${e}`);
      if (runsOn.includes('push')) {
        const branches = isObject(on.push) ? on.push.branches : undefined;
        if (!Array.isArray(branches) || !branches.includes('main')) err(`gate "${g.id}": push trigger must include branch main`);
      }
      if (runsOn.includes('pull_request')) {
        const branches = isObject(on.pull_request) ? on.pull_request.branches : undefined;
        if (!Array.isArray(branches) || !branches.includes('main')) err(`gate "${g.id}": pull_request trigger must target branch main`);
      }
      // A skipped job counts as success for a required check, so a condition may only restrict to the declared events.
      const cond = job.if === undefined ? undefined : String(job.if).trim();
      const onlyPr = runsOn.length === 1 && runsOn[0] === 'pull_request';
      if (cond === undefined) {
        if (onlyPr) err(`gate "${g.id}": declared pull_request-only but the job has no event condition`);
      } else if (!(onlyPr && cond === "github.event_name == 'pull_request'")) {
        err(`gate "${g.id}": job condition "${cond}" could skip the gate (a skipped required check passes)`);
      }
      out.required.push(g.id);
    } else {
      if (!('schedule' in on)) err(`gate "${g.id}": scheduled gate but ${g.workflow} has no schedule trigger`);
      else {
        const crons = Array.isArray(on.schedule) ? on.schedule.map((s) => s?.cron) : [];
        if (crons.length === 0 || !crons.every(cronAtLeastWeekly)) err(`gate "${g.id}": schedule must run at least weekly`);
      }
      if (job.if !== undefined) err(`gate "${g.id}": a scheduled gate must not carry a job condition`);
      out.scheduled.push(g.id);
    }
  }

  // The implemented floor: every floor gate is present and in the declared state.
  for (const [id, state] of Object.entries(IMPLEMENTED)) {
    const g = gates.find((x) => x?.id === id);
    if (!g) err(`gate "${id}": missing from the catalogue (an implemented gate disappeared)`);
    else if (g.state !== state) err(`gate "${id}": must be ${state}, found ${g.state}`);
  }

  // The pending floor: every current pending gate stays in the catalogue, pending, with EXACTLY its pinned prerequisites.
  for (const [id, pinned] of Object.entries(PENDING)) {
    const g = gates.find((x) => x?.id === id);
    if (!g) {
      err(`gate "${id}": missing from the catalogue (a pending gate disappeared)`);
      continue;
    }
    const given = Array.isArray(g.prerequisites) ? [...g.prerequisites].sort() : [];
    if (g.state !== 'pending')
      err(`gate "${id}": must stay pending, found ${g.state} (implementing a gate is a deliberate change of catalogue.mjs)`);
    else if (JSON.stringify(given) !== JSON.stringify([...pinned].sort())) {
      err(`gate "${id}": prerequisites must be exactly [${pinned.join(', ')}], found [${given.join(', ')}]`);
    }
  }

  // The prerequisite registry: exactly the pinned ids. An invented prerequisite cannot be added to keep a gate pending.
  for (const id of floors.prerequisites) {
    if (!(id in prereqs)) err(`prerequisite "${id}": missing from the registry (a pinned prerequisite disappeared)`);
  }
  for (const id of Object.keys(prereqs)) {
    if (!floors.prerequisites.includes(id))
      err(`prerequisite "${id}": not in the prerequisite floor (adding a prerequisite is a deliberate change of catalogue.mjs)`);
  }

  // Every job of every workflow is a catalogued gate: a job nobody listed is an untracked change of coverage.
  for (const [file, wf] of Object.entries(workflows)) {
    if (!isObject(wf) || !isObject(wf.jobs)) continue;
    for (const jobId of Object.keys(wf.jobs)) {
      if (!jobsClaimed.has(`${file}#${jobId}`)) err(`${file}: job "${jobId}" is not in the gate catalogue`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pinned gate definitions (Foundation Task 2). A weakened script ("lint": "true") or run command would keep every gate
// "present" while proving nothing, so the exact strings are pinned here, in code that is independent of the files they pin.
// This is a guard against accident and against a change that does not also edit this file; it is NOT proof against a pull
// request that changes the guard and its tests together. For that, the root files below are self-modifying paths (Task 1
// classification) and the engineering authority reads the actual diff (STACK-ADR-002 6.3).

/** package.json scripts used by the required gates, exactly. */
export const EXPECTED_SCRIPTS = Object.freeze({
  lint: 'eslint .',
  'format:check': 'prettier --check .',
  typecheck: 'tsc --noEmit -p tsconfig.json',
  'test:unit': 'vitest run --project unit',
  'test:governance': 'node --test "scripts/governance/test/*.test.mjs"',
  'test:ci-gates': 'node --test "scripts/governance/ci-gates/test/*.test.mjs"',
  'check:architecture': 'node scripts/governance/ci-gates/architecture-check.mjs',
  'check:gates': 'node scripts/governance/ci-gates/check-gates.mjs',
  'test:migration': 'vitest run --project integration tests/integration/migration',
  'test:database': 'vitest run --project integration tests/integration/database',
  'test:registry': 'vitest run --project integration tests/integration/registry',
  migrate: 'node --env-file-if-exists=.env.local src/foundation/migrations/cli.ts',
  'report:dependencies': 'node scripts/governance/ci-gates/dependency-report.mjs',
});

/** The scan command of the dependency-scan job: the only place `pnpm audit` runs is the report script, with exactly these arguments. */
export const EXPECTED_DEPENDENCY_SCAN_RUN = 'node scripts/governance/ci-gates/vulnerability-report.mjs dependency';
/** The arguments (after `corepack`) of the audit run by vulnerability-report.mjs: no level, filter, ignore or registry option. */
export const AUDIT_ARGS = Object.freeze(['pnpm', 'audit', '--json']);
/** The Trivy argument list of the image-scan job (quotes removed): vulnerabilities only, no filter, no policy option. */
export const EXPECTED_TRIVY_ARGS = Object.freeze([
  'image',
  '--scanners',
  'vuln',
  '--no-progress',
  '--format',
  'json',
  '--output',
  '$RUNNER_TEMP/trivy-report.json',
  'challenge-me:ci',
]);

/**
 * Every run line of any workflow that mentions Trivy, exactly: the installer lines and the two invocations. The scan line is
 * "$RUNNER_TEMP/trivy/trivy" followed by EXPECTED_TRIVY_ARGS. A line that differs in any way (a flag, -s, --ignore-status,
 * --pkg-types, a TRIVY_* variable, a wrapper such as sh -c) is rejected by the workflow policy.
 */
export const EXPECTED_TRIVY_LINES = Object.freeze([
  'mkdir -p "$RUNNER_TEMP/trivy"',
  'curl -fsSL --retry 3 -o "$RUNNER_TEMP/trivy.tar.gz" "https://github.com/aquasecurity/trivy/releases/download/v${IMAGE_SCANNER_VERSION}/trivy_${IMAGE_SCANNER_VERSION}_Linux-64bit.tar.gz"',
  'echo "${IMAGE_SCANNER_SHA256}  $RUNNER_TEMP/trivy.tar.gz" | sha256sum -c -',
  'tar -xzf "$RUNNER_TEMP/trivy.tar.gz" -C "$RUNNER_TEMP/trivy" trivy',
  '"$RUNNER_TEMP/trivy/trivy" --version',
  '"$RUNNER_TEMP/trivy/trivy" image --scanners vuln --no-progress --format json --output "$RUNNER_TEMP/trivy-report.json" challenge-me:ci',
  'node scripts/governance/ci-gates/vulnerability-report.mjs image "$RUNNER_TEMP/trivy-report.json"',
]);

/** The exact run command of the named step of each Task 2 job (default: the last step; `fromEnd: 2` is the one before it). */
export const EXPECTED_RUNS = Object.freeze([
  { file: '.github/workflows/ci.yml', job: 'install-frozen', run: 'node --version\ncorepack pnpm --version\ncorepack pnpm ls --depth 0' },
  { file: '.github/workflows/ci.yml', job: 'lint', run: 'corepack pnpm run lint' },
  { file: '.github/workflows/ci.yml', job: 'format', run: 'corepack pnpm run format:check' },
  { file: '.github/workflows/ci.yml', job: 'typecheck', run: 'corepack pnpm run typecheck' },
  { file: '.github/workflows/ci.yml', job: 'unit', run: 'corepack pnpm run test:unit' },
  { file: '.github/workflows/ci.yml', job: 'governance-tests', run: 'corepack pnpm run test:ci-gates' },
  { file: '.github/workflows/ci.yml', job: 'architecture', run: 'corepack pnpm run check:architecture' },
  { file: '.github/workflows/ci.yml', job: 'integration-skeleton', run: 'bash scripts/governance/ci-gates/postgres-probe.sh' },
  { file: '.github/workflows/ci.yml', job: 'migration-verification', fromEnd: 2, run: 'corepack pnpm run test:migration' },
  { file: '.github/workflows/ci.yml', job: 'migration-verification', run: 'bash scripts/governance/ci-gates/schema-review-dump.sh' },
  { file: '.github/workflows/ci.yml', job: 'integration-real-roles', run: 'corepack pnpm run test:database' },
  { file: '.github/workflows/ci.yml', job: 'table-category-registry-vs-rls', run: 'corepack pnpm run test:registry' },
  { file: '.github/workflows/ci.yml', job: 'dependency-scan', run: 'node scripts/governance/ci-gates/vulnerability-report.mjs dependency' },
  {
    file: '.github/workflows/ci.yml',
    job: 'image-build',
    run: 'set -euo pipefail\nuid="$(docker run --rm --entrypoint id challenge-me:ci -u)"\necho "image user id: $uid"\ntest "$uid" != "0"\ntest "$(docker run --rm challenge-me:ci)" = "$NODE_VERSION"',
  },
  {
    file: '.github/workflows/ci.yml',
    job: 'image-scan',
    run: 'set -euo pipefail\n"$RUNNER_TEMP/trivy/trivy" --version\n"$RUNNER_TEMP/trivy/trivy" image --scanners vuln --no-progress --format json --output "$RUNNER_TEMP/trivy-report.json" challenge-me:ci\nnode scripts/governance/ci-gates/vulnerability-report.mjs image "$RUNNER_TEMP/trivy-report.json"',
  },
  { file: '.github/workflows/ci.yml', job: 'dependency-report', run: 'corepack pnpm run report:dependencies' },
  { file: '.github/workflows/ci.yml', job: 'gate-catalogue', run: 'corepack pnpm run check:gates' },
  { file: '.github/workflows/dependency-report-weekly.yml', job: 'dependency-report-weekly', run: 'corepack pnpm run report:dependencies' },
  { file: '.github/workflows/ci.yml', job: 'governance-tests', fromEnd: 2, run: 'corepack pnpm run test:governance' },
]);

/**
 * The exact scope of .prettierignore. The only exclusion the ADR requires is the frozen authoritative directory (STACK-ADR-001
 * 4.9); the others are the recorded Task 2 scope decisions. A pattern such as * or **, or any new exclusion, changes what the
 * format gate checks and needs a reviewed change of this list.
 */
export const EXPECTED_PRETTIER_IGNORE = Object.freeze([
  'docs/specifications/authoritative/',
  'docs/',
  '.claude/',
  'PROJECT-STATE.md',
  'AGENTS.md',
  'CLAUDE.md',
  'scripts/governance/*.mjs',
  'scripts/governance/lib/',
  'scripts/governance/test/',
  'scripts/governance/README.md',
  'node_modules/',
  'pnpm-lock.yaml',
]);

/**
 * @param {{packageJson:any, workflows: Record<string, any>, prettierIgnoreText: string|null}} o
 * @returns {string[]} violations
 */
export function checkGateDefinitions({ packageJson, workflows, prettierIgnoreText }) {
  const v = [];
  const scripts = isObject(packageJson?.scripts) ? packageJson.scripts : {};
  for (const [name, expected] of Object.entries(EXPECTED_SCRIPTS)) {
    if (scripts[name] !== expected)
      v.push(`package.json: script "${name}" must be exactly ${JSON.stringify(expected)}, found ${JSON.stringify(scripts[name] ?? null)}`);
  }
  for (const name of Object.keys(EXPECTED_SCRIPTS)) {
    for (const hook of [`pre${name}`, `post${name}`]) {
      if (hook in scripts) v.push(`package.json: script "${hook}" would run around the pinned gate script "${name}"`);
    }
  }
  for (const { file, job, run, fromEnd = 1 } of EXPECTED_RUNS) {
    const steps = workflows[file]?.jobs?.[job]?.steps;
    const step = Array.isArray(steps) ? steps[steps.length - fromEnd] : undefined;
    const actual = typeof step?.run === 'string' ? step.run.trim() : null;
    if (actual !== run)
      v.push(
        `${file} job "${job}": step ${fromEnd === 1 ? 'last' : `-${fromEnd}`} must run exactly ${JSON.stringify(run)}, found ${JSON.stringify(actual)}`,
      );
  }
  if (prettierIgnoreText === null) v.push('.prettierignore: missing (the format gate would check unintended scope)');
  else {
    const lines = prettierIgnoreText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    for (const l of lines)
      if (!EXPECTED_PRETTIER_IGNORE.includes(l))
        v.push(`.prettierignore: unexpected pattern "${l}" (it would narrow what the format gate checks)`);
    for (const e of EXPECTED_PRETTIER_IGNORE) if (!lines.includes(e)) v.push(`.prettierignore: expected pattern "${e}" is missing`);
  }
  return v;
}
