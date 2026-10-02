# Challenge Me — Architecture Decision Records — Commercial V1.4 (reconciled)

> Status: V1.3 decision baseline with the cross-wave reconciliation applied (Domain Model corrections X1–X13, Wave 1 carried items, Spec Kit SC1–SC4, Waves 2–11). V1.3 text is unchanged except where marked; each ADR ends with tagged "V1.4 reconciliation amendments". Conflicts U1 and U2 found during reconciliation are closed by product-owner decision (ADR-021 amendment).
>
> FROZEN 2026-09-30 as ADR set V1.4 (reconciled, freeze revision: includes U1, U2, US-1 and the DI-2 wording alignment in ADR-011). Changes require formal change control.
>
> Principle: Build the product. Buy/integrate the infrastructure. Own the domain.
>
> Companion documents: Commercial V1.3 Implementation Architecture; V1.3 Architecture Review Remediation Report.

# How to read this document

This set keeps every V1.2 decision and changes it only where the V1.2 architecture review found a contradiction, a missing seam, or an unowned responsibility. Each ADR states which review findings it resolves (F-numbers refer to the V1.2 review; N-numbers to the ADR reconciliation).

| Status | Meaning |
|---|---|
| Accepted | Binding for implementation. |
| Accepted — amended V1.3 | V1.2 decision retained; V1.3 adds or corrects rules. |
| Proposed — owner sign-off | The architecture is designed around the stated default so implementation can proceed, but a named business, legal or product owner must confirm it before launch. Changing the default must not require a domain-model change. |

# Change log (V1.2 → V1.3)

| ADR | Change | Resolves |
|---|---|---|
| ADR-001 | Amended: queue selection criteria, worker transaction rule, leases, admission control, weighted priority, payload versioning | F10, F25 |
| ADR-002 | Amended: single active organization per request; MFA for privileged staff; learner sessions moved to ADR-016 | F8, F26 |
| ADR-003 | Amended: consent removed from ContactPoint; tenant-scoped ContactPoints; link vs merge semantics | F3, F22/N2, N3 |
| ADR-004 | Amended: superset design rules, tenant resolution, opt-out scope, throughput; proposed default and deadline | F14 |
| ADR-005 | Amended: golden-set sourcing, minimum aggregate group size, regional capability matrix pointer | F15 |
| ADR-006 | Amended: data classification register, evidence by reference, deletion fan-out, backup window, telemetry allow-lists | F12 |
| ADR-007 | Amended wording: HintSetVersions pinned transitively | N4 |
| ADR-008 | Amended: change classification, evaluation compatibility, presented vs evaluated version, topic identity | F6, F21, F17 |
| ADR-009 | Amended: judging outside the sandbox, per-test isolation, runtime pinning, outcome classes, quotas; proposed language list | F9 |
| ADR-010 | Amended: tri-state deterministic outcomes, answer modes, shared text normalization | N1, F24 |
| ADR-011 | New: Evaluation record and authority model | F1, F23, F34 |
| ADR-012 | New: Tenant context, database roles and elevated access | F2, F26 |
| ADR-013 | New: Module ownership (Roster) and inter-module communication | F3, F5, F17, F18 |
| ADR-014 | New: Learning observation and projection semantics | F4, F17, F35 |

| ADR | Change | Resolves |
|---|---|---|
| ADR-015 | New: Evaluation composition, confidence and confirmation | F7, N1, F18, F33 |
| ADR-016 | New: Learner/guardian capability sessions, OTP and rate limiting | F8, F27 |
| ADR-017 | New: AI model lifecycle, quality gates and reproducibility | F11, F15, F28, F36 |
| ADR-018 | New: Onboarding, roster import and consent acquisition | F13 |
| ADR-019 | New: Consent model | F22, N2 |
| ADR-020 | New: Assessment runtime integrity (student-safe contracts, reveal policy, attempts) | F16, F30 |
| ADR-021 | New: Usage, budgets and reservations | F19 |
| ADR-022 | New: Scheduling and materialization | F20 |
| ADR-023 | New: Operations — DR, SLOs, migrations, incidents, load profile | F25, F31 |
| ADR-024 | New: Integration security — webhooks, secrets, storage, privileged staff actions | F26 |
| ADR-025 | New: Safeguarding signals | F29 |

# Change log (V1.3 → V1.4 reconciled)

| ADR | Amendment sources |
|---|---|
| ADR-001 | W1 J-6 |
| ADR-002 | W2-C1, W2-C2 |
| ADR-003 | W2-1, W2-6, W2-C3, W2-C4 |
| ADR-004 | W4-5, W11-4 |
| ADR-005 | W7-2 |
| ADR-006 | DM X11, W3-C3, W9-3, W10-4, W10-5, W10-C2, W10-C3, W11-C2; LG-10, LG-11 |
| ADR-007 | W5-4, W7-C2 |
| ADR-008 | FD-1, W3-3, W3-4, W3-C1, W3-C2, W3-C4 |
| ADR-009 | DM X9, X12; W5-1, W7-1, W7-C3, W7 CX-4, W11 PE-7 |
| ADR-011 | DM X3, X8; FD-1, W6-1, W6-3, W6-4, W6-C5, W6 HD-4, W6 DI, W6 RG-6, W9-C1 |
| ADR-012 | DM X1, X7; W1 F-1, F-5; FD-4 |
| ADR-013 | DM X4, X13; SC3, W2-C4, W6-6, W10 |
| ADR-014 | SC4, W4-1, W4-C5, W4-C6, W8-1, W8-C2, W8-C3, W10-C3 |
| ADR-015 | DM X2 (and Rule 9), W6-2, W6-C1, W6-C2, W6-C4 |
| ADR-016 | SC1, SC2, W2-2, W2-C3, W2-C4, W4-4, W4-5, W4-C2, W4-C7, W5-C2 |
| ADR-017 | DM X5, X6; W6-C3, W7-2, W7-3, W7-4, W7-5, W7-C1, W7-C2, W11-C4 |
| ADR-018 | W2-1 |
| ADR-019 | W2-C4, W7-C1; LG-3, LG-5 |
| ADR-020 | DM X10, X12; W4-6, W4-C1, W5-2, W5-3, W5-5, W5-C1, W5-C2, W6-1, W6-5 |
| ADR-021 | W11-1…W11-5, W11-C1, W11-C3, W11-C4, W11-C6, W11-C7; U1 and U2 (closed by product-owner decision) |
| ADR-022 | G5, W4-2, W4-3, W4-4, Wave 4 S-5 |
| ADR-023 | W1 F-2, W1 J-6, W11 OP-1…OP-4; gate 11; LG-10 |
| ADR-024 | FD-1, FD-4, W11 SB-10 |
| ADR-025 | W7-5; gate 10 |
| Cross-ADR Rules | DM X2 (Rule 9), DM X8 (Rule 2), J-6, W11-C7 |

ADR-010 has no reconciliation amendment. No ADR is withdrawn and no new ADR is added.

# ADR-001 — Execution Substrate

**Status:** Accepted — amended V1.3

**Decision (unchanged):** Use a PostgreSQL-native queue for V1. Domain state and queue jobs are committed in the same database transaction. No outbox relay and no external queue for ordinary jobs.

## V1.3 rules

**Queue library acceptance criteria.** The selected library (or a thin in-house table using row locking with SKIP LOCKED) must provide: enqueue inside the caller's transaction; lock-free claiming; leases with expiry and heartbeat; priorities; deterministic job keys for de-duplication; delayed jobs; retry with backoff and attempt caps; a dead-letter state. Per-key concurrency above one is desirable; if the library lacks it, the admission-control table below provides it. The concrete library is chosen in a provider-selection ADR after the benchmark.

**Worker execution rule (mandatory).**

```
1. Claim job (queue role)            -> commit RUNNING + lease_expires_at
2. Acquire admission tokens           (tenant x work class, provider x account)
3. Call provider OUTSIDE any DB transaction
4. New tenant transaction: write result with a unique result key -> commit
5. Mark job complete; release tokens
```

No database transaction may be held open across network I/O. A lint/architecture test flags provider calls inside a transaction scope.

**Leases and dead letters.** A sweeper returns jobs with expired leases to the queue and increments the attempt count. After the attempt cap the job moves to DEAD_LETTER with a reason. Operators replay dead letters with a tool that re-validates tenant and payload version.

**Failure classes.**

| Class | Example | Behaviour |
|---|---|---|
| INFRASTRUCTURE | connection reset, 5xx | retry with exponential backoff |
| RATE_LIMITED | provider 429 | retry honouring retry-after; counted separately from the attempt cap up to a ceiling |
| DOMAIN | student program timed out; validation rejected | never retried; recorded as a domain outcome |
| POISON | unknown payload version; tenant/entity mismatch | dead letter immediately; security alert on tenant mismatch |

