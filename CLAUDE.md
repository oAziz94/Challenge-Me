# CLAUDE.md — Challenge Me Commercial V1

## 1. Project purpose

Challenge Me is a multi-tenant learning platform for tutoring centers, test-prep companies and training providers: teachers publish questions, learners receive challenges by private link (WhatsApp / email / web), answers are marked by rules, AI or code execution with teacher oversight, and results become a rebuildable picture of each learner's progress. Commercial V1 is specified by a frozen behavioral, domain and architecture contract. **The contract is frozen (2026-09-30). Implementation has not started.** This file governs how AI agents and humans work in this repository.

## 2. Source-of-truth hierarchy

Precedence is defined in [docs/specifications/authoritative/00_README_Index.md](docs/specifications/authoritative/00_README_Index.md). In order:

1. **Authoritative contract (frozen):** `01` Domain Model & Implementation Contract rev. 1.8, `02` ADR set V1.4, `03` Spec Kit Part 1 (reconciled), `04` Learning Trajectory Model rev. 14 — read together with `05`–`15` Spec Kit Part 2, Waves 1–11.
2. Where a closed document differs from these, the reconciled document and the later LOCKED decision govern.
3. Known superseded passages are listed in `16` Reconciliation Report rev. 3, §6.4 (errata).
4. `17` Implementation Architecture V1.3 and `18` Remediation Report V1.3 are baseline inputs; `01` and `02` govern where they differ.
5. Inside `02`, each ADR's "V1.4 reconciliation amendments" override that ADR's base text.
6. This file, `AGENTS.md` and `docs/engineering/AI_WORKFLOW.md` govern *process*; they never override the contract.

Rule labels in the contract decide what an agent may do:

| Label | Agent behavior |
|---|---|
| LOCKED DECISION / DECIDED / EXISTING ARCHITECTURAL RULE / APPROVED / RECONCILED | Implement exactly as written; cite the origin tag (e.g. `[W4-C6]`, `[X3]`, `[FD-1]`) |
| PROPOSED DEFAULT / implementation default | Implement as **configuration** with the proposed value; never a hard-coded constant; never treat as approved |
| OPEN / sign-off gate / LEGAL GATE (LG-1…LG-11) | Build a configuration surface **only** when the contract explicitly specifies both the surface and the designed-in default value/behavior; otherwise STOP and record the gate as unresolved. Never resolve, never claim approval, never infer a value (see §3) |
| IMPLEMENTATION DETAIL | Engineering choice; record it in the implementation brief |

## 3. Mandatory engineering rules

Non-negotiable; each traces to the contract. Full list: `AGENTS.md` §3.

