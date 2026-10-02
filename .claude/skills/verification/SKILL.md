---
name: verification
description: Verification playbook for the tester agent and for the verification step after fixes — maps each acceptance criterion of an APPROVED brief to evidence, executes the catalogue tests, checks failure paths, tenant isolation, idempotency, sensitive logging, queue behavior and architectural invariants, and records evidence. States NOT TESTED / TESTED / FAILED / BLOCKED / VERIFIED; none of them is ACCEPTED.
---

# Verification playbook

Operational playbook for the `tester` agent (`AI_WORKFLOW.md` §5) and for the §6.4 verification of fixes. It is **not** a source of authority. Precedence: authoritative specifications → approved ADRs and V1.4 amendments → `CLAUDE.md` / `AGENTS.md` / `AI_WORKFLOW.md` → explicit human architectural decisions → the approved brief → this skill → agent judgment → existing implementation convenience. A test asserts the contract's behavior, cited by tag; if the code and the contract disagree, the code (or the brief) is wrong, not the test.

## Purpose

Demonstrate, with recorded evidence, that an implementation satisfies the acceptance criteria the brief cites — and say plainly when it does not.

## Inputs / preconditions

- Brief with `State: APPROVED`, approver recorded, and test plan (item 7) listing DM §29 rows, wave §15 criteria, LTM §20 (Learning), property tests and Arch §32 gates.
- A stack ADR in `docs/architecture/adr/` that defines the test tooling and runner.
- The implementation log and the files under test.
- Permission to write under `tests/**` (per `.claude/settings.json`); a denial is a stop signal.

## Workflow

1. **Read the approved brief** and only the sections it cites; confirm `State: APPROVED`.
2. **Read the acceptance criteria** at their source: the DM §29 rows, the wave §15 criteria, LTM §20 theorems, Arch §32 gates — not the brief's paraphrase.
3. **Map each criterion to verification.** One row per criterion: `criterion id/tag | test(s) | type | evidence location`. A criterion with no test is a gap, reported as such.
4. **Identify required tests** by type: unit; integration (real PostgreSQL, real RLS, `cm_app` role); provider-contract (adapter against a fake/recorded provider — never a live credential); end-to-end (walking-skeleton path where applicable); security (Arch §32 for the phase); property (head CAS, projection equality); architecture (no cross-schema access direct or indirect, no SDK outside adapters, no transaction across I/O, no session `SET`, Assessment never imports evaluator views).
5. **Execute tests.** Full catalogue named in the brief; output recorded verbatim.
6. **Verify failure paths.** Each failure class; dead-letter; provider/budget/storage/consent failure never rejects, loses or alters learner work or a result (DM §25.1, W11-C7).
7. **Verify authorization / tenant isolation.** Cross-tenant id → `NOT_FOUND`; forced RLS fail-closed on every tenant-owned table or registry entry; pooled-connection leak; job tenant mismatch; role and scope checks; capability-token rules (replay, expiry, pre-fetch, forwarding) where the module issues or consumes tokens.
8. **Verify idempotency / concurrency where applicable.** Duplicate and out-of-order events/jobs; J-6 re-execution; never two current evaluations; machine writer never moves a `human_locked` head; compare-and-set on revision.
9. **Verify logging / sensitive-data constraints.** Sensitive-logging canary; DTO canary (no key, alias, rubric, hidden test, reference solution, unreleased explanation; no reveal before `closes_at`); no learner content, names, contact values, tokens, prompts, AI payloads or keys in logs, telemetry, audit events or job payloads; AI-request payload minimization where the module calls AI.
10. **Verify queue / retry behavior where applicable.** Enqueue in producer transaction; claim/lease/admission; retry per failure class; priority class; no post-commit in-memory dispatch.
11. **Verify relevant architectural invariants.** Projection rebuildability (live projection equals rebuild with out-of-order and duplicate observations, LTM T1/T10); deterministic evaluation (same input → same result; AI never changes a DETERMINISTIC component, X2); async evaluation state transitions (PENDING onward; immutability after PENDING); learner work persisted before evaluation.
12. **Record evidence.** For each criterion: test name, run id/command, verbatim result, date, runner instance. Evidence lives in the task log / brief item 12 reference, never only in chat.

## States (exactly one at the end)

- `NOT TESTED` — catalogue not executed (missing tooling ADR, missing brief, or not yet run).
- `TESTED` — the test suite named in the brief executed successfully; evidence recorded.
- `FAILED` — at least one required test failed; verbatim output attached; a failing test is a blocker, not a note.
- `BLOCKED` — cannot proceed: ambiguity, missing ADR, permission denial, conflict.
- `VERIFIED` — the recorded evidence demonstrates every applicable acceptance criterion in the mapping (step 3), including failure paths, isolation, idempotency, logging and invariants where applicable, with no gap.

`TESTED` means the suite ran green. `VERIFIED` means the evidence covers the criteria. **Neither means `ACCEPTED`.** Human acceptance (`AI_WORKFLOW.md` §6.5) is a separate, later step by the engineering authority; agents never mark `ACCEPTED`, merge, deploy, release or close a gate.

## Stop conditions

Stop and report (approved decision · observed conflict · impact · alternatives · recommendation · code changed) when: a test can only pass by weakening, skipping or deleting an assertion; a test exposes an architectural ambiguity or a brief-vs-contract mismatch rather than a bug; the expected value depends on an unresolved gate (test it as "surface absent / unresolved", never with an assumed value); the test tooling ADR is missing; a fixture would need a real secret or real learner data; the permission boundary denies a write.

## Prohibited

Weakening, skipping, marking flaky or deleting a required test; fabricating or summarizing a result instead of pasting it; encoding an assumption as an expectation; using live credentials or real learner content in fixtures (synthetic data only; secret-store doubles return placeholders); reaching into another module's tables, directly or through helpers, to arrange or assert state; marking your own tests as reviewed.

## Required outputs

- Criterion-to-evidence mapping; test files added (under the module's tests only); verbatim runner output.
- Report block: `Status (NOT TESTED | TESTED | FAILED | BLOCKED | VERIFIED) / Scope / Authoritative sources (rows and tags) / Findings / Changes made (tests only) / Tests (counts by type, catalogue coverage, gaps) / Open decisions / Blocked by / Next action (Reviewer by a separate instance → Codex → human acceptance)`.

## Cross-skill rules

No secret value in any output or fixture; `AGENTS.md` §9 applies. Tenant isolation and module ownership hold inside tests too; no indirect cross-module access for setup. Facts cite a tag; everything else is labeled proposal / assumption / unresolved question and raised, never encoded as an expectation. Never invent a legal, product, permission, retention, provider, schema, threshold or workflow value to make a test concrete. Human acceptance remains the final gate.

## Authority references

DM `01` §6, §10.5, §21, §25, §29–§30; `04` LTM §20, T1/T10; waves `05`–`15` §15; ADR-001, -006, -011, -012, -014, -020 (`02`); Arch `17` §32; `CLAUDE.md` §3; `AGENTS.md` §4, §7, §9; `AI_WORKFLOW.md` §5, §6.4–§6.5, §10–§11.