**Admission control.** Table `admission_tokens(scope, key, limit, in_use)`. Scopes: tenant × work class (noisy-neighbour control) and provider × account (global provider rate limits, which apply across all tenants). Tokens are released on completion or lease expiry.

**Weighted priority.** Classes P0 student evaluation, P1 student delivery, P2 teacher AI generation, P3 reports, P4 non-critical analytics. Workers draw by weighted share (proposed default 50/25/15/7/3) with a guaranteed minimum per class, so reports are never starved by an evaluation burst.

**Payload contract.** Every job carries `payload_version`,` tenant_id`, entity IDs,` correlation_id` and an idempotency key. Handlers accept the current and previous payload version (ADR-023). No learner content in payloads.

**Consequence.** The benchmark in ADR-023 (cohort-deadline burst) must pass before production sizing and before the library choice is final.

## V1.4 reconciliation amendments

- **Jobs may run more than once** [W1 J-6]: handlers are idempotent so duplicate execution yields at most one effective Challenge Me domain result; provider calls use the provider's idempotency key where supported, otherwise its reconciliation or de-duplication; universal exactly-once external delivery is not claimed.

# ADR-002 — Identity Provider Boundary

**Status:** Accepted — amended V1.3

Unchanged: the external IdP authenticates staff only and supplies a verified subject. Challenge Me owns Organization, Membership, scoped roles, permissions, tenant context and educational authorization.

## V1.3 rules

- Each staff request carries exactly one active organization. ActorContext binds that organization; every command re-verifies that the target resource belongs to it.
- Membership or role revocation takes effect on the next request (authorization is evaluated from Challenge Me data per request, not from long-lived token claims).
- Owner and Admin roles require MFA, enforced through IdP policy. Sensitive actions (elevated access, bulk regrade approval, data export, deletion approval) require recent authentication.
- Learner and guardian access is specified in ADR-016.

## V1.4 reconciliation amendments

- One Membership per User × organization; a revoked member can be re-invited, and acceptance reactivates the existing Membership with the new invitation's roles; the StaffInvitation is the pending record (no INVITED membership state) [W2-C1, W2-C2].

# ADR-003 — Learner, Guardian & ContactPoint Identity

**Status:** Accepted — amended V1.3

Unchanged: a phone number or email address is not a learner; ContactPoints link to multiple Learners and Guardians; every capability session is bound to a specific Learner.

## V1.3 rules

**ContactPoint scope and content.** ContactPoint is tenant-scoped: the same phone number used by two organizations is two ContactPoint rows, which prevents cross-tenant linkage. ContactPoint holds type, normalized value (E.164 for phones), verification state (UNVERIFIED, VERIFIED, INVALID) and lifecycle metadata. **ContactPoint does not hold processing consent.** Channel consent and processing consent are separate records (ADR-019).

**Links.** `ContactPointLink(contact_point_id, subject_type: LEARNER|GUARDIAN, subject_id, role,` `tenant_id)`. Every outbound delivery addresses the pair (ContactPoint, Learner), and templates name the learner the link is for, so a shared family phone never receives an ambiguous link.

**Link vs merge.**

- **Link:** an org-scoped Learner may link to a global User. A User may link to Learner profiles in several organizations. Linking never exposes one organization's data to another; each organization sees only its own Learner.
- **Merge (duplicates within one organization):** explicit staff command `MergeLearners(survivor, duplicate)` with a preview. The duplicate becomes MERGED with a pointer to the survivor; the pseudonym mapping resolves the duplicate's pseudonym to the survivor; the survivor's projections are rebuilt (ADR-014). Learning events are never rewritten. Merges across organizations are prohibited. **Ownership:** Roster module (ADR-013).

## V1.4 reconciliation amendments

- A ContactPoint is verified only by a correct one-time code; opening a link never verifies; verification proves possession, not identity or consent [W2-C3].
- Minor status is set or changed only by Owners and Admins (including import), audited, and emits `LearnerMinorStatusChanged` [W2-6, W2-C4]; ending a guardian link emits `GuardianLinkEnded` [W2-C4].
- Link recipients follow an organization setting (defaults: MINOR and UNKNOWN → guardian only; ADULT → learner); consent requests follow the same rule [W2-1].

# ADR-004 — WhatsApp Account Architecture

**Status:** Design rules Accepted. Account-model default: **Proposed — owner sign-off.**

## Design rules (accepted)

The model supports both per-organization and platform-shared accounts; the shared case is the superset and is designed for now.

- `ChannelAccount(tenant_id nullable, provider, provider_account_ids, quality_state,` `messaging_tier, throughput_limit, daily_quota, template_namespace)`. A null tenant_id means platform-shared; shared accounts are registered global records (ADR-012).
- `ChannelAccountAssignment(organization → channel_account)` routes outbound messages.
- **Inbound tenant resolution** uses only trusted data: the provider account identifier plus the sender ContactPoint, matched against recent outbound Deliveries. Payload fields never set the tenant. Unresolvable inbound messages are handled at platform level.
- **Opt-out scope** is (ChannelAccount, contact value). On a shared account an opt-out suppresses every organization using that account; on a dedicated account it affects only that organization. The organization's dashboard shows opt-outs.
- **Throughput:** the delivery scheduler respects per-ChannelAccount rate limits and daily quotas; excess is deferred with jitter. Web links and email remain complete substitute channels.
- **Templates** are versioned data with provider approval status; only approved template versions are sent.

## Proposed default (sign-off required)

Target model: per-organization accounts onboarded through the provider's embedded-signup flow. Platform-shared account permitted as a temporary onboarding fallback for organizations not yet verified. **Decision owner:** product/commercial. **Deadline:** end of implementation Phase 3, because business verification and template approval have external lead times. Current provider rules, pricing and tier limits must be re-verified at decision time.

## V1.4 reconciliation amendments

- No SMS channel is active in V1; WhatsApp and email only. The SMS adapter interface is retained for later [W4-5].
- When the MESSAGING pool is exhausted, one-time codes and consent requests are always sent (overage); other deliveries wait as specified in ADR-021 [W11-4].

# ADR-005 — Platform Data Rights & De-identified Aggregates

**Status:** Accepted with Legal Review — amended V1.3

Unchanged: no universal ownership of customer learning data; platform use limited to de-identified aggregates where legally and contractually permitted; raw learner content remains organization-scoped.

## V1.3 rules

- **Golden datasets.** Because raw learner content is organization-scoped, platform golden sets are sourced from (a) commissioned grading data collected with consent for that purpose, (b) synthetic data, or (c) a named customer's data under an explicit contract clause, de-identified, with a link back to the source for deletion. Arabic golden sets are a Phase 1 procurement task.
- **Minimum group size.** De-identified aggregates suppress any cell covering fewer than k learners (proposed k = 10) and never contain free text.
- **Regional capability matrix** is defined in ADR-017.
- **Before launch:** contract language for permitted aggregate use, and the technical de-identification policy.

## V1.4 reconciliation amendments

- V1 golden datasets are commissioned and synthetic only; no customer learner answers; CUSTOMER_CONTRACT and customer-derived golden items are outside the V1 quality-data path; a future path only after legal and contractual review [W7-2].

# ADR-006 — Subprocessors, Data Classification & Retention

**Status:** Accepted — amended V1.3

Unchanged: subprocessor inventory before launch; learner content excluded from observability and product analytics; AI payloads separated from metadata; ReportSnapshots immutable but redactable by retention policy.

## V1.3 rules

**Data classification register.** Every column or object that can contain learner content is registered as SENSITIVE_LEARNER_PAYLOAD with a purge handler. The register includes at minimum:

| Store | Owner module | Purge behaviour |
|---|---|---|
| Response and submission content, uploaded answer files | Assessment | delete content; keep metadata row |
| AIOperation input/output payloads | AI Platform | delete payload objects |
| CriterionResult evidence | Evaluation | stored as offsets into the Response; resolves to [redacted] once the Response is purged |
| AI feedback text | Evaluation / AI Platform | stored in the payload store by reference; purged with payloads |
| ReviewTask notes, Dispute text | Review / Evaluation | redact text; keep decision record |
| Rendered Message bodies | Communication | delete body; keep delivery metadata |
| Code-execution stdout/stderr | Evaluation | delete |
| Uploaded documents and extraction artifacts | Content | delete objects |
| Customer-derived golden-set items | AI Platform | delete via source link |
| ReportSnapshot bodies | Reporting | redact to tombstone |

A CI test fails the build if any table with a column marked sensitive lacks a registered purge handler.

**Deletion fan-out.** DeletionRequest → registry-driven purge jobs per store → deletion requests to subprocessors that support them → completion record with per-store status.

**Backups.** Deleted data persists in backups until the backup/PITR window expires (proposed 35 days), stated in customer DPAs. A deletion ledger is re-applied automatically after any restore.

