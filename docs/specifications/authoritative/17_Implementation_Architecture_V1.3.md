# Challenge Me — Commercial V1.3 — Implementation Architecture

> Status: Architecture baseline after Architecture Review Board remediation. Supersedes V1.2.
>
> Derived from ADR set V1.3.
>
> Core principle: Build the product. Buy/integrate the infrastructure. Own the domain.

# 1. Architecture Goals

Translate the approved product definition and ADR set V1.3 into an implementation architecture without expanding V1 scope. Primary goals: correctness, tenant isolation, production-grade AI, auditable evaluation, secure learner access, scalable asynchronous processing, observability, maintainability and replaceable infrastructure providers.

Default architecture: modular monolith with separately scaled process types. No microservices, event bus, workflow platform, policy engine or cache without a demonstrated requirement.

# 2. System Topology

```
Browser/PWA ──┐
Staff web  ───┼─► Stateless API ──► PostgreSQL (authoritative store + job queue)
Webhooks   ───┘        │                     │
                       │        same-transaction jobs (queue = outbox)
                       ▼                     ▼
              Object storage        Workers (weighted priority, admission control)
                                        │   AI providers (via AI Platform)
                                        │   Delivery providers (WhatsApp, email, OTP)
                                        │   Document extractor, malware scan
                                        └─► Code execution provider (separate boundary)
```

Conceptual flow: request → domain transaction (state + job) → commit → worker → provider call outside any transaction → new transaction records validated result → head change → learning projection.

# 3. Process Types

| Process | Responsibilities | DB roles |
|---|---|---|
| API | authentication verification, authorization, commands, queries, student DTOs, capability-link exchange | cm_app |
| Worker | evaluation, delivery, AI generation, ingestion, reports, projections, purges, regrades | cm_queue (dequeue) + cm_app (domain) |
| Scheduler | occurrence creation, materialization jobs, deadline sweeps, lease sweeper, reservation sweeper | cm_queue + cm_app as SystemActor |
| Code execution | provider-backed sandbox behind CodeExecutionProvider; receives inputs only; no DB credentials, no internal network | none |
| Migration job | schema migrations in the deployment pipeline | cm_migrator |

The projection worker is a worker work class, not a separate process type.

# 4. Module Ownership

Fourteen modules (ADR-013). Roster is new in V1.3.

| Module | Owns |
|---|---|
| Identity & Access | User, Membership, RoleAssignment (role × scope), staff sessions, CapabilityGrant, OTP challenges |
| Roster | Learner, Guardian, GuardianLink, ContactPoint, ContactPointLink, Course, Cohort, Enrollment, learner merge |
| Tenancy & Billing | Organization, Plan, Subscription, Entitlement, UsageLedger, Reservation, organization settings |
| Privacy & Consent | ChannelConsent, ProcessingConsent, ConsentPolicy, retention, DeletionRequest, classification register, data-region policy |
| Content | Topic, TopicMapping, Question, QuestionVersion bundle, SourceDocument, extraction artifacts, imports, approval, provenance |
| Challenge | ChallengeDefinition, ChallengeAssignment, StudentChallenge, RevealPolicy, delivery intents for challenges and reinforcement |
| Assessment Runtime | Attempt, Submission, Draft, HintEvent, student-facing DTOs |
| Evaluation | EvaluationPlan, EvaluationContext, EvaluationRun, Evaluation, CriterionResult, ResponseEvaluationHead, Dispute, RegradeRequest, GradingPolicyVersion, ConfidencePolicyVersion |
| Learning | LearningEvent, TopicState, ReinforcementItem, LearningPolicyVersion |
| Communication | ChannelAccount, Template, Message, Delivery, webhook normalization, OtpSender |
| Review | ReviewTask, assignment, SLA, resolution |
| Reporting | ReportSnapshot, read models, report delivery intents |
| AI Platform | AIOperation, capability contracts, PromptVersion, ModelSnapshot, CapabilityRoute, GoldenDataset, GateRun |
| Code Execution | provider adapter and sandbox contract |

# 5. Dependency and Communication Rules

Unchanged rules: identity is foundational; Content does not depend on Reporting; Learning does not send messages; Communication does not decide pedagogy; Assessment Runtime does not score; Evaluation does not mutate TopicState; AI Platform does not own business workflows.

