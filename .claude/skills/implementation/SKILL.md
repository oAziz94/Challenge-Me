---
name: implementation
description: Implements one task of an APPROVED implementation brief inside a single Challenge Me module, with its catalogue tests. Checks the literal APPROVED state, approver, scope and ADRs before any edit; stops on scope mismatch, ambiguity, cross-module shortcuts, secret exposure or permission denial. Do not redesign the architecture during implementation.
---

# Implementation playbook

Operational playbook for the `implementer` agent (`AI_WORKFLOW.md` §4). It is **not** a source of authority. Precedence: authoritative specifications → approved ADRs and V1.4 amendments → `CLAUDE.md` / `AGENTS.md` / `AI_WORKFLOW.md` → explicit human architectural decisions → the approved brief → this skill → agent judgment → existing implementation convenience. If the brief and the contract differ, the contract governs and the brief is wrong: stop.

> **Do not redesign the architecture during implementation.**

## Purpose

Turn one approved task into code and tests that satisfy the cited contract rules exactly, inside one module schema, without adding, removing or reinterpreting behavior.

## Preconditions (all must hold before the first edit)

- [ ] `docs/architecture/modules/<module>.md` exists.
- [ ] It contains the literal line `State: APPROVED`.
- [ ] `Approved by/date:` names a human approver and a date.
- [ ] The task you were given appears in the brief's item 11 (tasks) — the approved scope.
- [ ] Every stack/provider ADR the brief relies on exists in `docs/architecture/adr/` with `ACCEPTED` (required for migrations, adapters, test tooling).
- [ ] No unresolved blocking decision affects this task (brief item 3 `UNRESOLVED` rows and item 8 change records do not touch it).
- [ ] The permission boundary permits the files you need (`.claude/settings.json` denies `src/**`, `tests/**`, `prisma/**`, `migrations/**` until the engineering authority narrows it for an approved brief). A denied write is a stop signal, never something to route around.

Any unchecked box → `Blocked by:` and stop.

## Workflow

1. **Read the approved brief** and only the sections it cites. Load nothing else unless a step below needs it.
2. **Verify source-trace references.** For every matrix row and rule your task touches, open the cited section and confirm the brief's paraphrase matches the text and label. Mismatch → stop (contract governs).
3. **Inspect existing code** in the module and the public contracts it consumes; note conventions, existing tests, configuration-key patterns.
4. **Plan minimal compliant changes.** List files, tags implemented per file, configuration keys for PROPOSED DEFAULTs, tests from brief item 7. No new state, enum, event, table, column, permission, endpoint, period or threshold the brief does not list.
5. **Implement within one module / one task.** Code lives in the module's schema and package; rule comments carry the origin tag and a one-line rule; defaults are configuration, never constants.
6. **Respect module ownership.** Never touch another module's tables, entities or migrations. Cross-module references are plain ids validated through the owner's contract; no cross-schema FK (Remediation R4).
7. **Cross-module interaction only through** the DM §19 public contract (mechanism A: same transaction, same command, no network I/O) or a DM §20–§21 event/job enqueued in the producer's transaction (mechanism B, PostgreSQL-native queue as outbox). No in-memory post-commit dispatch. **Indirect cross-module access is prohibited** exactly as direct access is: no raw SQL, shared repository, generic data-access helper, query builder, view, join or FK into another schema (`AGENTS.md` §4).
8. **Preserve tenant isolation.** Tenant context only from `ActorContext` / `TenantTransaction` (transaction-local `set_config`); no session `SET`; `tenant_id` never from body, URL id or webhook payload; every tenant-owned table gets `tenant_id`, forced fail-closed RLS, registry entry, S-class, retention class and purge handler; cross-tenant ids → `NOT_FOUND` (ADR-012, DM §6).
9. **Preserve idempotency / CAS / concurrency.** Processed-event convention; jobs safe to run more than once (J-6); no transaction across provider/network I/O (Cross-ADR Rule 8; worker: claim → admission → provider call outside tx → result tx); head compare-and-set, one head per evaluable submission, `human_locked` never moved by a machine writer, results immutable after PENDING (ADR-011, X3, X8); learner work persisted before any evaluation (DM §25.1).
10. **Add required tests** from brief item 7 (DM §29 rows, wave §15 criteria, property tests, Arch §32 gates) before or alongside the code; never weaken, skip or delete an existing test.
11. **Run verification** — the brief's full catalogue; paste runner output verbatim. Failing test = blocker.
12. **Report implementation state** with the implementation log: files touched, tags implemented, config keys, migrations (only if named in the brief and tooling ADR exists), deviations (expected: none), open questions.

## Stop conditions

Stop, leave the code in a consistent state, and report (approved decision · observed conflict · impact · alternatives · recommendation · files changed) on any of:

- missing or non-`APPROVED` brief, or approver not recorded
- scope mismatch — task not in item 11, or work needs something the brief does not list
- architectural ambiguity affecting behavior or structure
- missing required stack/provider ADR
- a cross-module shortcut appears necessary (any path into another schema)
- a security boundary would be violated (tenant context, RLS, token handling, DTO allow-list)
- secret exposure — a secret would land in source, config, fixture, migration, script, log, prompt, payload or table, or one is discovered (`AGENTS.md` §9: report location and type, never the value)
- permission boundary denial by `.claude/settings.json`
- requirement conflict — contract vs library/database/provider/existing code, or brief vs contract → change record via the Architect (`AI_WORKFLOW.md` §8)

Design questions go back through the brief, not into the code.

## Required outputs

- Code and tests inside the one module; implementation log.
- Report block: `Status (IN_PROGRESS | TESTED | STOPPED) / Scope (brief state verified APPROVED by <who, date>) / Authoritative sources / Findings / Changes made / Tests (verbatim) / Open decisions / Blocked by / Next action (Opus review by a separate instance → Codex → human acceptance)`.
- The last state you set is `TESTED`; `VERIFIED` comes from the verification skill, `ACCEPTED` only from a human.

## Cross-skill rules

No secret value in any output; `AGENTS.md` §9 applies (secrets only at the adapter/runtime boundary via the managed secret store / KMS envelope; domain tables hold a reference only). No learner-sensitive content in logs, comments, fixtures or reports. Facts carry a tag; everything else is labeled proposal / assumption / unresolved question. Never invent a legal, product, permission, retention, provider, schema, threshold or workflow decision. Human acceptance remains the final gate before merge, deploy or release.

## Authority references

DM `01` §6, §19–§23, §25, §29; ADR-001, -006, -011, -012, -013, -020, -023, -024 and Cross-ADR Rules (`02`); Arch `17` §29, §32; Remediation `18` R4; `CLAUDE.md` §3–§5; `AGENTS.md` §3–§4, §7, §9; `AI_WORKFLOW.md` §4–§5, §8, §10.