**Telemetry and analytics.** Trace attributes are allow-listed; auto-instrumentation must not capture SQL parameters or HTTP bodies. Product-analytics events use an allow-listed property schema with no free text.

## V1.4 reconciliation amendments

- **Deletion ledger location (DM X11):** deletion completions are written to the database and to an append-only, write-once object-storage log; the restore runbook replays the external log.
- Organization purge (termination + 90 days) takes precedence over class retention periods, except audit events (LG-1) and the FINANCIAL record set [W10-C2, W11-C2].
- New retention class **R11 FINANCIAL** (minimal billing records; no learner data) survives organization purge; **duration governed by LG-11** [W11-C2].
- Owners may only shorten R2, R4, R5 and R8, within platform minimums [W10-4]; generated exports kept 7 days [W9-3, W10-5]; source documents and extraction artifacts are organization content (R1), deleted on request with a "source deleted" marker on versions [W3-C3]; learning deletion deletes rows (no RETRACTED) [W10-C3].
- Backup retention 35 days is an implementation default. **All retention periods, deletion deadlines, subject-access deadlines, anonymized aggregates and exemptions remain subject to LG-10 (OPEN); none is legally approved.**

# ADR-007 — Student Assistance in V1

**Status:** Accepted — wording amended V1.3

Unchanged: V1 student assistance is served only from approved HintSetVersions; runtime-generated adaptive hints are V1.5.

**Correction:** HintSetVersions are pinned **transitively** through the QuestionVersion frozen in the StudentChallenge. StudentChallenge has no independent hint pointer. Hint fixes reach new materializations only (see ADR-008).

## V1.4 reconciliation amendments

- The answer-leak check applies to every hint step; no step, including the last, contains the final answer [W7-C2].
- Hints revealed in earlier attempts stay visible on a retry and count in the retry's hints used [W5-4].

# ADR-008 — QuestionVersion Bundle, Compatibility & Topic Identity

**Status:** Accepted — amended V1.3

Unchanged: QuestionVersion is the immutable assessment bundle; material changes create a new version; StudentChallenge freezes versions; late joiners get their own materialization.

## V1.3 rules

**Change classification.** Each new version records two flags: `student_visible_changed` (prompt, options, media, visible tests, response input shape, hints) and `evaluation_changed` (answer key, aliases, rubric, hidden tests, harness configuration, runtime image). **Evaluation compatibility.** A version is *evaluation-compatible* with its predecessor when the student-visible assessment content (prompt, options, visible tests, response input shape) is unchanged. Hint-text changes do not break compatibility.

**Presented vs evaluated version.** A Response always keeps `presented_question_version_id` (immutable: what the learner saw). EvaluationContext pins both `presented_question_version_id` and `evaluation_question_version_id`. The evaluation version must equal the presented version or be an evaluation-compatible successor in the same version chain. A rubric or key fix is therefore applied by regrade (ADR-011) without rewriting what the learner saw.

**Pinning.** ChallengeAssignment pins GradingPolicyVersion and RevealPolicy (ADR-020). LearningPolicyVersion is organization/course-scoped and not pinned per assignment (ADR-014).

**Topic identity.** Topics are stable, organization-scoped identities (status ACTIVE or RETIRED). Renames keep the ID. Merges and splits are recorded in `TopicMapping(from_topic, to_topic,` `weight, effective_at)`; Learning resolves historical observations through the mapping at projection time. Taxonomy changes never force re-versioning of questions.

## V1.4 reconciliation amendments

- Difficulty belongs to QuestionVersion and is a material change creating a new evaluation-compatible version [W3-C1].
- One current published version per Question: publishing retires the previous one with reason SUPERSEDED; retired versions stay usable by frozen challenges, regrades and history [W3-C2].
- A retired version may be reinstated only if it is the latest version, the Question is ACTIVE and the reason is MANUAL; never SUPERSEDED; content never changes [W3-4].
- A failed AI item may be kept (REJECTED_BY_CHECK → DRAFT with `check_failed` and preserved reasons); it bypasses no validation, review or publication check [W3-3].
- With direct publishing off, no author approves their own content, regardless of role; with it on, the author may approve and publish their own content [FD-1, W3-C4].

# ADR-009 — Code Evaluation: Trust Boundary, Languages & Reference Solutions

**Status:** Accepted — amended V1.3. Language list: **Proposed — owner sign-off.**

Unchanged: provider-backed sandbox behind CodeExecutionProvider; Challenge Me owns test semantics and scoring; every executable question has a reference solution; AI-generated tests are validated against it.

## Trust boundary (accepted)