V1.3 rules (ADR-013):

- Exactly two communication mechanisms: (A) synchronous public service calls, inside the caller's transaction only for same-database work within one command; (B) asynchronous events enqueued as jobs in the same transaction.
- No post-commit in-memory events, no cross-module table access, no shared ORM entities, no provider SDKs outside adapters.
- One PostgreSQL schema per module; architecture tests enforce direction and schema access.
- Only Challenge and Reporting create delivery intents. Review creates and resolves tasks but executes nothing in other modules; owners act on `ReviewResolved`.
# 6. Identity & Access Flow

**Staff:** IdP authenticates → verified subject → User → Membership → role × scope → ActorContext with exactly one active organization per request. Authorization is evaluated from Challenge Me data per request. Owner/Admin require MFA; sensitive actions require recent authentication.

**Learners and guardians (ADR-016):** opaque, hashed, revocable CapabilityGrants. `GET /c/{token}` renders an inert page; `POST /c/exchange` issues an HttpOnly session and redirects to a token-free URL, so link-preview fetchers and scanners cannot consume grants. Default scope is one StudentChallenge (or one ReportSnapshot for guardians); history requires OTP step-up. **System work:** SystemActor(tenant, purpose) for scheduler, webhooks, workers, projections and regrades, each with an explicit permission set.

# 7. Roster and ContactPoint Model

- ContactPoints are tenant-scoped; one phone number in two organizations is two records.
- ContactPointLink connects a contact to Learners and Guardians. Each outbound delivery addresses (ContactPoint, Learner), and templates name the learner.
- ContactPoint holds verification state only; consent lives in Privacy (Section 23).
- Learner ↔ User linking never crosses tenants; `MergeLearners` handles duplicates within one organization without rewriting learning events.
- Bulk onboarding through RosterImport (Section 24).
# 8. Tenant Isolation (ADR-012)

| Layer | Control |
|---|---|
| Request | ActorContext from authenticated identity; one active organization; resource-tenant re-check on every command |
| Database | roles cm_migrator / cm_app / cm_queue / cm_ops_readonly; RLS enabled and forced on every tenant table; fail-closed policies on current_setting('app.tenant_id', true) |
| Transaction | TenantTransaction wrapper sets transaction-local context; session-level SET prohibited |
| Queue | dequeue as cm_queue; domain work as cm_app under the job's tenant; missing entity under RLS = POISON + alert |
| Webhooks | tenant from trusted ChannelAccount/provider mappings only |
| Cache | keys include tenant and version; in-process caching of immutable data only |
| Storage | {tenant}/{type}/{uuid} keys; signed URLs after authorization (≤ 5 min download, ≤ 15 min upload); validated uploads; no public buckets |
| AI | no cross-tenant batching; tenant-scoped operations and payloads |
| Operations | break-glass ElevatedAccessGrant: second-person approval, ≤ 4 h, read-only default, fully audited; cross-tenant writes only via reviewed per-tenant repair scripts |
| Analytics | platform analytics consume de-identified aggregates only (k ≥ 10) |

CI gates: global-table registry vs forced RLS coverage; cross-tenant endpoint suite; pooled-connection leak test; job tenant-mismatch test.

# 9. Content Model

- Question is the logical identity; QuestionVersion is the immutable bundle (content, ResponseSpecification, RubricVersion, TestSuiteVersion with runtime digest, HintSetVersion, topic weights, objectives, provenance).
- Each version records `student_visible_changed` and` evaluation_changed`, and whether it is evaluation-compatible with its predecessor (ADR-008).
- Topics are stable identities; merges and splits go through TopicMapping, resolved at projection time.
- Content exposes StudentQuestionView and EvaluatorQuestionView contracts (ADR-020).
- AI-generated and imported content follows draft → review → approve → publish.
# 10. Challenge Materialization (ADR-022)

- ChallengeDefinition: RRULE + IANA time zone; occurrence identity unique per (definition, local occurrence time); advisory lock per definition.
- ChallengeAssignment pins GradingPolicyVersion and RevealPolicy.
- StudentChallenge freezes QuestionVersions (hints transitively); materialized in chunks of ≤ 500 learners; unique (assignment, learner).
- Late joiners materialize on enrollment; leavers' open instances become CANCELLED (distinct from EXPIRED).
- Delivery windows respect quiet hours, weekends, jitter and ChannelAccount limits.
# 11. Assessment Runtime (ADR-020)

