# AGENTS.md — Repository-wide agent contract

Applies to every AI agent (Claude Fable / Opus / Sonnet / Haiku, Codex, any other model) and to any human acting through them. `CLAUDE.md` is the short form; `docs/engineering/AI_WORKFLOW.md` is the detailed process. The frozen specification in `docs/specifications/authoritative/` governs all three.

## 1. The contract

1. The authoritative Challenge Me contract is documents `00`–`18` under `docs/specifications/authoritative/`, read with the precedence in `00_README_Index.md`. It is frozen. Agents implement it; they do not interpret it loosely, extend it, or reopen it. Discovery notes, cached summaries, previous agent reports and implementation briefs are **not** authoritative; a brief may summarize the contract but never overrides or replaces it, and where a brief and the contract differ the contract governs and the brief is wrong.
2. Agents **draft**; humans **decide**. The product owner / engineering authority is the final approver of every brief, change record, gate closure and acceptance. **Human acceptance is a hard gate:** no agent merges, deploys, releases, marks a module or task accepted, represents an implementation as approved, or closes an engineering gate before the required human state transition has occurred and acceptance evidence has been recorded. Passing tests, a Codex review and an Opus/Fable review are not human acceptance.
3. Every rule an agent implements, tests or questions is cited by artifact, section and origin tag.
4. Work that the contract does not authorize does not happen. Absence of a rule is not permission.

## 2. Responsibilities

| Agent | Responsibilities | Produces |
|---|---|---|
| **Fable** | Architecture discovery for a module; cross-module reasoning; conflict analysis; difficult debugging; drafting implementation briefs and change records | Brief (DRAFT), change record (DRAFT), analysis notes |
| **Opus** | Architecture review, security review, concurrency review (CAS, RLS, queue, consent races), difficult code review | Review report with findings ranked by severity |
| **Sonnet** | Implementation inside an APPROVED brief; tests from the catalogue; approved migrations; provider adapters; routine engineering | Code, tests, migration files, implementation log |
| **Haiku** | Mechanical checks (lint, origin-tag presence, checklist completion), summaries, documentation chores, straightforward triage | Checklists, summaries, triage notes |
| **Codex** | Independent, repository-aware review from a different model family: architecture challenge, adversarial code review, security and tenant-boundary review, verification that tests prove the acceptance criteria, test-gap identification | Independent review report |
| **Human** | Approve or reject briefs and change records; close gates; accept modules; own ADRs | Signatures recorded in the artifact |

Codex is **not** an architectural authority and approves nothing. Claude is **not** the sole authority on anything. Fable is reserved for problems that need it; it does not do routine work.

## 3. Prohibited behaviors

An agent must never:

1. Make a product decision, choose between options a gate leaves open, or treat a PROPOSED DEFAULT, OPEN item or LEGAL GATE as approved. For an open gate, build a configuration surface or value only when the contract explicitly specifies both the surface and the designed-in default value/behavior; otherwise STOP and record the gate as unresolved. Never infer a legal decision, product decision, threshold, default, schema, workflow, permission, retention value or provider choice because a gate is open.
2. Change, reinterpret or work around an approved architecture rule without a change record.
3. Edit any file under `docs/specifications/authoritative/`.
4. Begin module code without an `APPROVED` implementation brief for that module.
5. Introduce a module, schema, table, column, event, job, command, state, enum value, permission, retention period or threshold that the contract does not define.
6. Access another module's tables directly or indirectly (§4), share ORM entities across modules, dispatch events in memory after commit, or import a provider SDK outside `adapters/`.
7. Hold a database transaction across a provider or network call, or use session-level `SET` for tenant context.
8. Take `tenant_id` from a request body, URL parameter the actor cannot hold, or webhook payload.
9. Create a tenant-owned table without `tenant_id`, forced fail-closed RLS, a registry entry, classification code, retention class and purge handler.
10. Hard-code a PROPOSED DEFAULT, gate value, retention period, threshold or SLA.
11. Reject, lose, hide or alter learner work or a result for budget, storage, consent, provider or AI reasons.
12. Change a result after an evaluation leaves PENDING, move a `human_locked` head with a machine result, bypass compare-and-set, or let AI produce or change a DETERMINISTIC component.
13. Let trajectory or learning signals trigger reinforcement or notifications; read the item grade in Learning; introduce a numeric trajectory score.
14. Put learner content, names, contact values, tokens, OTP codes, prompts, AI payloads or answer keys into telemetry, logs, audit events or job payloads.
14a. Put learner identity, names, IDs, contact values, tokens, answer keys, private teacher material or unnecessary learner data into an AI request; or send learner content (answers, essays, code, related material) to an AI provider other than through an approved AI capability and approved capability route with all applicable authoritative controls satisfied — AI_PROCESSING consent, data-region policy, provider eligibility, payload minimization, prompt/input validation, injection defenses, answer-leak controls, budget/entitlement controls, required auditability, required purge/retention controls (ADR-016, ADR-017, ADR-021, W9, W11). Learner content legitimately processed by an approved capability under those controls is permitted; this rule does not prohibit AI evaluation, AI feedback, injection detection or any other approved V1 AI capability.
15. Build a student-facing DTO from anything other than `StudentQuestionView` / `StudentRevealView`, or expose keys, aliases, rubrics, hidden tests, reference solutions or unreleased explanations.
16. Store a capability token in a message body, log or post-exchange URL; persist card or bank data.
16a. Commit, embed, log, prompt, fixture, script or table-store any secret, credential, provider API key, signing key or encryption material; or print, copy or reproduce a secret value anywhere an agent writes (§9).
17. Mark its own significant work as reviewed, review work authored by its own instance or a parent/child context of it, present a pending review as passed, or present a model review as human approval.
17a. Merge, deploy, release, mark a task or module accepted, or close an engineering gate; these are human actions recorded with evidence (§1.2).
18. Resolve a conflict with the contract by picking a side; the only valid response is STOP and a change record.
19. Create provider-selection decisions, stack decisions or migrations without an approved ADR / brief.
20. Fabricate a test result, skip a required catalogue test, or weaken a canary.

## 4. Module-boundary rules