- No AI agent makes a product decision, resolves a gate, or changes approved architecture silently.
- **Open gates.** An agent creates or implements a configuration surface or value for an OPEN / sign-off / LEGAL gate only when the contract explicitly specifies *both* the configuration surface *and* the designed-in default value or behavior. If either is missing, STOP and record the gate as unresolved in the brief. An open gate never licenses an agent to infer a legal decision, product decision, threshold, default, schema, workflow, permission, retention value or provider choice.
- No module implementation begins without an **approved implementation brief** (§4). A brief summarizes the contract; it never overrides or replaces it. Discovery notes, cached summaries, previous agent reports and briefs are not authoritative — only `docs/specifications/authoritative/` is.
- Implementers work only inside the approved module boundary: one PostgreSQL schema per module; no cross-module table access; modules communicate only via public service calls (mechanism A) or same-transaction job events (mechanism B) (ADR-013, DM §19). "Cross-module table access" includes indirect access — raw SQL, shared repository helpers, generic data-access packages, shared ORM repositories, database utility libraries, query builders, views, helper services, cross-schema joins and cross-module FKs. No abstraction may disguise it (`AGENTS.md` §4).
- PostgreSQL is authoritative; the PostgreSQL-native queue is the outbox; no Redis for correctness (ADR-001).
- No database transaction spans provider/network I/O (Cross-ADR Rule 8).
- No provider SDK outside a provider adapter (ADR-013, Arch §29).
- Tenant context comes only from `ActorContext` / `TenantTransaction` (transaction-local `set_config`); never from request bodies, URL ids or webhook payloads; session-level `SET` is forbidden (ADR-012, DM §6.2).
- Every tenant-owned table has forced, fail-closed RLS or is in the table-category registry; cross-tenant ids return `NOT_FOUND` (ADR-012, DM §6.3).
- Learner work is persisted before any evaluation; no budget, storage, consent or provider condition ever rejects, loses or alters learner work or a result (DM §25.1, W11-C7).
- Evaluation authority: immutable results after PENDING; one head per evaluable submission; compare-and-set on revision; machine writers never move a `human_locked` head; deterministic correctness is never produced or changed by AI (ADR-011, X2, X3, X8).
- Learning is a pure, rebuildable function of eligible observations, mappings, applicable policy version and `as_of`; live projection equals rebuild (ADR-014, LTM T1/T10).
- No learner content, names, contact values, tokens, prompts, AI payloads or answer keys in telemetry, logs, audit events or job payloads (ADR-006, DM §30).
- **AI requests.** Learner identity, names, IDs, contact values, tokens, answer keys, private teacher material and any learner data not needed for the capability must never be included in an AI request. Learner *content* (answers, essays, code and related material) MAY be sent to an AI provider only through an approved AI capability and route, with all applicable authoritative controls satisfied: AI_PROCESSING consent, data-region policy, provider eligibility, payload minimization, prompt/input validation, injection defenses, answer-leak controls, budget/entitlement controls, required auditability and required purge/retention controls (ADR-016, ADR-017, ADR-021, W9, W11). Nothing in these governance files prohibits AI evaluation, AI feedback, injection detection or any other approved V1 AI capability; the prohibition is on learner content reaching telemetry, logs, job payloads, audit records or unauthorized provider calls.
- Student DTOs are built only from `StudentQuestionView` / `StudentRevealView`; canary tests prove protected material never leaks (ADR-020, DM §10.5).
- **Secret handling (ADR-024; DM §14.1, §25.10; class S4).** Secrets, credentials, provider API keys, signing keys, encryption material and equivalent authentication material are never committed to source control, placed in source or configuration files, logs, telemetry, prompts, ordinary job payloads, test fixtures, migrations or scripts, or stored in application-domain tables (tables hold only a reference such as `credential_secret_ref`). Secrets are supplied through the managed secret store / KMS envelope architecture the contract specifies (no vendor is chosen until a stack ADR says so) and are accessed only at the runtime / provider-adapter boundary at the moment of use; rotation and audit follow ADR-024. Agents never print, copy or reproduce a secret value in reports, reviews, commits, documentation or chat. Local development uses the repository-approved secret mechanism once the stack ADR defines it; agents do not invent one. A secret found in the repository is a security incident: do not reproduce or commit it; report location and type only; follow the incident/rotation procedure once established (`AGENTS.md` §9).
- Every significant implementation ships with the behavioral tests from DM §29 and the owning wave's §15 acceptance criteria, plus the security tests from Arch §32.
- Changes to the contract go through change control: a change record naming the affected origin tags, an artifact revision bump, and a regenerated reconciliation matrix (16 §6.7). Closed wave documents are never edited.
- **Human acceptance is a hard gate.** No AI agent may merge, deploy, release, mark a module or task accepted, represent an implementation as approved, or close an engineering gate before the required human approval/state transition has occurred and acceptance evidence is recorded. Passing tests, a Codex review and an Opus/Fable review are inputs to acceptance, not acceptance. The human product/engineering authority is the final acceptance authority.
- **Independent review** is determined by author identity and agent instance, not by model name or job title: author and reviewer are different agent instances; the reviewer is not the author's continuation or child context; a different model family where practical (Codex for Claude-authored work); switching Fable → Opus does not make prior reasoning independent (`AGENTS.md` §6).

## 4. Architecture approval gate

An agent may write code for a module **only** when an implementation brief for that module exists under `docs/architecture/modules/` with state `APPROVED` (human sign-off recorded in the brief). The brief must contain, with section citations:

1. The DM sections for the module (aggregates, tables, state machines, commands/queries/events), the owning wave(s), the DM §19 contracts offered and consumed, and the DM §21 jobs owned.
2. Phase fit per Arch §35 as modified by DM §33, with prerequisites listed and their CI gates green.
3. Every rule to be implemented, with its label; PROPOSED DEFAULTs listed as configuration keys with owner; OPEN/LEGAL gates listed either as "surface + designed-in default explicitly specified at <section>" or as "unresolved — no surface built"; no claim of approval.
4. Per table: category, classification code (S0–S4), retention class, purge handler, RLS policy, registry entry, immutability rule, indexes (DM §22–§23).
5. Boundary declaration: mechanism A vs B per contract; adapters named for any provider; no cross-schema access.
6. Test plan: the DM §29 rows, wave §15 criteria and property tests that apply.
7. Conflict check: "no conflict found" or an attached change record (§5).
8. Statement that no state, enum value, event, permission, period or threshold absent from the contract is introduced.
9. Independent review by a different agent instance of a different model family (Codex) that validated the source-trace matrix against the authoritative documents, and, for ADR-011 and ADR-012 work, a human engineer (Remediation §1).
10. A **source-trace matrix** (template `AI_WORKFLOW.md` §9) mapping each of the following to its authoritative section/tag: module ownership; owned aggregates/tables; public contracts; consumed contracts; jobs; events; applicable wave acceptance criteria; applicable ADRs and V1.4 amendments; 16 §6.4 errata; open/sign-off/legal gates; required DM §29 test-catalogue rows; security/privacy requirements.