- Attempt per StudentChallenge item; Submission with client idempotency key, client and server timestamps, one final submission per attempt; drafts autosaved separately and never evaluated.
- The submission is committed before evaluation begins; `SubmitResponse` creates the pending evaluation in the same transaction (mechanism A).
- Only StudentQuestionView is available to Assessment; serialization snapshot tests and canary-value tests guard every student endpoint.
- RevealPolicy controls when answers, explanations and model solutions appear.
- Late submissions beyond the offline grace are flagged LATE for teacher decision.
- HintEvents reference the HintSetVersion inside the frozen QuestionVersion.
# 12. Evaluation Pipeline (ADR-015)

```
Submission committed
  -> CreatePendingEvaluation (EvaluationContext pinned:
       presented + evaluation QuestionVersion, GradingPolicyVersion,
       ConfidencePolicyVersion, normalizer_version, runtime digest)
  -> EvaluationPlan: ordered steps {strategy, components, required, on_missing}
  -> one EvaluationRun per step (AI runs reference AIOperation)
  -> Composer: correctness components from deterministic strategies only
  -> Confidence (policy-computed) -> decision rule -> head compare-and-set
  -> EvaluationHeadChanged job -> Learning
```

Deterministic strategies return MATCH_CORRECT, MATCH_INCORRECT or NO_DETERMINATION; only MATCH outcomes carry deterministic authority. Short-text OPEN_SEMANTIC specifications escalate NO_DETERMINATION to AI + Rubric. Teacher Review steps create ReviewTasks whose results are TEACHER_PRIMARY evaluations.

# 13. Evaluation Record & State Model (ADR-011)

- Results are immutable once an Evaluation leaves PENDING; only lifecycle status transitions are allowed.
- States: PENDING, PROVISIONAL, NEEDS_REVIEW, CONFIRMED, SUPERSEDED, DISCARDED. EvaluationRun: QUEUED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT.
- Origins: AUTOMATED, REGRADE, TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION; human origins outrank machine origins.
- `ResponseEvaluationHead` is the single authority for "current result", changed only by compare-and-set on its revision.
- Machine writers never move a human-authored head: they store a NEEDS_REVIEW candidate and create a ReviewTask.
- "Overridden" is derived: head origin = TEACHER_OVERRIDE.
- Disputes are entities that create ReviewTasks; upheld disputes produce DISPUTE_RESOLUTION evaluations.
- Bulk regrades run through RegradeRequest (preview, approval, chunked execution, grouped review for human heads, notification policy).
# 14. Confidence & Review

Confidence comes from run agreement, evidence verification (ADR-010 normalization), validator outcomes, injection detection and the capability's golden-set prior, under a versioned ConfidencePolicy. Thresholds decide CONFIRMED / PROVISIONAL (with or without auto-confirm) / NEEDS_REVIEW. A platform floor prevents organizations from disabling review; organizations may only tighten. Review rate is a monitored product metric with alerts.

# 15. Async Student Experience

Learner-facing states map from internal states (ADR-011): Evaluating; Evaluating — you can continue; Provisional result; Your teacher will review this; Final result; Updated. Learners never see "failed". Every Evaluation, AIOperation and Delivery has a deadline; the scheduler's deadline sweep escalates overdue work to NEEDS_REVIEW. Budget exhaustion holds work and routes it to review; submissions are never rejected.

# 16. Learning Event Pipeline (ADR-014)

- Events: ObservationRecorded, ObservationReplaced, ObservationRetracted, keyed by (response, head revision); out-of-order and duplicate events are safe.
- TopicState = pure function of effective observations (one per response) under the organization's LearningPolicyVersion. Replace, never accumulate. Live projection and rebuild share the function; a property test asserts equality.
- LearningPolicyVersion owns topic scoring, evidence thresholds, provisional weighting, repeated-mistake detection and reinforcement rules.
- ReinforcementItems record their basis; revalidation before delivery cancels items whose basis changed.
- Rebuilds per learner, learner × topic or tenant.
# 17. Communication Pipeline (ADR-004, ADR-024)

