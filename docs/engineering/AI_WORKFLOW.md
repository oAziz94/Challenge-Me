# AI Engineering Workflow — Challenge Me Commercial V1

Detailed process behind `CLAUDE.md` and `AGENTS.md`. The frozen contract in `docs/specifications/authoritative/` (precedence per `00_README_Index.md`) governs everything here; this document only organizes how agents and humans produce work that satisfies it.

Pipeline:

```
Architecture discovery → Architecture proposal (brief) → Independent review → Human approval
→ Implementation → Testing → Opus review (separate instance) → Independent Codex review → Fix
→ Verification → Human acceptance
```

Human approval and human acceptance are hard gates: no agent moves past them, represents them as done, or substitutes a model review for them (§6.5).

## 1. Roles

| Role | Who | Authority |
|---|---|---|
| Product owner | Human | Product decisions, LOCKED items, gates 1, 4, 8, 10 (with others) |
| Engineering authority | Human | Architecture, ADRs, briefs, change records, gates 11, 12; final acceptance |
| Gate owners / counsel | Humans per 16 §6.5 | Their gate or legal gate only |
| Architect agent | Fable | Discovery, brief drafting, conflict analysis, change-record drafting |
| Reviewer agent | Opus (fresh instance, not the author's context) | Architecture, security, concurrency, difficult code review |
| Implementer agent | Sonnet | Code, tests, approved migrations, adapters |
| Mechanical agent | Haiku | Checks, summaries, checklists, triage |
| Independent reviewer | Codex (different model family, fresh instance) | Cross-model review, challenge, verification, test-gap finding; preferred independent reviewer for Claude-authored work |

No agent approves, merges, deploys, releases, marks accepted or closes a gate. **Independence is a property of the agent instance, not the model name:** author and reviewer are different instances; a reviewer is never the author's continuation or child context; an Opus instance that continues a Fable context is the same author, not an independent reviewer; where practical the reviewer is a different model family. Model review and human approval are separate steps; neither replaces the other.

## 2. Model routing

| Task | Route to | Escalate to |
|---|---|---|
| Read a module's contract sections and produce a brief | Fable | Human (approve) |
| Analyze a suspected conflict with the contract | Fable | Human via change record |
| Implement an APPROVED brief | Sonnet | Fable for a blocking design question (via the brief, not ad hoc) |
| Write catalogue tests, adapters, migrations named in the brief | Sonnet | — |
| Lint, origin-tag check, checklist completion, summarize review output | Haiku | — |
| Review for architecture/security/concurrency | Opus, fresh instance (never the author's context) | Human on disagreement |
| Independent review, challenge, verification | Codex, fresh instance | Human on disagreement |
| Merge, deploy, release, accept, close a gate | Human only | — |
| Difficult debugging (CAS races, RLS leaks, projection drift) | Fable | — |
| Routine bug fix inside an approved module | Sonnet | Fable if root cause crosses modules |

Routing is by difficulty and risk, not by preference: Fable only when a cheaper model would likely be wrong; Haiku whenever the task is mechanical.

## 3. Architecture phase

**3.1 Discovery (Fable).** Input: module name and phase. Read only: DM §4 row, the module's DM section(s), DM §19 contracts it appears in, DM §20 events it produces/consumes, DM §21 jobs it owns, DM §22–§23 rows, DM §25 transactions, DM §29 rows, the owning wave(s) §4–§8 and §15, relevant ADRs with their V1.4 amendments, LTM for Learning, errata 16 §6.4. Output: a discovery note listing every rule with its label and tag, every PROPOSED DEFAULT as a configuration key, every OPEN/LEGAL gate touched (marked "surface + default specified at §…" or "unresolved"), and every cross-module contract. The discovery note is a working aid, not an authority: it is re-verified against the source documents by the reviewer and never cited in place of them.

**3.2 Proposal (Fable).** Draft `docs/architecture/modules/<module>.md` using the brief template (§9) with state `DRAFT`, including the source-trace matrix (§9, item 0). The brief cites sections; it does not restate the domain model, and it never overrides or replaces the contract. For an OPEN / sign-off / LEGAL gate the brief proposes a configuration surface only when the contract explicitly specifies both the surface and the designed-in default value/behavior; otherwise the gate is listed as unresolved and nothing is built for it. The brief never infers a legal decision, product decision, threshold, default, schema, workflow, permission, retention value or provider choice from an open gate.

**3.3 Independent review (Codex, then a fresh Opus instance if the brief touches ADR-011/012/013/014/016/017/020/021).** Reviewers are different agent instances from the author and not continuations of its context. Check: completeness against §9; **every source-trace matrix row validated against the authoritative documents themselves** (not the discovery note); every rule label correct; no invented behavior; every open gate correctly marked specified-or-unresolved; phase prerequisites true; conflict check honest. Output: review report. Brief → `IN_REVIEW`.

**3.4 Human approval.** Engineering authority (and product owner where the brief touches learner-facing behavior) sets `APPROVED` or `RETURNED` with reasons. Only a human writes the state `APPROVED`; reviewer reports are inputs to that decision, never a substitute for it.

## 4. Implementation phase

Precondition: brief `APPROVED`; phase prerequisites and CI gates green; stack/vendor ADRs the brief relies on exist.

**Sonnet, per task inside the brief:**
1. Load only the brief and the sections it cites.
2. Implement inside the module schema; every table per the brief's table section; every PROPOSED DEFAULT as a configuration key; every rule comment carries its origin tag. Reach another module's data only through its DM §19 contract or a DM §20–§21 event/job — never through raw SQL, shared repositories, generic data-access helpers, query builders, views, cross-schema joins or cross-module FKs (`AGENTS.md` §4).
2a. Learner content goes to an AI provider only through an approved AI capability and route with all applicable controls satisfied (`AGENTS.md` §3.14a); learner identity, contact values, tokens, answer keys and private teacher material never do. Learner content never goes into telemetry, logs, audit events or job payloads.
2b. Secrets (`AGENTS.md` §9, ADR-024): never in source, config, fixtures, migrations, scripts, logs, prompts, job payloads or domain tables; read only at the provider-adapter/runtime boundary from the managed secret store / KMS envelope; local development uses the stack-ADR-approved mechanism only. A secret found anywhere in the repository is reported by location and type, never by value, and work that would propagate it stops.
3. Write the tests named in the brief's test plan before or alongside the code; never weaken an existing test.
4. Keep an implementation log in the task's PR/notes: files touched, tags implemented, deviations (there should be none), open questions.
5. On any conflict with the contract: STOP that part, write a change record (§8), continue independent work.

Migrations are written only when the brief names them and a stack ADR defines the tooling; migrations are additive on immutable tables and run as `cm_migrator` in the pipeline (ADR-023).

## 5. Testing phase

- Run the full catalogue named in the brief (DM §29 rows, wave §15 criteria, LTM §20, Arch §32 security gates for the phase, architecture tests).
- Report results verbatim; a failing test is a blocker, not a note.
- Haiku may run and summarize; Sonnet fixes; a fix re-enters review (§6).
- Property tests (head CAS, projection equality) are required before Phase 4–5 feature work and run on every change to Evaluation or Learning.

## 6. Review phase

**6.1 Opus review.** Performed by an Opus instance that did not author the change and is not a continuation or child of the author's context. Scope: architecture, security, concurrency, contract fidelity. Checklist order: secret exposure (`AGENTS.md` §9 — any secret value in the diff, fixtures, config, logs, prompts, payloads or tables; reported by location, never quoted) → tenant boundary → transaction/I-O boundary → module boundary (direct and indirect access, `AGENTS.md` §4) → rule fidelity (tags) → defaults-as-configuration and open gates specified-or-unresolved → DTO and telemetry allow-lists → AI-request payload controls → idempotency/CAS → test coverage vs catalogue. Output: `ReportFindings`-style ranked list (file, line, failure scenario, rule violated, severity).

**6.2 Independent Codex review.** Runs after 6.1, from a fresh Codex instance with no shared context with the author or the 6.1 reviewer, with repository access. Scope: challenge the design and the brief, adversarial code review (secret or credential exposure, tenant leak, token leak, transaction across I/O, missing RLS, missing purge handler, hard-coded default, disguised cross-module access), security/tenant-boundary review, verification that the tests actually prove the cited acceptance criteria, and test-gap identification. Output: independent report. Codex never approves and never resolves disagreements; a Codex pass is not human approval.

**6.3 Fix.** Sonnet (or Fable if cross-module) addresses findings; each finding ends `fixed`, `no_change_needed` (with contract citation) or `escalated`.

**6.4 Verification.** An agent instance other than the fixer, or a test run, confirms each `fixed` item. Haiku may collate; it may not mark anything verified without evidence.

**Review record (high-risk work).** For work touching ADR-011/012/013/014/016/017/020/021, the tenant boundary, the evaluation head, the learning projection, AI requests or migrations, the task log records: author, author model, reviewer, reviewer model, review result, timestamp, findings and fixes — for each of 6.1, 6.2 and 6.4.

**6.5 Human acceptance — hard gate.** The engineering authority accepts the task and records acceptance evidence (who, when, what was reviewed, test report reference). Module acceptance requires all brief tasks accepted and all catalogue tests green. Until that human state transition is recorded, no agent may merge, deploy, release, mark the task or module accepted, represent the implementation as approved, or close the related engineering gate. Passing tests, a Codex review and an Opus/Fable review do not equal human acceptance. The human product/engineering authority remains the final acceptance authority under the contract's change-control process (16 §6.7).

## 7. Disagreement and escalation

- Reviewer vs implementer: the contract text decides; the party citing a tag that matches the text wins. If both cite text that conflicts, that is a contract contradiction → change record.
- Opus vs Codex: neither outranks the other. Both reports go to the engineering authority with each party's citations. The human decides; the decision is recorded in the task log.
- Any finding against a LOCKED/EXISTING rule blocks merge until a human overrides in writing (which itself requires a change record if the rule is to change).
- An agent that cannot proceed states exactly what is blocked, why, and what decision is needed; it does not guess.

## 8. Architecture conflict handling

**Trigger.** Implementation cannot satisfy a rule; two rules contradict; a library/database/provider cannot express the rule; a gate whose contract-specified configuration surface and designed-in default cannot be built as specified. (A gate for which the contract specifies no surface or no default is not a conflict; it is recorded as unresolved in the brief and nothing is built for it.)

**Protocol.** STOP affected work → classify the rule's label → draft change record → route → wait → record outcome. Independent work continues.

**Change record template** (`docs/decisions/CR-<n>-<slug>.md`):

```
# CR-<n>: <slug>
State: DRAFT | SUBMITTED | ACCEPTED | REJECTED | WITHDRAWN
Raised by: <agent/model> on behalf of <task>        Date:
Affected rule(s): <artifact §, origin tags>
Rule label: LOCKED | EXISTING | PROPOSED DEFAULT | OPEN/GATE | IMPLEMENTATION DETAIL
Conflict: <what cannot be done, with evidence>
Smallest resolution: <proposal; no product decision made here>
Touches: tables / events / state machines / contracts / tests / other tags
Model change? yes/no    Reopens a closed decision? yes/no (which)
Routing: engineering authority | product owner | counsel | gate owner | provider ADR
Decision (human): <text, name, date>
Applied in: <artifact revision, new tag, matrix regenerated y/n>
```

**On acceptance (human):** revise `01`/`02`/`03` as needed, bump the revision, regenerate the `16` matrix, add the new tag. Closed waves and `04` are never edited (`04` only by its own closure rules). **On rejection:** solve inside the contract or return the brief.

## 9. Artifacts exchanged between agents

| Artifact | Location | Author | Consumer |
|---|---|---|---|
| Discovery note | brief appendix or task notes | Fable | Fable, reviewers |
| Implementation brief | `docs/architecture/modules/<module>.md` | Fable | Codex/Opus, human, Sonnet |
| Brief review report | task notes / PR | Codex, Opus | Human |
| Implementation log | PR description / task notes | Sonnet | Reviewers |
| Test report | CI output, verbatim | CI / Haiku | Reviewers, human |
| Review findings | ranked list (file, line, scenario, rule) | Opus (separate instance) | Sonnet, human |
| Independent review | ranked list + test gaps | Codex (fresh instance) | Sonnet, human |
| Verification note | per finding | non-author agent instance / test run | Human |
| Review record (high-risk) | author, author model, reviewer, reviewer model, result, timestamp, findings/fixes | Reviewer; Haiku collates | Human |
| Acceptance evidence | task log / brief: who, when, what reviewed, test report ref | Human | Everyone |
| Change record | `docs/decisions/CR-*.md` | Fable (draft), human (decision) | Everyone |
| Provider/stack ADR | `docs/architecture/adr/` | Fable (draft), human (accept) | Everyone |

**Brief template** (`docs/architecture/modules/<module>.md`):

```
# Implementation brief — <Module> (schema <name>)
State: DRAFT | IN_REVIEW | APPROVED | RETURNED | SUPERSEDED
Phase: <per Arch §35 / DM §33>   Prerequisites: <briefs, CI gates>   Approved by/date:
This brief summarizes the contract; it never overrides or replaces it. Where they differ, the contract governs.
0. Source-trace matrix (each row: item | authoritative document | section | origin tag(s) | validated by <reviewer instance/date>):
   module ownership | owned aggregates/tables | public contracts | consumed contracts | jobs | events |
   applicable wave acceptance criteria | applicable ADRs + V1.4 amendments | 16 §6.4 errata |
   open/sign-off/legal gates | required DM §29 test rows | security/privacy requirements
1. Contract scope: DM §<n>; waves <..> §<..>; contracts C<..> (DM §19); events (DM §20); jobs (DM §21)
2. Rules by label: table of tag | label | section | how implemented (config key for defaults)
3. Open/legal gates touched: gate | "surface + designed-in default specified at <section>" → config key | owner,
   or "UNRESOLVED — contract specifies no surface/default; nothing built" (no approval claimed either way)
4. Tables: name | category | class | retention | purge handler | RLS | immutability | indexes (DM §22–23)
5. Boundaries: contracts by mechanism (A/B); adapters; what this module never does; statement that no
   raw SQL, shared repository, query builder, view, join or FK reaches another schema
6. Transactions: DM §25 items implemented
7. Test plan: DM §29 rows | wave §15 criteria | property tests | Arch §32 gates
8. Conflict check: none | CR-<n>
9. No-new-behavior statement
10. Reviews: Codex <instance/date/result, matrix validated y/n>; Opus <instance/date/result>;
    human engineer (ADR-011/012 work). Reviews are inputs to approval, not approval.
11. Tasks: ordered list, one module each
12. Acceptance evidence (human): who | date | what reviewed | test report ref — per task and for the module
```

## 10. Approval states

| Object | States | Who moves to the final state |
|---|---|---|
| Brief | DRAFT → IN_REVIEW → APPROVED / RETURNED → SUPERSEDED | Human (APPROVED) |
| Task | PLANNED → IN_PROGRESS → TESTED → IN_REVIEW → FIXING → VERIFIED → ACCEPTED / BLOCKED | Human (ACCEPTED, with acceptance evidence) |
| Change record | DRAFT → SUBMITTED → ACCEPTED / REJECTED / WITHDRAWN | Human |
| Provider/stack ADR | PROPOSED → ACCEPTED / REJECTED | Human |
| Gate / legal gate | OPEN → CLOSED | Named owner only (16 §6.5); never an agent |
| Module | NOT_STARTED → BRIEFED → IN_BUILD → UNDER_REVIEW → ACCEPTED | Human (ACCEPTED, with acceptance evidence) |
| Foundation (Phase 1) / Walking Skeleton (Phase 1b) | NOT_STARTED → BRIEFED → IN_BUILD → UNDER_REVIEW → APPROVED | Human, against the §11.1 / §11.2 checklist |

`VERIFIED` is the last state an agent may set. `ACCEPTED`, `APPROVED` and `CLOSED` are written only by the human named, after the evidence is recorded; an agent that reaches `VERIFIED` stops and reports.

## 11. Module lifecycle

1. Phase eligibility checked against Arch §35 / DM §33 and green prerequisites.
2. Discovery and brief (Fable) → independent review → human `APPROVED`.
3. Tasks implemented one at a time (Sonnet), each with its catalogue tests.
4. Each task: Opus review (separate instance) → Codex review → fix → verification → human acceptance with recorded evidence.
5. Module acceptance (human) when all tasks are accepted, the DM §29 rows for the module pass, the owning wave's §15 criteria are covered by passing tests, the phase's Arch §32 security gates are green, and the handoff checklist items in DM §34 that the module owns are ticked.
6. Post-acceptance changes re-enter at step 2 (brief amendment) or §8 (conflict).

Phase 1 Foundation and the Phase 1b Walking Skeleton are treated as modules under this lifecycle, with their own briefs, source-trace matrices and reviews. They are not vague infrastructure work: each is approved by a human against the checklist below, and the approval state is recorded in the brief. **Neither Phase 2 nor any later production module work begins until the applicable Foundation / Walking Skeleton approval state is recorded.**

### 11.1 Foundation approval checklist (Phase 1)

FOUNDATION APPROVAL must prove, at minimum, each item below with a passing test, CI gate or reviewed artifact cited in the brief (sources: DM §6, §21–§23, §25, §29, §33; ADR-001, ADR-006, ADR-012, ADR-013, ADR-019, ADR-022, ADR-023; Arch §32, §35; Remediation §1):

- [ ] Repository / Git baseline (initial commit, branch rules, `.gitignore`, protected `docs/specifications/authoritative/`)
- [ ] CI/CD baseline (pipeline runs the test catalogue and the architecture/security gates on every change)
- [ ] Module schema structure (one PostgreSQL schema per module, all fourteen created, no cross-schema FK)
- [ ] Database roles (`cm_migrator`, `cm_app`, `cm_queue`, `cm_ops_readonly`, `cm_resolver`) with their grants and no `BYPASSRLS` except where the contract names it
- [ ] `TenantTransaction` (transaction-local `set_config`; no session-level `SET`; pooled-connection leak test)
- [ ] `ActorContext` / `SystemActor` (tenant context only from here; never from body, URL or webhook payload)
- [ ] Forced, fail-closed RLS on every tenant-owned table; cross-tenant id → `NOT_FOUND`
- [ ] Table-category registry (five categories) and the CI gate that compares registry vs RLS coverage
- [ ] Platform organization (the platform tenant / system actor arrangement as specified in DM / ADR-012)
- [ ] Audit foundation (audit event table, allow-listed fields, sensitive-logging canary)
- [ ] Processed-event convention (idempotent consumer table / dedupe per module; duplicate and out-of-order delivery test)
- [ ] External deletion ledger (purge-handler registration gate; every S2–S4 column has a handler)
- [ ] Queue discipline (PostgreSQL-native queue as outbox; enqueue in producer transaction; no post-commit in-memory dispatch; priority classes)
- [ ] Lease / admission-control behavior (claim → lease → admission tokens → provider call outside tx → result tx; J-6 jobs may run more than once; failure classes)
- [ ] Required architecture / security CI gates green (registry vs RLS, cross-tenant suite, pooled-connection leak, job tenant mismatch, purge-handler registration, DTO canary, sensitive-logging canary, architecture dependency tests incl. indirect cross-schema access, SDK-outside-adapter, transaction-across-I/O, session `SET`)
- [ ] Secret handling baseline (ADR-024, `AGENTS.md` §9): managed secret store / KMS envelope access wired at the adapter/runtime boundary only; no secret in repository, config, fixtures, migrations or domain tables; secret-scan check in CI; local-development mechanism defined by the stack ADR
- [ ] Required foundational security tests from Arch §32 for Phase 1 passing
- [ ] ADR-011 and ADR-012 implementations independently reviewed by a human engineer (Remediation §1)
- [ ] Acceptance evidence recorded (who, when, test report reference)

### 11.2 Walking Skeleton approval checklist (Phase 1b)

WALKING SKELETON APPROVAL must prove the end-to-end path, with each hop implemented inside its owning module and crossing boundaries only by DM §19 contracts or DM §20–§21 events/jobs:

```
deterministic question → capability link → submission persistence → evaluation head
→ learning observation → teacher dashboard row
```

and must include, with passing tests cited in the brief:

- [ ] Deterministic question authored and published (Content; no AI involved)
- [ ] Capability link issued (Challenge; token never stored in a message body, log or post-exchange URL)
- [ ] Submission persisted before any evaluation (Assessment; DM §25.1 — no condition rejects, loses or alters learner work)
- [ ] Evaluation head created (Evaluation; one head per evaluable submission; immutable results after PENDING)
- [ ] **CAS / revision behavior** under concurrency: never two current evaluations; compare-and-set on revision proven by a property test
- [ ] **Human override**: a human-locked head that a machine writer cannot move
- [ ] **Regrade**: a new result via the authorized regrade path, prior results immutable, head moves by CAS only
- [ ] Learning observation emitted and consumed (Learning; evidence unit recorded; no item grade read; no reinforcement or notification triggered)
- [ ] **Projection behavior**: live projection equals rebuild, including out-of-order and duplicate observations
- [ ] Teacher dashboard row rendered from the reporting read model (Reporting)
- [ ] Student-facing DTOs built only from `StudentQuestionView` / `StudentRevealView`; canary tests pass; no reveal before `closes_at`
- [ ] Every hop runs under `TenantTransaction`; cross-tenant suite passes against the skeleton
- [ ] Acceptance evidence recorded (who, when, test report reference)

**Capability-link delivery (explicit constraint).** The baseline identified that the walking skeleton needs a capability link to reach a learner while messaging adapters (Communication, X13) are scheduled in Phase 7. This remains an open question for the engineering authority, to be answered in the Phase 1b brief by citing the contract (e.g. a contract-specified web/manual channel) or by a change record. **Agents do not invent a delivery mechanism, a temporary channel, or a bypass of X13 to make the skeleton work.**

## 12. Token-efficiency principles

- Read by citation: the brief names sections; agents read those sections, not whole artifacts. The Domain Model is ~2,800 lines; never load it in full for a task.
- Search by origin tag (`W6-C5`, `X3`, `FD-1`) or section number (`§25.1`) before reading.
- One module, one task, one context. Cross-module questions go to Fable via the brief, not by widening the implementer's context.
- Reviews receive the diff, the brief and the cited sections, nothing else.
- Haiku handles collation and checklists so expensive models see only decisions.
- Discovery notes and briefs are a navigation aid, not an authority: later agents use them to find the right sections quickly, then read those sections in the authoritative documents. When a brief and the contract differ, the contract governs; cached summaries and previous agent reports are never cited as the source of a rule.
- Do not restate the contract in code comments beyond the tag and a one-line rule; the tag is the pointer.
- Fable is invoked for the problem, not the module: hand it the specific contradiction or design question with the sections involved.