Phase 1 (Foundation) and Phase 1b (Walking Skeleton) have their own approval checklists (`AI_WORKFLOW.md` §11.1–§11.2); no Phase 2 or later module work begins until the applicable approval state is recorded.

Template and states: `docs/engineering/AI_WORKFLOW.md` §9–§10.

## 5. Implementation conflict rule

If implementation conflicts with the frozen contract (library limitation, database capability, provider API, performance, or an internal contradiction):

1. **STOP the affected work.** Do not work around the rule, relax a test, or pick a default that sidesteps a LOCKED/EXISTING rule.
2. Classify the conflicting rule by label (change control vs owner default vs implementation detail vs gate).
3. Write a change record (`docs/decisions/CR-<n>-<slug>.md`, template in `AI_WORKFLOW.md` §8) with: rule text and origin tags; artifact and section; the constraint with evidence; the smallest resolution; touched tags, tables, events, state machines and tests; whether it is a model change; whether it reopens a closed decision.
4. Route it: architecture → engineering lead (+ product owner if behavior changes); product behavior → product owner; legal value → counsel; vendor → provider-selection ADR. Agents draft; humans decide.
5. Continue only on work independent of the conflict.

## 6. Model and agent behavior rules

| Model | Use for | Never |
|---|---|---|
| **Fable** | Hardest architecture and cross-module reasoning, complex conflict analysis, difficult debugging, drafting change records and implementation briefs | Routine implementation; approving its own brief |
| **Opus** | Architecture, security, concurrency and difficult code review | Reviewing work authored by its own instance or a parent/child context of it; counting as "independent" of Fable's reasoning it continued |
| **Sonnet** | Normal implementation, normal tests, approved migrations, adapters, routine engineering | Starting a module without an APPROVED brief |
| **Haiku** | Mechanical checks, summaries, checklist and documentation chores, simple triage | Design or review authority |
| **Codex** | Independent repository-aware review, architecture challenge, adversarial and tenant-boundary review, verification, test-gap identification; preferred independent cross-model reviewer for Claude-authored work | Architectural authority; approving anything; its review counting as human approval |
| **Human product owner / engineering authority** | Final approver of briefs, change records, gate closures and acceptance; the only party that merges, releases or marks accepted | — |

Every agent: cite the artifact section and origin tag for any rule you implement or question; say "this is a gate / open item" instead of choosing; never edit `docs/specifications/authoritative/**`; never invent a module, event, table, state or threshold; keep context small (read the sections the brief cites, not whole artifacts). An agent instance never reviews its own significant work, and no model review substitutes for human acceptance. Full contract: `AGENTS.md`.

## 7. Commands and workflow references

No technology stack, test runner or CI pipeline has been chosen yet; a provider-selection / stack ADR (`docs/architecture/adr/`) must exist before any build or test command is documented here. Until then:

- Specification lookup: grep the authoritative folder by origin tag (e.g. `W6-C5`, `X11`) or DM section number.
- Workflow: `docs/engineering/AI_WORKFLOW.md`.
- Briefs: `docs/architecture/modules/<module>.md`. Change records: `docs/decisions/CR-*.md`. Stack and vendor decisions: `docs/architecture/adr/`.
- Git: no commits exist yet. Commit only when asked; every commit message that touches a contract rule names its origin tag(s).

## 8. Pointers

- Index and precedence: `docs/specifications/authoritative/00_README_Index.md`
- Domain model, contracts (§19), events (§20), jobs (§21), tables (§22), transactions (§25), tests (§29), implementation order (§33), handoff checklist (§34): `01_Domain_Model_and_Implementation_Contract_rev1.8.md`
- Architecture decisions and Cross-ADR Rules: `02_Architecture_Decision_Records_V1.4.md`
- Core journey and gaps: `03_Spec_Kit_Part1_Core_Journey_reconciled.md`
- Learning model: `04_Learning_Trajectory_Model_rev14.md`
- Capability waves: `05`–`15`
- Reconciliation matrix, errata, gate register, freeze checklist: `16_Reconciliation_Report_rev3.md`
- Phase plan: `17_Implementation_Architecture_V1.3.md` §35
- Sign-off gates and proofs: `18_Remediation_Report_V1.3.md` §5–§6
- Agent contract: `AGENTS.md`. Detailed workflow: `docs/engineering/AI_WORKFLOW.md`.