- Challenge or Reporting creates a delivery intent → Communication checks ChannelConsent (at enqueue and at dispatch), resolves ChannelAccount via ChannelAccountAssignment, renders an approved template version, applies throughput limits and quiet hours, calls the provider.
- ChannelAccount supports per-organization and platform-shared models; opt-out scope is (ChannelAccount, contact value).
- Webhooks: signature verification, replay window, de-duplication by provider event ID, monotonic delivery states, tenant from trusted mappings.
- Web link and email are complete substitute channels. OtpSender serves step-up authentication.
- The account-model default awaits sign-off by the end of Phase 3.
# 18. AI Platform Architecture (ADR-017)

- Domain modules call capability contracts (GenerateQuestion, ImproveQuestion, ClassifyQuestion, GenerateExplanation, GenerateVariant, GenerateRubric, GenerateHintSet, EvaluateResponse), never vendor SDKs. A gateway/SDK may normalize providers beneath the capability layer.
- CapabilityRoute maps capability × data-region policy to gated (PromptVersion, ModelSnapshot) pairs. ModelSnapshots are dated, never aliases.
- Fallback only within the route; otherwise HOLD/REVIEW (evaluation) or visible failure (generation).
- Reproducibility is auditability: prompt hash, PromptVersion, snapshot, parameters, payload references, validator results and usage entries are stored in Challenge Me.
- Injection defence for documents and student responses; answer-leak check on runtime feedback; safety filtering; SafeguardingSignal emission (ADR-025, pending sign-off).
# 19. AI Operation Lifecycle

AIOperation: CREATED → QUEUED → RUNNING → SUCCEEDED / FAILED / TIMED_OUT / CANCELLED. AIOperation is authoritative for provider execution; AI EvaluationRuns derive their state from it. Idempotency key = hash(capability, subject, context hash, attempt number); retries check for an existing SUCCEEDED operation. Possible duplicate billing after provider timeouts is reconciled daily. Payloads live in the purgeable payload store; cost lives only in the UsageLedger. Consent (ProcessingConsent AI_PROCESSING) is checked at enqueue and dispatch.

# 20. Document Ingestion

Digital PDF, DOCX, text, notes and OCR for scanned material where the selected extractor meets Arabic quality requirements. Uploads are validated and malware-scanned before extraction. Extraction output is a versioned artifact; workers receive document IDs and per-object signed URLs. Extracted content is untrusted and passes injection defences before generation.

# 21. Code Evaluation Architecture (ADR-009)

```
Evaluation code strategy (trusted worker)
  -> CodeExecutionProvider: source + test INPUTS + runtime digest + limits
       (per-test isolated process, no network, non-root, CPU/memory/PID/
        output/compile/filesystem limits)
  <- raw observations per test (truncated stdout/stderr, exit, time, memory)
  -> comparison, scoring, partial credit in the trusted worker
```

- Expected outputs, reference solutions and scoring logic never enter the sandbox.
- Hidden-test output is never shown to learners.
- Student outcomes (wrong answer, limits, errors) are domain results and never retried; provider outcomes are retried, then held, then reviewed.
- Publication gate: reference solution passes all tests; the suite rejects a known-wrong variant.
- Quotas per attempt, per learner per day and per tenant (UsageLedger).
- Language list pending sign-off (default Python 3).
# 22. Data Classification & Privacy (ADR-006)

- Classes: domain data, sensitive learner payload, operational metadata, derived analytics.
- The classification register lists every sensitive store with a purge handler (responses, AI payloads, evidence by offset, feedback text, review and dispute text, message bodies, code output, documents, customer-derived golden items, report bodies). A CI test enforces registration.
- Deletion fan-out: DeletionRequest → per-store purge jobs → subprocessor deletion requests → completion record. The deletion ledger is re-applied after restores; backup windows are disclosed in DPAs.
- Telemetry and analytics use allow-listed attributes and properties; no SQL parameters, HTTP bodies or free text; no session replay on learner surfaces.
- Organization.dataRegion drives the regional capability matrix (ADR-017).
# 23. Consent Enforcement (ADR-019)