- The sandbox receives only: student source, test **inputs**, the runtime image digest and resource limits. It never receives expected outputs, reference solutions or scoring logic.
- Each test case runs as a separate isolated process invocation with a fresh filesystem.
- The sandbox returns raw observations per test: stdout and stderr (truncated), exit code or signal, wall and CPU time, peak memory, truncation flags.
- **Comparison, scoring and partial credit run in the trusted worker** (Evaluation's code strategy). Because expected outputs never enter the sandbox, student code cannot forge a pass on hidden tests.
- Hidden-test inputs necessarily enter the sandbox, so hidden-test stdout is never shown to learners; they see pass/fail and an outcome category only. **Runtime pinning.** TestSuiteVersion pins `runtime_image_digest` per language; EvaluationContext records it. A runtime upgrade is a new TestSuiteVersion and therefore a new, evaluation-compatible QuestionVersion.
**Outcome classes.**

| Class | Outcomes | Retry |
|---|---|---|
| Student (domain) | WRONG_ANSWER, TIME_LIMIT, MEMORY_LIMIT, RUNTIME_ERROR, COMPILE_ERROR, OUTPUT_LIMIT | Never |
| Provider (infrastructure) | PROVIDER_ERROR, PROVIDER_TIMEOUT, CAPACITY | Yes; persistent failure holds the evaluation until its deadline, then NEEDS_REVIEW |

**Limits and quotas.** CPU, wall time, memory, process count, output bytes, compile time, filesystem size; no network; non-root. Submission limits per attempt and per learner per day; execution-seconds per tenant recorded in the UsageLedger. **Quality gate.** Before publication: the reference solution passes every test, and the suite must fail at least one known-wrong variant (for example an empty or constant-output solution) so trivially wrong code cannot pass.

**Provider requirements.** Documented isolation model; contractual retention of submitted code and tests acceptable under ADR-006; region recorded; circuit breaker and degradation path tested.

## Proposed language list (sign-off required) — RESOLVED

Python 3 only at launch; a second language selected from the first customers' curricula. **Decision owner:** product. **Deadline:** before Phase 4 code-strategy work.

**V1.4:** resolved by W7-1 — Python 3 only in V1; no other language in V1.

## V1.4 reconciliation amendments

- **Practice runs (DM X9) confirmed** [W5-1]: visible tests only, never evaluated; limits 20 per attempt and 100 per learner per day are owned and enforced by Assessment; Code Execution enforces only the CODE_EXECUTION budget and provider/runtime throughput [W7-C3].
- **V1 language: Python 3 only** [W7-1]; further languages are added by runtime image without domain-model change. The "Proposed language list" sign-off is resolved.
- Default sandbox limits (CPU 5 s, wall 10 s, memory 256 MB, output 64 KB, 64 processes, 50 MB file system, compile 20 s, ≤ 50 tests) are implementation defaults; Content may tighten, never loosen [W7 CX-4].
- `Submission.is_final` is dropped; one submission per attempt is enforced by uniqueness (DM X12).
- `code_evaluation` not entitled: code questions cannot be published or assigned; existing code submissions go to teacher review (PROPOSED DEFAULT, W11 PE-7).

# ADR-010 — Short Text & Structured Response Evaluation

**Status:** Accepted — amended V1.3

Unchanged: short text uses a hybrid strategy; structured responses are evaluated per their ResponseSpecification.

## V1.3 rules

**Tri-state deterministic outcome.** Deterministic strategies return `MATCH_CORRECT`,` MATCH_INCORRECT` (the answer matches an explicitly defined wrong answer) or `NO_DETERMINATION`. Deterministic authority applies only to the two MATCH outcomes. A non-match is not an objective "incorrect".

**Answer modes (declared in ResponseSpecification).**

| Mode | Behaviour on NO_DETERMINATION |
|---|---|
| CLOSED | treated as incorrect (the accepted-answer list is exhaustive) |
| OPEN_SEMANTIC | escalates to AI + Rubric; if AI is unavailable or not consented, NEEDS_REVIEW |

**Known misconceptions.** Explicit wrong answers may carry a misconception tag, which becomes a learning signal (repeated-mistake detection in ADR-014).

**Shared text normalization library** (versioned; `normalizer_version` recorded in EvaluationContext): Unicode NFKC; Arabic diacritics (tashkeel) and tatweel removal; alef variants unified; alef maqsura/yaa and taa marbuta/haa unification configurable per specification; Arabic-Indic and Eastern Arabic-Indic digits converted to Western digits; Arabic decimal separator handled; whitespace and Latin case folding. The same library is used by evidence verification (ADR-015).

# ADR-011 — Evaluation Record & Authority Model

**Status:** Accepted (new). Resolves F1, F23, F34.

**Context.** V1.2 described OVERRIDDEN as a state produced on an existing evaluation while also declaring evaluation history append-oriented, and it had no authoritative pointer to the evaluation that counts. Concurrent regrades and overrides could both win.

## Decision

1. **Immutable results.** Scores, component results and criterion results are immutable once an Evaluation leaves PENDING. Only lifecycle status may change. A different result is always a new Evaluation.
2. **Origin.** Every Evaluation has an origin: AUTOMATED, REGRADE, TEACHER_PRIMARY, TEACHER_OVERRIDE or DISPUTE_RESOLUTION. Human origins (TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION) outrank machine origins (AUTOMATED, REGRADE).
3. **Head pointer.** `ResponseEvaluationHead(response_id, tenant_id, current_evaluation_id,` `revision, human_authored)`. Every head change is a compare-and-set on `revision` in the same transaction that inserts the new Evaluation and marks the previous one SUPERSEDED with `superseded_by`. The losing writer re-reads and re-decides.
4. **Human decisions are protected.** A machine-origin writer that finds `human_authored = true` does not move the head. It stores its result as a candidate Evaluation in NEEDS_REVIEW and creates a ReviewTask. If the teacher rejects the candidate it becomes DISCARDED.
5. **OVERRIDDEN is derived.** "Overridden" means the head's origin is TEACHER_OVERRIDE. It is a label, not a state written onto another record. Cross-ADR Rule 2 is restated accordingly.

## Evaluation states

| State | Meaning |
|---|---|
| PENDING | runs in progress; no result yet |
| PROVISIONAL | result available; may auto-confirm per ADR-015 |
| NEEDS_REVIEW | human decision required (low confidence, run failure, conflict, dispute, budget hold expiry) |
| CONFIRMED | final unless superseded |
| SUPERSEDED | replaced by a later head |
| DISCARDED | machine candidate rejected by a human |

Run failures live on EvaluationRun. When every required run fails, the Evaluation moves to NEEDS_REVIEW with reason RUN_FAILURE; there is no FAILED evaluation state.

## Learner-facing mapping

| Internal | Learner sees |
|---|---|
| PENDING within latency budget | Evaluating |
| PENDING beyond latency budget | Evaluating — you can continue |
| PROVISIONAL | Provisional result |
| NEEDS_REVIEW (any reason) | Your teacher will review this |
| CONFIRMED | Final result |
| Head replaced after learner viewed a result | Updated, with a reason category |

Learners never see "failed". Staff see the underlying reason.

## Human actions

- **Confirm unchanged:** status transition PROVISIONAL → CONFIRMED, recording `confirmed_by`; no new record.
- **Change the result:** new Evaluation with origin TEACHER_OVERRIDE, mandatory reason code and optional note; audited.

## Disputes

`Dispute(response_id, raised_by: LEARNER|GUARDIAN|STAFF, reason, status: OPEN → UNDER_REVIEW →` `UPHELD | REJECTED | WITHDRAWN)`. A dispute creates a ReviewTask; UPHELD produces an Evaluation with origin DISPUTE_RESOLUTION. Disputes are allowed on PROVISIONAL and CONFIRMED results within a dispute window (default 14 days) with per-organization limits (default one open dispute per response).

## Bulk regrade

`RegradeRequest(scope, target_evaluation_question_version | target_grading_policy_version,` `mode: DRY_RUN|EXECUTE, status: DRAFT → PREVIEWED → APPROVED → RUNNING → COMPLETED | FAILED |` `CANCELLED)`. Requires staff approval with recent authentication. Executes in chunked jobs under admission control. The preview reports responses affected, results changed and mean change. Human-authored heads produce one grouped ReviewTask rather than thousands. Learner notification policy per request: NONE, CHANGED_ONLY or MATERIAL_ONLY (default MATERIAL_ONLY: change at or above a configured threshold).

## Report corrections (F34)

A result change affects an already-sent ReportSnapshot only when it crosses the material threshold; corrections are batched into the next scheduled report unless a teacher marks the correction urgent.

**Consequences.** Learning consumes head changes only (ADR-014). Reporting reads heads. The head row is the single concurrency point for grading.

## V1.4 reconciliation amendments

- **Revision rule (DM X3):** the head revision increments when the current evaluation changes, when its result arrives and when it is confirmed.
- **Human lock (DM X8):** `human_locked` = authored or confirmed by a human; auto-confirm does not lock; machine writers store a candidate instead of moving a locked head; no review task when the candidate equals the human result [W6 HD-4].
- Exactly one head per **evaluable** submission (ON_TIME, LATE_ACCEPTED); LATE_HELD and LATE_REJECTED submissions have none [W6-C5].
- Item grade = best weighted total among evaluated attempts [W6-3]; challenge grade uses all items as denominator with a "Not attempted" count [W6-4]; neither is stored in the head or the evaluation summary.
- Disputes only on a score visible to the learner, within 14 days, not on a DISPUTE_RESOLUTION result, at most one open per submission; dispute text never sent to AI [W6 DI].
- Bulk regrade: the approver is never the requester [FD-1]; recent authentication; learner notification means the "Updated result" state only, no message [W6 RG-6, W6-1].
- Report corrections: material = an item's correctness flips or a reported challenge grade changes by at least 10% of its maximum; no pass/fail concept in V1 [W9-C1].

# ADR-012 — Tenant Context, Database Roles & Elevated Access

**Status:** Accepted (new). Resolves F2 and part of F26.

## Database roles

| Role | Used by | Rights |
|---|---|---|
| cm_migrator | migration pipeline only | schema owner; never used at runtime |
| cm_app | API, workers, scheduler, projections | DML on module schemas; subject to RLS; not owner; no BYPASSRLS |
| cm_queue | worker dequeue path | queue and admission tables only; no domain tables |
| cm_ops_read only | break-glass sessions | read-only; BYPASSRLS; every statement audited |

## Row-level security

- Every tenant-owned table has RLS **enabled and forced** (so even an owner connection cannot bypass it by accident).
- Policies compare `tenant_id` with` current_setting('app.tenant_id', true)`. When the setting is absent the comparison yields no rows: **fail closed**.
- Global/reference tables (plan catalogue, languages, runtime images, platform-shared ChannelAccounts, platform templates) carry no tenant_id, are read-only to cm_app, and are listed in a global-table registry.
- CI test: every table either has tenant_id with forced RLS or is in the registry.

## Tenant context

- Context is set only by the `TenantTransaction` wrapper, at the start of each transaction, with transaction-local settings (`set_config(..., true)`):` app.tenant_id`,` app.actor_id`,` app.actor_kind`. Transaction-local settings are safe under transaction-mode connection pooling.
- Session-level SET is prohibited (lint rule).
- ActorContext kinds: StaffActor (user, organization, scoped roles), LearnerActor (learner, session scope), GuardianActor, and **SystemActor(tenant, purpose)** with purpose SCHEDULER, WEBHOOK, WORKER, PROJECTION or REGRADE and an explicit permission set per purpose.

## Worker path

Dequeue as cm_queue on its own connection pool → open a cm_app TenantTransaction with the job's tenant_id → load the job's primary entity. Under RLS a cross-tenant entity is invisible; a missing entity is classified POISON and raises a security alert.

## Webhooks

The tenant is resolved from trusted mappings (ChannelAccount and provider identifiers, ADR-004), never from payload fields.

## Caches and storage

- Cache keys include tenant_id and version; in-process caches hold immutable data only (e.g. published QuestionVersions).
- Object keys: `{tenant_id}/{entity_type}/{random_uuid}`. Signed URLs are issued only after authorization; lifetime at most 5 minutes for downloads and 15 minutes for uploads. Uploads are validated (size, content sniffing, allowed types) before an entity may reference them. No public buckets.

## Elevated access (break-glass)

`ElevatedAccessGrant(requester, approver ≠ requester, reason, ticket, tenant scope, expires_at` `≤ 4 hours, read_only = true by default)`. Sessions use cm_ops_readonly; all statements are audited to the security audit log. Cross-tenant **writes** happen only through reviewed data-repair scripts that run per tenant as SystemActor. Platform analytics never query tenant tables; they consume the de-identified aggregate pipeline (ADR-005).

## Tests

Cross-tenant suite (every endpoint called as organization B with organization A identifiers); RLS coverage test; pooled-connection context-leak test; job tenant-mismatch test.

## V1.4 reconciliation amendments

- **Resolver role (DM X1):** `cm_resolver` (NOLOGIN, BYPASSRLS) owns a closed, audited set of SECURITY DEFINER resolver functions returning identifiers only (staff memberships, capability token and session, invitation, inbound channel, delivery by provider message). The table registry has five categories: tenant-owned, reference, global identity, operational, platform.
- **Platform organization (DM X7):** a reserved platform organization owns platform AI operations, usage and gate runs; shared channel accounts and cross-tenant suppression (HMAC only) live in platform tables.
- Platform-level audit events are recorded under the platform organization [W1 F-1]; break-glass access is visible in the affected organization's audit log [FD-4]; a rejected elevated-access request is recorded as REVOKED with reason REJECTED [W1 F-5].

# ADR-013 — Module Ownership & Inter-Module Communication

**Status:** Accepted (new). Resolves F3, F5, F17 (part), F18.

## Modules and ownership

| Module | Owns |
|---|---|
| Identity & Access | User, Membership, RoleAssignment (role × scope), staff sessions, CapabilityGrant, OTP challenges |

| Module | Owns |
|---|---|
| Roster (new) | Learner, Guardian, GuardianLink, ContactPoint, ContactPointLink, Course, Cohort, Enrollment, learner merge |
| Tenancy & Billing | Organization, Plan, Subscription, Entitlement, UsageLedger, Reservation, organization settings |
| Privacy & Consent | ChannelConsent, ProcessingConsent, ConsentPolicy, RetentionPolicy, DeletionRequest, classification register, data-region policy |
| Content | Topic, TopicMapping, Question, QuestionVersion bundle, SourceDocument, extraction artifacts, approval, provenance, imports |
| Challenge | ChallengeDefinition, ChallengeAssignment, StudentChallenge, RevealPolicy, DeliveryIntent (challenge and reinforcement) |
| Assessment Runtime | Attempt, Submission/Response, Draft, HintEvent, student-facing DTOs |
| Evaluation | EvaluationPlan, EvaluationContext, EvaluationRun, Evaluation, CriterionResult, ResponseEvaluationHead, Dispute, RegradeRequest, GradingPolicyVersion, ConfidencePolicyVersion |
| Learning | LearningEvent, TopicState, ReinforcementItem, LearningPolicyVersion |
| Communication | ChannelAccount, Template, Message, Delivery, webhook normalization, OtpSender |
| Review | ReviewTask, assignment, SLA, resolution records |
| Reporting | ReportSnapshot, read models, DeliveryIntent (report delivery) |
| AI Platform | AIOperation, capability contracts, PromptVersion, ModelSnapshot, CapabilityRoute, GoldenDataset, GateRun |
| Code Execution | provider adapter, sandbox request/response contract |

## Communication mechanisms (the only two permitted)

- **A. Synchronous public service call.** Allowed inside the caller's transaction only when the callee performs local database work in the same database as part of the same user command (example: Assessment `SubmitResponse` → Evaluation` CreatePendingEvaluation`). No network I/O inside.
- **B. Asynchronous domain event.** An event is a job enqueued **in the same transaction** as the state change. The PostgreSQL queue is the outbox. Events carry a stable event_id; consumers are idempotent. **Forbidden:** post-commit in-memory event dispatch; access to another module's tables; shared ORM entities across modules; provider SDK imports outside adapter packages.
**Enforcement.** One PostgreSQL schema per module; each module's data access touches only its schema. Architecture tests enforce dependency direction.

## Key interactions

| From → To | Mechanism | Contract |
|---|---|---|
| Assessment → Evaluation | A | CreatePendingEvaluation |
| Evaluation → Learning | B | EvaluationHeadChanged |
| Learning → Challenge | B | ReinforcementItemCreated / Cancelled |
| Challenge → Communication | B | DeliveryIntentCreated |
| Reporting → Communication | B | ReportDeliveryIntentCreated |
| Any owner → Review | A | CreateReviewTask(subject_type, subject_id, task_type, payload_ref) |
| Review → owner | B | ReviewResolved(task, decision) — the owner executes the decision |
| Privacy → all consumers | B | ConsentChanged, DeletionRequested |

Only Challenge and Reporting create delivery intents. Learning never does. Review imports no owner module.

## V1.4 reconciliation amendments

- **Review decisions (DM X4):** decisions are commands to the owning module, which calls `Review.CompleteTask` in the same transaction (mechanism A); `ReviewResolved` is informational.
- **Delivery ownership (DM X13):** producers emit `DeliveryRequested`; Communication creates and owns the Delivery; no DeliveryIntent is owned by Challenge or Reporting.
- Challenge may call `Roster.ResolveLearners(pseudonyms)` for reinforcement planning only [SC3].
- Review tasks for a submission route by the assignment's cohort; that cohort's teachers keep review, override and dispute rights for those submissions after the learner leaves [W6-6].
- Roster events `GuardianLinkEnded` and `LearnerMinorStatusChanged` [W2-C4]; `LearnerDeleted` / `GuardianDeleted` [W10].

# ADR-014 — Learning Observation & Projection Semantics

**Status:** Accepted (new). Resolves F4, F17 (part), F35.

## Events

- `ObservationRecorded(response_id, evaluation_id, head_revision, topic_weights,` `score_components, misconception_tags, hinted, attempt_no, provisional)`
- `ObservationReplaced(response_id, previous_evaluation_id, new_evaluation_id, head_revision)`
- `ObservationRetracted(response_id, reason)` — for learner removal or deletion. Events are keyed by (response_id, head_revision); duplicates are ignored. A consumer applies an event only if its revision is greater than the stored revision, which makes out-of-order delivery safe.

## Projection rule: replace, never accumulate

TopicState for a learner and topic is a pure function of the set of **effective observations** (one per response: the latest head revision) and the LearningPolicyVersion. A new evaluation replaces its response's contribution; compensating events are audit records, not arithmetic. The live projection and a full rebuild use the same function; a property test asserts they are equal.

## LearningPolicyVersion (owned by Learning)

Holds topic scoring, evidence thresholds for Strong / Needs Practice / Insufficient Evidence, provisional weighting (proposed default 0.5), repeated-mistake detection and reinforcement rules. These rules move out of GradingPolicy. LearningPolicyVersion is organization/course-scoped because TopicState spans many assignments; a policy change triggers a projection rebuild, and TopicState records the version used.

## Reinforcement

ReinforcementItem states: PENDING → SCHEDULED → DELIVERED | CANCELLED | SUPERSEDED | EXPIRED. Each item records its basis (observation IDs and head revisions). Immediately before delivery Challenge asks Learning to revalidate; if any basis revision is no longer current or the rule no longer holds, the item is CANCELLED.

## Rebuilds and growth

Rebuilds run per learner, per learner × topic, or per tenant. Global rebuild is an offline operation. Topic mappings (ADR-008) are applied at projection time. Learning events are append-only; time partitioning is introduced when measured volume requires it.

## V1.4 reconciliation amendments

- Revalidation happens at planning **and** when the reinforcement student challenge opens; invalid → cancelled (REINFORCEMENT_INVALIDATED), nothing sent [SC4, W4-C6].
- The reinforcement creation rule lives in LearningPolicyVersion (one open item per learner × topic, 7-day topic spacing, 48-hour delay, rolling 7-day cap of 2 with postponement, 14-day unscheduled expiry) [W8-1, W8-C3]; the frequency cap is enforced only by Learning [W4-C5]; an unplannable item expires with NO_ELIGIBLE_QUESTIONS and sends nothing [W8-C2].
- Reinforcement selection: up to 3 eligible questions, no top-up; repeats only from previously wrong questions when the eligible pool is empty [W4-1].
- Learning deletion deletes rows; RETRACTED is unused in V1 [W10-C3].

# ADR-015 — Evaluation Composition, Confidence & Confirmation

**Status:** Accepted (new); numeric defaults **Proposed — owner sign-off after golden-set** **calibration**. Resolves F7, N1, F18, F33.

## Composition

EvaluationPlan is derived from ResponseSpecification and GradingPolicyVersion as ordered steps. Each step declares its strategy, the components it owns, whether it is required, and `on_missing` ∈ {HOLD, RENORMALIZE, REVIEW}. **Correctness authority is structural.** Correctness components can only be produced by deterministic strategies (MATCH outcomes, code execution). The result type returned by AI strategies cannot carry correctness components, so the composer cannot accept one.

**Partial-failure defaults.**

| Situation | Default |
|---|---|
| Code execution failed (infrastructure) | HOLD until deadline, then NEEDS_REVIEW |
| AI quality step failed, correctness known | RENORMALIZE if the policy allows, else REVIEW; learner sees available components |
| Deterministic NO_DETERMINATION, OPEN_SEMANTIC | AI + Rubric step; if unavailable or not consented, NEEDS_REVIEW |

## Confidence

Confidence in [0, 1] is computed by ConfidencePolicyVersion from: agreement across runs (two runs by default for essays; score is reduced by the largest criterion-level disagreement), evidence verification rate (share of scored criteria with verified evidence, using ADR-010 normalization with whitespace and punctuation tolerance), validator outcomes (any failure sets confidence to 0), prompt-injection detection (a flag sets it to 0), and the operation prior (the capability's golden-set agreement, which caps confidence). Model self-reported confidence is not an input.

## Decision rule

| Condition | Result |
|---|---|
| Deterministic only | CONFIRMED immediately |
| AI involved, confidence ≥ auto_confirm_threshold | PROVISIONAL; auto-confirms after confirm_delay (proposed 48 h) if no dispute or teacher action |
| review_threshold ≤ confidence < auto_confirm_threshold | PROVISIONAL, no auto-confirm; teachers can bulk-confirm |
| confidence < review_threshold | NEEDS_REVIEW |

**Platform floor.** review_threshold cannot be set below a platform minimum (proposed 0.4); validator failures and injection flags always require review. Organizations may only make thresholds stricter.

**Teacher Review as a strategy.** A Teacher Review step creates a ReviewTask; the teacher's result is an Evaluation with origin TEACHER_PRIMARY in state CONFIRMED (not an override).

**Review rate** per organization, course and capability is a monitored metric with an alert above a configured target.

## V1.4 reconciliation amendments

- **Authority tags (DM X2):** each component carries authority DETERMINISTIC, SEMANTIC_AI or HUMAN. **Cross-ADR Rule 9 restated:** a component determined by a deterministic strategy can never be produced or changed by AI; an AI step may supply correctness only when the plan marks it `on_no_determination` and the deterministic step returned NO_DETERMINATION; SEMANTIC_AI correctness is never confirmed instantly.
- Unconfirmed SEMANTIC_AI results stay PROVISIONAL; after 14 days an EVALUATION_REVIEW task (UNCONFIRMED_SEMANTIC) is escalated to the admin scope; never auto-confirmed [W6-2, W6-C2].
- Evaluations record `performance_score` and `total_score`; hint penalty and retry weight are applied exactly once [W6-C4]; "full marks" for retry eligibility uses performance score [W6-C1].

# ADR-016 — Learner & Guardian Capability Sessions, OTP & Rate Limiting

**Status:** Accepted (new); numeric values **Proposed — owner sign-off**. Resolves F8, F27.

## Capability grants

Tokens are opaque random values of at least 128 bits, stored hashed and looked up server-side (revocable, unlike self-contained tokens): `CapabilityGrant(id, token_hash, tenant_id, subject:` `LEARNER|GUARDIAN, scope, expires_at, family_id, revoked_at)`.

| Scope | Allows | Step-up |
|---|---|---|
| STUDENT_CHALLENGE:id (default) | view and answer that challenge | none |

| Scope | Allows | Step-up |
|---|---|---|
| LEARNER_HOME | history, progress, other challenges | OTP to a verified ContactPoint linked to the learner |
| REPORT_SNAPSHOT:id | read one guardian report | none |
| GUARDIAN_HOME | guardian history | OTP |

## Link exchange (pre-fetch safe)

```
GET  /c/{token}   -> inert landing page: no state change, no learner data,
                     noindex, Referrer-Policy: no-referrer, Cache-Control: no-store
POST /c/exchange  -> validates grant, issues session cookie
                     (HttpOnly, Secure, SameSite=Lax; challenge scope <= 12 h)
                  -> redirect to a URL without the token
```

Link-preview fetchers and security scanners only issue GET requests and therefore never consume or activate a grant. Challenge grants allow several exchanges (device changes) until expiry; each exchange is audited; exchanges from more than a configured number of distinct devices require OTP.

**Revocation** by grant, by family (on re-issue), by learner, on ContactPoint unlink and on enrollment end.

## OTP

Six digits, 5-minute lifetime, 5 attempts per code, 3 sends per 15 minutes per ContactPoint, stored hashed. Sent through the `OtpSender` capability in Communication (WhatsApp authentication template, SMS or email adapters).

## Rate limiting

Coarse per-IP and per-route limits at the edge (CDN/WAF). Application limits for OTP, token exchange, submission and disputes in PostgreSQL sliding-window tables. No Redis unless a measured workload requires it.

## V1.4 reconciliation amendments

- **Step-up wording [W2-C3]:** OTP is sent to an ACTIVE ContactPoint linked to the learner or guardian, verified or not; a correct code verifies it.
- `OtpSender` uses WhatsApp authentication templates or email; no SMS adapter is active in V1 [W4-5].
- Issuing a new grant does **not** revoke earlier ACTIVE grants for the same learner and scope; device limit counted across them; only staff "reset link" or a security event revokes the family [SC1]. The token is never stored in a message body [SC2].
- STUDENT_CHALLENGE grants expire at closes_at + 14 days and are read-only after close; expiry moves with an extension [W4-C2, W4-4]. Read-only review refuses attempts, retries, drafts, hints and practice, except the single late submission [W5-C2].
- Staff-issued links (copy or print), off by default, audited [W2-2]. `GuardianLinkEnded` revokes that guardian's grants and sessions for that learner only [W2-C4, W4-C7].

# ADR-017 — AI Model Lifecycle, Quality Gates & Reproducibility

**Status:** Accepted (new); gate thresholds **Proposed — owner sign-off after calibration**. Resolves F11, F15, F28, F36.

**Reproducibility means auditability.** For every AI operation Challenge Me stores: input payload reference, rendered-prompt hash and PromptVersion, ModelSnapshot (dated identifier, never an alias), parameters, output payload reference, validator results and usage entry. Re-execution producing the same output is not promised.

**Registries.**

- `ModelSnapshot(provider, dated_model_id, regions, retention/DPA terms, status: APPROVED |` `DEPRECATED | RETIRED)`
- `CapabilityRoute(capability, data_region_policy) → ordered list of (PromptVersion,` `ModelSnapshot)` pairs that have passed gates.
**Fallback.** Only to another pair in the route. If none is available: evaluation → HOLD, then NEEDS_REVIEW at deadline; generation → teacher-visible failure with retry.

**Quality gates (GateRun records).**

- Evaluation capabilities: agreement with teacher grades on the golden set at or above threshold, per language and response type; Arabic/English parity check.
- Generation capabilities: schema validity and solve-check pass rate at launch (teacher approval already sits in front); teacher acceptance rate monitored in production.
- Deprecation or retirement of a snapshot triggers gates for its replacement. No silent model switch.
- Regrades use the current routed pair and record it. **Operation authority.** AIOperation is authoritative for provider execution. AI EvaluationRuns reference `ai_operation_id` and derive their state from it. Cost exists only in the UsageLedger; runs reference usage entries.
**Idempotency key** = hash(capability, subject_type, subject_id, context_hash, attempt_no). A retry first looks for a SUCCEEDED operation with the key. When a provider timeout may still complete and bill, the duplicate cost is accepted and reconciled daily against provider usage reports.

**Student-response injection defence.** Learner content is delimited as data; instruction hierarchy in prompts; evaluators have no tools or side effects; structured output only; evidence grounding; an injection classifier flag sets confidence to 0 (ADR-015).

**Answer-leak check.** Runtime feedback is compared with the answer key, reference solution and hidden tests (exact values and n-gram overlap). A leak triggers one regeneration; a second leak withholds feedback (the score stands) and flags review.

**Regional capability matrix.** Each data-region policy lists which providers may serve each capability. If none may, the capability is disabled for that organization, shown at onboarding; evaluation then uses deterministic and teacher-review paths.

**Golden-set priority.** Strict gates for EvaluateResponse (every response type, both languages) at launch; lighter gates for generation capabilities.

## V1.4 reconciliation amendments

- **GenerateFeedback (DM X5):** feedback is a separate capability run from the immutable criterion results; leak regeneration repeats only GenerateFeedback.
- **Idempotency (DM X6):** the key uses `request_id` instead of `attempt_no`; retries reuse it; regeneration creates a new request.
- The answer-leak check covers the model solution and explanation [W6-C3], and every hint step [W7-C2].
- Consent gate applies to every capability whose inputs contain learner content or content materially derived from it [W7-C1].
- Provider eligibility (no training on Challenge Me or customer data; zero retention where offered; processing region; data-region policy) is checked before a route becomes ACTIVE, never at runtime; subject to LG-9 [W7-4]. Golden data per ADR-005 amendment [W7-2].
- Organization switches for AI marking and AI generation (audited, within entitlements); queued operations fail DISABLED; marking falls back to teacher review [W7-3]. DetectSafeguardingSignal inactive in V1 [W7-5].
- Budget hold: a new operation for a held step only if no provider operation was started for that step [W11-C4].

# ADR-018 — Onboarding, Roster Import & Consent Acquisition

**Status:** Accepted (new); legal basis per market **Proposed — counsel sign-off**. Resolves F13.

- **RosterImport:** CSV/XLSX upload → asynchronous ImportJob (idempotent by file hash and organization) → row validation (E.164 normalization, duplicates, guardian linkage, cohort mapping) → preview with row-level errors → commit creates Learners, Guardians, ContactPoints, links and Enrollments. Re-import upserts by `external_ref`.
- **QuestionImport:** structured CSV/XLSX template per question type. Imported items enter as drafts; teachers with publish permission may publish them directly; they never bypass versioning.
- **Consent acquisition:** ConsentRequest sent as a capability link (ADR-016) to the learner or guardian through a channel the market's rules allow for first contact (for example the organization sharing the link itself, or email). The consent page lists purposes separately (WhatsApp messages, AI processing, guardian reporting) and records ChannelConsent and ProcessingConsent with the grantor. Organizations send consent requests in batches and see consent coverage on their dashboard.
- **Before consent:** learners can still use web links shared by the organization where market policy allows; AI evaluation routes to deterministic or teacher-review paths; no WhatsApp business-initiated messages.

## V1.4 reconciliation amendments

- Consent requests follow the link recipient rule [W2-1].

# ADR-019 — Consent Model

**Status:** Accepted (new); grantor rules per market **Proposed — counsel sign-off**. Resolves F22, N2.

| Record | Key | Purposes |
|---|---|---|
| ChannelConsent | tenant × ContactPoint × channel × purpose | CHALLENGE_DELIVERY, REMINDERS, REPORTS |
| ProcessingConsent | tenant × Learner × purpose | AI_PROCESSING, GUARDIAN_REPORTING (extensible) |

Both carry status (GRANTED, WITHDRAWN, EXPIRED), source, evidence, policy version and timestamps. ProcessingConsent also records `grantor_type` (LEARNER, GUARDIAN, ORGANIZATION_ATTESTED) and grantor ID.

**ConsentPolicy** per market and organization decides whether a guardian must grant for learners under a market-defined age and whether organization attestation is acceptable. Proposed default: guardian grant required for minors as defined by the market; learner grant otherwise.

**Shared phones.** Channel consent applies to messages sent to that contact; processing consent is per learner, so siblings sharing a phone have independent AI and reporting consent.

**Enforcement.** Checked at enqueue **and again at dispatch** inside the worker immediately before the provider call. Withdrawal before the call cancels the job; withdrawal during an in-flight call discards the result (not written to the learner record) and purges the payload. `ConsentChanged` cancels queued deliveries and jobs.

## V1.4 reconciliation amendments

- Consent applies to learner content and content materially derived from it [W7-C1].
- `LearnerMinorStatusChanged` re-evaluates applicable consent rules and never grants or revokes consent; `GuardianLinkEnded` keeps consent history; validity per LG-3 [W2-C4]. Withdrawal is not retroactive (LG-5).

# ADR-020 — Assessment Runtime Integrity

**Status:** Accepted (new); reveal default **Proposed — owner sign-off**. Resolves F16, F30.

**Student-safe contracts.** Content exposes `StudentQuestionView`, built from an explicit allow-list, and `EvaluatorQuestionView`. Assessment Runtime only ever receives StudentQuestionView and structurally cannot serialize protected fields. Every student endpoint has a serialization snapshot test, and a canary test seeds answer keys, hidden tests and rubrics with unique marker strings and asserts they never appear in any student response.

**RevealPolicy** (pinned at ChallengeAssignment): what is revealed (score, feedback, correct answer, explanation, model solution, visible test results) and when (IMMEDIATE, AFTER_CHALLENGE_COMPLETE, AFTER_DUE_DATE, NEVER). Proposed default: score and feedback immediately; correct answers, explanations and model solutions after the due date, which limits answer-sharing within a cohort.

**Attempts and submissions.** `Attempt(student_challenge_id, question_version_id, attempt_no)`; `Submission(attempt_id, idempotency_key, client_submitted_at, server_received_at, is_final)`. Drafts are autosaved separately and never evaluated. One final submission per attempt. Retries permitted by GradingPolicy create a new Attempt.

**Late and offline submissions.** Client clocks are untrusted. A submission received after expiry is accepted only within the policy's offline grace (default 0) and is flagged LATE; teachers may accept late work explicitly.

## V1.4 reconciliation amendments

- **Late work (DM X10) resolved [W4-6, W5-C1]:** beyond grace the submission is stored as LATE_HELD and not evaluated until a teacher accepts it; teacher rejection or 14 days → LATE_REJECTED with reason TEACHER or HOLD_EXPIRED; the late path also applies to ABANDONED (EXPIRED) attempts within the late window.
- `is_final` is dropped; one submission per attempt by uniqueness (DM X12). This is Challenge Me's stored record; downstream work may run more than once (J-6) [W5].
- **Reveal:** answer-revealing content is never shown before the assignment's closes_at, whatever the policy says; AFTER_DUE_DATE is read as after close [W4-C1]. Retries never bypass reveal [W5-3]. Provisional results labelled "Provisional" [W6-5]; no delayed-result notification [W6-1]. The default reveal policy remains a sign-off item within this constraint.
- Learners may answer in any order and finish early (`FinishChallenge`); unanswered items are "Not attempted" [W5-2]. Integrity facts recorded by Assessment, no content; LG-7 [W5-5].

# ADR-021 — Usage, Budgets & Reservations

**Status:** Accepted (new). Resolves F19.

- `Reservation(tenant_id, pool, estimate, operation_ref, status: HELD | SETTLED | RELEASED |` `EXPIRED, expires_at)`. The estimate is the maximum possible cost (maximum tokens × price; maximum execution seconds).
- Settlement records actual usage and releases the difference. A sweeper expires stale HELD reservations; a daily job reconciles against provider usage reports.
- **Hot-row avoidance:** pool balances use sharded counters; admission uses an approximate read with a bounded overrun (proposed 2% — **superseded: V1 default 0%, Wave 11 BP-2, U1 LOCKED**) rather than serializing all reservations on one row.
- **Pools:** STUDENT_EVALUATION, TEACHER_GENERATION, MESSAGING, CODE_EXECUTION, STORAGE, each with its own exhaustion behaviour. STUDENT_EVALUATION exhaustion holds the work and routes it to review at the deadline; a submission is never rejected or discarded.
- Entitlements are read from Entitlement records, never from feature flags.

## V1.4 reconciliation amendments

- **Overrun (U1, LOCKED):** the V1 default `overrun_pct` is **0%**. Wave 11 BP-2 is authoritative and supersedes this ADR's earlier 2% proposal. Approximate sharded reads can still produce a small overshoot within the reservation window; that is a technical concurrency characteristic, not a commercial budget-overrun allowance.
- Reservation state **SETTLED_LATE**: an operation completing after its reservation expired still settles; usage is never lost from the ledger [W11-C3].
- STUDENT_EVALUATION hold re-checks every 5 minutes until the step deadline, then NEEDS_REVIEW (BUDGET_HOLD_EXPIRED) [W11-C4].
- MESSAGING: OTP and consent requests always sent (overage); challenge messages and reminders wait and expire at challenge close; reports wait for the next period [W11-4]. STORAGE: may block non-essential uploads; never rejects or loses authoritative learner work [W11-C7].
- While SUSPENDED, STUDENT_EVALUATION and CODE_EXECUTION stay usable for marking already-submitted work at the last active limits; no other pool [W11-C6]. Warnings at 80% / 100% (banners plus one Owner email per threshold per pool per period) [W11-5].
- Entitlement keys include `ai_generation` (PROPOSED DEFAULT); organization settings only narrow entitlements [W11 PE-4]. Learner cap: soft to 110% of `max_learners`, then additions and reactivations refused; existing learners unaffected [W11-3]. **Counting rule (U2, LOCKED; closes W11-U1):** only learners whose current status is ACTIVE count (not INACTIVE, MERGED or DELETED), evaluated point-in-time at learner creation or reactivation, not as a period peak. The usage statement reports ACTIVE learners at the end of the statement period; reporting only [US-1].
- Subscription = billing state; organization status = access state by the fixed mapping; only operator security suspension and termination set it directly [W11-C1]. Paid access ended → SUSPENDED 30 days → TERMINATED [W11-1]; PAST_DUE suspended manually only [W11-2]. V1 billing is manual invoicing; no payment gateway in V1 (Wave 11 scope). FINANCIAL retention per ADR-006 amendment [W11-C2].

# ADR-022 — Scheduling & Materialization

**Status:** Accepted (new). Resolves F20.

- ChallengeDefinition stores an RRULE and an IANA time zone (organization default, overridable). Occurrences are computed in local time with the time-zone database, so daylight-saving changes are handled.
- **Occurrence identity:** unique (definition_id, occurrence_local_datetime). The scheduler takes an advisory lock per definition and relies on the unique constraint, so multiple scheduler instances are safe.
- **Materialization:** chunk jobs of at most 500 learners; unique (assignment_id, learner_id). Late joiners materialize on their Enrollment event if the assignment is open.
- **Leavers:** open StudentChallenges move to CANCELLED (reason ENROLLMENT_ENDED), distinct from EXPIRED.
- Organization quiet hours and weekend definitions constrain delivery windows; deliveries are jittered and respect ChannelAccount limits (ADR-004).

## V1.4 reconciliation amendments

- closes_at defaults to due_at and may be later [W4-2]; after opening, extend-only for the whole assignment, no per-learner overrides, audited [W4-4]; cancellation never erases submitted work [W4-3].
- Occurrence states PLANNED, ASSIGNMENT_CREATED, MISSED, SKIPPED; a missed occurrence is created and opened late with its original times if before closes_at, with teachers notified [Wave 4 S-5].
- One reminder 24 h before due if not started, within quiet hours; moves with a due-time change if unsent [G5, W4-4].

# ADR-023 — Operations: DR, SLOs, Migrations, Incidents

**Status:** Accepted (new); targets **Proposed — owner sign-off**. Resolves F25, F31.

**Recovery.** Proposed RPO ≤ 5 minutes (PITR) and RTO ≤ 4 hours. Object-storage versioning with 30-day non-current retention. Restore drill before launch and quarterly; the deletion ledger is re-applied after every restore.

**SLOs (proposed).**

| Indicator | Target |
|---|---|
| Deterministic evaluation, API p95 | < 1 s |
| AI evaluation to first decision, p95 | < 60 s |
| Evaluations exceeding their deadline | < 1 % |
| Delivery success per ChannelAccount (excluding recipient errors) | > 97 % |
| Review backlog age, p90 | < 48 h |
| P0 queue lag, p95 | < 30 s |
| API availability | 99.5 % |
| Sandbox provider error rate | < 1 % |

Alerts use SLO burn rates, plus AI spend against forecast and any P0 dead letter.

**Migrations.** Expand/contract; immutable tables are additive-only; migrations run as cm_migrator in the pipeline before deployment; application code stays compatible with the previous schema for one release.

**Job payload versioning.** Handlers accept payload versions N and N−1. Deployment order: consumers that understand N+1 are deployed before producers emit N+1.

**Runbooks required before launch:** provider outage (AI, sandbox, WhatsApp, email); bad prompt version rollback with targeted regrade; wrong answer key (RegradeRequest); suspected tenant leak; dead-letter replay; projection rebuild; deletion request execution; database restore. **Load profile.** Cohort-deadline burst: 5,000 learners, 80 % of submissions within 20 minutes, mix of 60 % deterministic, 30 % AI and 10 % code; plus peak scheduled delivery. This profile also serves as the ADR-001 benchmark.

## V1.4 reconciliation amendments

- **Paging:** any P0 or P1 dead letter pages on-call; the Domain Model §30 threshold is authoritative over this ADR's minimum [W1 F-2].
- Backup retention 35 days (implementation default, subject to LG-10). Recovery and service targets are sign-off gate 11 [W11 OP-1]. After a restore the external deletion ledger is replayed before reopening (X11); jobs after the restore point may run again (J-6) and affected organizations are told (PROPOSED DEFAULT); lost usage entries are recovered by reconciliation (PROPOSED DEFAULT) [W11 OP-2…OP-4].
- Billing metrics: pool utilization, active holds, reconciliation differences, late settlements [W11].

# ADR-024 — Integration Security: Webhooks, Secrets, Storage, Privileged Actions

**Status:** Accepted (new). Resolves F26.

- **Webhooks:** provider signature verification; replay window (reject timestamps older than 5 minutes where the provider supplies them); de-duplication on unique (provider, provider_event_id); delivery status is monotonic by rank, so regressions (DELIVERED after READ) are ignored; unknown event types are stored and ignored.
- **Secrets:** platform secrets in a managed secret store. Per-tenant provider credentials (for example organization WhatsApp tokens) are envelope-encrypted with a managed KMS key, decrypted only in the worker at use, never logged, and have a rotation procedure.
- **Uploads:** malware scanning of uploaded documents (bought, not built) before extraction; extraction workers access objects only through per-object signed URLs.
- **Privileged staff actions:** MFA and recent authentication (ADR-002); approvals for elevated access require a second person; a bulk-regrade approver is never the requester [V1.4: FD-1].
- **Audit:** security and domain audit events are append-only, tenant-scoped, separate from telemetry, with their own retention class.

## V1.4 reconciliation amendments

- **Privileged approvals:** a regrade approver is never the requester, regardless of organization size [FD-1]; break-glass requires a second platform operator [FD-4, W11 OP-5]; organization termination requires a second operator (PROPOSED DEFAULT, W11 SB-10).

# ADR-025 — Safeguarding Signals

**Status: Proposed — owner sign-off** (product and legal, per market). Resolves F29.

- AI evaluation and document extraction may emit a `SafeguardingSignal` when learner content indicates risk of harm (for example self-harm, abuse disclosure or threats).
- Signals route to the organization's designated safeguarding role (new scope-able role SAFEGUARDING_LEAD; Owner if none is configured). They never enter the normal review queue, are never shown to the learner, never enter analytics, and use a restricted retention class.
- Challenge Me does not make welfare decisions; the organization's own policy governs the response. Detection is best-effort and is described to customers as such.

## V1.4 reconciliation amendments

- **V1: no automated safeguarding detection** [W7-5]. Staff flag answers manually (`FlagForSafeguarding`, audited) to a restricted SAFEGUARDING task visible only to the safeguarding lead (Owner if none); flags never change results; absent from general queues; hidden from learners and guardians. Automated detection stays behind sign-off gate 10.

# Cross-ADR Rules (V1.3)

1. **Consent is an enforcement control**, checked at enqueue and at dispatch.
2. **Human decisions cannot be silently replaced.** A machine-origin result never moves a human-authored evaluation head; it becomes a candidate with a ReviewTask (ADR-011).
3. **Domain truth stays in Challenge Me.** Providers execute infrastructure; they do not define tenancy, authorization, grading semantics or learning state.
4. **Sensitive payloads are minimized** in jobs and telemetry, and every sensitive store has a registered purge handler.
5. **Vendor choices are implementation decisions** recorded in provider-selection ADRs.
6. **V1 remains production-grade**; buying infrastructure does not lower security, auditability, testing, observability or reliability requirements.
7. **Every tenant-owned table has forced RLS** or is registered as global.
8. **No database transaction spans network I/O.**
9. **Only deterministic strategies produce correctness components.**
10. **Evaluation heads change only by compare-and-set.**
11. **Modules communicate only through public services or same-transaction job events.**

**V1.4 reconciliation amendments.**

- **Rule 2** uses `human_locked` (authored **or confirmed** by a human) rather than origin alone [DM X8].
- **Rule 9 restated [DM X2]:** a component determined by a deterministic strategy can never be produced or changed by AI; an AI step may supply correctness only when the plan marks it `on_no_determination` and the deterministic step returned NO_DETERMINATION; SEMANTIC_AI correctness is never confirmed instantly (ADR-015 amendment).
- **Recorded alongside the rules (LOCKED J-6, Wave 1; not a new decision):** jobs may run more than once; handlers guarantee at most one effective domain result; universal exactly-once external delivery is not claimed.
- **Recorded alongside the rules (LOCKED Waves 5–7 and W11-C7; not a new decision):** budget or storage exhaustion never deletes, hides or rejects authoritative learner work and never changes a result.

# Decisions awaiting owner sign-off

| ADR | Decision | Owner | Needed by |
|---|---|---|---|
| ADR-004 | WhatsApp account model (default: per-organization with shared fallback) | Product / commercial | End of Phase 3 |
| ADR-005 | Contract language and de-identification policy (k = 10 default) | Legal | Before launch |
| ADR-009 | V1 code languages (default: Python 3) — **RESOLVED W7-1** | Product | — |
| ADR-015 | Confidence thresholds, confirm delay, platform floor | Product + AI lead, after calibration | Before AI evaluation launch |
| ADR-016 | Session lifetimes, OTP limits, device threshold | Security lead | Before Phase 3 exit |
| ADR-017 | Golden-set gate thresholds per language/type | AI lead | Before AI evaluation launch |
| ADR-018 / ADR-019 | Consent legal basis and minors' grantor rules per market | Legal (per market) | Before first customer in each market |
| ADR-020 | Default reveal policy (constrained by W4-C1: answer-revealing content never before closes_at) | Product | Before Phase 3 exit |
| ADR-023 | RPO/RTO and SLO targets | Engineering lead | Before Phase 9 |
| ADR-025 | Safeguarding policy (V1: manual flag only, W7-5; automated detection behind gate 10) | Product + legal | Before launch with minors |
| ADR-006 / ADR-021 | Legal gates LG-1 to LG-11 (retention, deletion, financial records and others) | Legal (per market) | Before first customer in each market |