- 14 modules, one PostgreSQL schema each: `identity`, `roster`, `tenancy`, `privacy`, `content`, `challenge`, `assessment`, `evaluation`, `learning`, `review`, `comms`, `ai`, `codeexec`, `reporting` (DM §4). Ownership per DM §4 and ADR-013.
- Dependency direction: Identity, Tenancy → Roster → Privacy → Content → Challenge → Assessment → Evaluation → Learning → Reporting; Review, Communication, AI Platform, Code Execution are leaf services. Events may flow backwards; compile-time dependencies may not.
- Communication only by mechanism A (synchronous public service call, same database, same command, no network I/O) or mechanism B (job enqueued in the producer's transaction). The permitted contracts are DM §19; the events are DM §20.
- Review executes no decisions in other modules; owners call `Review.CompleteTask` in their own transaction (X4). Only Communication owns Delivery (X13). Only Learning decides reinforcement need and enforces its cap (D13, W4-C5). Only Assessment enforces practice limits (W7-C3). Only Evaluation decides results. Content never scores or computes learning.
- Cross-module references are plain ids validated through the owning module's contract; no cross-schema foreign keys (Remediation R4).
- **Indirect access is cross-module access.** The prohibition on cross-module table access covers not only direct ORM imports but any path to another module's schema: raw SQL, shared repository helpers, generic data-access packages, shared ORM repositories, database utility libraries, query builders, views created to bypass ownership, helper services whose actual purpose is querying another module's schema, cross-schema joins and cross-module FKs. A module obtains another module's data only through the explicitly authorized public service/contract (DM §19, mechanism A) or the durable event/job mechanisms (DM §20–§21, mechanism B). No abstraction may be used to disguise forbidden access; reviewers judge by what a call actually reads, not by the layer it is called through.
- A task touches one module. A change that needs two modules is two tasks under one brief, each inside its schema, joined only by DM §19 contracts.

## 5. Architecture approval requirements

- Brief location: `docs/architecture/modules/<module>.md`. States: `DRAFT → IN_REVIEW → APPROVED | RETURNED`. Only a human sets `APPROVED`.
- Required content: `CLAUDE.md` §4 items 1–10 (contract scope, phase fit, rule labels, table compliance, boundary declaration, test plan, conflict check, no-new-behavior statement, independent review, source-trace matrix).
- **Source-trace matrix.** Every brief carries a compact matrix tracing, as applicable, (1) module ownership, (2) owned aggregates/tables, (3) public contracts, (4) consumed contracts, (5) jobs, (6) events, (7) applicable wave acceptance criteria, (8) applicable ADRs and their V1.4 amendments, (9) 16 §6.4 errata, (10) applicable open/sign-off/legal gates, (11) required DM §29 test-catalogue rows, (12) relevant security/privacy requirements — each to its authoritative document, section and origin tag. The independent reviewer validates every row against the authoritative source documents, not against discovery notes or earlier reports. A brief with an unvalidated or incomplete matrix is `RETURNED`.
- Phase order: Arch V1.3 §35 as modified by DM §33. Phase 1 foundation and the Phase 1b walking skeleton precede any single-module build; Roster before Content; X2/X5 in the composer before any AI strategy; the Phase 1 CI gates (registry vs RLS, cross-tenant suite, pooled-connection leak, job tenant mismatch, purge-handler registration, DTO canary, sensitive-logging canary, architecture dependency tests) must be green before Phase 2 starts.
- **Foundation and Walking Skeleton are not vague infrastructure work.** Each has an explicit approval checklist (`AI_WORKFLOW.md` §11.1–§11.2) and a recorded human approval state. Neither Phase 2 nor any later production module work begins until the applicable approval state is recorded.
- A brief that would require a model change, a new product behavior or the resolution of a gate is `RETURNED` with a change record, not approved.
- ADR-011 and ADR-012 implementations require independent review by a human engineer before Phase 1 exits (Remediation §1).

## 6. Review requirements

- Every significant change gets two reviews: (a) an Opus review for architecture, security and concurrency; (b) an independent Codex review.
- **Independence is determined by author identity and agent instance, not by job title or model name.** For significant work: the author and each reviewer are different agent instances; a reviewer is not the author's continuation or child context; where practical the reviewer uses a different model family; the author never approves its own work; a model does not make its own prior reasoning independent by switching from Fable to Opus (an Opus instance that continues a Fable context is the same author); Codex is the preferred independent cross-model reviewer for Claude-authored work. Human approval is separate from and additional to model review.
- For high-risk work (anything touching ADR-011, ADR-012, ADR-013, ADR-014, ADR-016, ADR-017, ADR-020, ADR-021, tenant boundary, evaluation head, learning projection, AI requests, migrations) the review record states: author, author model, reviewer, reviewer model, review result, timestamp, findings and fixes.
- Reviewers check, in order: tenant boundary (RLS, context source, resolver use, `NOT_FOUND`), transaction/I-O boundary, module boundary (schema, imports, SDKs), contract fidelity (tags cited and matched), default-as-configuration, DTO allow-lists, telemetry allow-lists, idempotency and CAS, test coverage against the catalogue.
- Findings are reported as a ranked list with file and line, failure scenario, and the contract rule violated. A finding against a LOCKED/EXISTING rule blocks merge. Disagreement between reviewers escalates to the human authority (`AI_WORKFLOW.md` §7).
- A fix re-enters review; a fixer's "fixed" claim is verified by a different agent instance or a test run.
- Two passing reviews make a change *eligible* for human acceptance; they do not accept it, merge it or release it (§1.2).

## 7. Testing requirements

- The required test set is DM §29 (per area and phase) plus the owning wave's §15 acceptance criteria plus LTM §20 for Learning. These are copied into the brief's test plan before implementation and must exist and pass before review.
- Security tests from Arch §32 run continuously from Phase 1: cross-tenant suite, RLS coverage, pooled-connection leak, job tenant mismatch, answer-key canaries, sensitive-logging canary, purge-handler registration; before production: token replay/pre-fetch/forwarding, OTP brute force, webhook signature/replay/ordering, injection suites, storage access, sandbox escape and exhaustion.
- Property tests before feature work in Phases 4–5: head compare-and-set under concurrency (never two current evaluations, never a machine move of a locked head); learning live projection equals rebuild with out-of-order and duplicate events.
- Architecture tests: no cross-schema access, direct or indirect (§4: raw SQL, shared helpers, query builders, views, cross-schema joins, cross-module FKs), no SDK outside adapters, no transaction across I/O (lint + test), Assessment never imports evaluator views, session-level SET absent.
- A test may not be weakened, skipped or deleted to make a change pass. Test failures are reported verbatim.

## 8. Change-control protocol

1. Trigger: any conflict between implementation and the frozen contract, any needed model change, any proposal to alter a LOCKED/EXISTING rule, any gate outcome that would need a model change.
2. Action: STOP the affected work. Draft `docs/decisions/CR-<n>-<slug>.md` (template: `AI_WORKFLOW.md` §8) naming every affected origin tag, artifact section, table, event, state machine and test; state the smallest resolution and whether it reopens a closed decision.
3. Routing: architecture → engineering lead (and product owner if behavior changes); product behavior → product owner; legal values → counsel; vendor/stack → provider-selection ADR in `docs/architecture/adr/`.
4. Outcome: on acceptance a human revises the reconciled artifact (`01`/`02`/`03`), bumps its revision, regenerates the matrix in `16`, and records the new tag; closed wave documents are never edited. On rejection the brief is updated and the constraint is solved inside the contract.
5. Until decided: no code implements either side of the conflict. Independent work continues.
6. Open gates (1, 3–12) and legal gates (LG-1…LG-11) are closed only by their named owners (16 §6.5). An agent prepares a configuration surface for a gate only where the contract explicitly specifies both the surface and the designed-in default value/behavior (§3.1); where it does not, the gate is recorded as unresolved and nothing is built for it. An agent never supplies or approves a gate's value.

## 9. Secret handling

Source: ADR-024 (Secrets); DM §14.1 and §25.10 (secrets never at rest in payloads); DM classification S4; ADR-006 (telemetry); Arch V1.3 §3 (Code Execution receives inputs only, no DB credentials) and §33 ("managed secret store and KMS").

1. Secrets, credentials, provider API keys, signing keys, encryption material and equivalent authentication material are **never**: committed to source control; placed in source or configuration files; placed in logs or telemetry; placed in prompts or AI requests; placed in ordinary job payloads; placed in test fixtures; placed in migrations or scripts; stored in application-domain tables. Domain tables hold only a reference (e.g. `credential_secret_ref`, a KMS envelope reference per DM §22).
2. Secrets are supplied through the approved managed secret store / KMS envelope architecture: platform secrets in the managed secret store; per-tenant provider credentials envelope-encrypted with a managed KMS key (ADR-024). The contract names no vendor; one is chosen only by a stack/provider ADR.
3. A secret is accessed only at the relevant runtime or provider-adapter boundary, decrypted at the moment of use inside the worker/adapter, never held in domain code, DTOs or events.
4. Agents never print, expose, copy or reproduce a secret value in reports, reviews, commits, documentation, implementation logs or chat output. A secret is referred to by name/location only.
5. Rotation and audit follow ADR-024 and the Arch §32 security requirements where applicable; a rotation procedure is part of any adapter brief that handles credentials.
6. Local development uses the repository-approved secret mechanism defined by the stack ADR; agents do not invent a secret-management mechanism, environment convention or fallback.
7. A secret discovered in the repository (history, fixture, config, doc, log) is a **security incident**: do not reproduce the value; do not commit it, move it or "clean" it silently; report the file/location and the type of secret without the value; STOP work that would propagate it; follow the project's incident/rotation procedure once established (until then, report to the engineering authority).

Reviewers check every diff for items 1 and 4 before any other finding.