- ChannelConsent (ContactPoint × channel × purpose) and ProcessingConsent (Learner × purpose, with grantor) are separate records.
- ConsentPolicy per market and organization defines guardian grant rules for minors (pending counsel sign-off).
- Checked at enqueue and at dispatch; withdrawal cancels queued work and discards in-flight results with payload purge.
- Missing AI consent → deterministic or teacher-review path. Missing WhatsApp consent → web or email where eligible.
# 24. Onboarding (ADR-018)

- RosterImport: validated, previewable, idempotent, upsert by external reference.
- QuestionImport: structured templates; imported items are drafts under versioning.
- Consent acquisition: batch ConsentRequests via capability links through market-permitted first-contact channels; consent coverage dashboard.
# 25. Billing, Entitlements, Usage & Budget (ADR-021)

- V1 billing is domain-only: Plan, Subscription, Entitlement, Trial, admin-provisioned subscriptions, manual invoicing; PaymentProvider in V1.5.
- Entitlements live in billing data; feature flags are for rollout only.
- Reservations: estimate at maximum cost → HELD → SETTLED / RELEASED / EXPIRED; sweeper and daily reconciliation.
- Sharded pool counters with bounded overrun avoid hot rows.
- Pools: STUDENT_EVALUATION, TEACHER_GENERATION, MESSAGING, CODE_EXECUTION, STORAGE, each with defined exhaustion behaviour; student work is never discarded.
# 26. Queue & Worker Design (ADR-001)

- PostgreSQL-native queue meeting the ADR-001 acceptance criteria; final library chosen after the benchmark.
- Worker rule: claim → commit RUNNING with lease → provider call outside transactions → new transaction with unique result key.
- Leases with heartbeat; sweeper; attempt caps; dead-letter with replay tool.
- Failure classes: INFRASTRUCTURE, RATE_LIMITED, DOMAIN, POISON.
- Admission control per tenant × work class and per provider × account.
- Weighted priority P0–P4 with minimum shares.
- Payloads: payload_version, tenant_id, IDs, correlation ID, idempotency key; no learner content.
# 27. Database Strategy

- PostgreSQL is authoritative. One schema per module. Relational constraints enforce invariants, including uniqueness for occurrences, materializations, results, webhook events and learning-event keys.
- Immutable records: QuestionVersion, GradingPolicyVersion, LearningPolicyVersion, ConfidencePolicyVersion, Evaluation results, ReportSnapshot (redactable), LearningEvent.
- Indexes on tenant_id plus assignment, StudentChallenge, head, evaluation state, queue status, scheduled time and projection keys.
- Read models serve dashboards. Time partitioning is introduced when measured volume requires it.
# 28. API Boundaries

- Domain commands: CreateChallenge, SubmitResponse, RequestDispute, ConfirmEvaluation, OverrideEvaluation, ApproveQuestionVersion, RequestRegrade, ApproveRegrade, MergeLearners, ImportRoster, RequestElevatedAccess.
- Purpose-built DTOs; student DTOs built only from StudentQuestionView.
- Idempotency keys on retryable state-changing commands; compare-and-set revisions on evaluation-changing commands.
# 29. External Provider Interfaces

AuthProvider, EmailProvider, WhatsAppProvider, OtpSender, StorageProvider, AIProvider (beneath capability contracts), CodeExecutionProvider, DocumentExtractor, MalwareScanner; PaymentProvider in V1.5. Adapters translate provider concepts; provider SDK types never reach domain code. Provider selection lives in provider-selection ADRs and configuration, recorded in the subprocessor inventory.

# 30. Observability & Audit

- One primary observability backend; OpenTelemetry-style traces from API through transaction, job, provider and result, with correlation IDs.
- Attribute allow-lists; no learner content, SQL parameters or HTTP bodies.
- Security and domain audit events are append-only, tenant-scoped and separate from telemetry.
- SLOs and burn-rate alerts per ADR-023.
# 31. Testing Strategy

