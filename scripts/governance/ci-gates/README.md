# CI gate catalogue and meta-gate (Foundation Task 2)

Source: STACK-ADR-002 section 8 (Task 2 capabilities), 6.4-6.7 (permissions, untrusted code, secrets, supply chain), STACK-ADR-001 4.7-4.14.
These are protection-mechanism files: a change here is a self-modifying change (STACK-ADR-002 6.3). The authoritative review signal for it is the
human reading of the actual diff, not CI output.

## What is here

| File                                                 | Purpose                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gates.json`                                         | The gate catalogue: every gate with a state (`required`, `scheduled`, `pending`), and the registry of accepted prerequisites that justify `pending`.                                                                          |
| `check-gates.mjs`                                    | The meta-gate (the `gate-catalogue` job). `--list-required-checks` prints the exact check names to register as required status checks on `main`.                                                                              |
| `lib/catalogue.mjs`                                  | Catalogue rules and the implemented floor (`IMPLEMENTED_FLOOR`), which is independent of `gates.json`.                                                                                                                        |
| `lib/workflow-policy.mjs`                            | Workflow and Dockerfile policy: triggers, permissions, actions, secrets, image digests, install commands, retention.                                                                                                          |
| `lib/supply-chain.mjs`                               | Exact pins, lockfile, install-script exceptions, one Node.js version, no workspaces, no bot updates.                                                                                                                          |
| `install-script-exceptions.json`                     | Reviewed dependency install-script exceptions. Empty: no dependency install script runs.                                                                                                                                      |
| `architecture-check.mjs`, `architecture-selftest/`   | The `architecture` job: dependency-cruiser rules plus a self-test that proves the gate can fail.                                                                                                                              |
| `vulnerability-report.mjs`, `lib/scan-report.mjs`    | The reporting step of `dependency-scan` and `image-scan`: it fails only when the scan cannot be performed honestly (tool failure, unavailable data, unreadable or malformed result). Findings are reported and never fail it. |
| `dependency-report.mjs`, `lib/dependency-report.mjs` | The dependency report (current pin, proposed target, vulnerability information). Proposes only.                                                                                                                               |
| `ci-setup.sh`, `postgres-probe.sh`                   | Toolchain bootstrap (Node.js by SHA-256, pnpm by corepack hash, frozen install without scripts) and the PostgreSQL 18 probe.                                                                                                  |
| `harness/smoke.test.ts`                              | Proves only that the pinned Vitest runs a TypeScript test. It is not a catalogue row.                                                                                                                                         |
| `test/`                                              | Tests of this machinery (`pnpm run test:ci-gates`).                                                                                                                                                                           |

## Gate states

- **required** - implemented now. A workflow job with exactly the gate id exists, runs on the declared events, cannot be skipped by a condition (a skipped
  required check passes), and is a required status check on `main`.
- **scheduled** - implemented now; runs on a schedule of at least weekly; not a pull-request check.
- **pending** - not implemented, because an accepted prerequisite is still open. A pending gate has no job, is never a required check, and is printed as
  `PENDING ... NOT passed` in every run (log, `::warning::` annotation and job summary). Pending gates are how the unavailable capabilities are recorded:
  migration verification (runner undecided), the pooled-connection-leak test (test-only pooler undecided) and the Foundation brief section 14 catalogue rows
  that later tasks deliver.

## How "pending by accepted prerequisite" differs from "missing unexpectedly"

- A gate absent from `gates.json`, or whose job is absent from its workflow, fails the meta-gate.
- A gate in `IMPLEMENTED_FLOOR` (code, not data) cannot be moved to `pending` and cannot be removed.
- A `pending` gate must name prerequisites that exist in the registry. If every prerequisite is `RESOLVED`, the meta-gate fails until the gate is implemented.
- A job that is not in the catalogue fails the meta-gate (coverage cannot change untracked).
- Moving a prerequisite from `OPEN` to `RESOLVED`, and every change to the catalogue or the floor, is a human-reviewed diff of this directory.

Registering the required checks on `main` is a repository-settings action for the engineering authority; this change does not perform it.

## Vulnerability scans: what green means

`dependency-scan` (pnpm audit) and `image-scan` (Trivy) execute the required scan and report every finding in the log and job summary. They fail only when the scan
cannot be performed honestly. **A finding alone does not fail either job**, because no findings-based failure policy is decided (prerequisite
`decision-vulnerability-findings-policy`, OPEN, owner: engineering authority; visible in every run as the pending gate `vulnerability-findings-policy`). A green scan job
therefore means "the required scan executed successfully and its findings were reported", not "no unacceptable vulnerability exists". The meta-gate rejects any
severity, fixability, exit-code, ignore or offline option on a scan command and any ignore or allow-list file (`.trivyignore`, `trivy.yaml`).

`idempotency-key-convention` stays pending on `fb20-no-assigned-task-owner`: the approved Foundation sequence assigns that row to no task, and none is assumed.

## Pinned definitions (guards against a weakened but present gate)

`lib/catalogue.mjs` pins, in code that is independent of the files they describe: the implemented floor (required and scheduled gates, exact states), the
pending floor (every pending gate with its exact prerequisite set), the prerequisite registry (exact ids), the exact `package.json` scripts the gates run,
the exact final `run` command of every Task 2 job, the exact `.prettierignore` scope, the exact Trivy lines (installer and invocations) and the fixed
`pnpm audit --json` arguments. A weakened script, a changed command, a new ignore pattern, a deleted or re-pointed pending gate, an invented prerequisite,
a `TRIVY_*` variable, `pnpm.auditConfig` or a `.npmrc` fails the meta-gate.

These pins guard against accident and against a change that does not also edit them. They are NOT proof against a pull request that changes a guard and
its tests together: CI cannot prove its own integrity. The gate-defining root files (`package.json`, `.prettierignore`, `.prettierrc.json`, `eslint.config.mjs`, `vitest.config.ts`,
`tsconfig.json`, `.dependency-cruiser.cjs`, `Dockerfile`, `.dockerignore`, `pnpm-lock.yaml`, `.node-version`) are self-modifying paths in the Task 1 path check, so
the SELF_MODIFYING notice is printed for them and the engineering authority reads the actual diff (STACK-ADR-002 6.3).

## Alternate configuration routes

The approved configuration is the one root file per tool. The meta-gate scans the real file tree (one policy, `FORBIDDEN_FILES` / `FORBIDDEN_BASENAMES` /
`SHADOW_CONFIGS` in `lib/supply-chain.mjs`; `check-gates.mjs` holds no list of its own) and fails on:

- any `eslint.config.*` except the root `eslint.config.mjs`, any `.prettierrc*` except the root `.prettierrc.json`, any `prettier.config.*`, any
  `vitest.config.*` except the root `vitest.config.ts`, any `vite.config.*`, at any depth, and a `prettier` or `eslintConfig` key in `package.json`;
- `trivy.yaml`, `.trivy.yaml`, `.trivyignore`, `.trivyignore.yaml` at any depth, and `.pnpmfile.*` at any depth;
- in a workflow: `defaults` (workflow or job level), step `shell` and step `working-directory`, `npm_config_*` / `pnpm_config_*` names (environment keys at
  workflow, job and step scope, and anywhere in a string, run text included), and `TRIVY_*` in any string value;
- a `pnpm install` (workflow, Dockerfile or a script in this folder) without `--frozen-lockfile`, `--ignore-scripts` and `--ignore-pnpmfile`;
- a `pre` / `post` hook around a pinned gate script.

None of this adds lint, format or scan policy; it only closes other ways to configure the same tools. The tests run the real Prettier and ESLint to show that a
shadowing file really would take effect, so the rejection is not theoretical.