- Unit: domain invariants, strategies, composer authority, confidence policy, normalization library (Arabic cases), projection function.
- Property tests: projection live-vs-rebuild equality; head compare-and-set under concurrency.
- Integration: PostgreSQL, forced-RLS coverage, tenant transactions, queue leases and dead letters, admission control, provider adapters.
- Contract tests for every provider adapter.
- End-to-end: staff auth mapping, capability exchange, challenge completion, each evaluation strategy, review, dispute, regrade, delivery, consent withdrawal, learner deletion.
- AI: golden sets with gates per capability, language and response type; regression on every PromptVersion or snapshot change.
- Code: reference-solution, known-wrong-variant, hidden-test and leakage tests.
# 32. Security Testing Gates

Continuous from Phase 1: cross-tenant suite, RLS coverage, pooled-connection leak, job tenant mismatch, answer-key canary tests, sensitive-logging tests, purge-handler registration.

Before production: capability-token replay, expiry, pre-fetch and forwarding tests; OTP brute-force limits; webhook signature, replay and ordering tests; prompt-injection suites (documents and student responses); storage access tests; sandbox escape and resource-exhaustion tests against the real provider; external penetration test focused on capability sessions and code execution.

# 33. Deployment Topology

- One application image with API, worker and scheduler entry points, scaled independently; migrations run as a pipeline job with cm_migrator.
- Code execution through the external provider boundary.
- Managed PostgreSQL with PITR; object storage with versioning; managed secret store and KMS.
- Redis is not required; introduce it only for a measured need.
- Deployment order respects payload versioning: consumers before producers.
# 34. Performance Strategy

- No synchronous AI calls on request paths; submissions persist quickly and evaluation continues asynchronously.
- Dashboards read projections.
- Immutable content cached by tenant and version.
- AI and code concurrency bounded by admission control.
- Materialization in chunks; delivery jittered and throttled per ChannelAccount.
- Capacity validated with the ADR-023 cohort-deadline load profile.
# 35. Implementation Sequence (revised)

| Phase | Scope | Change from V1.2 |
|---|---|---|
| 1 Foundation | repository, CI/CD, module schemas, architecture tests, DB roles, TenantTransaction, forced RLS, ActorContext incl. SystemActor, staff IdP adapter, audit, queue with leases/admission control, security gates in CI | tenant isolation and leakage gates moved here from Phase 9 |
| 1 (parallel, operational) | WhatsApp business verification, sandbox provider security review, Arabic golden-set procurement, subprocessor inventory | new: long-lead items |
| 1b Walking skeleton | one deterministic question → capability link → submission → evaluation head → learning observation → teacher dashboard row | new: proves ADR-011/012/013/014 early |
| 2 Content & Roster | topics, QuestionVersion bundle, compatibility flags, StudentQuestionView, approval, Roster module, RosterImport, QuestionImport | Roster and imports added |
| 3 Challenge, Assessment & Access | definitions, assignments, materialization, attempts, submissions, reveal policy, capability sessions, OTP, consent model and acquisition | consent and sessions moved earlier |
| 4 Evaluation | composer, tri-state deterministic, head/CAS, review, disputes, RegradeRequest, thin AI rubric strategy and code strategy spikes | AI and code spikes pulled in |
| 5 Learning | observations, replace-semantics projection, LearningPolicy, reinforcement with revalidation | — |
| 6 AI | full AI Platform, routes, gates, generation workflows, feedback safeguards, confidence calibration | — |
| 7 Communication | ChannelAccount, templates, WhatsApp adapter, webhooks, throughput control | account model signed off by end of Phase 3 |
| 8 Reporting & Billing | read models, snapshots and corrections, plans, entitlements, reservations | — |

| Phase | Scope | Change from V1.2 |
|---|---|---|
| 9 Hardening | load test (cohort burst), provider-failure drills, restore drill, deletion verification, penetration test, runbooks | gates already running since Phase 1 |

# 36. Architecture Completion Criteria

The architecture is complete for a capability only when the team can answer: who owns the data; who owns the decision; what is synchronous or asynchronous; what happens on failure; what is versioned; what crosses a tenant boundary; what data reaches an external provider; how it is deleted; how it is observed. V1.3 answers these for every V1 capability; open items are limited to the owner sign-offs listed in the ADR set.

# 37. Final Architecture Principle

Challenge Me owns the domain. External services provide replaceable infrastructure. The architecture stays simple enough for a small team to operate and rigorous enough for paying customers and sensitive learner data.
