# Challenge Me — V1.3 Domain Model & Implementation Contract — rev. 1.8 (reconciled, FROZEN)

> Status: Implementation contract derived from Implementation Architecture V1.3, ADR set V1.3 and the V1.3 Remediation Report.
>
> Audience: engineers implementing the PostgreSQL schema, module structure and application services.
>
> FROZEN 2026-09-30 as part of the V1 implementation contract (Reconciliation Report rev. 3). Changes require formal change control.
>
> Change-control revision 1.8.1 (2026-10-03): CR-3 applied by engineering-authority decision — §6.4 paragraph "Ownership and boundary [CR-3]" (Foundation owns `cm_resolver` and the six X1 resolver functions as a closed, explicit exception to module-schema isolation; `identity.resolver_audit` remains Identity-owned; Identity & Access owns the `AuthProvider` port and the concrete staff IdP adapter). No other text changed. Recorded in the Reconciliation Report §7.
>
> Change-control revision 1.8.2 (2026-10-04): CR-3-F1 Decision 2b applied by engineering-authority decision — §3 X1 paragraph "Delivery resolver signature [CR-3-F1 2b]" (`resolve_delivery_by_provider_message(provider, provider_account_ref, provider_message_id)`; the two-input signature in the X1 correction is superseded). No other text changed. Recorded in the Reconciliation Report §7 and §6.4.
>
> Change-control revision 1.8.3 (2026-10-04): CR-5 applied by engineering-authority decision — §14.1 paragraph "Webhook inbox account reference [CR-5]", §14.3 paragraph "Account reference at ingestion [CR-5]" and §14.4 sentence "[CR-5]" (`provider_account_ref` established at webhook ingestion after signature verification and replay-window validation and carried on `comms.webhook_inbox`; verification and normalization behind the Communication provider-adapter boundary). The data classification of the new column is OPEN. No other text changed. Recorded in the Reconciliation Report §7.
>
> Change-control revision 1.8.4 (2026-10-04): CR-3-F1 applied by engineering-authority decision — §6.4 paragraph "Resolver contracts, privileges, schema and audit boundary [CR-3-F1]" (the six X1 resolver functions are held in schema `foundation`; per-function sources, read columns, predicates and returns; `cm_resolver` privileges; EXECUTE for `cm_app` only; audit append to `identity.resolver_audit`) and §14.1 paragraph "Delivery account reference [CR-3-F1]". No other text changed; no passage superseded. Recorded in the Reconciliation Report §7.
>
> Revision 1.8 (Product-owner clarification US-1; freeze-audit corrections: §5.4 billing.view row aligned to Wave 11 §2, §17 direction values aligned to LTM, §24 dispute guard aligned to W6 DI-2, §32 X1/X2 status): the usage statement reports the number of ACTIVE learners at the end of the statement period; reporting only; U2 enforcement unchanged. §18, §21, §35.
>
> Revision 1.7 (Product-owner decisions closing U1 and U2): `overrun_pct` default 0% [U1]; `max_learners` counts ACTIVE learners, point-in-time at learner creation or reactivation [U2]. §18, §31, §32, §34, §35. No other change.
>
> Revision 1.6 (Cross-wave reconciliation): applies every approved reconciliation item from Waves 1–11, the Spec Kit Part 1 corrections SC1–SC4 and the Wave 11 closure. Each change carries its origin tag in square brackets (for example [W4-C6], [SC1], [FD-1]); §35 lists every item and where it was applied. Items that could not be applied because two approved artifacts still conflict are marked [UNRESOLVED Uₙ] and listed in §35.3. No new product decision is introduced.
>
> Revision 1.5 (Wave 8 Learning reconciliation: W8-1 to W8-3, W8-C1 to W8-C4): §5.4, §12.2, §12.4, §17, §19 (C13a), §21, §25.8, §29, §31.
>
> Revision 1.4 (C7-A course policy fallback, C7-B topic scope changes): §8.3, §8.5, §12.1, §12.2, §12.3, §19, §20, §29, §30.
>
> Revision 1.3 (C7 reconciliation: applicable LearningPolicyVersion by topic scope): §12.1, §12.2, §12.3, §29.
>
> Revision 1.2 (C6 reconciliation: REPEATED_MISCONCEPTION rule): §12.1, §12.2, §29.
>
> Revision 1.1 (C10/C11 reconciliation with Spec Kit Learning Trajectory Model, D13/D14): §12.1, §12.2, §12.3, §12.4, §25.8.
>
> Labels used: DECIDED (from V1.3) · PROPOSED CORRECTION (fixes a contradiction found here) · PROPOSED DEFAULT (implementation choice, changeable without model change) · OPEN (needs a named sign-off).

# 1. Executive Summary

This document turns the approved V1.3 architecture into an implementation-ready domain model: 14 modules, their aggregates, tables, invariants, state machines, transaction boundaries, events, jobs, indexes, privacy lifecycle and application contracts. It adds no product scope. Where V1.3 is silent, defaults are labelled PROPOSED DEFAULT; where V1.3 contradicts itself, the conflict is stated in Section 3 with the smallest correction.

**Result of the contradiction check:** no P0 contradictions. Sixteen contradictions or gaps were found (2 P1, 9 P2, 5 P3). The two P1 items are:

- **X1 — Pre-tenant resolution.** ADR-012's fail-closed RLS and read-only global tables make it impossible to look up a staff user's memberships at login, a capability token at link exchange, or a delivery at webhook receipt, because the tenant is not yet known. Correction: a narrow set of audited resolver functions owned by a dedicated role. Must be adopted before Phase 1 identity work.
- **X2 — Semantic correctness authority.** Cross-ADR Rule 9 says only deterministic strategies produce correctness components, while ADR-010 requires AI to judge correctness of open short-text answers when the deterministic layer returns NO_DETERMINATION. Correction: correctness components carry an authority (DETERMINISTIC or SEMANTIC_AI); AI may fill only a component the deterministic layer left undetermined, and such results are never confirmed instantly. Must be adopted before Phase 4.

All corrections are written into the model below so implementation can proceed; Section 3 lists which need an ADR amendment.

**Implementation readiness:** Phases 1–3 can start immediately after X1 is accepted. Twelve sign-off gates from the Remediation Report remain open and are mapped to capabilities in Section 32; one new product confirmation is added (X9, practice runs for code questions). *(Rev. 1.6: X9 resolved by W5-1; gate 2 by W7-1; implementation starts only after the contract freeze checklist in the Reconciliation Report is signed off; conflicts U1 and U2 were closed by product-owner decision in rev. 1.7, see §35.)*

# 2. Architecture Assumptions

| # | Assumption | Source |
|---|---|---|
| A1 | Modular monolith, one codebase, API / worker / scheduler entry points, one PostgreSQL schema per module | Arch §3–5, ADR-013 |
| A2 | Fourteen modules including Roster; Tenancy & Billing is one module and one schema (`tenancy`) presented in two sections here | Arch §4, ADR-013 |
| A3 | PostgreSQL is authoritative; PostgreSQL-native queue; jobs enqueued in the same transaction are the outbox; no Redis for correctness | ADR-001, ADR-013 |
| A4 | Tenant isolation: forced RLS, transaction-local context, four DB roles, SystemActor | ADR-012 |
| A5 | Evaluation authority per ADR-011 (immutable results, origins, head with compare-and-set, derived OVERRIDDEN) | ADR-011 |
| A6 | Learning uses replace-semantics projections; LearningPolicyVersion is organization/course-scoped, not assignment-pinned | ADR-014 |
| A7 | V1 student assistance only from approved HintSetVersions | ADR-007 |
| A8 | Code judging in the trusted worker; sandbox receives inputs only | ADR-009 |
| A9 | Billing is domain-only; no payment gateway in V1 | ADR-021, Arch §25 |
| A10 | Identifiers are UUIDv7 (time-ordered) for index locality — PROPOSED DEFAULT | new |
| A11 | Enumerations are stored as `text` with CHECK constraints rather than PostgreSQL enum types, to keep expand/contract migrations simple — PROPOSED DEFAULT | new |
| A12 | Monetary and usage amounts are stored as `bigint` micro-units — PROPOSED DEFAULT | new |
| A13 | All timestamps are `timestamptz` in UTC; local times are computed from stored IANA zones | ADR-022 |

# 3. Architectural Contradictions Found

No P0 contradictions were found. Implementation can continue under the corrections below.

### X1 [P1] Tenant cannot be resolved before tenant context exists

**Conflict.** ADR-012: RLS is forced and fails closed when `app.tenant_id` is unset; global tables are "read-only to cm_app". Three V1 flows must find tenant-owned rows before the tenant is known: (a) staff login must list a user's memberships across organizations (ADR-002 "one active organization per request" implies choosing among several); (b) `POST /c/exchange` receives only a capability token (ADR-016); (c) provider webhooks carry provider IDs, not tenants (ADR-012, ADR-024). `identity.user` must also be writable at first login, contradicting "global tables are read-only".
**Impact.** Phase 1 identity cannot be built as specified; engineers would bypass RLS ad hoc.
**Correction.** (1) Add role `cm_resolver` (NOLOGIN, BYPASSRLS) that owns a closed set of SECURITY DEFINER **resolver functions**, each returning only identifiers needed to establish context: `resolve_staff_memberships(user_id)`, `resolve_capability_token(token_hash)`, `resolve_capability_session(session_hash)`, `resolve_invitation(token_hash)`, `resolve_inbound_channel(provider, provider_account_ref)`, `resolve_delivery_by_provider_message(provider, provider_message_id)`. Every call is audited. (2) Extend the ADR-012 table registry from two categories to five (Section 6.3): tenant-owned, reference, global identity, operational, platform.
**Continue without resolving?** No for Phase 1 identity; yes for everything else. ADR amendment: ADR-012.

**Delivery resolver signature [CR-3-F1 2b].** The signature of the delivery resolver is `resolve_delivery_by_provider_message(provider, provider_account_ref, provider_message_id)`; it returns `tenant_id` or not found. The two-input signature `resolve_delivery_by_provider_message(provider, provider_message_id)` in the Correction above is superseded. The added `provider_account_ref` aligns the resolver with the delivery uniqueness key `(channel_account_ref, provider_message_id)` (Section 14.1; Section 23). The other five signatures, the closed set of six functions and every other statement of X1 are unchanged.

### X2 [P1] Correctness authority vs semantic short-text evaluation

**Conflict.** Cross-ADR Rule 9 and ADR-015: "Correctness components can only be produced by deterministic strategies." ADR-010: OPEN_SEMANTIC short text escalates NO_DETERMINATION to AI + Rubric "when correctness depends on meaning".
**Impact.** Taken literally, the composer must reject the AI result and every paraphrase goes to review, making OPEN_SEMANTIC useless.
**Correction.** Each component value carries `authority` ∈ {DETERMINISTIC, SEMANTIC_AI, HUMAN}. Rule 9 restated: *a component determined by a deterministic strategy (MATCH_CORRECT or MATCH_INCORRECT, or code execution) can never be produced or changed by AI; an AI step may supply the correctness component only when the plan marks it `on_no_determination` and the deterministic step returned NO_DETERMINATION; SEMANTIC_AI correctness is never confirmed instantly.* The type returned by AI strategies can hold `SemanticCorrectness` but not `DeterministicCorrectness`.
**Continue without resolving?** Yes until Phase 4. ADR amendment: ADR-015 and Cross-ADR Rule 9.

### X3 [P2] Head revision does not change on result arrival or confirmation

**Conflict.** ADR-014 keys learning events by (response_id, head_revision). ADR-011 changes `revision` only when the head moves to a new evaluation. The head initially points at the PENDING evaluation; when it becomes PROVISIONAL, and later CONFIRMED, the pointer does not move, so Learning receives no new key and cannot observe either change.
**Correction.** `revision` increments on every learning-relevant change of the head: new current evaluation, result becoming present, and confirmation. Section 11.6.
**Continue?** Yes. ADR amendment: ADR-011 (one sentence).

### X4 [P2] Asynchronous review resolution hides compare-and-set conflicts from the reviewer

**Conflict.** ADR-013: "Review → owner: B ReviewResolved — the owner executes the decision." A teacher's override then executes after the teacher has left the screen; a CAS conflict (another override or regrade won) cannot be reported to them.
**Correction.** Decisions are commands sent to the owning module (e.g. `Evaluation.OverrideEvaluation`), which calls `Review.CompleteTask` synchronously in the same transaction (mechanism A, owner → Review). Review still imports no owner module. `ReviewResolved` becomes an informational event. **Continue?** Yes. ADR amendment: ADR-013 interaction table.

### X5 [P2] Feedback regeneration would re-score

**Conflict.** ADR-017: a feedback leak "triggers one regeneration". Feedback is produced by EvaluateResponse, and ADR-011 makes scores immutable after PENDING; regenerating the whole operation re-scores.
**Correction.** Add capability **GenerateFeedback**, run after the decision from the immutable CriterionResults. Leak regeneration repeats only GenerateFeedback. Feedback is a write-once field outside the immutable result (Section 11.5). **Continue?** Yes. ADR amendment: ADR-017 capability list.

### X6 [P2] AI idempotency key uses an ambiguous `attempt_no`

**Conflict.** ADR-017: key = hash(capability, subject_type, subject_id, context_hash, attempt_no). If `attempt_no` is the retry count, retries get new keys and call the model again; if it is constant, intentional regeneration is deduplicated.
**Correction.** Replace `attempt_no` with `request_id`: a stable identifier of the intended request (evaluation run id, generation request item id). Retries reuse it; intentional regeneration creates a new request. **Continue?** Yes. ADR amendment: ADR-017.

### X7 [P2] Mixed global and tenant rows in one table

**Conflict.** ADR-012 requires each table to be either tenant-owned with forced RLS or registered global. ADR-004 gives ChannelAccount a nullable tenant_id (shared accounts). ADR-017 gate runs execute AI operations that belong to no tenant. ADR-004 opt-out on a shared account must suppress a contact value across tenants, while ContactPoints are tenant-scoped.
**Correction.** (a) Split `comms.channel_account` (tenant-owned, dedicated) from `comms.shared_channel_account` (platform). (b) A reserved **platform organization** (`is_platform = true`) owns platform AI operations, usage and gate executions, so `ai.ai_operation` stays tenant-owned. (c) Cross-tenant suppression lives in platform table `comms.channel_suppression` keyed by an HMAC of the contact value, never the raw value. **Continue?** Yes.

### X8 [P2] Human-confirmed machine results are not protected

**Conflict.** ADR-011 protects heads whose *origin* is human. A teacher confirming an AUTOMATED result unchanged is a human decision (Cross-ADR Rule 2), but the head's origin stays AUTOMATED and a later regrade could replace it silently.
**Correction.** Head flag `human_locked` = origin is human OR the evaluation was confirmed by a human (`confirm_mode = HUMAN`). Machine writers respect `human_locked`. Auto-confirmation does not lock. **Continue?** Yes. ADR amendment: ADR-011.

### X9 [P2] "Submission limits per attempt" vs one final submission per attempt

**Conflict.** ADR-009 sets "submission limits per attempt"; ADR-020 allows exactly one final submission per attempt. The only coherent reading is that learners may run code against visible tests before submitting, which V1.3 never models.
**Correction.** Model **PracticeRun**: execution of learner code against visible tests only, owned by Assessment, never evaluated or recorded as a learning observation, rate-limited per attempt. **Continue?** Yes. **RESOLVED (W5-1):** practice runs are in V1, visible tests only; limits 20 per attempt and 100 per learner per day, owned by Assessment [W7-C3].

### X10 [P2] Late submissions beyond the grace window

**Conflict.** ADR-020: a late submission "is accepted only within the policy's offline grace (default 0) and is flagged LATE; teachers may accept late work explicitly". Beyond grace the text implies rejection, yet teachers must be able to accept it, which requires the work to be stored. Rejection would also discard student work.
**Correction.** Beyond grace the submission is stored with `timing_status = LATE_HELD` and not evaluated until a teacher accepts it (`AcceptLateSubmission`) or the hold expires. Within grace: `LATE_ACCEPTED`, evaluated normally. **Continue?** Yes. **RESOLVED (W4-6, W5-C1):** hold 14 days; teacher rejection or expiry → `LATE_REJECTED` with `late_rejection_reason` TEACHER or HOLD_EXPIRED; the late path also applies to ABANDONED (EXPIRED) attempts.

### X11 [P2] Deletion ledger location

**Conflict.** ADR-006/023: "the deletion ledger is re-applied after every restore." If the ledger lives in the database, a point-in-time restore to before a deletion also restores the ledger to before it, and the deletion is lost.
**Correction.** Deletion completions are written both to `privacy.deletion_request` and to an append-only object-storage log with object lock (write-once). The restore runbook replays that external log. **Continue?** Yes. ADR amendment: ADR-006.

### X12 [P3] `Submission.is_final` is redundant

ADR-020 has drafts separately and one final submission per attempt, so a non-final submission never exists. Correction: drop the flag; enforce `UNIQUE (attempt_id)`.

### X13 [P3] DeliveryIntent owned by two modules

ADR-013 lists DeliveryIntent under both Challenge and Reporting. Correction: producers emit `DeliveryRequested`; Communication creates and owns the Delivery (the "intent" is a Delivery in CREATED). Producers keep only a reference.

### X14 [P3] Module list in the task brief differs from V1.3

The brief lists 13 modules without Roster. V1.3 (ADR-013) is authoritative: Roster is modelled in Section 5.B. Tenancy and Billing are one module presented in Sections 6 and 18.

### X15 [P3] Schema isolation cannot be enforced by database grants

Per-module database roles would break mechanism A (one transaction writing two schemas). Module schema isolation is therefore enforced by architecture tests and repository conventions, not grants. Accepted limitation.

### X16 [P3] EvaluationRun has no cancellation state

Runs can be cancelled (consent withdrawal, superseded evaluation). To keep the approved five-state machine, cancellation is FAILED with `failure_class = CANCELLED`.

**ADR amendments recommended:** ADR-012 (X1, X7), ADR-015 and Rule 9 (X2), ADR-011 (X3, X8), ADR-013 (X4, X13), ADR-017 (X5, X6), ADR-006 (X11), ADR-009/ADR-020 (X9, X10, X12). **Applied** in the ADR set V1.4 (reconciled).

# 4. Domain Map

| # | Module | Schema | Aggregate roots | Depends on (contracts) |
|---|---|---|---|---|
| 1 | Identity & Access | identity | User, Membership, CapabilityGrant, CapabilitySession, OtpChallenge, ElevatedAccessGrant | Roster (scope validation), Communication (OTP send) |
| 2 | Roster | roster | Learner, Guardian, ContactPoint, Course, Cohort, RosterImport, LearnerMerge | Privacy (consent summary), Identity (grant revocation) |
| 3 | Tenancy & Billing | tenancy | Organization, Subscription, BudgetPool, Reservation | — |
| 4 | Privacy & Consent | privacy | ChannelConsent, ProcessingConsent, ConsentPolicy, ConsentRequest, DeletionRequest | Roster, Identity, Communication |
| 5 | Content | content | Topic, Question, QuestionVersion, RubricVersion, TestSuiteVersion, HintSetVersion, SourceDocument, GenerationRequest, QuestionImport | AI Platform, Code Execution (validation), Review |
| 6 | Challenge | challenge | ChallengeDefinition, ChallengeAssignment, StudentChallenge, ReinforcementPlan | Roster, Content, Evaluation (policy id), Learning, Communication |
| 7 | Assessment Runtime | assessment | Attempt (with Submission, Draft, HintEvents, PracticeRuns) | Content (student view), Challenge, Evaluation, Code Execution |
| 8 | Evaluation | evaluation | Evaluation, ResponseEvaluationHead, GradingPolicyVersion, ConfidencePolicyVersion, Dispute, RegradeRequest | Content (evaluator view), AI Platform, Code Execution, Review, Privacy, Tenancy (budget) |
| 9 | Learning | learning | Observation, TopicState, LearningSignal, ReinforcementItem, LearningPolicyVersion | Content (topic mappings), Roster (pseudonyms) |
| 10 | Review | review | ReviewTask, ReviewGroup | Identity (assignees) |
| 11 | Communication | comms | ChannelAccount, Template, Delivery | Privacy, Identity (grant issue), Roster |
| 12 | AI Platform | ai | AIOperation, PromptVersion, ModelSnapshot, CapabilityRoute, GateRun, GoldenDataset | Privacy, Tenancy (budget) |
| 13 | Code Execution | codeexec | ExecutionRequest, RuntimeImage | Tenancy (budget) |
| 14 | Reporting | reporting | ReportSnapshot, read models | consumes events; Communication, Identity |

**Dependency direction (no cycles):** Identity, Tenancy → Roster → Privacy → Content → Challenge → Assessment → Evaluation → Learning → Reporting; Review, Communication, AI Platform and Code Execution are leaf services called by domain modules. Asynchronous events flow "backwards" (for example Learning → Challenge) without creating compile-time dependencies, because consumers depend only on published event contracts.

**Conventions for every tenant-owned table (PROPOSED DEFAULT):**

- `id uuid PRIMARY KEY` (UUIDv7) and `tenant_id uuid NOT NULL`.
- `UNIQUE (tenant_id, id)` so in-module foreign keys can be composite `(tenant_id, parent_id)`, making a cross-tenant reference impossible even by bug.
- `created_at timestamptz NOT NULL DEFAULT now()`, `created_by_kind text`, `created_by_id uuid`.
- Mutable aggregates carry `row_version integer NOT NULL` for optimistic concurrency and `updated_at`.
- Immutable tables are protected by a trigger that rejects UPDATE of immutable columns and DELETE outside purge handlers.
- Cross-module references are plain `uuid` columns with no foreign key; validity is checked through the owning module's contract.

**Classification codes used in table specifications:**

| Code | Sensitivity |
|---|---|
| S0 | reference / non-personal |
| S1 | operational metadata |
| S2 | personal data (names, contact values, staff notes about a person) |
| S3 | sensitive learner payload (answers, essays, code, AI inputs/outputs containing learner content) |
| S4 | secrets and protected assessment material (tokens, credentials, answer keys, hidden tests, reference solutions) |

| Retention class | Rule (all periods PROPOSED DEFAULT, legal sign-off) |
|---|---|
| R1 CORE_DOMAIN | while organization active; purged 90 days after termination; organization purge removes all tenant-owned data regardless of class, except audit events (LG-1) and the FINANCIAL record set (R11) [W10-C2, W11-C2] |
| R2 LEARNER_PAYLOAD | until learner deletion or 24 months after last activity; last activity = latest submission, challenge open or enrollment change [W10 RT-3]; Owners may shorten [W10-4] |
| R3 AI_PAYLOAD | 90 days, then payload purged; metadata kept under R1 |
| R4 CODE_OUTPUT | 30 days |
| R5 MESSAGE_BODY | 30 days after delivery reaches a terminal state |
| R6 AUDIT | 24 months |
| R7 EPHEMERAL_SECURITY | 30 days after expiry (tokens, OTP, sessions) |
| R8 REPORT_SNAPSHOT | 24 months, then redacted to tombstone |
| R9 IMPORT_STAGING | 30 days after import commit or cancellation |
| R10 WEBHOOK_RAW | 14 days |
| R11 FINANCIAL | minimal billing record set (subscription history, usage statements, usage ledger summaries; organization name and billing contact only; no learner data); survives organization purge; **duration governed by LG-11, no approved default** [W11-C2] |
| EXPORT_FILE | generated exports (assignment results, subject and organization exports): 7 days [W9 §7, W10-5] |

All periods remain proposed defaults subject to **LG-10** (and LG-11 for R11); none is legally approved [W10 closure]. Owners may only **shorten** R2, R4, R5 and R8, within platform minimums; no class can be lengthened [W10-4].

---

# 5. Identity & Access

**Purpose.** Map verified staff identities to memberships and scoped roles; issue and verify learner/guardian capability grants and sessions; OTP step-up; break-glass access; authorization decisions. Owns ActorContext construction.

## 5.1 Aggregates

| Aggregate root | Owned | Invariants inside | Invariants at service level |
|---|---|---|---|
| User (global identity) | ExternalIdentity | one ExternalIdentity per (provider, subject) | email uniqueness across platform |
| Membership | RoleAssignments | exactly one Membership row per (tenant, user); a Membership exists only once an invitation is accepted [W2-C2]; a REVOKED Membership is reactivated (REVOKED → ACTIVE) by accepting a new invitation, roles replaced from that invitation, history kept [W2-C1]; OWNER role cannot be revoked if it is the last OWNER | scope_id must be a course/cohort of the same tenant (Roster contract) |
| CapabilityGrant | CapabilityExchanges | token hash unique; status transitions monotonic; issuing a new grant never revokes earlier ACTIVE grants for the same subject and scope; the device limit counts across all of them [SC1] | subject exists and is active (Roster); scope entity exists (Challenge/Reporting/Privacy) |
| CapabilitySession | — | belongs to one grant; elevation only via a correct one-time code [W2-C3]; after an assignment's closes_at a STUDENT_CHALLENGE session is read-only review, with the single late-submission exception [W4-C2, W5-C2] | revoked when grant revoked |
| OtpChallenge | — | attempts ≤ max; single verification; target = any ACTIVE contact point linked to the learner or guardian, verified or not; a correct code verifies it [W2-C3]; sent by WhatsApp or email only, never SMS in V1 [W4-5] | send-rate limits (rate-limit table) |
| ElevatedAccessGrant (platform) | — | approver ≠ requester; expiry ≤ 4 h; a rejected request is recorded as REVOKED with reason REJECTED [Wave 1 F-5] | audited on every statement; visible in the affected organization's audit log [FD-4] |
| StaffInvitation | — | single acceptance | email matches IdP-verified email on accept |

## 5.2 Tables

```
identity.user                         GLOBAL-IDENTITY · RLS(user_visibility) · R1 · S2
  id                 uuid         PK
  primary_email      citext       NOT NULL  UNIQUE
  display_name       text         NOT NULL
  locale             text         NOT NULL DEFAULT 'ar'
  status             text         NOT NULL  CHECK in (ACTIVE, SUSPENDED, DELETED)
  created_at, updated_at, row_version
  RLS user_visibility: id = app.user_id OR EXISTS active membership in app.tenant_id

identity.external_identity            GLOBAL-IDENTITY · R1 · S2
  id, user_id (FK user), idp_provider text, idp_subject text, last_login_at
  UNIQUE (idp_provider, idp_subject)

identity.membership                   TENANT · R1 · S1
  id, tenant_id, user_id (FK user)
  status             text   NOT NULL  CHECK in (ACTIVE, SUSPENDED, REVOKED)   -- INVITED removed [W2-C2]
  activated_at, revoked_at, revoked_by_id, row_version
  UNIQUE (tenant_id, user_id)   -- one row per person x organization; REVOKED -> ACTIVE via
                                --   AcceptInvitation of a new invitation [W2-C1]

identity.role_assignment              TENANT · R1 · S1 · audited
  id, tenant_id, membership_id (FK (tenant_id, membership_id))
  role               text   NOT NULL  CHECK in (OWNER, ADMIN, TEACHER, SAFEGUARDING_LEAD)
  scope_type         text   NOT NULL  CHECK in (ORGANIZATION, COURSE, COHORT)
  scope_id           uuid   NULL      -- NULL iff ORGANIZATION; Roster id otherwise
  granted_by_id, granted_at, revoked_at
  UNIQUE (tenant_id, membership_id, role, scope_type, coalesce(scope_id, zero_uuid))
         WHERE revoked_at IS NULL

identity.staff_invitation             TENANT · R7 · S2/S4
  id, tenant_id, email citext, roles jsonb, token_hash bytea UNIQUE, expires_at,
  status (PENDING, ACCEPTED, EXPIRED, REVOKED), invited_by_id, accepted_user_id

identity.capability_grant             TENANT · R7 · S4
  id, tenant_id
  token_hash         bytea  NOT NULL  UNIQUE   -- SHA-256 of 256-bit random token
  subject_type       text   NOT NULL  CHECK in (LEARNER, GUARDIAN)
  subject_id         uuid   NOT NULL           -- Roster id
  scope_type         text   NOT NULL  CHECK in (STUDENT_CHALLENGE, REPORT_SNAPSHOT,
                                               CONSENT_REQUEST)
  scope_id           uuid   NOT NULL
  family_id          uuid   NOT NULL           -- all grants for (subject, scope); device limit counted
                                               --   across the family; re-issue never revokes [SC1]
  status             text   NOT NULL  CHECK in (ACTIVE, REVOKED, EXPIRED)
  expires_at         timestamptz NOT NULL      -- STUDENT_CHALLENGE: assignment closes_at + 14 days
                                               --   (read-only after close); moves with a deadline
                                               --   extension [W4-C2, W4-4]; REPORT_SNAPSHOT: 30 days [W9 GR-8]
  issued_by_staff_id uuid NULL                 -- staff-issued (copy/print) link, audited [W2-2]
  max_devices        smallint NOT NULL DEFAULT 3
  issued_for_delivery_id uuid NULL            -- Communication id
  revoked_at, revoke_reason, row_version
  -- revocation triggers include GuardianLinkEnded: learner-subject grants for that learner
  --   issued to that guardian's contact points only [W2-C4, W4-C7]

identity.capability_exchange          TENANT · R7 · S1
  id, tenant_id, grant_id (FK), device_hash bytea, ip_hash bytea, exchanged_at

identity.capability_session           TENANT · R7 · S4
  id, tenant_id, grant_id (FK)
  session_hash       bytea  NOT NULL  UNIQUE
  subject_type, subject_id, scope_type, scope_id     -- copied from grant, immutable
  elevated_scope     text   NULL  CHECK in (LEARNER_HOME, GUARDIAN_HOME)
  elevated_until     timestamptz NULL
  device_hash, expires_at, last_seen_at, revoked_at

identity.otp_challenge                TENANT · R7 · S4
  id, tenant_id, session_id (FK), contact_point_id uuid (Roster)
  code_hash bytea, expires_at, attempts smallint, max_attempts smallint DEFAULT 5,
  status (PENDING, VERIFIED, EXPIRED, LOCKED), delivery_id uuid NULL
  -- contact point: any ACTIVE linked contact point, verified or not; VERIFIED sets the
  --   contact point's verification_state to VERIFIED [W2-C3]; channels WhatsApp/email [W4-5]

identity.elevated_access_grant        PLATFORM · R6 · S1 · audited
  id, requester_user_id, approver_user_id (CHECK <> requester), reason, ticket_ref,
  tenant_ids uuid[], read_only bool DEFAULT true, expires_at (CHECK <= created+4h),
  status (REQUESTED, APPROVED, ACTIVE, EXPIRED, REVOKED), revoke_reason NULL
  -- rejection is recorded as REVOKED with revoke_reason = REJECTED [Wave 1 F-5]
```

## 5.3 ActorContext (value object)

| Field | Staff | Learner | Guardian | System |
|---|---|---|---|---|
| kind | STAFF | LEARNER | GUARDIAN | SYSTEM |
| actor_id | user_id | learner_id | guardian_id | job or process id |
| tenant_id | active organization | from session | from session | from job |
| roles | [(role, scope)] | — | — | — |
| session_scope | — | (type, id), elevated scope | (type, id), elevated scope | — |
| purpose | — | — | — | SCHEDULER, WEBHOOK, WORKER, PROJECTION, REGRADE, IDENTITY, PURGE |
| auth_time | IdP auth_time | session creation | session creation | — |
| correlation_id | per request | per request | per request | from job |

## 5.4 Authorization

`authorize(actor, permission, resourceScope{tenant_id, course_id?, cohort_id?})`. The owning module supplies the resource scope. A COURSE-scoped role covers every cohort in that course (Roster contract `GetCohortCourse`). PROPOSED DEFAULT permission matrix:

| Permission | OWNER | ADMIN | TEACHER (scoped) | SAFEGUARDING_LEAD |
|---|---|---|---|---|
| org.manage, membership.manage (billing.view: see row below [W11 §2]) | ✓ | ✓ (not OWNER roles) | | |
| roster.manage, roster.import, learner.merge | ✓ | ✓ | view only | |
| content.author | ✓ | ✓ | ✓ (cohort-scoped teachers: drafts in their cohort's course only [W3-2]) | |
| content.approve / publish / retire / archive | ✓ | ✓ | ✓ organization- and course-scoped only; never cohort-scoped [W3-2] | |
| own-content approval | only when `allow_direct_publish` is enabled — applies to every author, including Owners and Admins [FD-1, W3-C4] | same | same | |
| topic.manage (merge, split, scope change, retire) | ✓ | ✓ | ✗ [W3-1] | |
| topic.create / rename | ✓ | ✓ | organization- and course-scoped teachers within scope [W3-1] | |
| challenge.manage | ✓ | ✓ | ✓ | |
| evaluation.review, evaluation.confirm, evaluation.override | ✓ | ✓ | ✓ (also for submissions made in their cohort's assignment after the learner left, those submissions only [W6-6]) | |
| regrade.request | ✓ | ✓ | ✓ | |
| regrade.approve | ✓ (never own request) | ✓ (never own request) | ✓ (never own request, even when no other approver exists) [FD-1] | |
| dispute.resolve | ✓ | ✓ | ✓ | |
| consent.manage, deletion.request | ✓ | ✓ | | |
| deletion.approve (recent auth) | ✓ | | | |
| report.view | ✓ | ✓ | ✓ | |
| report.export (assignment results CSV; recent auth; audited) | ✓ | ✓ | ✓ in scope [W9-3] | |
| capability.issue_staff_link (copy/print; organization setting, off by default; audited) | ✓ | ✓ | ✓ in scope [W2-2] | |
| learner.minor_status.set | ✓ | ✓ | | [W2-6] |
| deletion.cancel (during 7-day hold) | ✓ | | | [W10-3] |
| retention.shorten (R2, R4, R5, R8) | ✓ | | | [W10-4] |
| data.export.subject | ✓ | ✓ | | [W10-5] |
| data.export.organization | ✓ | | | [W10-5, W11 SB-9] |
| ai.settings (switch off AI marking / AI generation) | ✓ | ✓ | | [W7-3] |
| safeguarding.flag (manual) | ✓ | ✓ | ✓ | ✓ [W7-5] |
| learning_policy.publish, evaluation policy publish | ✓ | ✓ | | [W8-2, Wave 6] |
| billing.view (plan, entitlements, statements) | ✓ | usage only | | [W11 §6] |
| learning_policy.manage (create and publish organization and course LearningPolicyVersions; preview counts; audited) — W8-2 | ✓ | ✓ | | |
| learning.rebuild (per-learner repair rebuild; audited) — W8-2. Tenant-wide rebuilds: platform operators only | ✓ | ✓ | | |
| safeguarding.view | | | | ✓ (OWNER if no lead) |

Learner permissions are implied by session scope: `challenge.answer` on its StudentChallenge; `progress.view` only with LEARNER_HOME elevation; `dispute.raise` on own responses whose score is visible [W6 DI-2]; `deletion.request_own` with LEARNER_HOME elevation [W10-1]. Guardian: `report.view` on its snapshot; `dispute.raise`, history and `deletion.request_own` only with GUARDIAN_HOME elevation [W10-1]; guardian home lists only learners with an ACTIVE guardian link [W9-C4].

**Former-cohort submissions [W2-5, W6-6].** After a cohort move, the learner's current-cohort teacher sees a summary (date, assignment, grade, status) of former-cohort submissions, never their raw content; teachers of the cohort that set the assignment keep review, confirmation, override and dispute rights for those submissions only; no other widening of learner access.

**Platform operators** act through the platform operations API only (subscriptions, entitlements, overrides, suspension, termination with second-operator approval, dead-letter replay, restore, break-glass) [W11 §6, SB-10].

## 5.5 Commands, queries, events

| Command | Actor | Notes |
|---|---|---|
| ResolveStaffLogin | IdP callback (SystemActor IDENTITY) | upsert User/ExternalIdentity; list memberships via resolver; client chooses active org |
| InviteStaff / AcceptInvitation | OWNER/ADMIN; invitee | acceptance requires IdP-verified email equal to invitation email; creates the Membership, or reactivates an existing REVOKED Membership and replaces its ended role assignments with the invitation's roles [W2-C1, W2-C2] |
| AssignRole / RevokeRole | OWNER/ADMIN | audited; last OWNER protected |
| IssueCapabilityGrant | internal (Communication, Privacy, Reporting via A); staff copy/print link where the organization enables it [W2-2] | returns plaintext token once; only hash stored; never revokes earlier grants [SC1]; staff issuance audited [W2-2] |
| ExchangeCapabilityToken | anonymous (POST) | Section 25.9 |
| RequestOtp / VerifyOtp | learner/guardian session | elevates session scope; code to any ACTIVE linked contact point; correct code verifies it [W2-C3] |
| RevokeGrants(subject or scope) | internal / staff | on unlink, enrollment end, StudentChallenge cancel, merge, learner deletion, `GuardianLinkEnded` (that guardian's contact points, that learner only) [W2-C4, W4-C7] |
| RequestElevatedAccess / ApproveElevatedAccess | platform staff | platform API only |

Queries: `GetActorContext`, `ListMyOrganizations`, `ListMembers(scope)`. Events: `MembershipRevoked` (→ Review), `CapabilityGrantsRevoked` (informational).

**Provider boundary.** `AuthProvider.verify(token) → {provider, subject, email, email_verified, auth_time, amr}`. No IdP organization or role concept is read.

**Observability.** Metrics: login success/failure, exchanges per grant, OTP send/verify/lock counts, resolver calls by function. Audit: role changes, invitation lifecycle, grant revocations, elevation, every resolver call, every break-glass statement.

## 5.B Roster (module added in V1.3)

**Purpose.** Educational identity and structure: learners, guardians, contact points, courses, cohorts, enrollments, imports, merges, pseudonyms. A phone number or email address is never a person.

### 5.B.1 Aggregates

| Aggregate root | Owned | Key invariants |
|---|---|---|
| Learner | LearnerPseudonyms | status MERGED requires `merged_into_learner_id`; a MERGED learner cannot be merged again or enrolled |
| Guardian | GuardianLinks | one active link per (guardian, learner) |
| ContactPoint | ContactPointLinks | unique normalized value per (tenant, type); a link targets exactly one of learner or guardian |
| Course | Cohorts | cohort belongs to one course |
| Enrollment (own root, small) | — | one ACTIVE enrollment per (cohort, learner) |
| RosterImport | ImportRows | idempotent by (tenant, file_hash) while active |
| LearnerMerge | — | survivor ≠ duplicate; both ACTIVE and same tenant |

### 5.B.2 Tables

```
roster.learner                        TENANT · R1 · S2
  id, tenant_id, display_name text NOT NULL, preferred_locale text,
  minor_status  text NOT NULL DEFAULT 'UNKNOWN' CHECK in (MINOR, ADULT, UNKNOWN)
                -- set only by Owner/Admin (incl. import); audited; emits
                --   LearnerMinorStatusChanged [W2-6, W2-C4]
  external_ref  text NULL, linked_user_id uuid NULL (global user),
  status text CHECK in (ACTIVE, INACTIVE, MERGED, DELETED),
  merged_into_learner_id uuid NULL (FK (tenant_id, id)), row_version
  UNIQUE (tenant_id, external_ref) WHERE external_ref IS NOT NULL

roster.learner_pseudonym              TENANT · R1 · S1 · access: Roster service only
  pseudonym_id uuid PK, tenant_id, learner_id (FK), created_at
  -- merge re-points the duplicate's pseudonym to the survivor; deletion removes rows

roster.guardian                       TENANT · R1 · S2
  id, tenant_id, display_name, external_ref, status (ACTIVE, INACTIVE, DELETED)

roster.guardian_link                  TENANT · R1 · S1
  id, tenant_id, guardian_id (FK), learner_id (FK), relationship text,
  receives_reports bool DEFAULT true, may_grant_consent bool DEFAULT true,
  status (ACTIVE, ENDED)
  UNIQUE (tenant_id, guardian_id, learner_id) WHERE status = 'ACTIVE'

roster.contact_point                  TENANT · R1 · S2
  id, tenant_id, type (PHONE, EMAIL), value_normalized text (E.164 / lower email),
  value_hmac bytea NOT NULL (keyed platform HMAC, for suppression and resolution),
  verification_state (UNVERIFIED, VERIFIED, INVALID), verified_at,
  -- VERIFIED only through a correct one-time code; opening a link never verifies [W2-C3]
  status (ACTIVE, RETIRED)
  UNIQUE (tenant_id, type, value_normalized)

roster.contact_point_link             TENANT · R1 · S1
  id, tenant_id, contact_point_id (FK), learner_id (FK) NULL, guardian_id (FK) NULL,
  role (PRIMARY, SECONDARY, GUARDIAN_CONTACT), status (ACTIVE, ENDED)
  CHECK (num_nonnulls(learner_id, guardian_id) = 1)
  UNIQUE (tenant_id, contact_point_id, learner_id, guardian_id) WHERE status='ACTIVE'

roster.course / roster.cohort          TENANT · R1 · S0/S1
  course: id, tenant_id, name, code, timezone NULL (org default), status (ACTIVE, ARCHIVED)
  cohort: id, tenant_id, course_id (FK), name, starts_on, ends_on, status

roster.enrollment                     TENANT · R1 · S1
  id, tenant_id, cohort_id (FK), learner_id (FK), status (ACTIVE, ENDED),
  started_at, ended_at, end_reason
  UNIQUE (tenant_id, cohort_id, learner_id) WHERE status = 'ACTIVE'

roster.roster_import                  TENANT · R9 · S1
  id, tenant_id, file_object_key, file_sha256, status (UPLOADED, VALIDATING,
  PREVIEW_READY, COMMITTING, COMMITTED, FAILED, CANCELLED), counts jsonb,
  error_report_key, requested_by_id, committed_at
  UNIQUE (tenant_id, file_sha256) WHERE status NOT IN ('FAILED','CANCELLED')

roster.roster_import_row              TENANT · R9 · S2
  import_id, row_no, raw jsonb, status (VALID, INVALID, COMMITTED, SKIPPED),
  errors jsonb, learner_id, guardian_id, contact_point_ids uuid[]
  PK (import_id, row_no)

roster.learner_merge                  TENANT · R1 · S1 · audited
  id, tenant_id, survivor_id, duplicate_id (CHECK <>), status (PREVIEWED, COMMITTED,
  CANCELLED), preview jsonb, requested_by_id, committed_at
```

**Shared phones and siblings.** Two siblings share one `contact_point` linked twice (one link per learner). Deliveries address (contact_point, learner); templates name the learner; capability grants bind the learner. Channel consent is per contact point; processing consent is per learner (Section 7).

**Link vs merge.** Link: `learner.linked_user_id` connects to a global User; a user may have learner profiles in several tenants, never merged. Merge: `MergeLearners` (Section 28) re-points pseudonyms, marks the duplicate MERGED, and emits `LearnerMerged`; consumers re-point mutable references (Challenge re-points open StudentChallenges; Identity revokes the duplicate's grants; Learning rebuilds the survivor; Reporting rebuilds read models). Learning events and evaluations are never rewritten. The duplicate's processing consents are listed in the preview and do not transfer automatically.

**Link recipients [W2-1].** `ResolveContactsForLearner` applies the organization's link-recipient setting: defaults MINOR → guardian contact points only, UNKNOWN → guardian only, ADULT → the learner's own; consent requests follow the same rule.

**Contracts offered:** `GetLearner`, `ListActiveEnrollments(cohort_ids, cursor)`, `GetCohortCourse`, `ResolveContactsForLearner(learner, purpose)`, `ResolvePseudonym(learner) / ResolveLearners(pseudonyms)` (restricted to Learning, Reporting, Privacy, and Challenge for reinforcement planning only [SC3]), `GetGuardiansForLearner`.
**Events:** EnrollmentStarted, EnrollmentEnded, LearnerMerged, ContactPointUnlinked, LearnerDeactivated, `GuardianLinkEnded` (→ Identity, Reporting: revoke that guardian's grants and sessions for the learner, stop future reports; consent history kept; consent validity per LG-3) [W2-C4], `LearnerMinorStatusChanged` (→ Privacy: re-evaluate applicable consent rules; never grants or revokes consent; audited) [W2-C4], `LearnerDeleted`, `GuardianDeleted` (→ all: cancellations and revocations) [W10 §8].

# 6. Tenancy

## 6.1 Organization aggregate

```
tenancy.organization                  TENANT (tenant_id = id) · R1 · S1
  id uuid PK, tenant_id uuid NOT NULL CHECK (tenant_id = id)
  name, status (TRIAL, ACTIVE, SUSPENDED, TERMINATED),
  is_platform bool NOT NULL DEFAULT false   -- exactly one platform organization (X7)
  market_code text NOT NULL, data_region text NOT NULL,
  default_timezone text NOT NULL (IANA), default_locale text NOT NULL,
  weekend_days smallint[] NOT NULL, quiet_hours_start time, quiet_hours_end time,
  terminated_at, purge_after, row_version
  UNIQUE (is_platform) WHERE is_platform

tenancy.organization_setting          TENANT · R1 · S1
  tenant_id, key text, value jsonb, updated_by_id, row_version   PK (tenant_id, key)
```

Organization states: TRIAL → ACTIVE → SUSPENDED → ACTIVE; any → TERMINATED (irreversible; schedules purge at `purge_after`). SUSPENDED stops scheduling and delivery but keeps learner access to already-open challenges read-only; staff are read-only except billing contacts; marking of submitted work continues [FD-2]. Events: OrganizationSuspended, OrganizationReactivated, OrganizationTerminated.

**Organization status is access state derived from billing state [W11-C1].** Subscription TRIAL → organization TRIAL; ACTIVE or PAST_DUE → ACTIVE; SUSPENDED, EXPIRED, or CANCELLED after its effective date → SUSPENDED; organization TERMINATED only by the W11-1 timer (30 days after paid access ended) or by a platform operator with second-operator approval [W11-1, SB-10]. An operator security suspension sets SUSPENDED regardless of subscription. See §18.

**Organization settings used by approved decisions:** `link_recipient_rule` [W2-1]; `staff_issued_links_enabled` (default off) [W2-2]; `allow_direct_publish` [FD-1, W3-C4]; `ai_marking_enabled`, `ai_generation_enabled` (audited; can only narrow entitlements) [W7-3, W11 PE-4]; quiet hours and weekend days [Wave 4].

## 6.2 Tenant context mechanics (DECIDED, ADR-012)

```
-- TenantTransaction (only place tenant context is set)
BEGIN;
SELECT set_config('app.tenant_id',      :tenant_id,  true),
       set_config('app.actor_kind',     :actor_kind, true),
       set_config('app.actor_id',       :actor_id,   true),
       set_config('app.user_id',        :user_id_or_empty, true),
       set_config('app.correlation_id', :correlation_id, true);
-- domain work
COMMIT;

-- RLS template for every TENANT table
ALTER TABLE s.t ENABLE ROW LEVEL SECURITY;
ALTER TABLE s.t FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON s.t
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

`nullif(..., '')` matters: after a transaction-local setting ends, PostgreSQL returns an empty string for the custom setting, so the comparison yields NULL and no rows (fail closed).

## 6.3 Table categories (PROPOSED CORRECTION X1/X7)

| Category | RLS | Written by | Examples |
|---|---|---|---|
| TENANT | forced tenant_isolation | cm_app in TenantTransaction | almost every domain table |
| REFERENCE | none; SELECT only for cm_app | migrations / platform ops | plan catalogue, runtime images, platform templates, market consent defaults, classification register, evaluation floors |
| GLOBAL-IDENTITY | row policy (user_visibility) | Identity module only | identity.user, identity.external_identity |
| OPERATIONAL | none; no personal data except hashed keys | cm_queue, cm_app (rate limits) | queue tables, admission tokens, rate-limit windows, comms.webhook_inbox |
| PLATFORM | none; cm_app SELECT only where needed; writes by platform ops role | platform ops API | ai.model_snapshot, ai.prompt_version, ai.capability_route, ai.gate_run, ai.golden_*, comms.shared_channel_account, comms.channel_suppression, identity.elevated_access_grant, privacy.subprocessor |

CI test: every table appears in exactly one category; TENANT tables have `tenant_id` and forced RLS; OPERATIONAL tables contain no column classified S2–S4 except hashes.

## 6.4 Roles and resolver functions

| Role | Login | Rights |
|---|---|---|
| cm_migrator | pipeline only | owner of all schemas |
| cm_app | yes | DML on module tables; subject to RLS; EXECUTE on resolver functions |
| cm_queue | yes | queue and admission tables only |
| cm_ops_readonly | break-glass | SELECT, BYPASSRLS, statement audit |
| cm_resolver | NOLOGIN | BYPASSRLS; owns resolver functions; SELECT on the few columns they read (X1) |

Each resolver returns identifiers only, validates input shape, is rate-limited by its caller, and writes an audit record via a SECURITY DEFINER insert into `identity.resolver_audit` (OPERATIONAL, hashed inputs).

**Ownership and boundary [CR-3].** Foundation (the Phase 1 platform layer; not one of the fourteen modules) owns the `cm_resolver` role, the six resolver functions defined by X1 — `resolve_staff_memberships`, `resolve_capability_token`, `resolve_capability_session`, `resolve_invitation`, `resolve_inbound_channel`, `resolve_delivery_by_provider_message` — the resolver infrastructure, and the corresponding architecture/boundary tests. These six functions are a closed, explicit exception to the module-schema isolation rule (X15; ADR-013 "Enforcement"): only they may perform the cross-module reads that X1 requires. The exception gives Foundation no general access to the Identity or Communication schemas and is not a mechanism for any other cross-module query. `identity.resolver_audit` remains owned by Identity & Access; the resolver functions append their audit records only through the SECURITY DEFINER insert described above. No table permission, grant or schema privilege beyond what X1 and this section state is established. Identity & Access owns Identity-domain behavior, ActorContext construction, the `AuthProvider` provider port and the concrete staff IdP adapter; the listing of the staff IdP adapter under Phase 1 in Implementation Architecture §35 is a delivery-phase assignment, not a module-ownership declaration.

**Resolver contracts, privileges, schema and audit boundary [CR-3-F1].** The six X1 resolver functions are SECURITY DEFINER PostgreSQL functions owned by `cm_resolver` and held in the schema `foundation`: `foundation.resolve_staff_memberships`, `foundation.resolve_capability_token`, `foundation.resolve_capability_session`, `foundation.resolve_invitation`, `foundation.resolve_inbound_channel`, `foundation.resolve_delivery_by_provider_message`. The schema `foundation` holds only these six functions; it is not a module schema, holds no tables and is not a general-purpose shared schema. The functions are not placed in `identity` or `comms`. Each function reads only the columns listed here:

| Resolver | Source | Reads | Predicate | Returns |
|---|---|---|---|---|
| `resolve_staff_memberships(user_id)` | `identity.membership` | `user_id`, `status`, `tenant_id` | `user_id` = input; `status` = ACTIVE | set of `tenant_id` (empty set: no active membership) |
| `resolve_capability_token(token_hash)` | `identity.capability_grant` | `token_hash`, `tenant_id`, `id` | `token_hash` = input | `(tenant_id, grant_id)` or not found; `grant_id` is `id` |
| `resolve_capability_session(session_hash)` | `identity.capability_session` | `session_hash`, `tenant_id` | `session_hash` = input | `tenant_id` or not found |
| `resolve_invitation(token_hash)` | `identity.staff_invitation` | `token_hash`, `tenant_id` | `token_hash` = input | `tenant_id` or not found |
| `resolve_inbound_channel(provider, provider_account_ref)` | dedicated account: `comms.channel_account`; shared account: `comms.shared_channel_account` and `comms.channel_account_assignment` | `comms.channel_account`: `provider`, `provider_account_ref`, `id`, `tenant_id`; `comms.shared_channel_account`: `provider`, `provider_account_ref`, `id`; `comms.channel_account_assignment`: `shared_channel_account_id`, `tenant_id` | `provider`, `provider_account_ref` = inputs | candidate set of `tenant_id`: the tenant of a dedicated account, or the tenants assigned to a shared account |
| `resolve_delivery_by_provider_message(provider, provider_account_ref, provider_message_id)` | the account tables above; `comms.delivery` | accounts: `provider`, `provider_account_ref`, `id`; `comms.delivery`: `channel_account_ref`, `provider_message_id`, `tenant_id` | account by `provider`, `provider_account_ref`; delivery by `channel_account_ref`, `provider_message_id` | `tenant_id` or not found |

No row identifier other than those listed is returned unless an authoritative consumer later requires it. Status, expiry and revocation are not resolver predicates, with the single exception of `identity.membership.status` = ACTIVE; they are validated by the owning module's tenant-scoped workflow after resolution (for capability tokens, Section 25.9). Skipping TERMINATED organizations at staff sign-in is performed by the calling Identity workflow; the resolver performs no Tenancy read. `resolve_inbound_channel` does not read Roster, perform ContactPoint matching, decide Communication matching policy, validate tenant lifecycle or business status, or perform consent, opt-out or suppression behavior; sender and contact matching remain in the Communication-owned, tenant-scoped workflow.

*Privileges.* `cm_resolver` holds USAGE on the `identity` and `comms` schemas solely to support these six functions, and no CREATE privilege on either; column-level SELECT only on the columns listed above; and INSERT only on `identity.resolver_audit`, with no UPDATE and no DELETE. Only `cm_app` holds EXECUTE on the six functions; PUBLIC and all other roles do not. `cm_app` has no INSERT privilege on `identity.resolver_audit`. No other role receives any privilege by virtue of the X1 resolver functions; the rights in the role table are otherwise unchanged.

*Audit.* Each function appends its audit record within the resolver call, through the Identity-defined audit append boundary. `identity.resolver_audit` remains owned by Identity & Access, and its column definition remains an Identity concern that is not finalized here. The resolver passes only the information the audit contract requires, including the resolver identity and the hashed resolver inputs.

*Boundary.* The closed exception [CR-3] is unchanged. Foundation may access only the source columns listed above, through these six functions. This authorizes no general Identity or Communication read, cross-module ORM import, shared repository, cross-module query helper, arbitrary raw SQL, cross-schema join outside the resolver functions, or general access to the `identity` or `comms` schemas.

## 6.5 Worker tenant flow

```
dequeue (cm_queue pool) -> job {tenant_id, entity ids, payload_version}
open TenantTransaction(cm_app, tenant_id, SYSTEM, purpose)
load primary entity -> not found under RLS => POISON + security alert
execute handler (no network I/O inside the transaction)
```

# 7. Privacy & Consent

## 7.1 Aggregates

| Aggregate root | Invariants |
|---|---|
| ChannelConsent (current state) | one row per (tenant, contact point, channel, purpose); transitions append a ConsentEvent in the same transaction |
| ProcessingConsent (current state) | one row per (tenant, learner, purpose); grantor must satisfy the active ConsentPolicyVersion (guardian for MINOR/UNKNOWN when policy requires) |
| ConsentPolicyVersion | immutable once ACTIVE; one ACTIVE per tenant |
| ConsentRequest (+ batch) | bound to one capability grant; completes once |
| DeletionRequest | owns DeletionTasks; completes when every applicable register entry is DONE or NOT_APPLICABLE |

## 7.2 Tables

```
privacy.consent_policy_version        TENANT · R1 · S0
  id, tenant_id, version_no, market_code, minor_requires_guardian bool,
  allow_org_attestation bool, purposes_enabled text[], status (DRAFT, ACTIVE, RETIRED),
  effective_at, legal_basis_ref text                       -- OPEN: legal sign-off per market
  UNIQUE (tenant_id, version_no); UNIQUE (tenant_id) WHERE status = 'ACTIVE'

privacy.channel_consent               TENANT · R1 · S1
  id, tenant_id, contact_point_id uuid (Roster), channel (WHATSAPP, EMAIL, SMS),
  -- SMS retained for the adapter interface only; no SMS channel is active in V1 [W4-5]
  purpose (CHALLENGE_DELIVERY, REMINDERS, REPORTS, CONSENT_REQUESTS),
  status (GRANTED, WITHDRAWN, EXPIRED), source (CONSENT_PAGE, ORG_ATTESTED,
  INBOUND_OPT_IN, INBOUND_OPT_OUT, STAFF), policy_version_id, changed_at, row_version
  UNIQUE (tenant_id, contact_point_id, channel, purpose)

privacy.processing_consent            TENANT · R1 · S1
  id, tenant_id, learner_id uuid (Roster), purpose (AI_PROCESSING, GUARDIAN_REPORTING),
  status (GRANTED, WITHDRAWN, EXPIRED), grantor_type (LEARNER, GUARDIAN,
  ORGANIZATION_ATTESTED), grantor_id uuid NULL, policy_version_id, changed_at, row_version
  UNIQUE (tenant_id, learner_id, purpose)

privacy.consent_event                 TENANT · R6 · S1 · append-only
  id, tenant_id, consent_kind (CHANNEL, PROCESSING), consent_id, from_status,
  to_status, source, actor_kind, actor_id, evidence_ref, occurred_at

privacy.consent_request_batch / privacy.consent_request     TENANT · R1 · S1
  request: id, tenant_id, batch_id, learner_id, guardian_id NULL, contact_point_id,
  purposes text[], capability_grant_id, delivery_id NULL,
  status (CREATED, SENT, OPENED, COMPLETED, EXPIRED)

privacy.deletion_request              TENANT · R6 · S1 · audited
  id, tenant_id, subject_type (LEARNER, GUARDIAN, CONTACT_POINT, ORGANIZATION),
  subject_id, reason, status (REQUESTED, APPROVED, EXECUTING, COMPLETED,
  PARTIALLY_FAILED, REJECTED, CANCELLED), requested_by_id, approved_by_id, due_at, completed_at,
  source (STAFF, LEARNER_SELF, GUARDIAN_SELF)             -- W10-1
  execute_after timestamptz NULL                          -- approval + 7 days hold; Owner may
                                                          --   cancel during the hold [W10-3]
  rejection_reason_category NULL                          -- W10 DR-7
  -- due_at = receipt + 30 days: PROPOSED DEFAULT, not legally approved (LG-10)
  external_ledger_ref text NULL                           -- X11

privacy.deletion_task                 TENANT · R6 · S1
  id, tenant_id, deletion_request_id (FK), store_key text, status (PENDING, DONE,
  FAILED, NOT_APPLICABLE), attempts, detail jsonb
  UNIQUE (deletion_request_id, store_key)

privacy.classification_register       REFERENCE
  store_key PK, module, relation, columns text[], sensitivity, retention_class,
  purge_handler text, subprocessors text[]

privacy.retention_override            TENANT · R1
  tenant_id, retention_class, days (CHECK within platform bounds)  PK (tenant_id, class)
  -- allowed classes R2, R4, R5, R8; shorten only; never below platform minimums [W10-4]

privacy.subprocessor                  PLATFORM
  id, provider, service, data_classes text[], purpose, geography, retention,
  deletion_mechanism, dpa_status, sub_subprocessors text[]
```

## 7.3 Consent gate contract

`ConsentGate.check(tenant, subject, purpose, channel?) → ALLOWED | DENIED(reason)`, a synchronous, read-only call (mechanism A). Called at enqueue **and** at dispatch (ADR-019). Rules:

- Channel purposes check `channel_consent` for the target contact point and, on shared accounts, `comms.channel_suppression` by HMAC.
- AI_PROCESSING checks `processing_consent` for the learner, for every AI capability whose inputs contain learner content **or content materially derived from it** (EvaluateResponse, GenerateFeedback, DetectInjection on learner input, and any future equivalent) [W7-C1]. DENIED → Evaluation plans use deterministic and teacher-review steps only.
- GUARDIAN_REPORTING is required before a guardian report is generated for that learner.
- UNKNOWN minor status is treated as MINOR (PROPOSED DEFAULT).

**Withdrawal.** `WithdrawConsent` updates the state row, appends a ConsentEvent and enqueues `ConsentChanged` in one transaction. Consumers cancel queued work (Section 26). In-flight AI results for a withdrawn learner are discarded and their payloads purged.

## 7.4 Deletion fan-out

`RequestDeletion` (staff, or self-service `RequestOwnDeletion` from learner home / guardian home [W10-1]) → approval (OWNER only, recent auth [FD-1, DR-2]) → 7-day hold, cancellable by the Owner [W10-3] → one DeletionTask per applicable register entry → per-module purge jobs (Section 21) → subprocessor deletion calls where supported → completion written to the database and appended to the external write-once ledger (X11). Restore runbook: after any restore, replay ledger entries newer than the restore point.

**OPEN (external provider verification):** whether one-time passcodes over WhatsApp require prior channel opt-in under current provider rules. Until verified, OTP uses a channel with existing consent, or email. SMS is not used [W4-5].

**Withdrawal is not retroactive** [Wave 2 C-9, W10 CW-4]: results, feedback and evidence already produced remain unless deletion is requested; legal adequacy is LG-5.
# 8. Content

**Purpose.** Topics, questions, immutable assessment bundles, rubrics, test suites, hint sets, objectives, provenance, AI-assisted authoring workflow, imports, document ingestion. Content never evaluates.

## 8.1 Aggregates

| Aggregate root | Owned | Invariants |
|---|---|---|
| Topic | — | parent in same tenant; no cycles (service-level check on reparent) |
| TopicMapping | — | append-only; `from_topic` RETIRED after merge |
| Objective | — | code unique per tenant |
| Question (logical identity) | QuestionVersions (as separate aggregate, see below) | owning course optional; `current_published_version_id` points to the single PUBLISHED version of this question; publishing a new version retires the previous one (SUPERSEDED) [W3-C2] |
| QuestionVersion | ResponseSpecification (value, stored in row), TopicWeights, ObjectiveLinks, Provenance | immutable after PUBLISHED; pins at most one RubricVersion, TestSuiteVersion, HintSetVersion; pinned versions must be PUBLISHED at the time of publication; `compatible_with_previous` computed, never user-set |
| Rubric → RubricVersion | Criteria, Levels | version immutable after PUBLISHED; criterion weights sum to 1 |
| TestSuite → TestSuiteVersion | TestCases, ReferenceSolutions, KnownWrongVariants, ValidationRuns | publication requires a PASSED validation run (reference passes all; every known-wrong variant fails ≥ 1 test) |
| HintSet → HintSetVersion | HintSteps | immutable after PUBLISHED; ordered ladder; no step, including the last, may contain the final answer (leak check on every step, because hints are available before closes_at) [W7-C2] |
| SourceDocument | ExtractionArtifacts | extraction artifacts immutable, versioned per extractor version |
| GenerationRequest | GenerationItems | each item maps to exactly one AI operation request_id |
| QuestionImport | ImportRows | idempotent by file hash |

Rubric, TestSuite and HintSet have their own versions so they can be drafted, reviewed and validated before being pinned; the QuestionVersion bundle is what freezes them together (ADR-008).

## 8.2 Material change rules (DECIDED ADR-008, made precise here)

| Change | Creates new QuestionVersion | student_visible_changed | evaluation_changed | Evaluation-compatible with predecessor |
|---|---|---|---|---|
| Prompt text, stem, media, options, option order | yes | yes | maybe | **no** |
| Response input shape (type, fields, units shown, language list for code) | yes | yes | yes | **no** |
| Visible test cases (code) | yes | yes | yes | **no** |
| Answer key, accepted aliases, numeric tolerance, explicit wrong answers | yes | no | yes | yes |
| Rubric version (criteria, levels, weights) | yes | no | yes | yes |
| Hidden test cases, harness config, comparison mode | yes | no | yes | yes |
| Runtime image digest | yes | no | yes | yes |
| Hint set version | yes | yes (hints) | no | yes (ADR-008: hint changes do not break compatibility) |
| Explanation / model solution text (revealed later) | yes | yes (on reveal) | no | yes |
| Topic weights, objectives | yes | no | no (affects learning only) | yes |
| Title, internal notes, tags | **no** (Question metadata) | — | — | — |
| Topic rename / merge | **no** (TopicMapping) | — | — | — |
| Difficulty | yes (difficulty belongs to QuestionVersion) | no (not shown to learners, PROPOSED DEFAULT) | no (learning only) | yes [W3-C1] |

`compatible_with_previous = NOT (prompt/options/media/input-shape/visible-tests changed)`, computed by diffing the canonical content hash components. An evaluation-compatible chain lets a regrade use a later version (Section 11).

## 8.3 Tables

```
content.topic                         TENANT · R1 · S0
  id, tenant_id, parent_id NULL (FK), course_id uuid NULL (Roster), name, code,
  status (ACTIVE, RETIRED), row_version
  UNIQUE (tenant_id, coalesce(course_id, zero), code)
  -- changing course_id (scope) is audited and emits TopicScopeChanged (C7-B);
  -- the topic keeps its id: a scope change never creates a new topic

content.topic_mapping                 TENANT · R1 · S0 · append-only
  id, tenant_id, from_topic_id (FK), to_topic_id (FK), weight numeric(5,4)
  CHECK (weight > 0 AND weight <= 1), effective_at, created_by_id

content.objective                     TENANT · R1 · S0
  id, tenant_id, code, description, course_id NULL, status
  UNIQUE (tenant_id, code)

content.question                      TENANT · R1 · S1
  id, tenant_id, course_id NULL, owner_membership_id NULL, title, tags text[],
  current_published_version_id NULL (FK),       -- difficulty moved to question_version [W3-C1]
  status (ACTIVE, ARCHIVED), row_version

content.question_version              TENANT · R1 · S4 (answer material) · immutable after publish
  id, tenant_id, question_id (FK), version_no int NOT NULL,
  previous_version_id NULL (FK)
  status (DRAFT, IN_REVIEW, APPROVED, PUBLISHED, REJECTED, RETIRED)
  retire_reason NULL CHECK in (SUPERSEDED, MANUAL, QUESTION_ARCHIVED)   -- W3-C2, W3-4
  difficulty (EASY, MEDIUM, HARD) NULL          -- versioned; evaluation-compatible change [W3-C1]
  check_failed bool NOT NULL DEFAULT false      -- kept REJECTED_BY_CHECK item [W3-3]
  check_failure_reasons jsonb NULL              -- preserved AI check reasons [W3-3]
  variant_of_question_id NULL                   -- variant provenance link [W3 P-1]
  source_deleted bool NOT NULL DEFAULT false    -- source document deleted marker [W3-C3]
  response_type text NOT NULL CHECK in (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE,
      NUMERIC, SHORT_TEXT, LONG_TEXT, STRUCTURED, CODE, CODE_EXPLANATION)
  student_content jsonb NOT NULL      -- prompt, options, media refs, visible tests
  response_spec   jsonb NOT NULL      -- schema by type, incl. protected answer material
  explanation     jsonb NULL          -- revealed per RevealPolicy
  rubric_version_id    NULL (FK), test_suite_version_id NULL (FK),
  hint_set_version_id  NULL (FK)
  student_content_hash bytea NOT NULL, evaluation_config_hash bytea NOT NULL,
  student_visible_changed bool, evaluation_changed bool, compatible_with_previous bool,
  provenance_kind (MANUAL, AI_GENERATED, AI_ASSISTED, IMPORTED, EXTRACTED),
  ai_operation_ids uuid[], source_document_id NULL, import_id NULL,
  created_by_id, approved_by_id, approved_at, published_at, retired_at
  UNIQUE (tenant_id, question_id, version_no)

content.question_version_topic        TENANT · immutable
  tenant_id, question_version_id (FK), topic_id (FK), weight numeric(5,4)
  PK (question_version_id, topic_id)   -- weights sum to 1 (trigger at publish)

content.question_version_objective    TENANT · immutable
  tenant_id, question_version_id, objective_id   PK (question_version_id, objective_id)

content.rubric / content.rubric_version / content.rubric_criterion
  rubric_version: id, tenant_id, rubric_id, version_no, status (DRAFT, PUBLISHED,
    RETIRED), language, provenance_kind, published_at
  rubric_criterion: id, tenant_id, rubric_version_id, key, title, description,
    weight numeric(5,4), levels jsonb [{level, score, descriptor}], component
    (CORRECTNESS | QUALITY | COMMUNICATION | CUSTOM)  -- ties criterion to a score component

content.test_suite / content.test_suite_version          S4
  test_suite_version: id, tenant_id, test_suite_id, version_no, status (DRAFT,
    VALIDATING, VALIDATED, PUBLISHED, VALIDATION_FAILED, RETIRED), language text,
    runtime_image_id uuid (codeexec reference), runtime_image_digest text NOT NULL,
    limits jsonb {cpu_ms, wall_ms, memory_mb, pids, output_bytes, compile_ms, fs_mb},
    comparison jsonb {mode: EXACT|TRIMMED|TOKENS|FLOAT_TOLERANCE|CUSTOM_CHECKER, ...},
    scoring jsonb {mode: ALL_OR_NOTHING|PROPORTIONAL|WEIGHTED}, published_at

content.test_case                     TENANT · immutable · S4
  id, tenant_id, test_suite_version_id (FK), ordinal, visibility (VISIBLE, HIDDEN),
  input_ref text (object key) or input_inline text, expected_output_ref / inline,
  weight numeric, provenance_kind, ai_operation_id NULL,
  disputed bool NOT NULL DEFAULT false          -- AI-proposed test whose expected output
                                                --   disagrees with the reference solution;
                                                --   blocks validation [W3 CS-4]
  UNIQUE (test_suite_version_id, ordinal)

content.reference_solution / content.known_wrong_variant   TENANT · immutable · S4
  id, tenant_id, test_suite_version_id, language, source_ref (object key), purpose

content.test_validation_run           TENANT · R1 · S1
  id, tenant_id, test_suite_version_id, status (QUEUED, RUNNING, PASSED, FAILED),
  reference_results jsonb, wrong_variant_results jsonb, execution_request_ids uuid[]

content.hint_set / content.hint_set_version / content.hint_step
  hint_step: tenant_id, hint_set_version_id, ordinal, kind (NUDGE, CONCEPT,
    STRATEGY, PARTIAL_STEP, WORKED_EXAMPLE_DIFFERENT_PROBLEM), body jsonb,
    penalty_hint numeric NULL   -- informational; GradingPolicy decides penalty

content.review_link                   TENANT · R1
  question_version_id, review_task_id   -- Review task opened for approval

content.source_document               TENANT · R2 (teacher material) · S2
  id, tenant_id, object_key, file_sha256, mime, size_bytes, scan_status (PENDING,
  CLEAN, INFECTED, FAILED), status (UPLOADED, SCANNING, EXTRACTING, EXTRACTED,
  FAILED, DELETED), uploaded_by_id
  UNIQUE (tenant_id, file_sha256)

content.extraction_artifact           TENANT · immutable · S2
  id, tenant_id, source_document_id, extractor (provider), extractor_version,
  ocr_used bool, language_detected, text_object_key, structure_object_key,
  injection_flags jsonb, created_at
  UNIQUE (source_document_id, extractor, extractor_version)

content.generation_request            TENANT · R1 · S1
  id, tenant_id, requested_by_id, source_document_id NULL, parameters jsonb,
  status (REQUESTED, RUNNING, COMPLETED, PARTIALLY_FAILED, FAILED, CANCELLED)

content.generation_item               TENANT · R1 · S1
  id, tenant_id, generation_request_id, kind (QUESTION, VARIANT, RUBRIC, HINT_SET,
  EXPLANATION, TESTS, IMPROVEMENT, CLASSIFICATION), target_ref uuid NULL,
  ai_request_id uuid NOT NULL UNIQUE, status (PENDING, SUCCEEDED, FAILED,
  REJECTED_BY_CHECK, KEPT), draft_ref uuid NULL, check_results jsonb
  -- Keep on REJECTED_BY_CHECK creates a DRAFT with check_failed = true, preserved reasons
  --   and AI operation ids; bypasses no review or publication check [W3-3]

content.question_import / content.question_import_row      TENANT · R9
```

## 8.4 QuestionVersion lifecycle

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | DRAFT | author / AI generation / import | — | — | create |
| DRAFT | IN_REVIEW | author | spec schema valid | CreateReviewTask(CONTENT_APPROVAL) | yes |
| IN_REVIEW | APPROVED | reviewer with content.approve | task open | CompleteTask | yes |
| IN_REVIEW | REJECTED | reviewer | — | CompleteTask | yes |
| IN_REVIEW | DRAFT | author (withdraw) | — | review task cancelled | yes [W3 V-2] |
| APPROVED | PUBLISHED | content.publish | pinned sub-versions PUBLISHED; code: suite VALIDATED/PUBLISHED, no disputed tests [CS-4]; hint set passes the every-step leak check [W7-C2]; topic weights sum 1; hashes computed; approver ≠ author unless direct publishing is enabled [FD-1, W3-C4] | set question.current_published_version_id; previous PUBLISHED version → RETIRED (SUPERSEDED) [W3-C2]; emit QuestionVersionPublished | yes |
| DRAFT | PUBLISHED | content.publish (direct publish) | same guards + org setting `allow_direct_publish` | same | yes |
| PUBLISHED | RETIRED (MANUAL) | content.publish | — | removed from selection; existing materializations, marking, history and permitted regrades unaffected [Wave 3 rule 4] | yes |
| RETIRED (MANUAL) | PUBLISHED | Owner/Admin (reinstate) | latest version of an ACTIVE question; SUPERSEDED and QUESTION_ARCHIVED never; content unchanged [W3-4] | set current_published_version_id | yes |
| REJECTED_BY_CHECK item | DRAFT | author (Keep) | — | check_failed = true, reasons preserved [W3-3] | yes |
| PUBLISHED | DRAFT/any edit | — | **invalid**: create a new version | — | — |
| REJECTED | DRAFT | author | — | — | yes |

Imported and AI-generated items start in DRAFT (ADR-018, ADR-009). Direct publish never bypasses validation. Archiving a Question retires its published version with reason QUESTION_ARCHIVED [W3-C2]. Deleting a source document never changes a published version; affected versions carry `source_deleted = true` [W3-C3].

## 8.5 Views (ADR-020)

| Contract | Consumer | Contents | Excludes structurally |
|---|---|---|---|
| StudentQuestionView | Assessment | `student_content`, response input schema derived from spec (field types only), visible tests, hint step count | answer keys, aliases, wrong answers, tolerances, rubric, hidden tests, reference solutions, explanation (until reveal), provenance, prompts |
| StudentRevealView | Assessment (after RevealPolicy allows) | explanation, correct answer, model solution | hidden tests, rubric internals |
| EvaluatorQuestionView | Evaluation | full spec, rubric criteria, test suite refs, hashes, compatibility chain | — |
| HintStepView | Assessment | one hint step by ordinal | other steps |

`StudentQuestionView` is built by an allow-list mapper in the Content module from typed records (not by removing fields from the full record). Its type has no fields that can carry protected data.

**Commands:** CreateQuestion, CreateQuestionVersionDraft, UpdateDraft, SubmitForApproval, ApproveQuestionVersion, RejectQuestionVersion, PublishQuestionVersion, RetireQuestionVersion, CreateRubricVersion, PublishRubricVersion, CreateTestSuiteVersion, RequestTestValidation, PublishTestSuiteVersion, CreateHintSetVersion, PublishHintSetVersion, UploadSourceDocument, RequestGeneration, AcceptGenerationItem (creates DRAFT), ImportQuestions, CommitQuestionImport, CreateTopic, MergeTopics, SplitTopic.
**Queries:** SelectQuestionsForChallenge(criteria) → current published version ids of non-archived questions only [W3-C2]; GetStudentQuestionView; GetEvaluatorQuestionView; GetCompatibilityChain(version) → ordered compatible successors; ResolveTopicMappings(since).
**Events:** QuestionVersionPublished, QuestionVersionRetired, TopicMappingChanged, TopicScopeChanged (C7-B), TestSuiteValidated, GenerationItemReady.

**Generation quality pipeline (ADR-017).** GenerateQuestion → schema validation → solve-check (a second model answers; must match the key) → ambiguity and duplicate checks → classification → draft. Items failing checks are REJECTED_BY_CHECK and visible to the teacher with the reason.

# 9. Challenge

## 9.1 Aggregates

| Aggregate root | Owned | Invariants |
|---|---|---|
| ChallengeDefinition | selection rules, recurrence, targets | RRULE valid; IANA zone valid; targets are cohorts/learners of same tenant (service check) |
| ChallengeOccurrence | — | unique (definition, local occurrence time) |
| ChallengeAssignment | targets | pins GradingPolicyVersion and RevealPolicy at creation; immutable pins |
| StudentChallenge | StudentChallengeItems (frozen versions) | unique (assignment, learner); items frozen at materialization; state machine below |
| ReinforcementPlan | — | one plan per reinforcement item; consumes Learning's item id |

## 9.2 Tables

```
challenge.challenge_definition        TENANT · R1 · S1
  id, tenant_id, course_id uuid NULL, title, target_type (COHORT, LEARNER_SET),
  target_ids uuid[], selection_rule jsonb {mode: FIXED|RULE, question_ids,
  topic_filters, count, difficulty_mix}, rrule text NULL, timezone text NOT NULL,
  window_minutes int, grading_policy_id uuid (Evaluation), reveal_policy jsonb,
  status (DRAFT, ACTIVE, PAUSED, ARCHIVED), row_version

challenge.challenge_occurrence        TENANT · R1 · S1
  id, tenant_id, definition_id (FK), occurrence_local timestamp NOT NULL,
  occurrence_utc timestamptz NOT NULL, assignment_id NULL (FK),
  status (PLANNED, ASSIGNMENT_CREATED, MISSED, SKIPPED)   -- Wave 4 §5.2
  UNIQUE (tenant_id, definition_id, occurrence_local)

challenge.challenge_assignment        TENANT · R1 · S1
  id, tenant_id, definition_id NULL (FK), occurrence_id NULL (FK),
  kind (SCHEDULED, AD_HOC, REINFORCEMENT), title,
  grading_policy_version_id uuid NOT NULL,   -- pinned, immutable
  reveal_policy jsonb NOT NULL,              -- pinned, immutable (ADR-020)
  selection_rule jsonb NOT NULL,             -- snapshot of definition rule
  opens_at, due_at, closes_at,              -- closes_at defaults to due_at and may be later;
                                           --   after due and before close = ON_TIME, shown
                                           --   as "after due" [W4-2]; after opening only
                                           --   extensions of due/close for the whole
                                           --   assignment, audited; no per-learner
                                           --   overrides [W4-4]
  opened_late bool NOT NULL DEFAULT false,  -- missed occurrence opened on recovery [W4 S-5]
  status (DRAFT, SCHEDULED, MATERIALIZING, OPEN, CLOSED, CANCELLED),
  materialized_count int, target_count int, row_version

challenge.assignment_target           TENANT
  tenant_id, assignment_id, target_type (COHORT, LEARNER), target_id
  PK (assignment_id, target_type, target_id)

challenge.student_challenge           TENANT · R1 · S1
  id, tenant_id, assignment_id (FK), learner_id uuid (Roster),
  status (MATERIALIZED, AVAILABLE, OPENED, STARTED, COMPLETED, EXPIRED, CANCELLED),
  cancel_reason (ENROLLMENT_ENDED, ASSIGNMENT_CANCELLED, LEARNER_MERGED,
                 LEARNER_DELETED, STAFF, REINFORCEMENT_INVALIDATED) NULL,   -- W4-C6
  materialized_at, available_at, opened_at, started_at, completed_at, expires_at,
  materialization_seed bigint,
  selection_rule_snapshot jsonb, candidate_pool_size int NULL,
  candidate_pool_hash bytea NULL,          -- reproducibility record [W4 SEL-9]
  row_version
  UNIQUE (tenant_id, assignment_id, learner_id)

challenge.student_challenge_item      TENANT · immutable
  tenant_id, student_challenge_id (FK), ordinal, question_id uuid,
  question_version_id uuid NOT NULL, points numeric NULL
  PK (student_challenge_id, ordinal)

challenge.reinforcement_plan          TENANT · R1 · S1
  id, tenant_id, reinforcement_item_id uuid UNIQUE (Learning), learner_id,
  planned_for timestamptz, assignment_id NULL, student_challenge_id NULL,
  status (PLANNED, REVALIDATING, SCHEDULED, CANCELLED, DONE)
```

## 9.3 Rules

- **Pinning.** `CreateChallengeAssignment` resolves the definition's GradingPolicy to its current ACTIVE version and snapshots RevealPolicy. Later policy changes do not affect the assignment.
- **Materialization.** For each target learner, select QuestionVersions (currently published at materialization time), freeze them as items, create StudentChallenge. Chunks ≤ 500 learners; each chunk its own transaction; unique (assignment, learner) makes chunks idempotent.
- **Selection determinism.** `materialization_seed` makes RULE selection reproducible for audit; the frozen items plus the rule snapshot, seed and candidate-pool size and hash are the authoritative record [W4 SEL-9]. Only current published versions of non-archived questions are selectable [W3-C2].
- **Late joiners.** On `EnrollmentStarted`, open assignments targeting the cohort materialize for the learner if `closes_at` is in the future.
- **Leavers.** On `EnrollmentEnded`, open StudentChallenges not COMPLETED become CANCELLED (ENROLLMENT_ENDED) unless the learner is still targeted through another cohort or directly.
- **Reinforcement.** On `ReinforcementItemCreated`, create a ReinforcementPlan. Before scheduling, call Learning `RevalidateReinforcementItem` (mechanism A, read-only). If invalid → CANCELLED. If valid → create a REINFORCEMENT assignment for the learner (PROPOSED DEFAULT: separate assignment), resolving the learner through `ResolveLearners` [SC3]. **Revalidate again when the reinforcement StudentChallenge opens**; if invalid, the StudentChallenge is CANCELLED (REINFORCEMENT_INVALIDATED) and nothing is sent [SC4, W4-C6]. **Selection** [W4-1, exact Part 1 G4]: up to 3 published questions on the target topic (topic weight ≥ 0.5) not answered by the learner in the previous 14 days; if 1 or 2 are eligible, only those (no top-up); only if none is eligible, repeats drawn only from questions the learner previously got wrong on the topic (repeat-exposure factor applies, D9); empty selection → `MarkReinforcementUnplannable` [W8-C2]. **Grading policy:** course default; organization default for organization-wide topics [W4-1]. **Frequency cap** is enforced by Learning at item creation, never by Challenge; Challenge applies timing, delivery window (72 hours, no reminders) and channel constraints [W4-C5, W4 RF-7].
- **Delivery requests.** When a StudentChallenge becomes AVAILABLE, Challenge emits `DeliveryRequested`. Communication owns the Delivery (X13). Channels: WhatsApp then email (one fallback); no SMS [W4-5, W4 DL-4]. One reminder 24 hours before due, only if not STARTED, within allowed hours; a due-date extension moves an unsent reminder and never creates a second one [Part 1 G5, W4-4].
- **Cancellation keeps submitted work.** Cancelling an assignment never erases submissions; marking continues and results count as learning evidence [W4-3].
- **Answer reveal** of answer-revealing content never happens before the assignment's closes_at [W4-C1].

## 9.4 StudentChallenge state machine

| From | To | Actor / trigger | Invalid | Side effects | Audit |
|---|---|---|---|---|---|
| — | MATERIALIZED | materialization job | — | — | no (bulk; counts only) |
| MATERIALIZED | AVAILABLE | scheduler at opens_at | before opens_at | DeliveryRequested | no |
| AVAILABLE | OPENED | first actual open in any valid learner session (challenge link, learner home, staff-issued link) [W5-C4] | from CANCELLED/EXPIRED; a channel READ event never | — | no |
| OPENED | STARTED | first Attempt created | — | — | no |
| STARTED | COMPLETED | every item has at least one Submission of any timing status, or the learner chooses Finish Challenge [W5-C3, W5-2]; engagement state only, never grading; permitted retries continue until closes_at and never revert it | — | ChallengeCompleted | no |
| AVAILABLE/OPENED/STARTED | EXPIRED | scheduler at expires_at | — | pending LATE_HELD rules | no |
| any non-terminal | CANCELLED | enrollment end, assignment cancel, merge, deletion, staff, reinforcement invalidated at opening [W4-C6] | from COMPLETED | RevokeGrants(scope); submitted work kept [W4-3] | yes |
| COMPLETED/EXPIRED/CANCELLED | anything | — | terminal | — | — |

Engagement ≠ delivery: WhatsApp READ never moves StudentChallenge to OPENED.

**ChallengeAssignment:** DRAFT → SCHEDULED → MATERIALIZING → OPEN → CLOSED; OPEN → OPEN (extended: due/close only later, whole assignment, audited) [W4-4]; DRAFT/SCHEDULED/OPEN → CANCELLED (cancels open StudentChallenges; submitted work kept [W4-3]). Invalid: changing pinned policy fields after SCHEDULED; shortening or per-learner deadlines after opening [W4-4].

**ChallengeOccurrence:** PLANNED → ASSIGNMENT_CREATED; PLANNED → MISSED (not created before its close); PLANNED → SKIPPED (definition paused or archived) [Wave 4 §5.2, S-5].

# 10. Assessment Runtime

## 10.1 Aggregate

**Attempt** is the root. It owns: at most one Submission, a Draft, HintEvents and PracticeRuns. Small aggregate; submission contention is per attempt only.

| Invariant | Enforcement |
|---|---|
| Attempt belongs to an item of a StudentChallenge the actor may answer | service check (Challenge contract `GetAnswerableItem`) |
| attempt_no ≤ policy max attempts | service check using pinned GradingPolicyVersion |
| exactly one Submission per Attempt | `UNIQUE (attempt_id)` on submission (X12) |
| a new Attempt for the same item only when the previous attempt's result is visible (provisional qualifies, "Evaluating…" does not), its performance score is below the maximum, the pinned policy allows another attempt, closes_at has not passed, and the reveal policy does not hide the score [W5-3, W6-C1] | service check + `UNIQUE (student_challenge_id, item_ordinal, attempt_no)` |
| drafts never evaluated | drafts are a separate table with no evaluation reference |
| client clock untrusted | server_received_at authoritative; client time stored for information |
| HintEvents reference the HintSetVersion pinned inside the frozen QuestionVersion | service check |

## 10.2 Tables

```
assessment.attempt                    TENANT · R1 · S1
  id, tenant_id, student_challenge_id uuid, item_ordinal smallint,
  question_version_id uuid NOT NULL (frozen item), learner_id uuid,
  attempt_no smallint NOT NULL, status (OPEN, SUBMITTED, ABANDONED),
  abandon_reason NULL CHECK in (EXPIRED, CANCELLED)   -- W5-C1
  started_at, submitted_at, row_version
  UNIQUE (tenant_id, student_challenge_id, item_ordinal, attempt_no)

assessment.submission                 TENANT · R2 · S3 (content)
  id, tenant_id, attempt_id (FK) UNIQUE, idempotency_key uuid NOT NULL,
  presented_question_version_id uuid NOT NULL,
  response_type text NOT NULL, content jsonb NULL, content_object_key text NULL,
  content_sha256 bytea NOT NULL, client_submitted_at, server_received_at NOT NULL,
  timing_status (ON_TIME, LATE_ACCEPTED, LATE_HELD, LATE_REJECTED),   -- W4-6
  late_rejection_reason NULL CHECK in (TEACHER, HOLD_EXPIRED),        -- W4-6
  -- "after due" is derived (server_received_at > due_at and <= closes_at), not a status [W4-2]
  hints_used smallint NOT NULL DEFAULT 0,   -- includes hints revealed in earlier attempts of
                                            --   the same item [W5-4]
  content_purged_at NULL
  UNIQUE (tenant_id, idempotency_key)

assessment.draft                      TENANT · R2 · S3
  tenant_id, attempt_id PK, content jsonb, content_object_key, updated_at, row_version

assessment.hint_event                 TENANT · R1 · S1
  id, tenant_id, attempt_id (FK), hint_set_version_id, ordinal, revealed_at
  UNIQUE (attempt_id, ordinal)

assessment.practice_run               TENANT · R4 · S3            (X9 confirmed by W5-1)
  -- visible tests only; 20 per attempt, 100 per learner per day, enforced here (not by
  --   Code Execution) [W5-1, W7-C3]; refused when CODE_EXECUTION is exhausted, after
  --   submission and after close
  id, tenant_id, attempt_id (FK), source_object_key, execution_request_id uuid,
  status (QUEUED, RUNNING, COMPLETED, FAILED), visible_results jsonb, created_at

assessment.integrity_fact              TENANT · R1 (with submission metadata) · S1   (W5-5; LG-7)
  id, tenant_id, submission_id, kind (TIME_TO_SUBMIT, DEVICES_SESSIONS,
  SUBMITTED_AFTER_REVEAL, IDENTICAL_NORMALIZED_CONTENT), value jsonb (no content; hashes
  only), created_at
  -- never changes a score, result, timing status or evidence; never shown to learners or
  --   guardians; staff views audited [W5-5]; deleted with the learner [W10 LD-10]
```

## 10.3 Submission flow (see Section 25.1 for the transaction)

`SubmitResponse` validates the response against the StudentQuestionView input schema, persists the Submission, closes the Attempt, calls `Evaluation.CreatePendingEvaluation` (mechanism A), and returns immediately with the learner-facing status. For LATE_HELD, no evaluation is created until `AcceptLateSubmission`. Challenge Me stores **one submission per attempt**; this is a statement about Challenge Me's record, not exactly-once execution at outside providers (J-6) [W5 SU-9]. An attempt ABANDONED (EXPIRED) may receive its one queued submission through the late path until closes_at + 14 days; ABANDONED (CANCELLED) is terminal; the original server position is authoritative [W5-C1, W5-C2]. LATE_HELD for 14 days, then LATE_REJECTED (HOLD_EXPIRED); a teacher rejection is LATE_REJECTED (TEACHER) [W4-6].

## 10.4 Reveal (ADR-020)

`GetRevealState(student_challenge, item)` computes what may be shown from the pinned RevealPolicy, the current time, StudentChallenge status and the evaluation head. Fields:

```
reveal_policy (pinned): {
  score:          IMMEDIATE | AFTER_CHALLENGE_COMPLETE | AFTER_DUE_DATE | NEVER,
  feedback:       ...,
  correct_answer: ...,
  explanation:    ...,
  model_solution: ...,
  visible_tests:  ...
}
PROPOSED DEFAULT (sign-off): score + feedback IMMEDIATE; the rest not before closes_at
-- Answer-revealing content (correct answer, explanation, model solution and equivalent)
--   is never shown before the assignment's closes_at, whatever the policy says;
--   AFTER_DUE_DATE and AFTER_CHALLENGE_COMPLETE for these fields mean "not before
--   closes_at" [W4-C1]. Retries never bypass the reveal policy [W5-3].
-- Provisional results are shown labelled "Provisional" [W6-5]; no result-ready message
--   in V1 [W6-1].
```

## 10.5 Student DTO enforcement

1. Assessment depends only on Content's `StudentQuestionView` and `StudentRevealView` types.
2. Student endpoints return DTO classes built from those views; serializers are explicit field lists.
3. Snapshot tests for each student endpoint.
4. Canary test: seed each protected field type with a unique marker, call every student endpoint, assert markers absent from all responses (bodies, headers, error messages).
5. Architecture test: Assessment may not import `EvaluatorQuestionView` or any Content repository.

**Commands:** StartAttempt, SaveDraft, RequestHint, SubmitResponse, RunPractice, FinishChallenge [W5-2], AcceptLateSubmission, RejectLateSubmission (reason TEACHER), ExpireLateHold (system, HOLD_EXPIRED) [W4-6], AbandonAttempt.
**Queries:** GetStudentChallenge (learner view), GetItemForLearner, GetLearnerResultView (maps head → UX state), GetTeacherSubmissionView (draft existence only, never draft content [W5 DR-5]; integrity facts, audited [W5-5]).
**Events:** ResponseSubmitted (informational), LateSubmissionHeld, LateSubmissionAccepted, LateSubmissionRejected (reason) [W5 §8].

# 11. Evaluation

**Purpose.** Plan and execute evaluation strategies, compose results, compute confidence, decide lifecycle, maintain the authoritative head, handle disputes and regrades. Owns GradingPolicy and ConfidencePolicy.

## 11.1 Aggregates

| Aggregate root | Owned | Invariants |
|---|---|---|
| ResponseEvaluationHead | — | exactly one per **evaluable** submission (ON_TIME, LATE_ACCEPTED); none for LATE_HELD or LATE_REJECTED [W6-C5]; `revision` strictly increasing; changes only by compare-and-set; `current_evaluation_id` references an Evaluation of the same submission |
| Evaluation | EvaluationContext (1:1), EvaluationRuns, CriterionResults, ComponentResults | results immutable once status ≠ PENDING; status transitions per table 11.4; exactly one EvaluationContext |
| GradingPolicy → GradingPolicyVersion | composition rules | version immutable once ACTIVE |
| ConfidencePolicy → ConfidencePolicyVersion | thresholds | immutable once ACTIVE; review_threshold ≥ platform floor |
| Dispute | — | at most `max_open_per_response` open disputes per submission |
| RegradeRequest | RegradeItems | approval by permitted approver; execution idempotent per item |

## 11.2 Tables

```
evaluation.grading_policy / evaluation.grading_policy_version     TENANT · R1 · S0
  version: id, tenant_id, grading_policy_id, version_no, status (DRAFT, ACTIVE,
    RETIRED), rules jsonb NOT NULL, published_at
  rules: {
    attempts: {max, retry_weighting: [1.0, 0.8, 0.6]},
    hints: {penalty_per_step, max_penalty},
    components: [{key, weight, authority_allowed: [DETERMINISTIC|SEMANTIC_AI|
                  AI_QUALITATIVE|HUMAN]}],
    plan_overrides_by_response_type: {...},
    on_missing: {CODE: HOLD, AI_QUALITY: RENORMALIZE|REVIEW},
    semantic_correctness: {auto_confirm_allowed: false},
    dispute: {window_days: 14, max_open_per_response: 1},
    confidence_policy_version_id,
    auto_confirm: {enabled, delay_hours}
  }

evaluation.confidence_policy_version   TENANT (or platform default) · R1 · S0
  id, tenant_id, version_no, status, review_threshold numeric CHECK (>= floor),
  auto_confirm_threshold numeric, run_count_by_type jsonb, disagreement_weight,
  evidence_weight, floor_ref (REFERENCE row id)

evaluation.evaluation_floor            REFERENCE
  key PK, review_threshold_floor numeric   -- proposed 0.4, sign-off gate 8

evaluation.response_evaluation_head    TENANT · R1 · S1
  submission_id uuid PK, tenant_id, learner_id uuid, question_version_id uuid,
  current_evaluation_id uuid NOT NULL (FK),
  revision bigint NOT NULL, human_locked bool NOT NULL DEFAULT false,
  current_origin text NOT NULL, current_status text NOT NULL,   -- denormalized for queries
  updated_at

evaluation.evaluation                  TENANT · R1 (+R2 via references) · S1
  id, tenant_id, submission_id uuid NOT NULL, learner_id uuid NOT NULL,
  origin (AUTOMATED, REGRADE, TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION),
  status (PENDING, PROVISIONAL, NEEDS_REVIEW, CONFIRMED, SUPERSEDED, DISCARDED),
  is_candidate bool NOT NULL DEFAULT false,   -- machine result blocked by human lock
  review_reason text NULL CHECK in (LOW_CONFIDENCE, RUN_FAILURE, VALIDATOR_FAILURE,
      INJECTION_SUSPECTED, CONFLICT_WITH_HUMAN, DISPUTE, BUDGET_HOLD_EXPIRED,
      DEADLINE_EXCEEDED, NO_AI_CONSENT, TEACHER_REVIEW_STEP,
      UNCONFIRMED_SEMANTIC),                -- W6-2, W6-C2
  -- immutable result block (set once when leaving PENDING):
  performance_score numeric NULL,           -- before grading adjustments; the only score
                                            --   Learning uses [C2]
  total_score numeric NULL,                 -- after the hint penalty for this attempt's
                                            --   hints_used and the retry weight for this
                                            --   attempt number, applied exactly once [W6-C4]
  max_score numeric NULL, result_summary jsonb NULL,
  confidence numeric NULL, confidence_inputs jsonb NULL,
  result_set_at timestamptz NULL,
  -- write-once feedback (X5):
  feedback_ref text NULL, feedback_status (NONE, PENDING, READY, WITHHELD),
  -- lifecycle:
  decision_deadline timestamptz NOT NULL,
  confirmed_at, confirmed_by_id NULL, confirm_mode (AUTO, HUMAN, INSTANT) NULL,
  superseded_by_evaluation_id NULL (FK), superseded_at,
  authored_by_id NULL, reason_code NULL, note_ref NULL,
  regrade_request_id NULL, dispute_id NULL, supersedes_evaluation_id NULL,
  created_at
  trigger: result block columns immutable once result_set_at IS NOT NULL

evaluation.evaluation_context          TENANT · immutable · S1
  evaluation_id PK (FK), tenant_id,
  presented_question_version_id uuid NOT NULL,
  evaluation_question_version_id uuid NOT NULL,
  grading_policy_version_id uuid NOT NULL,
  confidence_policy_version_id uuid NOT NULL,
  rubric_version_id NULL, test_suite_version_id NULL, runtime_image_digest NULL,
  normalizer_version text NOT NULL, plan jsonb NOT NULL, ai_consent_state text NOT NULL,
  context_hash bytea NOT NULL

evaluation.evaluation_run              TENANT · R1 · S1
  id, tenant_id, evaluation_id (FK), step_key text, strategy (DETERMINISTIC,
  AI_RUBRIC, AI_SEMANTIC, CODE_EXECUTION, TEACHER_REVIEW),
  status (QUEUED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT),
  failure_class (INFRASTRUCTURE, RATE_LIMITED, PROVIDER, VALIDATION, DOMAIN,
                 CANCELLED, BUDGET) NULL,
  ai_operation_id NULL, execution_request_id NULL, review_task_id NULL,
  usage_entry_ids uuid[], attempt_count smallint, deadline_at,
  started_at, finished_at, output_ref text NULL
  UNIQUE (evaluation_id, step_key)

evaluation.component_result            TENANT · immutable · S1
  id, tenant_id, evaluation_id, component_key, authority (DETERMINISTIC, SEMANTIC_AI,
  AI_QUALITATIVE, HUMAN), outcome (MATCH_CORRECT, MATCH_INCORRECT, NO_DETERMINATION,
  SCORED) , score numeric, max_score numeric, source_run_id NULL, misconception_tag NULL
  UNIQUE (evaluation_id, component_key)

evaluation.criterion_result            TENANT · immutable · S1 (evidence by reference)
  id, tenant_id, evaluation_id, run_id NULL, rubric_criterion_key, level,
  score numeric, max_score numeric,
  evidence jsonb  -- [{start, end, content_sha256}] offsets into the submission (ADR-006)
  evidence_verified bool, explanation_ref text NULL, validation jsonb

evaluation.code_test_result            TENANT · R4 · S3 (observations) / S1 (outcome)
  id, tenant_id, evaluation_run_id, test_case_id, visibility, outcome (PASSED,
  WRONG_ANSWER, TIME_LIMIT, MEMORY_LIMIT, RUNTIME_ERROR, COMPILE_ERROR,
  OUTPUT_LIMIT), time_ms, memory_kb, observation_ref text NULL, purged_at

evaluation.dispute                     TENANT · R1 · S2 (text) · audited
  id, tenant_id, submission_id, raised_by_kind (LEARNER, GUARDIAN, STAFF),
  raised_by_id, reason_code, text_ref text NULL,   -- dispute text never sent to AI [W6 DI-3]
  -- only on a score visible to the learner, within 14 days of it becoming visible; not on
  --   a DISPUTE_RESOLUTION result [W6 DI-2]
  status (OPEN, UNDER_REVIEW, UPHELD, REJECTED, WITHDRAWN),
  head_revision_at_open bigint, review_task_id, resolution_evaluation_id NULL,
  resolved_by_id, resolved_at
  UNIQUE (tenant_id, submission_id) WHERE status IN ('OPEN','UNDER_REVIEW')
  -- when max_open_per_response = 1 (default)

evaluation.regrade_request             TENANT · R1 · S1 · audited
  id, tenant_id, scope jsonb {question_id | question_version_ids | assignment_ids |
  submission_ids}, target_kind (QUESTION_VERSION, GRADING_POLICY_VERSION),
  target_evaluation_question_version_id NULL, target_grading_policy_version_id NULL,
  notification_policy (NONE, CHANGED_ONLY, MATERIAL_ONLY),
  status (DRAFT, PREVIEWING, PREVIEWED, APPROVED, RUNNING, COMPLETED, FAILED,
  CANCELLED), preview jsonb, requested_by_id, approved_by_id, approved_at,
  counts jsonb, row_version

evaluation.regrade_item                TENANT · R1 · S1
  tenant_id, regrade_request_id, submission_id, status (PENDING, DONE, SKIPPED_HUMAN,
  NO_CHANGE, FAILED, SKIPPED_CONTENT_PURGED), new_evaluation_id NULL   -- W10-C1
  PK (regrade_request_id, submission_id)
```

## 11.3 Head (ADR-011 with corrections X3, X8)

```
UPDATE evaluation.response_evaluation_head
   SET current_evaluation_id = :new_id,
       revision = revision + 1,
       human_locked = :human_locked,
       current_origin = :origin, current_status = :status, updated_at = now()
 WHERE submission_id = :submission_id
   AND revision = :expected_revision;
-- 0 rows => CAS lost: re-read head, re-decide (never blind retry)
```

- `revision` increments when: the current evaluation changes; the current evaluation's result arrives (PENDING → PROVISIONAL/NEEDS_REVIEW with result/CONFIRMED); the current evaluation becomes CONFIRMED. (X3)
- `human_locked` = current origin ∈ {TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION} OR (current status CONFIRMED AND confirm_mode = HUMAN). (X8)
- Every head change enqueues `EvaluationHeadChanged` in the same transaction.
- A machine writer (AUTOMATED, REGRADE) that finds `human_locked = true` inserts its result with `is_candidate = true`, status NEEDS_REVIEW, reason CONFLICT_WITH_HUMAN, and creates a ReviewTask. The head does not move.
- Machine writers that find a newer non-locked head than the one they started from re-decide: a REGRADE result still replaces a non-locked head (it is the purpose of regrading); an AUTOMATED result from an older evaluation run whose evaluation is no longer current is discarded (evaluation status SUPERSEDED immediately, no head change).

**"Overridden"** is shown when `current_origin = TEACHER_OVERRIDE`.

## 11.4 Evaluation state machine

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | PENDING | CreatePendingEvaluation (Assessment), Regrade, Dispute-less teacher action | context pinned | runs enqueued; head created (first) | no |
| PENDING | CONFIRMED (confirm_mode INSTANT) | composer | all correctness DETERMINISTIC; no AI components; no review conditions | result set; head rev+1 | no |
| PENDING | PROVISIONAL | composer | confidence ≥ review_threshold; no review conditions | result set; head rev+1; schedule auto-confirm if eligible; GenerateFeedback | no |
| PENDING | NEEDS_REVIEW | composer / deadline sweep | review condition (Table 11.7) | result set if any; ReviewTask; head rev+1 if current | no |
| PROVISIONAL | CONFIRMED (AUTO) | auto-confirm job | delay elapsed; no open dispute; head revision unchanged; auto-confirm allowed (not SEMANTIC_AI correctness) | head rev+1 | no |
| PROVISIONAL / NEEDS_REVIEW | CONFIRMED (HUMAN) | ConfirmEvaluation (staff) | head CAS | head rev+1; human_locked | yes |
| PROVISIONAL / NEEDS_REVIEW / CONFIRMED | SUPERSEDED | new head evaluation | head CAS | superseded_by set | via new evaluation |
| NEEDS_REVIEW (candidate) | DISCARDED | reviewer rejects machine candidate | is_candidate | ReviewTask completed | yes |
| PENDING | SUPERSEDED | override/regrade before result arrives | head CAS | runs cancelled (FAILED/CANCELLED) | via new evaluation |
| CONFIRMED | PROVISIONAL / NEEDS_REVIEW | — | **invalid** | — | — |
| any non-PENDING | result change | — | **invalid** (immutable) | — | — |
| SUPERSEDED / DISCARDED | any | — | **invalid** (terminal) | — | — |

Human-created evaluations (TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION) are inserted directly as CONFIRMED with confirm_mode HUMAN.

## 11.5 Feedback (X5)

Feedback is generated after the result is set, by `GenerateFeedback` over the immutable CriterionResults, stored in the payload store, and referenced once by `feedback_ref`. The leak check covers the answer key, accepted answers, reference solution, **model solution, the version's explanation** and hidden-test data [W6-C3]. Leak check failure → one regeneration → second failure → `feedback_status = WITHHELD`, flag for review; the score stands. Feedback never changes scores. Feedback is written in the question version's language [W6 FB-3]. Deterministic results show correct / incorrect and the score, never the correct option before closes_at [W4-C1].

## 11.6 EvaluationPlan and strategies

Plan (stored in EvaluationContext) = ordered steps derived from ResponseSpecification + GradingPolicyVersion + consent state:

```
step: { key, strategy, components_owned[], required: bool,
        on_missing: HOLD | RENORMALIZE | REVIEW,
        on_no_determination: null | <step_key>,     -- X2
        deadline_seconds }
```

| Response type | Default plan (PROPOSED DEFAULT) |
|---|---|
| single/multiple choice, true/false | DETERMINISTIC(correctness) |
| numeric | DETERMINISTIC(correctness; tolerance, units, digit normalization) |
| short text CLOSED | DETERMINISTIC(correctness); NO_DETERMINATION = incorrect |
| short text OPEN_SEMANTIC | DETERMINISTIC(correctness) → on NO_DETERMINATION: AI_SEMANTIC(correctness, authority SEMANTIC_AI) |
| long text | AI_RUBRIC(quality components per rubric), runs = 2 |
| structured | per field: DETERMINISTIC fields + AI_RUBRIC fields as declared in spec |
| code | CODE_EXECUTION(correctness) + optional AI_RUBRIC(quality) |
| code explanation/review | AI_RUBRIC(quality, understanding) |
| any, no AI consent or AI unavailable in region | AI steps replaced by TEACHER_REVIEW |

| Strategy | Inputs | Output | Authority | Async | Failure / retry | Budget |
|---|---|---|---|---|---|---|
| DETERMINISTIC | submission, spec, normalizer | MATCH_CORRECT / MATCH_INCORRECT / NO_DETERMINATION + misconception tag | DETERMINISTIC | in-transaction (no I/O) | none (pure) | none |
| AI_SEMANTIC | submission, accepted answers, rubric | SemanticCorrectness(score, evidence) | SEMANTIC_AI | yes | retry infra/rate-limit; validation fail → REVIEW | STUDENT_EVALUATION reserve |
| AI_RUBRIC | submission, rubric, question | per-criterion level, evidence offsets, explanation refs | AI_QUALITATIVE | yes | as above; n runs | STUDENT_EVALUATION |
| CODE_EXECUTION | source, test inputs, runtime digest, limits | per-test observations → trusted comparison → correctness | DETERMINISTIC | yes | provider failures retry → HOLD → deadline → REVIEW; student outcomes never retried | CODE_EXECUTION |
| TEACHER_REVIEW | submission, evaluator view | TEACHER_PRIMARY evaluation | HUMAN | yes (human) | SLA escalation | none |

**Composer rules.**
1. Each component is taken from the step that owns it.
2. A DETERMINISTIC outcome for a component can never be replaced by a non-HUMAN result (enforced by types and by a composer assertion).
3. SEMANTIC_AI may fill a correctness component only via `on_no_determination`.
4. Missing required components apply `on_missing`.
5. Performance score = Σ component weight × normalized score. Total = performance score with the policy's hint penalty (for `hints_used`, including carried hints [W5-4]) and the retry weight of this attempt's number, each applied exactly once [W6-C4].
6. **Item grade** = best total among the item's evaluated attempts; LATE_HELD and LATE_REJECTED attempts excluded; never re-applies weights; never read by Learning [W6-3]. **Challenge grade** = earned points / points of all items; unanswered items shown "Not attempted", never "0" or "Wrong", with the count shown [W6-4].
7. **Budget holds** [W11-C4]: a step held for STUDENT_EVALUATION or CODE_EXECUTION re-checks the pool every 5 minutes until its deadline; a new AI operation may be requested for the held step only if no provider operation was previously started for it; otherwise the started operation's outcome follows X6 idempotency and daily reconciliation; past the deadline → NEEDS_REVIEW (BUDGET_HOLD_EXPIRED).

## 11.7 Confidence (ADR-015)

Computed only when AI components exist. Deterministic-only evaluations have no confidence (NULL).

```
agreement      = 1 - max_c |level_run1(c) - level_run2(c)| / level_range(c)   (1.0 if one run)
evidence_rate  = verified_scored_criteria / scored_criteria
prior          = gate agreement of the (PromptVersion, ModelSnapshot) pair, per language+type
raw            = min(agreement, 1 - evidence_weight * (1 - evidence_rate))
confidence     = min(raw, prior)
confidence     = 0 if any validator failed or injection flag set
```

Evidence verification: offsets resolve into the submission; the span text, after ADR-010 normalization and whitespace/punctuation tolerance, must match the quoted evidence the model returned.

**Review conditions (→ NEEDS_REVIEW):** confidence < review_threshold; validator failure; injection flag; required run failed with on_missing REVIEW; code infrastructure failure past deadline; budget hold past deadline; an AI step required but no AI consent (the plan is normally re-planned to TEACHER_REVIEW instead); TEACHER_REVIEW step.

**SEMANTIC_AI correctness (X2):** never INSTANT-confirmed; with confidence at or above review_threshold it becomes PROVISIONAL **without** auto-confirm unless the GradingPolicy sets `semantic_correctness.auto_confirm_allowed = true` (default false). Teachers confirm it individually or in bulk. If unconfirmed after 14 days it stays PROVISIONAL (provisional learning weight) and an EVALUATION_REVIEW task with review reason UNCONFIRMED_SEMANTIC is created, escalated to the appropriate admin scope; it is never auto-confirmed [W6-2, W6-C2].

**Auto-confirm:** PROVISIONAL with confidence ≥ auto_confirm_threshold, no SEMANTIC_AI correctness, policy enabled → `AutoConfirmEvaluation` job at result_set_at + delay.

## 11.8 Human actions, disputes, regrades

| Action | Result |
|---|---|
| ConfirmEvaluation (unchanged) | status → CONFIRMED (HUMAN); head rev+1; human_locked |
| OverrideEvaluation | new evaluation TEACHER_OVERRIDE, CONFIRMED; head CAS; mandatory reason |
| Teacher grades a TEACHER_REVIEW step | new evaluation TEACHER_PRIMARY, CONFIRMED; head CAS |
| Accept machine candidate (conflict task) | new evaluation TEACHER_OVERRIDE copying the candidate's result (the human adopts it); candidate → SUPERSEDED |
| Reject machine candidate | candidate → DISCARDED |
| Dispute UPHELD | new evaluation DISPUTE_RESOLUTION; dispute UPHELD |
| Dispute REJECTED | no evaluation change; dispute REJECTED; if the head was PROVISIONAL, reviewer may confirm it |

**Regrade.** Approver never the requester, even when no other approver exists [FD-1]; scope limited to what both requester and approver can access [W6 RG-3]; submissions whose content was purged are skipped (SKIPPED_CONTENT_PURGED) [W10-C1]; learner notification means the "Updated result" state only, default CHANGED_ONLY; material = correctness flip or change ≥ 10% of maximum [W6 RG-6, W6-1]. `RequestRegrade` → preview job computes, per submission in scope: whether the target version is in the presented version's compatible chain (else SKIPPED as incompatible), deterministic re-scores (cheap), and an estimate for AI steps (not executed in preview; PROPOSED DEFAULT). Approval → chunked execution; each item creates a REGRADE evaluation with a new EvaluationContext (`evaluation_question_version_id` = target) and runs its plan; human-locked heads → one grouped ReviewTask per request (ReviewGroup). Notifications follow the request's policy.

**Commands:** CreatePendingEvaluation (internal), RecordRunResult (internal), ComposeEvaluation (internal), ConfirmEvaluation, BulkConfirmEvaluations (≤ 200), OverrideEvaluation (reason categories MARKING_ERROR, RUBRIC_INTERPRETATION, ACCEPTED_ALTERNATIVE, OTHER [W6 TR-4]), GradeTeacherReview, ResolveConflictCandidate, RequestDispute, WithdrawDispute, ResolveDispute, RequestRegrade, ApproveRegrade, CancelRegrade, PublishGradingPolicyVersion, PublishConfidencePolicyVersion (Owner, Admin only [W6 §6]), FlagForSafeguarding (any staff; creates a restricted SAFEGUARDING task; never changes a result) [W7-5].
**Queries:** GetHead(submission), GetEvaluationDetail (staff; never AI prompt text [W6 TR-5]), GetLearnerResult (student-safe), ListReviewableEvaluations, GetRegradePreview, GetItemGrade [W6-3], GetChallengeGrade [W6-4].
**Machine candidates:** a candidate whose result equals the human result creates no review task [W6 HD-4].
**Events:** EvaluationHeadChanged (→ Learning, Reporting, Assessment), EvaluationNeedsReview (→ informational), DisputeOpened, DisputeResolved, RegradeCompleted.

# 12. Learning

## 12.1 Aggregates

| Aggregate root | Invariants |
|---|---|
| Observation (one per submission) | holds the effective observation; updated only by events with a higher head revision |
| TopicState (per learner pseudonym × topic) | a projection; recomputed from observations by a pure function under the **applicable** ACTIVE LearningPolicyVersion (C7); keyed by learner + topic only (never by course); records the `policy_version_id` it was calculated under |
| LearningSignal | derived records with basis, kind ∈ exactly the six D14 signals: REPEATED_MISCONCEPTION, MISCONCEPTION_RESOLVED, PERSISTENT_DIFFICULTY, RETRY_RECOVERY, RETRY_DEPENDENCE, HINT_DEPENDENCE. Topic states (STRONG, DEVELOPING, NEEDS_PRACTICE, INSUFFICIENT_EVIDENCE) are TopicState values, never signals. Signals are teacher-facing context only and are never an input to reinforcement (C10, D13, D14). REPEATED_MISCONCEPTION (APPROVED C6): same misconception tag in ≥ 2 distinct evidence units (all attempts on one student-challenge item form one unit; retries never count separately) across ≥ 2 distinct questions within 28 days; fully recomputed from current evidence, never a running counter; parameters versioned in LearningPolicyVersion; not a reinforcement trigger |
| ReinforcementItem | created, revalidated and cancelled only from the current TopicState and the reinforcement rules of the active LearningPolicyVersion; basis = the TopicState that satisfied the rule (state, policy version) + observation ids + head revisions; no signal or trajectory field is an input (C11, D13); state machine below |
| LearningPolicyVersion | immutable once ACTIVE; one ACTIVE per (tenant, course or org default). Applicable policy (APPROVED C7, C7-A): a course-scoped topic (content.topic.course_id set) uses the ACTIVE LearningPolicyVersion of that course when one exists, and otherwise inherits the ACTIVE organization LearningPolicyVersion; an organization-wide topic (course_id NULL) always uses the ACTIVE organization LearningPolicyVersion. Never selected by ChallengeAssignment or by the course in which the evidence was produced. A topic scope change (C7-B) changes the applicable version and triggers the normal rebuild. Not pinned per assignment (ADR-014) |

## 12.2 Tables

```
learning.learning_event                TENANT · R1 · S1 · append-only
  id, tenant_id, event_type (OBSERVATION_RECORDED, OBSERVATION_REPLACED,
  OBSERVATION_RETRACTED), submission_id, learner_pseudonym_id uuid, head_revision bigint,
  evaluation_id, payload jsonb (no learner content), occurred_at
  UNIQUE (tenant_id, submission_id, head_revision, event_type)

learning.observation                   TENANT · R1 · S1
  submission_id PK, tenant_id, learner_pseudonym_id, course_id NULL,
  question_version_id, head_revision bigint, evaluation_id, status_class
  (PENDING, PROVISIONAL, CONFIRMED, REVIEW_PENDING, RETRACTED),
  -- RETRACTED is not produced in V1: learner deletion deletes all learning rows for the
  --   pseudonym [W10-C3]
  -- PENDING (W8-C4): head without an authoritative result; contributes zero evidence
  normalized_score numeric, component_scores jsonb, topic_weights jsonb,
  misconception_tags text[], hinted bool, attempt_no smallint, observed_at, updated_at

learning.learning_policy_version       TENANT · R1 · S0
  -- course_id NULL = organization policy; course_id set = course policy
  -- applicable version per topic scope (C7, C7-A): course-scoped topic -> its course's
  --   ACTIVE version if one exists, else the organization's ACTIVE version (inherited);
  --   organization-wide topic -> always the organization's ACTIVE version
  id, tenant_id, course_id NULL, version_no, status, rules jsonb {
    provisional_weight: 0.5, review_pending_weight: 0, recency_half_life_days,
    min_evidence: 3, strong_threshold, needs_practice_threshold,
    signals: { repeated_misconception: {                 -- APPROVED C6 (replaces the former
                 min_distinct_units: 2,                   --  "2 occurrences within 14 days")
                 min_distinct_questions: 2,
                 window_days: 28 },                       -- retries = one evidence unit;
               ... other D14 signal parameters },         -- recomputed, never a counter;
                                                          -- never read by reinforcement
    reinforcement: {                                      -- APPROVED W8-1, W8-C3
      delay_hours: 48,               -- due time after creation
      topic_spacing_days: 7,         -- no new item within 7 days of the last delivered on the topic
      max_open_per_topic: 1,         -- one PENDING or SCHEDULED item per learner x topic
      max_per_rolling_7_days: 2,     -- scheduled or delivered; at the cap: postpone, never drop
      unscheduled_expiry_days: 14 }} -- item EXPIRED if not scheduled within 14 days

learning.topic_state                   TENANT · R1 · S1 · projection
  tenant_id, learner_pseudonym_id, topic_id, course_id NULL,
  mastery_estimate numeric, evidence_weight numeric, observation_count int,
  state (STRONG, DEVELOPING, NEEDS_PRACTICE, INSUFFICIENT_EVIDENCE),
  policy_version_id NOT NULL, computed_at, projection_revision bigint
  PK (tenant_id, learner_pseudonym_id, topic_id)          -- unchanged: not course-keyed (C7)
  -- course_id = the topic's course scope (denormalized for queries), NULL for
  --   organization-wide topics; it is not part of the key
  -- policy_version_id = the applicable version (C7) used for this calculation;
  --   TopicTrajectory (Learning Trajectory Model §19.2) records the same version

learning.learning_signal               TENANT · R1 · S1
  id, tenant_id, learner_pseudonym_id, topic_id,
  kind CHECK in (REPEATED_MISCONCEPTION, MISCONCEPTION_RESOLVED, PERSISTENT_DIFFICULTY,
                 RETRY_RECOVERY, RETRY_DEPENDENCE, HINT_DEPENDENCE),        -- C10, D14
  basis jsonb, status (ACTIVE, CLEARED), created_at, cleared_at
  -- derived; recomputed with the projection; not read by reinforcement (C11)

learning.reinforcement_item            TENANT · R1 · S1
  id, tenant_id, learner_pseudonym_id, topic_id, reason,
  basis_topic_state text NOT NULL, basis_policy_version_id uuid NOT NULL,   -- C11 (replaces signal_id)
  basis jsonb [{submission_id, head_revision}], due_after timestamptz,
  status (PENDING, SCHEDULED, DELIVERED, CANCELLED, SUPERSEDED, EXPIRED),
  cancel_reason NULL,   -- incl. LEARNER_INELIGIBLE (no active enrollment where the topic applies)
  expiry_reason NULL CHECK in (UNSCHEDULED_14_DAYS, NO_ELIGIBLE_QUESTIONS),   -- W8-1, W8-C2
  row_version

learning.projection_rebuild            TENANT · R1 · S1
  id, tenant_id, scope (LEARNER, LEARNER_TOPIC, TENANT), scope_ids jsonb,
  reason (POLICY_CHANGE, TOPIC_MAPPING, TOPIC_SCOPE_CHANGE, MERGE, REPAIR),   -- TOPIC_SCOPE_CHANGE: C7-B
  status, started_at, finished_at
```

Learning stores pseudonyms, not learner ids (ADR-006/018). Deletion removes the pseudonym mapping in Roster; Learning rows are then deleted by the purge handler for that pseudonym (no RETRACTED rows remain) [W10-C3]. Submissions on cancelled assignments and before a learner left a cohort are normal evidence [W4-3]; LATE_HELD contributes nothing; LATE_ACCEPTED joins at its original position; LATE_REJECTED never [W4-6, D1]; the item grade is never read [W6-3].

## 12.3 Pipeline

```
EvaluationHeadChanged {submission, head_revision, evaluation_id, status, origin}
  -> Learning handler (idempotent on submission+revision)
     if head_revision <= observation.head_revision: ignore (stale / duplicate)
     fetch EvaluationSummary (Evaluation contract, no learner content)
     upsert observation (replace semantics)
     append learning_event (RECORDED on first, REPLACED otherwise)
  -> enqueue RecomputeTopicState(learner_pseudonym, affected topics)
RecomputeTopicState
  -> TopicState = f(effective observations, topic mappings, active policy)
  -> apply the policy's reinforcement rules to the new TopicState only;
     create/cancel ReinforcementItems -> enqueue ReinforcementItemCreated / Cancelled
  -> derive learning signals (context only; never read by the reinforcement step)  [C11, D13]
```

**Status weighting:** PROVISIONAL counts at `provisional_weight`; NEEDS_REVIEW (result held for review) at `review_pending_weight` (default 0); CONFIRMED at 1. A REGRADE or override is simply a new revision: the observation's contribution is replaced.

**Superseded evaluation:** the next head revision replaces the observation; the old contribution disappears on recompute. Reinforcement items whose basis references the old revision are revalidated and cancelled if the reinforcement rule no longer holds for the current TopicState.

**Policy changes (R3, C7, C7-A, C7-B):** any change in which version applies to a topic enqueues the existing projection rebuild for the affected learners and topics: publishing a course version rebuilds that course's course-scoped topics; publishing an organization version rebuilds organization-wide topics and the course-scoped topics of courses without an ACTIVE course version (they inherit it); a course left without an ACTIVE course version rebuilds its topics under the inherited organization version; a topic scope change (`TopicScopeChanged`) rebuilds that topic under its newly applicable version. TopicState keeps its key (learner + topic) and the topic keeps its identity; only `course_id` (denormalized scope) and `policy_version_id` change. Historical calculations stay attributable to their version through ReportSnapshot.learning_policy_version_id and the before/after policy version on TrajectoryTransition; TopicState records `policy_version_id`; teacher views show "calculated under policy vN" and the change is an audit event. Historical ReportSnapshots are unaffected (they are snapshots).

## 12.4 ReinforcementItem state machine

| From | To | Actor | Side effects |
|---|---|---|---|
| — | PENDING | projection | ReinforcementItemCreated |
| PENDING | SCHEDULED | Challenge after revalidation | — |
| PENDING/SCHEDULED | CANCELLED | projection (basis changed / reinforcement rule no longer holds for the current TopicState), consent/deletion, revalidation failed | ReinforcementItemCancelled |
| PENDING | SUPERSEDED | newer item for same learner/topic | — |
| SCHEDULED | DELIVERED | Challenge (reinforcement StudentChallenge AVAILABLE) | — |
| PENDING/SCHEDULED | EXPIRED | sweep: not scheduled within 14 days (UNSCHEDULED_14_DAYS); Challenge `MarkReinforcementUnplannable` (NO_ELIGIBLE_QUESTIONS, W8-C2) | outcome shown on the teacher's learner row; no notification |

**Creation rule (APPROVED W8-1, W8-C3).** While the learner is eligible (active enrollment where the topic applies; not INACTIVE, merged or deleted) and the TopicState is NEEDS_PRACTICE: at most one open item per learner × topic; no new item within 7 days of the last delivered reinforcement on the topic; due_after = created + 48 h; if the learner already has 2 items scheduled or delivered in the rolling 7 days, due_after moves to the first time within the cap (postponed, never dropped); not scheduled within 14 days → EXPIRED. Learning decides need; Challenge decides when and how; trajectory and learning signals are never inputs (D13).

**Repeat exposure (APPROVED W8-3, clarifying D9).** Only an earlier answered, countable evidence unit of the same Question establishes repeat exposure; an earlier unanswered appearance does not.

**Contracts offered:** MarkReinforcementScheduled(item), MarkReinforcementDelivered(item), MarkReinforcementUnplannable(item, NO_ELIGIBLE_QUESTIONS) (Challenge → Learning, mechanism A; W8-C2); RevalidateReinforcementItem(item) → VALID | INVALID(reason) (read-only, mechanism A; checks basis revisions against current observations and the reinforcement rule against the current TopicState; learning signals and trajectory are not inputs, C11/D13); GetTopicStates(learner|cohort) for Reporting; GetLearnerProgress (learner-safe).
# 13. Review

**Purpose.** Human work queue: assignment, SLA, escalation and completion records. Review executes no decisions in other modules (ADR-013, corrected by X4).

## 13.1 Model

```
review.review_task                     TENANT · R1 · S1
  id, tenant_id, task_type (EVALUATION_REVIEW, CONFLICT_WITH_HUMAN, DISPUTE,
  CONTENT_APPROVAL, GROUPED_REGRADE_CONFLICT, LATE_SUBMISSION, SAFEGUARDING),
  reason_code text, subject_module text, subject_type text, subject_id uuid,
  subject_revision bigint NULL,          -- e.g. head revision when opened
  scope_course_id NULL, scope_cohort_id NULL,  -- drives authorization and routing
  --   for a submission: the ASSIGNMENT's cohort, not the learner's current cohort [W6-6]
  priority (P1_URGENT, P2_HIGH, P3_NORMAL, P4_LOW),
  restricted bool NOT NULL DEFAULT false,      -- SAFEGUARDING: visible to lead only
  --   (Owner if no lead); absent from general queues; hidden from learner/guardian [W7-5]
  status (OPEN, ASSIGNED, RESOLVED, ESCALATED, EXPIRED, CANCELLED),
  due_at timestamptz, escalation_level smallint DEFAULT 0,
  group_id NULL (FK review_group), resolution jsonb NULL, resolved_by_id,
  resolved_at, created_at, row_version
  UNIQUE (tenant_id, subject_module, subject_type, subject_id, task_type)
         WHERE status IN ('OPEN','ASSIGNED','ESCALATED')

review.review_assignment               TENANT · R1
  id, tenant_id, task_id (FK), assignee_membership_id, assigned_by_kind,
  assigned_at, released_at

review.review_group                    TENANT · R1
  id, tenant_id, kind (REGRADE_CONFLICTS, BULK_CONFIRM), source_ref uuid,
  item_count int, status

review.review_event                    TENANT · R6 · append-only
  id, tenant_id, task_id, event (CREATED, ASSIGNED, RELEASED, ESCALATED,
  RESOLVED, EXPIRED, CANCELLED), actor_kind, actor_id, detail jsonb, occurred_at
```

## 13.2 Lifecycle

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | OPEN | owner module via CreateReviewTask (A) | unique open task per subject/type | route by scope | yes |
| OPEN | ASSIGNED | staff claim / auto-assign | assignee has permission for scope | — | yes |
| ASSIGNED | OPEN | release, or MembershipRevoked | — | — | yes |
| OPEN/ASSIGNED | ESCALATED | SLA sweep past due_at | — | notify scope admins; level+1 | yes |
| OPEN/ASSIGNED/ESCALATED | RESOLVED | owner module calls CompleteTask (A) inside its decision transaction | subject_revision unchanged where applicable | emits ReviewResolved (informational) | yes |
| OPEN/ASSIGNED/ESCALATED | CANCELLED | owner module (subject superseded, deleted, consent withdrawn) | — | — | yes |
| OPEN/ASSIGNED/ESCALATED | EXPIRED | only for task types whose owner defines an expiry fallback (e.g. LATE_SUBMISSION) | — | owner fallback via event | yes |
| RESOLVED/CANCELLED/EXPIRED | any | — | terminal | — | — |

**How decisions create evaluations (X4).** The reviewer UI calls the owning module's command (`OverrideEvaluation`, `ConfirmEvaluation`, `ResolveDispute`, `ResolveConflictCandidate`, `ApproveQuestionVersion`, `AcceptLateSubmission`). In one transaction the owner performs the head CAS or content transition and calls `Review.CompleteTask(task_id, resolution)`. A lost CAS returns a conflict to the reviewer; the task stays open with the new subject revision shown.

**Routing by assignment cohort (LOCKED, W6-6).** Review, confirmation, override and dispute tasks for a submission route by the cohort of the assignment it was submitted under. Teachers of that cohort keep these rights for those submissions only after the learner leaves the cohort; general learner access is not widened (consistent with W2-5).

**UNCONFIRMED_SEMANTIC tasks (LOCKED, W6-2, W6-C2).** A PROVISIONAL SEMANTIC_AI result not confirmed within 14 days creates an EVALUATION_REVIEW task with reason UNCONFIRMED_SEMANTIC, escalated to the admin scope; semantic correctness is never auto-confirmed (job in §21).

**Manual safeguarding flag (LOCKED, W7-5).** Staff create a SAFEGUARDING task with `FlagForSafeguarding` (audited). No automated detection in V1 (gate 10 unchanged). A flag never changes a result.

**SLA defaults (PROPOSED DEFAULT):** EVALUATION_REVIEW 48 h; DISPUTE 72 h; CONFLICT_WITH_HUMAN 72 h; CONTENT_APPROVAL none; SAFEGUARDING 24 h, restricted, never auto-expired.

**Contracts offered:** CreateReviewTask, CompleteTask, CancelTask, AssignTask, ListMyQueue, GetQueueStats. Events: ReviewTaskCreated, ReviewResolved, ReviewTaskEscalated.

# 14. Communication

**Purpose.** Transport: channel accounts, templates, deliveries, provider calls, webhooks, opt-outs, OTP sending. It makes no pedagogical decisions.

## 14.1 Tables

```
comms.channel_account                  TENANT · R1 · S1/S4 (credential ref)
  id, tenant_id, provider (WHATSAPP_CLOUD, EMAIL_PROVIDER, SMS_PROVIDER),
  --   SMS_PROVIDER / SMS: enum retained, no ACTIVE account in V1 [W4-5]
  channel (WHATSAPP, EMAIL, SMS), provider_account_ref text NOT NULL,
  sender_ref text, credential_secret_ref text (KMS envelope), quality_state,
  messaging_tier, throughput_per_sec int, daily_quota int, status (ONBOARDING,
  ACTIVE, RESTRICTED, DISABLED)
  UNIQUE (provider, provider_account_ref)          -- resolver lookup (X1)

comms.shared_channel_account           PLATFORM                           (X7)
  id, provider, channel, provider_account_ref UNIQUE, sender_ref,
  credential_secret_ref, throughput_per_sec, daily_quota, status

comms.channel_account_assignment       TENANT · R1
  tenant_id, channel, channel_account_id NULL, shared_channel_account_id NULL,
  CHECK (num_nonnulls(channel_account_id, shared_channel_account_id) = 1)
  PK (tenant_id, channel)

comms.channel_suppression              PLATFORM · S1 (hash only)          (X7)
  provider, account_ref, contact_hmac bytea, reason (OPT_OUT, INVALID, BLOCKED),
  created_at   PK (provider, account_ref, contact_hmac)

comms.message_template / comms.template_version     TENANT or REFERENCE (platform templates)
  template_version: id, tenant_id NULL→ platform templates live in reference table
  comms.platform_template_version; tenant table for org templates:
  id, tenant_id, template_key, channel, locale, version_no, body jsonb,
  variables text[], provider_template_ref, approval_status (DRAFT, SUBMITTED,
  APPROVED, REJECTED, PAUSED), approved_at
  UNIQUE (tenant_id, template_key, channel, locale, version_no)

comms.delivery                         TENANT · R1 (metadata) · S1
  id, tenant_id, purpose (CHALLENGE, REINFORCEMENT, REMINDER, REPORT,
  CONSENT_REQUEST, OTP, CORRECTION), source_module, source_ref uuid,
  learner_id NULL, guardian_id NULL, contact_point_id uuid NOT NULL,
  channel, channel_account_ref uuid, template_version_id,
  capability_grant_id NULL, idempotency_key text NOT NULL,
  status (CREATED, QUEUED, SENDING, SENT, DELIVERED, READ, FAILED, RETRYING,
  EXPIRED, CANCELLED), status_rank smallint, attempt_count smallint,
  provider_message_id text NULL, failure_code NULL, failure_class NULL,
  not_before timestamptz, expires_at timestamptz, sent_at, delivered_at, read_at,
  body_ref text NULL, body_purged_at NULL, row_version
  -- body_ref: rendered body stored with placeholders for capability tokens; the token is
  --   never persisted in the body or in telemetry [SC2]
  -- no RESULT_READY purpose: delayed results are not notified in V1 [W6-1]
  UNIQUE (tenant_id, idempotency_key)
  UNIQUE (channel_account_ref, provider_message_id) WHERE provider_message_id IS NOT NULL

comms.delivery_event                   TENANT · R1 · S1 · append-only
  id, tenant_id, delivery_id, status, provider_event_id NULL, occurred_at, raw_ref NULL

comms.webhook_inbox                    OPERATIONAL · R10
  id, provider, provider_event_id text, received_at, signature_valid bool,
  payload_ref text (object, encrypted), status (RECEIVED, PROCESSED, IGNORED,
  FAILED), tenant_id NULL (resolved), processed_at
  UNIQUE (provider, provider_event_id)

comms.inbound_message                  TENANT · R5 · S3
  id, tenant_id, channel_account_ref, contact_point_id NULL, kind (OPT_OUT,
  OPT_IN, REPLY, UNKNOWN), body_ref, received_at
```

**Webhook inbox account reference [CR-5].** `comms.webhook_inbox` carries `provider_account_ref`, established at ingestion after successful signature verification and replay-window validation (Section 14.3). The data classification of this column is OPEN: it is not decided here and is to be set by Privacy through the classification register (Section 6.3 is unchanged). Implementation of the persisted column is blocked until that classification is recorded.

**Delivery account reference [CR-3-F1].** `comms.delivery.channel_account_ref` references the account row used for the delivery, which may be either `comms.channel_account.id` or `comms.shared_channel_account.id`.

**Cancellation (added state).** CANCELLED is added to the approved delivery states for consent withdrawal and source cancellation before sending; it is terminal and never reached after SENT. LOCKED (W4-C3; the states list in Arch §17 omits it).

## 14.2 Delivery state machine

Ranks: CREATED 0, QUEUED 1, SENDING 2, RETRYING 2, SENT 3, DELIVERED 4, READ 5; terminal FAILED, EXPIRED, CANCELLED.

| From | To | Trigger | Guard / notes |
|---|---|---|---|
| — | CREATED | DeliveryRequested handler | consent check #1; idempotency key |
| CREATED | QUEUED | throughput scheduler | not_before reached; quiet hours respected |
| QUEUED/RETRYING | SENDING | dispatch job | consent check #2; suppression check; grant issued |
| SENDING | SENT | provider accepted | provider_message_id stored |
| SENDING | RETRYING | infra/rate-limit failure | attempts < max |
| SENDING/RETRYING | FAILED | permanent failure or attempts exhausted | fallback channel evaluated by producer rule |
| SENT | DELIVERED → READ | webhook | monotonic by rank: lower-rank updates ignored |
| CREATED/QUEUED/RETRYING | CANCELLED | consent withdrawn, source cancelled | — |
| any non-terminal | EXPIRED | expires_at passed | — |
| SENT/DELIVERED/READ | CANCELLED/QUEUED | — | invalid |

READ never changes StudentChallenge engagement.

## 14.3 Webhook processing

```
HTTP handler (no tenant):
  verify signature; reject timestamp older than 5 min where provided
  INSERT webhook_inbox ON CONFLICT (provider, provider_event_id) DO NOTHING
  if inserted: enqueue ProcessWebhookEvent(inbox_id) ; return 200 quickly
Worker ProcessWebhookEvent (SystemActor WEBHOOK):
  tenant := resolve_delivery_by_provider_message(...) for status events
         or resolve_inbound_channel(provider, account_ref) + contact match for inbound
  unresolved -> status IGNORED (platform-level log)
  TenantTransaction(tenant):
    status update: apply only if new rank > current rank (or terminal failure before SENT)
    inbound opt-out: record ChannelConsent WITHDRAWN (via Privacy command);
                     on shared account also insert channel_suppression by HMAC
  mark inbox PROCESSED
```

**Account reference at ingestion [CR-5].** The order of work is: verify signature → replay-window validation → establish `provider_account_ref` → persist it on `webhook_inbox` → `ProcessWebhookEvent(inbox_id)` → resolver. The worker takes `provider` and `provider_account_ref` from the inbox row and does not derive them again from the payload. `tenant_id` on the inbox row stays unset until resolution. The job payload remains `inbox_id`. Trusted-identifier and credential rules: ADR-012 and ADR-024 amendments [CR-5].

Unknown event types are stored and ignored (ADR-024).

## 14.4 Contracts

Consumes `DeliveryRequested{purpose, source_ref, learner_id?, guardian_id?, contact_selection: {purpose}, capability: {scope_type, scope_id, ttl}?, template_key, variables(ids only), not_before, expires_at, idempotency_key}`. Communication resolves contacts via Roster, checks consent via Privacy, issues the capability grant via Identity (A), renders the template, and sends. Variables are resolved at render time from source modules (learner display name, challenge title, link). Rendered bodies are stored under R5.

**MESSAGING budget exemptions (LOCKED, W11-4).** OTP and CONSENT_REQUEST deliveries are always sent and recorded as overage. CHALLENGE and REMINDER deliveries wait while the pool is exhausted and expire when the challenge closes; REPORT deliveries wait for the next period.

**Billing notices (IMPLEMENTATION DETAIL, W11-5).** Budget-threshold and subscription notices go to Owners' staff IdP email as operational messages; they are not learner or guardian deliveries and do not pass ChannelConsent.

Offers: `SendOtp(contact_point, code_ref)`, `GetDeliveryStatus(source_ref)`. Emits: `DeliveryFailed` (producer decides fallback), `DeliveryDelivered` (informational), `ChannelOptOutReceived`.

**Provider boundary:** `WhatsAppProvider`, `EmailProvider`, `SmsProvider` (interface retained; inactive in V1 [W4-5]) behind `ChannelProvider.send(message) → {provider_message_id} | failure(class)`. Template approval sync through the provider adapter. **[CR-5]** Webhook signature verification and normalization, including establishing `provider_account_ref`, occur behind the Communication provider-adapter boundary.

# 15. AI Platform

**Purpose.** Capability execution infrastructure: routing, prompts, model snapshots, validation, safety, cost, auditability, quality gates. Owns no business workflow.

## 15.1 Capabilities

| Capability | Caller | Output schema (summary) | Validators |
|---|---|---|---|
| GenerateQuestion | Content | question draft by response type, answer key, explanation | schema; key present; solve-check; ambiguity; duplicate |
| ImproveQuestion | Content | revised draft + change list | schema; meaning preserved check |
| ClassifyQuestion | Content | topics, objectives, difficulty with rationale | schema; topics exist |
| GenerateExplanation | Content | explanation | schema; consistent with key |
| GenerateVariant | Content | variant draft | schema; solve-check; not a duplicate |
| GenerateRubric | Content | criteria, levels, weights | schema; weights sum 1 |
| GenerateHintSet | Content | ordered hint steps | schema; leak check on every step: no step, including the last, contains the final answer [W7-C2] |
| GenerateTests | Content | test inputs/expected outputs | schema; validated later by execution |
| EvaluateResponse | Evaluation | per-criterion level + evidence offsets | schema; ranges; evidence present per scored criterion; evidence verified |
| GenerateFeedback | Evaluation | learner feedback from criterion results | schema; answer-leak; safety; locale |
| DetectInjection | AI Platform (internal) | flag + category | — |
| DetectSafeguardingSignal | — (inactive in V1 [W7-5]; gate 10) | flag + category | restricted routing |

## 15.2 Tables

```
ai.prompt_version                      PLATFORM · immutable · S0
  id, capability, version_label, template_text, template_sha256 bytea UNIQUE,
  output_schema jsonb, validators text[], parameters jsonb, locale, status
  (DRAFT, GATED, APPROVED, RETIRED), created_at

ai.model_snapshot                      PLATFORM
  id, provider, dated_model_id text, regions text[], retention_terms text,
  training_use text, status (APPROVED, DEPRECATED, RETIRED), retire_at
  -- records training-use terms, retention terms and processing region; eligible only if no
  --   training on Challenge Me/customer data; zero retention where offered [W7-4, LG-9]
  UNIQUE (provider, dated_model_id)

ai.capability_route                    PLATFORM
  id, capability, region_policy text, priority smallint, prompt_version_id,
  model_snapshot_id, gate_run_id NOT NULL, status (ACTIVE, DISABLED)
  -- ACTIVE only if snapshot eligibility and region policy match, checked at activation,
  --   never as a runtime business decision [W7-4]
  UNIQUE (capability, region_policy, priority)

ai.golden_dataset / ai.golden_item     PLATFORM · S3 (items) · R: per source
  item: id, dataset_id, language, response_type, input_ref, expected jsonb,
  source (COMMISSIONED, SYNTHETIC, CUSTOMER_CONTRACT), source_tenant_id NULL,
  --   V1: COMMISSIONED and SYNTHETIC only; CUSTOMER_CONTRACT not used [W7-2]
  source_submission_id NULL   -- deletion link (ADR-005)

ai.gate_run                            PLATFORM · R6
  id, capability, prompt_version_id, model_snapshot_id, dataset_id, language,
  metrics jsonb {agreement, parity, schema_valid_rate, solve_check_rate},
  thresholds jsonb, passed bool, run_at, platform_operation_ids uuid[]

ai.ai_operation                        TENANT (platform org for gate runs, X7) · R1 · S1
  id, tenant_id, capability, requester_module, subject_type, subject_id,
  request_id uuid NOT NULL,               -- X6
  idempotency_key bytea NOT NULL,         -- hash(capability, subject, context_hash, request_id)
  context_hash bytea, route_id, prompt_version_id, model_snapshot_id,
  rendered_prompt_sha256, parameters jsonb,
  status (CREATED, QUEUED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT, CANCELLED),
  failure_class NULL, attempts smallint, deadline_at,
  --   failure_class includes DISABLED (organization AI switch off) [W7-3]
  input_payload_ref, output_payload_ref, payload_purged_at NULL,
  validation jsonb, safety jsonb, injection_flag bool,
  reservation_id, usage_entry_id NULL, latency_ms, created_at, finished_at
  UNIQUE (tenant_id, idempotency_key)
```

Payloads (rendered prompt with learner content, raw output) live in the object store under `{tenant}/ai/{operation_id}/…`, class R3.

## 15.3 Execution pipeline

```
Caller (in its transaction) -> RequestAIOperation(capability, subject, request_id,
                                                  context_ref) [A] -> row CREATED + job
Worker ExecuteAIOperation:
  1 if existing SUCCEEDED with same idempotency_key -> return it (retry case)
  1a organization AI switch (ai_marking_enabled / ai_generation_enabled) and entitlement
     off -> FAILED(DISABLED) for CREATED/QUEUED operations  [W7-3, W11 PE-4/PE-6]
  2 ConsentGate (AI_PROCESSING) if inputs contain learner content or content
    materially derived from it  [check #2; W7-C1]
  3 Reserve budget (pool by capability)          -> exhausted: FAILED(BUDGET)
  4 Resolve route (capability, org data-region policy) -> none: FAILED(NO_ROUTE)
  5 Load inputs by reference; minimize (strip names/ids); delimit untrusted content
  6 Render PromptVersion; store payload; hash
  7 Admission token (provider x account); call provider OUTSIDE transaction
  8 Validate: schema -> semantic validators -> safety -> injection -> leak (feedback)
  9 TenantTransaction: record result, settle usage, SUCCEEDED/FAILED; enqueue
    AIOperationCompleted(operation_id) to requester
```

**Budget hold (LOCKED, W11-C4).** When the STUDENT_EVALUATION pool is exhausted, Evaluation holds the step and re-checks every 5 minutes until the step deadline. A new operation may be requested for a held step only if no provider operation was started for that step; otherwise the outcome follows idempotency and reconciliation (X6, J-6) and no second operation is created.

**Retry vs regeneration (X6).** A retry (lease expiry, infrastructure failure) re-executes the same row and first checks for a SUCCEEDED result. A regeneration ("give me another version", feedback leak regeneration) is a new `request_id` and therefore a new operation. A timed-out provider call that later bills is reconciled daily against provider usage.

**Fallback.** Only to the next ACTIVE route entry for the same capability and region policy (each has a passed gate). No route → evaluation HOLD then review at deadline; generation → visible failure.

## 15.4 AIOperation state machine

| From | To | Trigger |
|---|---|---|
| CREATED | QUEUED | enqueue |
| QUEUED | RUNNING | worker claim |
| RUNNING | SUCCEEDED | validated result |
| RUNNING | QUEUED | retryable failure (INFRASTRUCTURE, RATE_LIMITED) within attempt cap |
| RUNNING | FAILED | validation failure after allowed repair attempt (one re-ask), budget, no route, consent denied, attempts exhausted |
| CREATED/QUEUED | FAILED(DISABLED) | organization AI switch off or not entitled [W7-3] |
| RUNNING | TIMED_OUT | deadline passed |
| CREATED/QUEUED | CANCELLED | consent withdrawal, subject superseded |
| RUNNING | CANCELLED | cancel request: the provider call completes; result discarded; payload purged |

**Injection defence (ADR-017).** Learner/document content is placed only in delimited data sections; the system prompt forbids following instructions inside data; outputs are structured; evaluators have no tools; `DetectInjection` runs on inputs for EvaluateResponse and document-based generation; a flag sets confidence to 0 (review).

**Answer-leak check.** For GenerateFeedback and GenerateHintSet (every step [W7-C2]): exact match of key values/aliases, normalized n-gram overlap with the reference solution, model solution, explanation [W6-C3] and hidden test expected outputs above threshold → leak.

**Observability.** Per capability × route: latency, validation failure rate, injection rate, leak rate, cost, fallback rate, gate age. No payload content in telemetry.

# 16. Code Execution

**Purpose.** Adapter to a provider-backed sandbox. Receives inputs only and returns raw observations. Holds no domain decisions and no database credentials in the sandbox.

## 16.1 Tables

```
codeexec.runtime_image                 REFERENCE
  id, language, version_label, image_digest text UNIQUE, provider_ref,
  status (ACTIVE, DEPRECATED)
  -- V1: Python 3 is the only ACTIVE image; languages are added by image only [W7-1]

codeexec.execution_request             TENANT · R4 · S1 (metadata)
  id, tenant_id, purpose (EVALUATION, PRACTICE, SUITE_VALIDATION),
  requester_ref uuid, request_id uuid NOT NULL, runtime_image_digest, limits jsonb,
  test_count smallint, status (CREATED, SUBMITTED, COMPLETED, PROVIDER_FAILED,
  CANCELLED), provider_job_ref, attempts, reservation_id, usage_entry_id,
  created_at, finished_at
  UNIQUE (tenant_id, purpose, request_id)

codeexec.execution_observation         TENANT · R4 · S3
  id, tenant_id, execution_request_id, test_ordinal, exit_code, signal,
  wall_ms, cpu_ms, peak_memory_kb, stdout_ref, stderr_ref, stdout_truncated,
  stderr_truncated, provider_outcome (OK, TIMEOUT, MEMORY, OUTPUT_LIMIT,
  COMPILE_FAILED, PROVIDER_ERROR)
  UNIQUE (execution_request_id, test_ordinal)
```

## 16.2 Contract

```
CodeExecutionProvider.run({
  runtime_image_digest, source (bytes), tests: [{ordinal, stdin}],   -- inputs only
  limits: {cpu_ms, wall_ms, memory_mb, pids, output_bytes, compile_ms, fs_mb},
  network: NONE, user: NON_ROOT, isolation: PER_TEST_PROCESS_FRESH_FS
}) -> [{ordinal, exit_code, signal, wall_ms, cpu_ms, peak_memory_kb,
        stdout(trunc), stderr(trunc), flags}] | ProviderFailure(class)
```

- **Never sent:** expected outputs, reference solutions (except in SUITE_VALIDATION, where the reference solution is the *source* being executed), scoring logic, hidden-test expected values.
- **Trusted comparison** (Evaluation code strategy): compares stdout with expected per comparison mode, maps observations to outcomes (WRONG_ANSWER, TIME_LIMIT …), computes score per scoring mode.
- **Retry:** ProviderFailure (PROVIDER_ERROR, PROVIDER_TIMEOUT, CAPACITY) → retry with backoff → HOLD → deadline → NEEDS_REVIEW. Student outcomes are observations, never retried.
- **Practice runs:** visible tests only; results shown with stdout (visible tests are visible by definition).
- **Suite validation:** runs reference solution and each known-wrong variant; Content marks the suite VALIDATED or VALIDATION_FAILED.
- **Quotas:** practice limits (20 per attempt, 100 per learner per day) are owned and enforced by Assessment; Code Execution enforces only the CODE_EXECUTION budget and provider/runtime throughput [W7-C3].
- **Language list:** Python 3 only in V1 (LOCKED, W7-1; sign-off gate 2 satisfied).
- **Not entitled** (`code_evaluation` off): code questions cannot be published or assigned; existing code submissions are marked by teacher review; practice runs unavailable (PROPOSED DEFAULT, W11 PE-7).

# 17. Reporting

**Purpose.** Read models for dashboards and immutable snapshots of what was sent. Reporting never owns learning truth.

```
reporting.rm_student_challenge_status  TENANT · projection
  tenant_id, assignment_id, student_challenge_id, learner_id, cohort_id, status,
  items_total, items_submitted, items_final, score_current, provisional_count,
  review_count, not_attempted_count, challenge_grade (W6-4: all items as denominator;
  never 0 for unanswered), completion from engagement [W9-C2], after_due flag,
  updated_at      PK (tenant_id, student_challenge_id)

reporting.rm_cohort_topic              TENANT · projection
  tenant_id, cohort_id, topic_id, learners_strong, learners_developing,
  learners_needs_practice, learners_insufficient, direction counts per LTM Direction (IMPROVING,
  DECLINING, NO_CLEAR_CHANGE, NOT_ENOUGH_EVIDENCE), needs_attention_count [W9-C3], policy_version_id, updated_at
  PK (tenant_id, cohort_id, topic_id)

reporting.rm_review_queue_stats        TENANT · projection
reporting.rm_learner_summary           TENANT · projection (by learner_id; resolved via Roster)

reporting.report_definition            TENANT · R1
  id, tenant_id, kind (GUARDIAN_PERIODIC, TEACHER_COHORT, OWNER_OVERVIEW),
  --   V1 active: GUARDIAN_PERIODIC only; no staff digests, no learner reports [W9-4, W9-5]
  audience, cadence (WEEKLY, FORTNIGHTLY, MONTHLY; default MONTHLY) [W9-1],
  schedule_rrule, timezone, template_key,
  sections: learning (D12), activity counts, closed-challenge grades;
  --   no per-question section [W9-2]
  material_threshold numeric DEFAULT 0.10 (of maximum) [W9-C1], status

reporting.report_snapshot              TENANT · R8 · S2/S3 (body) · immutable
  id, tenant_id, definition_id, kind, subject_type (LEARNER, COHORT, ORGANIZATION),
  subject_id, period_start, period_end, revision smallint NOT NULL DEFAULT 1,
  corrects_snapshot_id NULL (FK), body_ref text, body_sha256,
  basis jsonb [{submission_id, head_revision}] -- what the numbers were built from
  learning_policy_version_id, generated_at, redacted_at NULL
  UNIQUE (tenant_id, definition_id, subject_id, period_start, revision)

reporting.report_recipient             TENANT · R1
  id, tenant_id, snapshot_id, recipient_kind (GUARDIAN, LEARNER, STAFF),
  recipient_id, contact_point_id NULL, delivery_id NULL, capability_grant_id NULL,
  status (PENDING, REQUESTED, DELIVERED, FAILED, SKIPPED_NO_CONSENT,
  CANCELLED)   -- CANCELLED: guardian link ended or consent withdrawn before dispatch [W9]

reporting.pending_correction           TENANT · R1
  id, tenant_id, snapshot_id, submission_id, old_revision, new_revision,
  delta numeric, material bool, urgent bool, status (PENDING, INCLUDED, DISMISSED)
```

**Correction semantics.** On `EvaluationHeadChanged`, Reporting checks whether the submission appears in any sent snapshot's `basis`. If so it records a PendingCorrection with the score delta. Material (an item's correctness flips, or a challenge grade shown in the report changes by at least 10% of its maximum; there is no pass/fail concept in V1 [W9-C1]) corrections are included in the next scheduled snapshot as a correction section; an urgent flag set by a teacher generates a correction snapshot now (`revision + 1`, `corrects_snapshot_id`). Non-material corrections are recorded and not sent. Sent snapshots are never modified; redaction after R8 replaces the body with a tombstone.

**Guardian reports** require GUARDIAN_REPORTING processing consent and REPORTS channel consent; otherwise the recipient row is SKIPPED_NO_CONSENT. When a guardian link ends, guardian home stops listing that learner and their reports; stored snapshots are unchanged [W9-C4].

**Exports (LOCKED, W9-3, W10-5).** Assignment-results CSV (`report.export`, in scope, recent authentication, audited); subject and organization exports (§28). Export files are kept 7 days (§4). Deleted learners are excluded from per-learner lists and exports and appear only in aggregates [W10-2].

**Teacher learning view — evidence strip authorization (APPROVED W8-C1).** TopicState and TopicTrajectory are calculated from all of the learner's evidence. In a teacher's evidence strip, units outside the teacher's authorization (another cohort's or course's work, or former-cohort work not covered by W6-6) expose only date, score band and markers; the response never contains question text, answer content or answer links for them. Presentation and authorization only; Learning calculations are unchanged. Reinforcement item status (including EXPIRED with NO_ELIGIBLE_QUESTIONS) is shown on the learner row; no notification is sent.

# 18. Billing & Usage

Part of the Tenancy & Billing module (schema `tenancy`).

```
tenancy.plan / tenancy.plan_version    REFERENCE
  plan_version: id, plan_code, version_no, entitlements jsonb, included_usage jsonb,
  price_ref text (informational, V1 manual invoicing), status

tenancy.subscription                   TENANT · R1 · S1
  id, tenant_id, plan_version_id, status (TRIAL, ACTIVE, PAST_DUE, SUSPENDED,
  CANCELLED, EXPIRED), trial_ends_at, current_period_start, current_period_end,
  provisioned_by_id, invoice_mode (MANUAL), row_version
  UNIQUE (tenant_id) WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')

tenancy.entitlement                    TENANT · R1 · S0
  tenant_id, key (max_learners, ai_evaluation, ai_generation [W11 PE-3], code_evaluation,
  whatsapp, and a monthly limit per pool), value jsonb, source (PLAN, OVERRIDE), effective_from,
  effective_to     PK (tenant_id, key, effective_from)

tenancy.budget_pool                    TENANT · R1
  tenant_id, pool (STUDENT_EVALUATION, TEACHER_GENERATION, MESSAGING,
  CODE_EXECUTION, STORAGE), period_start, limit_micro bigint, overrun_pct numeric
  -- overrun_pct default 0% (LOCKED (U1): V1 default 0%; Wave 11 BP-2 authoritative; ADR-021's 2% proposal superseded)
  -- limit = plan included usage + active overrides; no carry-over; periods follow the
  --   subscription anchor date in UTC (PROPOSED DEFAULT, W11 BP-2/BP-3)
  PK (tenant_id, pool, period_start)

tenancy.budget_pool_shard              TENANT · R1                         (ADR-021)
  tenant_id, pool, period_start, shard smallint, reserved_micro bigint,
  settled_micro bigint     PK (tenant_id, pool, period_start, shard)

tenancy.reservation                    TENANT · R1
  id, tenant_id, pool, period_start, shard, estimate_micro bigint, operation_kind,
  operation_ref uuid, status (HELD, SETTLED, RELEASED, EXPIRED, SETTLED_LATE), expires_at,
  --   EXPIRED -> SETTLED_LATE when the operation completes after expiry [W11-C3]
  settled_micro NULL, row_version
  UNIQUE (tenant_id, operation_kind, operation_ref)

tenancy.usage_ledger_entry             TENANT · R6 · append-only
  id, tenant_id, pool, kind (AI_TOKENS, MESSAGE, CODE_SECONDS, STORAGE_GB_DAY),
  quantity numeric, cost_micro bigint, provider, provider_ref NULL, reservation_id NULL,
  operation_ref, occurred_at, reconciled bool
```

**Reserve → execute → settle.**
- **Reserve:** pick shard = hash(operation_ref) mod N; read the pool total as the sum of shards (approximate read). If total + estimate > limit × (1 + overrun_pct) → EXHAUSTED; otherwise insert HELD and increment the shard. With the V1 default `overrun_pct` = 0% [U1], any small overshoot from concurrent approximate reads within the reservation window is a technical concurrency characteristic (ADR-021, W11 UL-2), not a commercial budget-overrun allowance.
- **Settle:** write the ledger entry; mark SETTLED with the actual amount; adjust the shard (reserved −estimate, settled +actual).
- **Release:** no charge; decrement the shard.
- **Expire:** a sweeper expires HELD reservations past `expires_at` and decrements the shard.

- **Expire late settle (W11-C3):** a completion after expiry writes the ledger entry and moves the reservation EXPIRED → SETTLED_LATE; usage is never lost from the ledger.

**Exhaustion behaviour:** STUDENT_EVALUATION → AI step HOLD; re-check every 5 minutes until the step deadline, new operation only if none was started for the step [W11-C4] → NEEDS_REVIEW (BUDGET_HOLD_EXPIRED); the submission is never rejected. TEACHER_GENERATION → visible error; drafts stay. MESSAGING → OTP and consent requests always sent as overage; challenge messages and reminders wait and expire at challenge close; reports wait for the next period (LOCKED, W11-4). CODE_EXECUTION → HOLD → review; practice runs refused. STORAGE → may block non-essential uploads; never rejects or loses authoritative learner work or correctness writes (LOCKED, W11-C7). Exhaustion never deletes, hides or rejects learner work or changes a result. Entitlement checks read `tenancy.entitlement`; organization settings can only narrow entitlements [W11 PE-4]; feature flags never decide entitlement.

**While SUSPENDED (LOCKED, W11-C6).** STUDENT_EVALUATION and CODE_EXECUTION stay usable for marking already-submitted work, including across a period boundary, at the last active limits; no other pool is used.

**Budget warnings (LOCKED, W11-5).** In-product banners for Owners and Admins at 80% and 100% of each pool, plus one email per threshold per pool per period to Owners (job in §21).

**Learner cap (LOCKED, W11-3).** Soft limit up to 10% over `max_learners` (shown to Owners and operators; overage on the usage statement); beyond 110% new learners and reactivations are refused; existing learners and their work are never affected. **Counting rule (LOCKED, U2; closes W11-U1):** `max_learners` counts only learners whose current status is ACTIVE; INACTIVE, MERGED and DELETED learners do not count. The entitlement is evaluated at the point of learner creation or reactivation (point-in-time), not as the peak count over a billing period. A downgrade below current usage never deactivates anything; it only blocks additions (PROPOSED DEFAULT, W11 PE-9).

**Subscription states and organization status (LOCKED, W11-C1).** Subscription states: TRIAL → ACTIVE | EXPIRED; ACTIVE → PAST_DUE → ACTIVE | SUSPENDED; any → CANCELLED. The subscription is the billing state; organization status is the access state derived by the fixed §6.1 mapping; only operator security suspension and termination set organization status directly. Provisioned and changed by platform operators only, audited (V1).
- Trial: `trial_ends_at` default 30 days; Owners see trial end and period dates 14 and 3 days ahead (PROPOSED DEFAULT, W11 SB-4/SB-5).
- Paid access ends (trial not converted, cancellation effective, expiry) → organization SUSPENDED for 30 days → TERMINATED automatically; Owners warned before each step; conversion or reactivation during the 30 days restores access (LOCKED, W11-1).
- PAST_DUE never suspends automatically; operators suspend manually from a past-due worklist (LOCKED, W11-2).
- Termination requires a second operator's approval and recent authentication (PROPOSED DEFAULT, W11 SB-10).

**Usage statement and invoicing (PROPOSED DEFAULT, W11 IN-1…IN-3).** Per organization and period: pools, included, used, overrides, overage, and the learner count against `max_learners` = the number of ACTIVE learners at the end of the statement period (LOCKED, US-1; reporting only — learner-cap enforcement stays point-in-time at creation or reactivation per U2). Invoices are produced outside Challenge Me; payment status is recorded only as a subscription state change; no card or bank data. Owners can view and download statements. Learners and guardians never see usage (W11 UL-7).

**FINANCIAL retention (LOCKED mechanism, W11-C2).** Subscription history, usage statements and ledger summaries (organization name and billing contact only; no learner data) are class R11 FINANCIAL and survive organization purge; duration per LG-11 (LEGAL GATE).

---

# 19. Cross-Module Contracts

Mechanism A = synchronous public service call (same database, no network I/O inside a transaction). Mechanism B = event enqueued as a job in the producer's transaction (ADR-013).

| # | From → To | Mech | Contract | Purpose |
|---|---|---|---|---|
| C1 | Assessment → Evaluation | A (write) | CreatePendingEvaluation(submission_id, presented_version, policy_version, learner) | pending evaluation + head in the submit transaction |
| C2 | Assessment → Content | A (read) | GetStudentQuestionView, GetHintStep, GetStudentRevealView | student-safe content |
| C3 | Assessment → Challenge | A (read) | GetAnswerableItem(student_challenge, ordinal, actor) | authorization + frozen version |
| C4 | Assessment → Challenge | A (write) | RecordEngagement(student_challenge, STARTED/COMPLETED) | engagement state |
| C5 | Evaluation → Content | A (read) | GetEvaluatorQuestionView, GetCompatibilityChain | evaluation inputs |
| C6 | Evaluation → AI Platform | A (write) | RequestAIOperation(EvaluateResponse / GenerateFeedback, request_id=run_id) | AI steps |
| C7 | AI Platform → Evaluation / Content | B | AIOperationCompleted{operation_id, requester_ref} | resume workflow |
| C8 | Evaluation → Code Execution | A (write) | RequestExecution(purpose=EVALUATION, request_id=run_id) | code step |
| C9 | Code Execution → Evaluation / Assessment / Content | B | ExecutionCompleted{execution_request_id, requester_ref} | resume |
| C10 | Evaluation → Learning, Reporting, Assessment | B | EvaluationHeadChanged | authoritative result change |
| C11 | Learning → Evaluation | A (read) | GetEvaluationSummary(evaluation_id) → components, performance score, total score, hints used, attempt number, status, topic weights (no content; the item grade is never part of it) [W6 C2] | observation data |
| C12 | Learning → Challenge | B | ReinforcementItemCreated / ReinforcementItemCancelled | reinforcement |
| C13 | Challenge → Learning | A (read) | RevalidateReinforcementItem | pre-delivery check |
| C13a | Challenge → Learning | A (write) | MarkReinforcementScheduled / MarkReinforcementDelivered / MarkReinforcementUnplannable(NO_ELIGIBLE_QUESTIONS) | item state (W8-C2) |
| C14 | Challenge → Communication | B | DeliveryRequested | challenge/reinforcement delivery |
| C15 | Reporting → Communication | B | DeliveryRequested (purpose REPORT/CORRECTION) | report delivery |
| C16 | Privacy → Communication | B | DeliveryRequested (purpose CONSENT_REQUEST) | consent acquisition |
| C17 | Communication → Identity | A (write) | IssueCapabilityGrant | link creation at dispatch |
| C18 | Communication → Privacy | A (read) | ConsentGate.check | enqueue/dispatch consent |
| C19 | Communication → Privacy | A (write) | RecordChannelOptOut / OptIn | inbound STOP |
| C20 | Communication → Roster | A (read) | ResolveContactsForLearner / Guardian | recipient resolution |
| C21 | Any owner → Review | A (write) | CreateReviewTask / CompleteTask / CancelTask | human work |
| C22 | Review → owners | B | ReviewResolved, ReviewTaskEscalated (informational) | notification only |
| C23 | Privacy → all consumers | B | ConsentChanged | cancel/allow work |
| C24 | Privacy → owners | B | PurgeStoreRequested{deletion_request, store_key, subject} | deletion fan-out |
| C25 | Owners → Privacy | A (write) | ReportPurgeResult | task completion |
| C26 | Roster → Challenge, Identity, Learning, Reporting, Privacy | B | EnrollmentStarted/Ended, LearnerMerged, ContactPointUnlinked, LearnerDeactivated, GuardianLinkEnded [W2-C4, W4-C7], LearnerMinorStatusChanged [W2-6, W2-C4], LearnerDeleted / GuardianDeleted [W10 §8] | structure changes |
| C27 | Content → Challenge, Evaluation | B | QuestionVersionPublished / Retired | selection pool; regrade targets |
| C28 | Content → Learning | B | TopicMappingChanged | projection rebuild |
| C28b | Content → Learning | B | TopicScopeChanged (C7-B) | rebuild of the topic under its newly applicable policy version |
| C29 | Evaluation / AI / Code / Comms → Tenancy | A (write) | Reserve / Settle / Release | budgets |
| C30 | any → Tenancy | A (read) | GetEntitlement | entitlement checks (organization settings can only narrow the result) [W11 PE-4] |
| C31 | Learning / Reporting / Challenge (reinforcement planning only [SC3]) → Roster | A (read, restricted) | ResolvePseudonym / ResolveLearners | identity mapping |
| C32 | Tenancy → all | B | OrganizationSuspended / Reactivated / Terminated | stop/start work |
| C33 | Identity → Review | B | MembershipRevoked | release assignments |
| C34 | Content/Assessment → Code Execution | A (write) | RequestExecution(purpose=SUITE_VALIDATION / PRACTICE); practice limits checked by Assessment first [W7-C3] | validation/practice |
| C35 | Reporting / Assessment → Evaluation | A (read) | GetItemGrade (best weighted total among evaluated attempts) [W6-3]; GetChallengeGrade (all items as denominator, "Not attempted" count) [W6-4] | grades |
| C36 | Evaluation → Tenancy | A (read) | pool re-check for held AI steps every 5 min; new operation only if none was started for the step [W11-C4] | budget hold |

**Domain vs integration events.** All events above are internal integration events between modules of the monolith, persisted as jobs. Domain events that stay inside a module (for example `AttemptStarted`) are not published. No external integration events exist in V1.

# 20. Domain Events

Common envelope (every event):

```
{ event_id: uuid (UUIDv7), event_type, event_version: int, tenant_id,
  occurred_at, producer_module, correlation_id, causation_id,
  subject: {type, id}, payload: {...ids and small metadata only} }
```

Consumers record `(consumer, event_id)` in their module's `processed_event` table (or rely on a natural unique key) and ignore duplicates. Delivery is at-least-once, unordered.

| Event | Producer | Consumers | Payload (beyond envelope) | Idempotency key | Ordering | v |
|---|---|---|---|---|---|---|
| EvaluationHeadChanged | Evaluation | Learning, Reporting, Assessment | submission_id, learner_id, head_revision, evaluation_id, status, origin, human_locked | (submission_id, head_revision) | per submission by revision; stale revisions ignored | 1 |
| EvaluationNeedsReview | Evaluation | Reporting (stats) | evaluation_id, reason | event_id | none | 1 |
| DisputeOpened / DisputeResolved | Evaluation | Reporting, Communication (optional notify) | dispute_id, submission_id, status | (dispute_id, status) | none | 1 |
| RegradeCompleted | Evaluation | Reporting | regrade_request_id, counts | regrade_request_id | none | 1 |
| ReinforcementItemCreated | Learning | Challenge | item_id, learner_pseudonym_id, topic_id, due_after | item_id | none (Challenge revalidates) | 1 |
| ReinforcementItemCancelled | Learning | Challenge | item_id, reason | item_id | may arrive before Created: Challenge stores tombstone | 1 |
| DeliveryRequested | Challenge, Reporting, Privacy | Communication | see §14.4 | producer idempotency_key | none | 1 |
| DeliveryFailed | Communication | producer module | delivery_id, source_ref, failure_class | delivery_id | none | 1 |
| ChannelOptOutReceived | Communication | Reporting (stats) | contact_point_id, channel | event_id | none | 1 |
| AIOperationCompleted | AI Platform | requester | operation_id, status | operation_id | none | 1 |
| ExecutionCompleted | Code Execution | requester | execution_request_id, status | execution_request_id | none | 1 |
| QuestionVersionPublished / Retired | Content | Challenge, Evaluation | question_id, version_id, compatible_with_previous | version_id | none | 1 |
| TopicMappingChanged | Content | Learning | mapping_id, from, to | mapping_id | none | 1 |
| TopicScopeChanged | Content | Learning, Reporting | topic_id, old_course_id, new_course_id, changed_by | (topic_id, row_version) | per topic by row_version; older ignored | 1 |
| ConsentChanged | Privacy | Evaluation, AI, Communication, Reporting, Challenge | kind, subject, purpose, new_status | (consent_id, changed_at) | per consent by changed_at; older ignored | 1 |
| PurgeStoreRequested | Privacy | owning module | deletion_request_id, store_key, subject | (deletion_request_id, store_key) | none | 1 |
| DeletionCompleted | Privacy | Reporting | deletion_request_id | id | none | 1 |
| EnrollmentStarted / EnrollmentEnded | Roster | Challenge, Reporting | enrollment_id, learner_id, cohort_id | (enrollment_id, status) | per enrollment | 1 |
| LearnerMerged | Roster | Challenge, Identity, Learning, Reporting, Privacy | survivor_id, duplicate_id | merge_id | none | 1 |
| ContactPointUnlinked | Roster | Identity, Communication | link_id, contact_point_id, subject | link_id | none | 1 |
| ChallengeCompleted | Challenge | Reporting | student_challenge_id | id | none | 1 |
| ReviewResolved / ReviewTaskEscalated | Review | Reporting (stats), notify | task_id, task_type | (task_id, event) | none | 1 |
| MembershipRevoked | Identity | Review | membership_id | id | none | 1 |
| GuardianLinkEnded | Roster | Identity, Reporting, Privacy | guardian_link_id, learner_id, guardian_id | guardian_link_id | none | 1 |
| LearnerMinorStatusChanged | Roster | Privacy | learner_id, old_status, new_status | (learner_id, row_version) | per learner by row_version | 1 |
| LearnerDeleted / GuardianDeleted | Roster (on deletion completion) | all consumers | subject id | subject id | none | 1 |
| LateSubmissionHeld / Accepted / Rejected | Assessment | Review, Reporting | submission_id, late_rejection_reason (TEACHER, HOLD_EXPIRED) | (submission_id, status) | none | 1 |
| OrganizationSuspended / Reactivated / Terminated | Tenancy | all schedulers | organization_id | (org, status, at) | per org | 1 |

**Versioning.** Adding optional payload fields keeps the version; removing or changing meaning increments it. Handlers accept version N and N−1 (ADR-023).

# 21. Background Jobs

**Jobs may run more than once (LOCKED, J-6, Wave 1 rev. 2).** (a) Challenge Me domain effects: handlers are idempotent (unique result keys, compare-and-set, state guards), so duplicate execution produces at most one effective domain result. (b) External provider side effects use the provider's idempotency key where supported, otherwise its reconciliation or de-duplication. (c) Universal exactly-once external delivery is not claimed; a rare duplicate external side effect remains possible.

Default policies: leases 5 min with heartbeat for long jobs; INFRASTRUCTURE retries exponential (1 s → 5 min, max 8); RATE_LIMITED honours retry-after, separate ceiling of 20; DOMAIN and POISON never retried; DEAD_LETTER after caps with alert when priority ≤ P1. Every job payload: `{payload_version, tenant_id, correlation_id, ids…}`, no learner content.

| Job | Owner | Trigger | Pri | Idempotency key | Transaction boundary | Notes |
|---|---|---|---|---|---|---|
| RunDeterministicStep | Evaluation | CreatePendingEvaluation (only if not done inline) | P0 | run_id | one tenant tx | usually executed inline in submit tx (pure) |
| RunAIEvaluationStep | Evaluation | plan | P0 | run_id | tx1 request AI op; resumes on AIOperationCompleted | lease 2 min |
| ExecuteAIOperation | AI Platform | RequestAIOperation | by capability (P0 eval, P2 gen) | operation idempotency_key | claim tx → provider call (no tx) → result tx | admission per provider |
| RunCodeExecutionStep | Evaluation | plan | P0 | run_id | request execution; resumes on ExecutionCompleted | — |
| ExecuteCode | Code Execution | RequestExecution | P0 (eval) P1 (practice) P2 (validation) | (purpose, request_id) | claim → provider (no tx) → observations tx | lease 5 min |
| ComposeEvaluation | Evaluation | last required run finished | P0 | (evaluation_id, runs_hash) | one tx incl. head CAS | CAS loss → re-read |
| GenerateEvaluationFeedback | Evaluation | result set with AI components | P1 | (evaluation_id, attempt) | request op; write-once feedback_ref | leak rule |
| AutoConfirmEvaluation | Evaluation | scheduled at result_set_at + delay | P1 | (evaluation_id, head_revision) | tx: check head revision + no dispute → CONFIRMED | stale → no-op |
| EvaluationDeadlineSweep | Evaluation | scheduler every 1 min | P0 | (evaluation_id, deadline) | per evaluation tx | → NEEDS_REVIEW |
| ProjectObservation | Learning | EvaluationHeadChanged | P1 | (submission_id, head_revision) | one tx | stale ignored |
| RecomputeTopicState | Learning | ProjectObservation, rebuild | P1 | (pseudonym, topic, projection_revision) | one tx per learner | coalesced per learner |
| ProjectionRebuild | Learning | policy/mapping change, merge, repair | P3 | rebuild_id + chunk | chunked per learner | resumable |
| PlanReinforcement | Challenge | ReinforcementItemCreated | P1 | item_id | tx with revalidation (A) | — |
| ExpireReinforcementItems | Learning | daily sweep | P3 | item_id | per row | EXPIRED (UNSCHEDULED_14_DAYS) after 14 days unscheduled (W8-1) |
| MaterializeAssignmentChunk | Challenge | assignment SCHEDULED/opened | P1 | (assignment_id, chunk_no) | one tx per chunk ≤ 500 | unique (assignment, learner) |
| CreateOccurrences | Challenge | scheduler hourly | P1 | (definition_id, occurrence_local) | advisory lock per definition | — |
| OpenStudentChallenges | Challenge | scheduler at opens_at | P1 | (assignment_id) | chunked | emits DeliveryRequested |
| ExpireStudentChallenges | Challenge | scheduler | P3 | (student_challenge_id) | per row | — |
| CreateDelivery | Communication | DeliveryRequested | P1 | producer idempotency_key | one tx (consent check #1) | — |
| DispatchDelivery | Communication | throughput scheduler | P1 | delivery_id + attempt | tx: consent #2, grant, render → provider (no tx) → status tx | per ChannelAccount tokens |
| ProcessWebhookEvent | Communication | inbox insert | P1 | inbox_id | resolver → tenant tx | — |
| SyncTemplateApprovals | Communication | scheduler | P4 | (account, date) | per account | — |
| ExtractDocument | Content | upload clean | P2 | (document_id, extractor_version) | claim → provider (no tx) → artifact tx | — |
| ScanUpload | Content | upload | P2 | object_key | — | before any extraction |
| RunGenerationItem | Content | RequestGeneration | P2 | ai_request_id | request op; checks on completion | — |
| ValidateTestSuite | Content | RequestTestValidation | P2 | test_suite_version_id + attempt | via Code Execution | — |
| ValidateRosterImport / CommitRosterImportChunk | Roster | upload / commit | P2 | (import_id, chunk) | chunked | — |
| ValidateQuestionImport / CommitQuestionImport | Content | upload / commit | P2 | (import_id, chunk) | chunked | — |
| MergeLearners follow-ups | consumers | LearnerMerged | P2 | (merge_id, consumer) | per consumer | — |
| PreviewRegrade | Evaluation | RequestRegrade | P3 | regrade_request_id | chunked | no AI calls in preview |
| ExecuteRegradeChunk | Evaluation | ApproveRegrade | P2 | (regrade_request_id, chunk) | per submission tx | admission-controlled |
| HandleConsentChanged | each consumer | ConsentChanged | P1 | (consent_id, changed_at, consumer) | per consumer tx | cancel queued work |
| PurgeStore | owning module | PurgeStoreRequested | P2 | (deletion_request, store_key) | chunked | reports result |
| RetentionSweep | each module | scheduler daily | P4 | (store_key, date) | chunked | R-class expiry |
| GenerateReportSnapshot | Reporting | schedule / urgent correction | P3 | (definition, subject, period, revision) | build → store body → tx | — |
| UpdateReadModels | Reporting | events | P3 | event_id | per event | — |
| ReviewSlaSweep | Review | scheduler every 5 min | P3 | (task_id, level) | per task | — |
| ReservationSweep | Tenancy | scheduler every 5 min | P1 | reservation_id | per row | a later completion settles late: EXPIRED → SETTLED_LATE [W11-C3] |
| UsageReconciliation | Tenancy | daily | P4 | (provider, date) | batch | — |
| LeaseSweep | queue | every 30 s | — | job_id | cm_queue | returns expired leases |
| GateRun | AI Platform | route change / snapshot deprecation | P4 | gate_run_id | platform org | — |
| ScheduleReminder | Challenge | student challenge AVAILABLE | P2 | student_challenge_id | per row | one reminder 24 h before due if not STARTED; quiet hours; moves with a due-time change if unsent; re-checks at send [G5, W4-4] |
| HandleMissedOccurrence | Challenge | scheduler recovery | P1 | (definition_id, occurrence_local) | per occurrence | before closes_at: create and open with original times, teachers told it opened late; otherwise MISSED [Wave 4 S-5] |
| ExpireReviewPeriod | Identity | scheduler | P3 | grant_id | per row | STUDENT_CHALLENGE grants expire at closes_at + 14 days; expiry moves with an extension [W4-C2, W4-4] |
| ExpireLateHold | Assessment | scheduler daily | P3 | submission_id | per row | LATE_HELD older than 14 days → LATE_REJECTED (HOLD_EXPIRED) [W4-6] |
| EscalateUnconfirmedSemantic | Evaluation | scheduler daily | P3 | (evaluation_id, head_revision) | per evaluation | PROVISIONAL SEMANTIC_AI unconfirmed 14 days → EVALUATION_REVIEW (UNCONFIRMED_SEMANTIC), admin scope; never auto-confirmed [W6-2, W6-C2] |
| RecheckBudgetHold | Evaluation | scheduler every 5 min | P1 | (run_id) | per held run | proceed when pool has room; past deadline NEEDS_REVIEW (BUDGET_HOLD_EXPIRED) [W11-C4] |
| ExecuteApprovedDeletion | Privacy | scheduler | P2 | deletion_request_id | per request | starts fan-out at execute_after (approval + 7 days) unless CANCELLED [W10-3] |
| SubscriptionTimers | Tenancy | scheduler hourly | P2 | (subscription_id, transition) | per subscription | trial end, cancellation effective, expiry → organization SUSPENDED; 30 days → TERMINATED; Owner warnings before each step [W11-1]; PAST_DUE never auto-suspends [W11-2]; trial-end notices 14 and 3 days ahead (PROPOSED DEFAULT) |
| BudgetWarning | Tenancy | reservation settle / hourly | P3 | (tenant, pool, period, threshold) | per pool | banners at 80% / 100%; one Owner email per threshold per pool per period [W11-5] |
| GenerateUsageStatement | Tenancy | period end | P4 | (tenant, period_start) | per organization | usage statement (PROPOSED DEFAULT, W11 IN-1); learner count = ACTIVE learners at period end [US-1]; FINANCIAL class R11 [W11-C2] |
| OrganizationPurge | Tenancy / Privacy | TERMINATED + 90 days | P4 | tenant_id | chunked per module | purge precedence over class periods; audit per LG-1; FINANCIAL set kept per LG-11 [W10-C2, W11-C2] |

# 22. Database Model Summary

Detailed column specifications are in Sections 5–18. This section lists every table with category, classification and retention for schema generation.

| Schema.table | Cat | Class | Ret | Mutability |
|---|---|---|---|---|
| identity.user, external_identity | GLOBAL-IDENTITY | S2 | R1 | mutable |
| identity.membership, role_assignment | TENANT | S1 | R1 | mutable / revocable |
| identity.staff_invitation | TENANT | S4 | R7 | mutable |
| identity.capability_grant, capability_session, otp_challenge | TENANT | S4 | R7 | status-mutable |
| identity.capability_exchange | TENANT | S1 | R7 | append-only |
| identity.elevated_access_grant | PLATFORM | S1 | R6 | status-mutable |
| identity.resolver_audit | OPERATIONAL | S1 (hashed) | R6 | append-only |
| roster.learner, guardian, contact_point | TENANT | S2 | R1 | mutable |
| roster.learner_pseudonym | TENANT | S1 | R1 | re-pointable (merge), deletable |
| roster.guardian_link, contact_point_link, course, cohort, enrollment | TENANT | S1 | R1 | mutable |
| roster.roster_import, roster_import_row | TENANT | S1/S2 | R9 | mutable |
| roster.learner_merge | TENANT | S1 | R1 | status-mutable |
| tenancy.organization, organization_setting | TENANT | S1 | R1 | mutable |
| tenancy.plan, plan_version | REFERENCE | S0 | — | versioned |
| tenancy.subscription, entitlement, budget_pool, budget_pool_shard, reservation | TENANT | S1 | R1 | mutable |
| tenancy.usage_ledger_entry | TENANT | S1 | R6 | append-only |
| privacy.consent_policy_version | TENANT | S0 | R1 | immutable when active |
| privacy.channel_consent, processing_consent | TENANT | S1 | R1 | state rows |
| privacy.consent_event | TENANT | S1 | R6 | append-only |
| privacy.consent_request_batch, consent_request | TENANT | S1 | R1 | status-mutable |
| privacy.deletion_request, deletion_task | TENANT | S1 | R6 | status-mutable |
| privacy.classification_register | REFERENCE | S0 | — | versioned by migration |
| privacy.retention_override | TENANT | S0 | R1 | mutable |
| privacy.subprocessor | PLATFORM | S0 | — | mutable |
| content.topic, topic_mapping, objective, question | TENANT | S0/S1 | R1 | mutable / append-only (mapping) |
| content.question_version (+ topic, objective) | TENANT | S4 | R1 | immutable after publish |
| content.rubric*, test_suite*, test_case, reference_solution, known_wrong_variant, hint_set* | TENANT | S4/S1 | R1 | immutable after publish |
| content.test_validation_run | TENANT | S1 | R1 | status-mutable |
| content.source_document, extraction_artifact | TENANT | S2 | R2 | immutable artifacts |
| content.generation_request, generation_item | TENANT | S1 | R1 | status-mutable |
| content.question_import, question_import_row | TENANT | S1 | R9 | mutable |
| challenge.* (definition, occurrence, assignment, target, student_challenge, item, reinforcement_plan) | TENANT | S1 | R1 | items immutable |
| assessment.attempt, hint_event | TENANT | S1 | R1 | status-mutable / append |
| assessment.submission, draft, practice_run | TENANT | S3 | R2 / R4 | submission content immutable (purgeable) |
| evaluation.grading_policy*, confidence_policy_version | TENANT | S0 | R1 | immutable when active |
| evaluation.evaluation_floor | REFERENCE | S0 | — | migration |
| evaluation.response_evaluation_head | TENANT | S1 | R1 | CAS-mutable |
| evaluation.evaluation, evaluation_context, component_result, criterion_result | TENANT | S1 (evidence by reference) | R1 | result immutable |
| evaluation.evaluation_run | TENANT | S1 | R1 | status-mutable |
| evaluation.code_test_result | TENANT | S1/S3 | R4 | observation refs purged |
| evaluation.dispute | TENANT | S2 | R1 | status-mutable; text redactable |
| evaluation.regrade_request, regrade_item | TENANT | S1 | R1 | status-mutable |
| learning.* | TENANT | S1 | R1 | event append-only; projections mutable |
| review.* | TENANT | S1 | R1 / R6 | status-mutable / append-only events |
| comms.channel_account, channel_account_assignment, template_version | TENANT | S1/S4 | R1 | mutable |
| comms.shared_channel_account, channel_suppression, platform_template_version | PLATFORM / REFERENCE | S1 | — | mutable |
| comms.delivery, delivery_event | TENANT | S1 (+body ref S3) | R1 / R5 | status-mutable / append-only |
| comms.webhook_inbox | OPERATIONAL | S1 (payload encrypted) | R10 | status-mutable |
| comms.inbound_message | TENANT | S3 | R5 | immutable |
| ai.prompt_version, model_snapshot, capability_route, golden_*, gate_run | PLATFORM | S0/S3 | per source | versioned |
| ai.ai_operation | TENANT | S1 (payload refs S3) | R1 / R3 | status-mutable |
| codeexec.runtime_image | REFERENCE | S0 | — | versioned |
| codeexec.execution_request, execution_observation | TENANT | S1/S3 | R4 | immutable observations |
| reporting.rm_* | TENANT | S1 | R1 | projections |
| reporting.report_definition, report_recipient, pending_correction | TENANT | S1 | R1 | mutable |
| reporting.report_snapshot | TENANT | S2/S3 | R8 | immutable, redactable |
| <module>.processed_event | TENANT | S1 | 30 days | append-only |
| audit.audit_event | TENANT | S1 | R6 | append-only, separate schema |

**Payload store (object storage).** Keys `{tenant_id}/{store}/{entity_id}/{uuid}`: submission content files, drafts over 64 KB, AI payloads, feedback text, criterion explanations, evidence excerpts are **not** stored (offsets only), code stdout/stderr, message bodies, report bodies, source documents, extraction outputs, dispute/review note text, test case large inputs/outputs. Every store key prefix is in the classification register.

# 23. Index Strategy

Every TENANT table leads its composite indexes with `tenant_id`: queries always run with the tenant predicate injected by RLS, and it keeps an organization's rows together. Unique constraints listed with tables are not repeated.

| Table | Index | Why |
|---|---|---|
| evaluation.response_evaluation_head | PK (submission_id) | CAS by submission |
| evaluation.response_evaluation_head | (tenant_id, learner_id) | learner result pages |
| evaluation.response_evaluation_head | (tenant_id, current_status) WHERE current_status IN ('PROVISIONAL','NEEDS_REVIEW') | teacher review lists, bulk confirm |
| evaluation.evaluation | (tenant_id, submission_id, created_at DESC) | evaluation history per response |
| evaluation.evaluation | (decision_deadline) WHERE status = 'PENDING' | deadline sweep (partial, tiny) |
| evaluation.evaluation | (tenant_id, regrade_request_id) WHERE regrade_request_id IS NOT NULL | regrade progress |
| evaluation.evaluation_run | (evaluation_id), (ai_operation_id), (execution_request_id) | resume on completion events |
| evaluation.dispute | (tenant_id, status, created_at) WHERE status IN ('OPEN','UNDER_REVIEW') | dispute queue |
| assessment.attempt | (tenant_id, student_challenge_id, item_ordinal) | learner runtime |
| assessment.submission | (tenant_id, attempt_id) unique; (tenant_id, idempotency_key) unique | submit idempotency |
| assessment.submission | (tenant_id, timing_status) WHERE timing_status = 'LATE_HELD' | late queue |
| challenge.student_challenge | (tenant_id, assignment_id, status) | assignment dashboards, chunked opening |
| challenge.student_challenge | (tenant_id, learner_id, status) | learner home, leaver cancellation |
| challenge.student_challenge | (expires_at) WHERE status IN ('AVAILABLE','OPENED','STARTED') | expiry sweep |
| challenge.challenge_assignment | (tenant_id, status, opens_at) | scheduler |
| challenge.challenge_occurrence | unique (tenant_id, definition_id, occurrence_local) | idempotent occurrences |
| learning.observation | (tenant_id, learner_pseudonym_id) | recompute per learner |
| learning.topic_state | PK (tenant_id, learner_pseudonym_id, topic_id); (tenant_id, topic_id, state) | cohort/topic views |
| learning.reinforcement_item | (tenant_id, status, due_after) WHERE status = 'PENDING' | planning |
| learning.learning_event | unique (tenant_id, submission_id, head_revision, event_type) | idempotent append |
| review.review_task | (tenant_id, status, priority, due_at) WHERE status IN ('OPEN','ASSIGNED','ESCALATED') | queues |
| review.review_task | (tenant_id, scope_cohort_id, status) | scoped queues for teachers |
| review.review_task | (due_at) WHERE status IN ('OPEN','ASSIGNED') | SLA sweep |
| comms.delivery | (channel_account_ref, status, not_before) WHERE status IN ('CREATED','QUEUED','RETRYING') | throughput scheduler |
| comms.delivery | unique (channel_account_ref, provider_message_id) | webhook resolution |
| comms.delivery | (tenant_id, source_module, source_ref) | status by producer |
| comms.webhook_inbox | unique (provider, provider_event_id); (status, received_at) | dedupe, processing |
| identity.capability_grant | unique (token_hash); (tenant_id, subject_type, subject_id) WHERE status='ACTIVE'; (tenant_id, scope_type, scope_id) | exchange, revocation |
| identity.capability_session | unique (session_hash) | per-request session lookup |
| identity.membership | (user_id) WHERE status = 'ACTIVE' | login resolver |
| roster.contact_point | unique (tenant_id, type, value_normalized); (value_hmac) | import dedupe, inbound resolution |
| roster.enrollment | (tenant_id, cohort_id) WHERE status='ACTIVE'; (tenant_id, learner_id) | materialization, leavers |
| roster.learner | unique (tenant_id, external_ref) | import upsert |
| content.question_version | (tenant_id, question_id, version_no DESC); (tenant_id, status) WHERE status='PUBLISHED' | latest version; selection |
| content.question_version_topic | (tenant_id, topic_id) | topic-based selection |
| ai.ai_operation | unique (tenant_id, idempotency_key); (status, deadline_at) WHERE status IN ('QUEUED','RUNNING') | retry dedupe, timeouts |
| tenancy.reservation | (status, expires_at) WHERE status='HELD'; unique (tenant_id, operation_kind, operation_ref) | sweeper, idempotency |
| tenancy.usage_ledger_entry | (tenant_id, pool, occurred_at) | usage reports |
| privacy.processing_consent / channel_consent | unique keys | gate lookups |
| queue jobs (library) | (queue, priority, run_at) WHERE state='available'; (lease_expires_at) WHERE state='active' | claim, lease sweep |

Avoided: indexes on low-selectivity status columns without partial predicates; GIN on jsonb (no V1 query needs it; add only for measured queries).

# 24. State Machines (remaining)

QuestionVersion (§8.4), StudentChallenge (§9.4), Evaluation (§11.4), ReinforcementItem (§12.4), ReviewTask (§13.2), Delivery (§14.2) and AIOperation (§15.4) are specified in their sections.

### ChallengeAssignment

| From | To | Actor | Invalid | Side effects | Audit |
|---|---|---|---|---|---|
| — | DRAFT | staff / occurrence job | — | — | yes (staff) |
| DRAFT | SCHEDULED | staff Publish / occurrence job | missing policy pin | pins policy + reveal | yes |
| SCHEDULED | MATERIALIZING | scheduler | — | chunk jobs | no |
| MATERIALIZING | OPEN | last chunk done and opens_at reached | — | OpenStudentChallenges | no |
| OPEN | CLOSED | scheduler at closes_at | — | expire open instances | no |
| OPEN | OPEN (extended) | staff | shortening; per-learner overrides [W4-4] | due/close only later for the whole assignment; reminders and grant expiry move | yes |
| DRAFT/SCHEDULED/MATERIALIZING/OPEN | CANCELLED | staff | from CLOSED | cancel StudentChallenges (ASSIGNMENT_CANCELLED); revoke grants; submitted work kept [W4-3] | yes |
| SCHEDULED+ | edit pinned fields | — | always invalid | — | — |

### Attempt

| From | To | Actor | Side effects |
|---|---|---|---|
| — | OPEN | learner StartAttempt | StudentChallenge STARTED (first) |
| OPEN | SUBMITTED | SubmitResponse | CreatePendingEvaluation (unless LATE_HELD) |
| OPEN | ABANDONED (abandon_reason EXPIRED / CANCELLED) | StudentChallenge expired/cancelled | draft kept under R2 [W5-C1] |
| ABANDONED (EXPIRED) | SUBMITTED | late path within the late window (queued offline submission) | timing_status LATE_* [W5-C1, X10] |
| SUBMITTED / ABANDONED (CANCELLED) | any | invalid | — |

### Submission (timing_status)

| From | To | Actor | Side effects | Audit |
|---|---|---|---|---|
| — | ON_TIME / LATE_ACCEPTED / LATE_HELD | SubmitResponse (server time vs expiry + grace) | evaluation except LATE_HELD; LATE_HELD → ReviewTask LATE_SUBMISSION | no |
| LATE_HELD | LATE_ACCEPTED | teacher AcceptLateSubmission | CreatePendingEvaluation | yes |
| LATE_HELD | LATE_REJECTED (late_rejection_reason TEACHER / HOLD_EXPIRED) | teacher RejectLateSubmission / ExpireLateHold at 14 days (LOCKED) | content kept under R2; no evaluation, no head [W4-6, W6-C5] | yes |
| content | purged | PurgeStore | content NULL, `content_purged_at` set | yes |

### EvaluationRun

| From | To | Trigger | Invalid |
|---|---|---|---|
| — | QUEUED | plan creation | — |
| QUEUED | RUNNING | step job claims | — |
| RUNNING | SUCCEEDED | result recorded | — |
| RUNNING | QUEUED | retryable failure (lease expiry, infra) | beyond caps |
| RUNNING/QUEUED | FAILED | non-retryable failure, caps reached, cancellation (`failure_class=CANCELLED`, X16), budget | — |
| RUNNING/QUEUED | TIMED_OUT | step deadline | — |
| SUCCEEDED/FAILED/TIMED_OUT | any | — | terminal |

### Dispute

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | OPEN | learner (own), guardian (elevated), staff | score visible to the learner; within 14 days of it becoming visible; not on a DISPUTE_RESOLUTION result; at most one open dispute per submission [W6 DI-1/DI-2] | ReviewTask DISPUTE routed by assignment cohort [W6-6]; auto-confirm suspended for this head; dispute text never sent to AI [W6 DI-3] | yes |
| OPEN | UNDER_REVIEW | reviewer claims task | — | — | yes |
| OPEN/UNDER_REVIEW | UPHELD | ResolveDispute(upheld) | head CAS | DISPUTE_RESOLUTION evaluation | yes |
| OPEN/UNDER_REVIEW | REJECTED | ResolveDispute(rejected) | — | optional confirm | yes |
| OPEN | WITHDRAWN | raiser | — | task cancelled | yes |
| terminal | any | — | invalid | — | — |

### RegradeRequest

| From | To | Actor | Guard | Side effects |
|---|---|---|---|---|
| — | DRAFT | regrade.request | target compatible for at least one submission | — |
| DRAFT | PREVIEWING | request | — | PreviewRegrade job |
| PREVIEWING | PREVIEWED | job | — | preview stored |
| PREVIEWED | APPROVED | regrade.approve + recent auth; approver ≠ requester, always [FD-1] | preview < 24 h old (PROPOSED DEFAULT) | — |
| APPROVED | RUNNING | system | — | chunk jobs |
| RUNNING | COMPLETED / FAILED | system | — | RegradeCompleted; grouped ReviewTask for locked heads |
| DRAFT/PREVIEWED/APPROVED/RUNNING | CANCELLED | requester/approver | — | pending items skipped; completed items remain |

### Usage Reservation

HELD → SETTLED (operation completed, actual cost); HELD → RELEASED (operation not executed / no cost); HELD → EXPIRED (sweeper past expires_at); EXPIRED → SETTLED_LATE (operation completed after expiry; the ledger records actual usage) [W11-C3]. SETTLED, RELEASED and SETTLED_LATE are terminal. Usage is never lost from the ledger.

### CapabilityGrant

| From | To | Trigger | Side effects | Audit |
|---|---|---|---|---|
| — | ACTIVE | IssueCapabilityGrant | a new grant does **not** revoke earlier ACTIVE grants of the same (subject, scope) family; device limit counted across the family [SC1] | yes |
| ACTIVE (family) | REVOKED | staff "reset link" or security event | all grants of the family revoked [SC1] | yes |
| ACTIVE | ACTIVE (exchange) | POST exchange | session created; device count checked | yes |
| ACTIVE | REVOKED | unlink, enrollment end, cancel, merge, deletion, staff, GuardianLinkEnded (that guardian, that learner) [W2-C4, W4-C7] | sessions revoked | yes |
| ACTIVE | EXPIRED | time (STUDENT_CHALLENGE: closes_at + 14 days, read-only after close; moves with extension) [W4-C2, W4-4] | sessions expire | no |
| REVOKED/EXPIRED | any | invalid | — | — |

### Consent (Channel and Processing)

| From | To | Actor | Side effects | Audit |
|---|---|---|---|---|
| — / WITHDRAWN / EXPIRED | GRANTED | consent page (grantor rules), org attestation where policy allows, inbound opt-in | ConsentChanged | ConsentEvent |
| GRANTED | WITHDRAWN | subject/grantor, staff on request, inbound STOP | ConsentChanged; cancel queued work | ConsentEvent |
| GRANTED | EXPIRED | policy version requiring renewal | ConsentChanged | ConsentEvent |
| any | GRANTED by LEARNER when policy requires GUARDIAN | — | invalid | — |

# 25. Transaction Boundaries

Notation: **TX** = one TenantTransaction; **after commit** = work done by jobs enqueued inside TX.

### 25.1 SubmitResponse
```
TX (LearnerActor):
  lock attempt FOR UPDATE; attempt.status = OPEN, or ABANDONED(EXPIRED) within the late
    window (late path, server order kept) [W5-C1]; actor may answer (C3);
    read-only review sessions refused except this single late path [W5-C2]
  validate response against StudentQuestionView input schema
  INSERT submission (UNIQUE attempt_id; UNIQUE idempotency_key)
    on idempotency conflict with same content hash -> return existing result
    on conflict with different content -> 409 ALREADY_SUBMITTED
  timing_status from server_received_at vs expires_at + grace
  attempt.status = SUBMITTED
  if not LATE_HELD: Evaluation.CreatePendingEvaluation (C1) ->
     INSERT evaluation(PENDING), evaluation_context, runs(QUEUED)
     INSERT response_evaluation_head(revision 1)
     deterministic-only plan: compose inline -> CONFIRMED (INSTANT), head revision 2
     else enqueue step jobs
     enqueue EvaluationHeadChanged
  if LATE_HELD: Review.CreateReviewTask(LATE_SUBMISSION)
  if every item has any submission (or on FinishChallenge [W5-2]):
     Challenge.RecordEngagement(COMPLETED)   -- engagement only; never reverted [W5-C3/C4]
COMMIT
after commit: AI/code steps, projections, read models
```
Invariants: one submission per attempt — Challenge Me's stored record; downstream jobs and providers may run more than once (J-6) and the evaluation head decides the authoritative result [W5 SU-9]; response persisted before any evaluation work; no network I/O.

### 25.2 ComposeEvaluation (result arrival)
```
TX (SystemActor WORKER):
  load evaluation + runs; if evaluation.status != PENDING -> no-op
  compose components (authority rules), compute confidence, decide status
  set immutable result block; status
  read head FOR UPDATE (row lock; also CAS by revision)
    if head.current_evaluation_id == this evaluation: revision+1, status fields
    elif this evaluation is REGRADE and head not human_locked: move head (CAS)
    elif head.human_locked: mark this candidate NEEDS_REVIEW; CreateReviewTask
    else (newer machine head): mark SUPERSEDED (stale)
  enqueue EvaluationHeadChanged (if head changed), GenerateEvaluationFeedback,
          AutoConfirmEvaluation (if eligible)
  settle reservations for completed runs
COMMIT
```

### 25.3 OverrideEvaluation
```
TX (StaffActor, evaluation.override, recent auth not required):
  input expected_head_revision, scores/criteria, reason_code
  INSERT evaluation(TEACHER_OVERRIDE, CONFIRMED, HUMAN) + context (copy of current,
         evaluation version = current evaluation version)
  UPDATE head ... WHERE revision = expected   -> 0 rows: ROLLBACK, 409 HEAD_CHANGED
  previous current evaluation -> SUPERSEDED (superseded_by)
  cancel queued runs of a PENDING previous evaluation
  Review.CompleteTask for open tasks on this submission (if any)
  audit_event; enqueue EvaluationHeadChanged
COMMIT
```

### 25.4 RequestRegrade / ApproveRegrade / ExecuteRegradeChunk
```
RequestRegrade TX: validate scope & target; INSERT regrade_request(DRAFT→PREVIEWING);
                   enqueue PreviewRegrade
ApproveRegrade TX: guard PREVIEWED, approver permission, recent auth, preview age;
                   status APPROVED→RUNNING; INSERT regrade_items; enqueue chunks
ExecuteRegradeChunk: per submission TX:
   read head; if human_locked -> item SKIPPED_HUMAN (collected into grouped task)
   else INSERT evaluation(REGRADE, PENDING) with new context (target version);
        plan runs; deterministic compose inline; head moves only when result exists
   item DONE / NO_CHANGE
Final TX: counts, COMPLETED, grouped ReviewTask, RegradeCompleted
```
The old head remains current until the regrade evaluation has a result (learners never see "Evaluating" because of a regrade).

### 25.5 MaterializeAssignmentChunk
```
TX (SystemActor SCHEDULER), chunk of ≤ 500 learner ids:
  assignment status in (SCHEDULED, MATERIALIZING, OPEN)
  for each learner: select versions (seeded); INSERT student_challenge ON CONFLICT
      (assignment, learner) DO NOTHING; INSERT items
  UPDATE assignment.materialized_count
  if assignment OPEN: enqueue DeliveryRequested for new instances
COMMIT
```

### 25.6 ApproveQuestionVersion / PublishQuestionVersion
```
Approve TX: guard IN_REVIEW; permission; status APPROVED; Review.CompleteTask; audit
Publish TX: guard APPROVED (or DRAFT + direct publish); lock question row;
            verify pinned versions PUBLISHED, suite VALIDATED, weights sum 1;
            compute hashes + compatibility vs previous published version;
            status PUBLISHED; question.current_published_version_id; audit;
            enqueue QuestionVersionPublished
```

### 25.7 WithdrawConsent
```
TX: UPDATE consent state row (row_version); INSERT consent_event;
    enqueue ConsentChanged
COMMIT
after commit (per consumer, P1):
  Communication: cancel CREATED/QUEUED/RETRYING deliveries for the contact/purpose
  AI Platform: CANCEL QUEUED ops for the learner; RUNNING ops finish -> result discarded,
               payload purged
  Evaluation: pending AI runs -> FAILED(CANCELLED); plans re-planned to TEACHER_REVIEW
  Reporting: skip future guardian reports
Dispatch-time check (#2) closes the race for jobs already claimed.
```

### 25.8 CreateReinforcement (Learning) and PlanReinforcement (Challenge)
```
RecomputeTopicState TX: recompute; if the TopicState satisfies the policy's reinforcement
                        rule (W8-1: NEEDS_PRACTICE, eligible, no open item on the topic,
                        7-day topic spacing; due_after = +48 h, postponed to the first slot
                        within 2 per rolling 7 days, never dropped):
                        INSERT reinforcement_item(PENDING, basis incl. topic state);
                        (learning signals are derived in the same TX but are not an input)
                        enqueue ReinforcementItemCreated
PlanReinforcement TX (Challenge): Roster.ResolveLearners(pseudonym) [SC3];
   Learning.RevalidateReinforcementItem (A, read)
   INVALID -> plan CANCELLED
   no eligible question (Wave 4 RF-6) -> Learning.MarkReinforcementUnplannable (A)
              -> item EXPIRED (NO_ELIGIBLE_QUESTIONS); no student challenge; no message
   VALID   -> create REINFORCEMENT assignment for learner (pins current policy),
              materialize inline (single learner), status SCHEDULED; Learning item
              -> SCHEDULED via Learning command (A)
OpenStudentChallenges (reinforcement): revalidate again at opening; INVALID ->
   StudentChallenge CANCELLED (REINFORCEMENT_INVALIDATED), nothing sent [SC4, W4-C6]
```

### 25.9 ExchangeCapabilityToken
```
Resolver (cm_resolver): token_hash -> (tenant_id, grant_id) or not found (uniform 404)
TX (SystemActor IDENTITY, tenant):
  lock grant; status ACTIVE and not expired
  device count ≤ max_devices else require OTP
  INSERT capability_exchange; INSERT capability_session
  if scope STUDENT_CHALLENGE: Challenge.RecordEngagement(OPENED)
COMMIT -> Set-Cookie (HttpOnly, Secure, SameSite=Lax), redirect to token-free URL
```

### 25.10 DispatchDelivery
```
TX1 claim: delivery QUEUED/RETRYING -> SENDING; ConsentGate (#2); suppression check;
           grant issue (C17) if capability required (never revokes earlier grants [SC1]);
           render body to payload store with a placeholder for the token; the token
           exists only in memory for the provider request [SC2]
           MESSAGING exhausted: OTP / CONSENT_REQUEST sent as overage; others wait [W11-4]
           -> denied: CANCELLED
COMMIT
provider call (no TX), admission token per ChannelAccount
TX2: SENT with provider_message_id | RETRYING | FAILED; delivery_event; settle usage
```

### 25.11 MergeLearners
```
Preview TX: compute counts (open challenges, grants, consents, links); store preview
Commit TX (ADMIN, recent auth): both ACTIVE; duplicate.status = MERGED, merged_into;
   re-point pseudonym rows; move ContactPointLinks and GuardianLinks (dedupe);
   end duplicate enrollments, create/keep survivor enrollments; audit;
   enqueue LearnerMerged
after commit: Identity revokes duplicate grants; Challenge re-points or cancels open
   StudentChallenges (unique (assignment, learner) conflict -> cancel duplicate's);
   Learning rebuilds survivor; Reporting rebuilds read models
```

# 26. Concurrency Model

| Concurrent writers | Problem | Mechanism | Losing writer |
|---|---|---|---|
| ResponseEvaluationHead: override vs regrade vs composer vs dispute | two results both "current" | `UPDATE … WHERE revision = expected` + row lock in compose | re-read; follow §11.3 rules; UI gets 409 HEAD_CHANGED |
| Teacher override vs teacher override | lost update | same CAS with client-supplied expected revision | 409, show new head |
| AutoConfirm vs dispute/override | confirming a disputed or replaced result | job checks head revision and open dispute in its TX | no-op |
| Regrade vs human lock | machine replaces human | human_locked check under CAS | SKIPPED_HUMAN / candidate |
| Challenge materialization chunks, late-joiner handler | duplicate StudentChallenges | UNIQUE (assignment_id, learner_id) + ON CONFLICT DO NOTHING | no-op |
| Occurrence creation (multiple schedulers) | duplicate occurrences | advisory lock per definition + UNIQUE (definition, occurrence_local) | no-op |
| SubmitResponse double-submit | two submissions | row lock on attempt + UNIQUE (attempt_id) + idempotency key | returns existing or 409 |
| Usage reservations | overspend / hot row | sharded counters, approximate read, bounded overrun; UNIQUE (operation) | EXHAUSTED or existing reservation returned |
| Webhook processing | duplicates, out of order | UNIQUE (provider, provider_event_id); rank-monotonic update | ignored |
| Learning projection | out-of-order head events | apply only if head_revision > stored | ignored |
| TopicState recompute (many observations) | lost recomputation | recompute from full observation set; coalescing job key per learner; `projection_revision` CAS | re-enqueue |
| Consent withdrawal vs dispatch | send after withdrawal | check at dispatch inside claim TX (row read of consent state); in-flight results discarded | CANCELLED |
| Reinforcement revalidation vs new evaluation | stale reinforcement | revalidation compares basis revisions with current observations | CANCELLED |
| Review task claim | two reviewers | `UPDATE … WHERE status='OPEN' AND row_version = x` | "already assigned" |
| Question publish (two versions of same question) | two current versions | lock question row; set current_published_version_id | serialized |
| Learner merge vs materialization | instance for MERGED learner | materialization checks learner ACTIVE in TX; merge cancels conflicts | skipped |
| Capability exchange device limit | exceeding max devices | lock grant row during exchange | OTP required |

# 27. Privacy & Data Lifecycle

Common to every row: deletions are recorded as a `privacy.deletion_task` (audit), and after any database restore the external deletion ledger is replayed (X11).

| Store | Class | Purpose | Owner | Retention | Deletion trigger |
|---|---|---|---|---|---|
| submission content and files | S3 | evaluation, review, disputes | Assessment | R2 | learner deletion; R2 expiry |
| drafts, practice runs | S3 | autosave, practice | Assessment | R2 / R4 | learner deletion; expiry |
| AI payloads (inputs, outputs) | S3 | audit of AI results | AI Platform | R3 | learner deletion; R3 expiry |
| criterion evidence | S1 (offsets) | grounding | Evaluation | R1 | follows submission purge |
| feedback text, criterion explanations | S3 | learner feedback | Evaluation | R2 | learner deletion |
| code observations | S3 | code results | Evaluation, Code Execution | R4 | expiry; learner deletion |
| dispute text, review notes | S2/S3 | human review | Evaluation, Review | R2 | learner deletion |
| message bodies, inbound messages | S3 | delivery audit | Communication | R5 | expiry; learner deletion |
| webhook raw payloads | S1–S3 | processing | Communication | R10 | expiry |
| report snapshots | S2/S3 | record of what was sent | Reporting | R8 | expiry; learner deletion |
| source documents, extraction | S2 | content creation (organization content) | Content | R1 [W3-C3] | deletion on request removes file and outputs; versions keep a "source deleted" marker [W3-C3] |
| roster personal data | S2 | identity | Roster | R1 | learner/guardian deletion |
| pseudonym mapping | S1 | re-identification | Roster | R1 | learner deletion |
| learning rows | S1 | progress | Learning | R1 | learner deletion (by pseudonym) |
| customer-derived golden items | — | NOT_APPLICABLE in V1 (commissioned and synthetic only) [W7-2] | — | — | — |
| integrity facts | S1 (no content) | teacher awareness | Assessment | with submission metadata | learner deletion; LG-7 [W5-5] |
| generated exports | S2/S3 | assignment results, subject and organization exports | Reporting / Privacy | EXPORT_FILE 7 days [W9-3, W10-5] | expiry |
| usage ledger, audit events | S1 | billing, security | Tenancy, audit | R6 | expiry; audit per LG-1 on organization purge [W10-C2] |
| FINANCIAL record set | S1 (organization name, billing contact; no learner data) | billing records | Tenancy | R11, duration per LG-11 | survives organization purge [W11-C2] |

| Store | Purge handler | External provider deletion |
|---|---|---|
| submission content and files | null content, set `content_purged_at`, delete objects | code provider if it retained code |
| drafts, practice runs | delete | code provider |
| AI payloads | delete objects, set `payload_purged_at` | AI provider per DPA (zero-retention where available) |
| criterion evidence | none needed: offsets resolve to [redacted] | — |
| feedback text, explanations | delete objects | — |
| code observations | delete objects | sandbox provider |
| dispute text, review notes | redact text, keep decision record | — |
| message bodies | delete bodies | messaging provider where supported |
| webhook raw payloads | delete | — |
| report snapshots | replace body with tombstone | email provider logs (limited) |
| source documents, extraction | delete objects | extractor provider |
| roster personal data | anonymize row; delete contact points with no other links | — |
| pseudonym mapping | delete mapping; Learning purges rows by pseudonym | — |
| learning rows | delete | — |
| golden items | not applicable in V1 [W7-2] | — |
| integrity facts | delete with submission metadata | — |
| generated exports | delete objects at expiry | — |
| usage ledger, audit events | delete by partition at expiry | — |

**Telemetry contract:** span/log attributes from an allow-list (ids, enums, counts, durations, sizes); no free text, no SQL parameters, no HTTP bodies; product analytics events server-side with pseudonymous ids and allow-listed properties; no session replay on learner surfaces.

**Organization purge precedence (LOCKED, W10-C2).** Organization purge at termination + 90 days removes all tenant-owned data regardless of class periods, except audit events (LG-1) and the FINANCIAL set (R11, LG-11). **Learning deletion** deletes rows; RETRACTED is unused in V1 [W10-C3]. **Deleted learners** are excluded from per-learner lists and exports and appear only in aggregates [W10-2]. All periods remain subject to **LG-10**.

**Deletion ledger (X11):** `DeletionCompleted` entries written to object storage with write-once retention; restore runbook replays entries newer than the restore point.

# 28. API Command / Query Contracts

All commands: authenticated ActorContext, tenant from context (never from body), explicit DTOs, idempotency key header for retryable commands, audit where marked. Errors use stable codes: `NOT_FOUND` (also used for cross-tenant ids), `FORBIDDEN`, `VALIDATION_FAILED`, `CONFLICT`, `HEAD_CHANGED`, `STATE_INVALID`, `RATE_LIMITED`, `ENTITLEMENT_REQUIRED`, `CONSENT_REQUIRED`.

| Command | Actor / authorization | Input DTO (key fields) | Transaction | Result | Events | Idempotency | Errors |
|---|---|---|---|---|---|---|---|
| CreateChallenge | Staff, challenge.manage on course/cohort | title, targets, selection_rule, grading_policy_id, reveal_policy, schedule{rrule, tz} or opens/due/closes | Definition TX (+ assignment for ad hoc, pins policy) | definition_id, assignment_id? | — | header key | VALIDATION_FAILED, FORBIDDEN (target scope) |
| SubmitResponse | Learner session (scope item) | student_challenge_id, item_ordinal, attempt_id, response (typed by input schema), client_submitted_at, idempotency_key | §25.1 | submission_id, learner_status | EvaluationHeadChanged | body key | STATE_INVALID, CONFLICT, VALIDATION_FAILED |
| RequestDispute | Learner (own), Guardian (elevated), Staff | submission_id, reason_code, text | Dispute TX + ReviewTask | dispute_id | DisputeOpened | (submission, raiser) open-unique | STATE_INVALID (window), CONFLICT |
| ConfirmEvaluation | Staff evaluation.confirm | evaluation_id, expected_head_revision | status TX + head rev | head_revision | EvaluationHeadChanged | expected revision | HEAD_CHANGED, STATE_INVALID |
| BulkConfirmEvaluations | Staff | [evaluation_id, expected_revision] ≤ 200 | per item TX | per-item result | per item | per item | partial results |
| OverrideEvaluation | Staff evaluation.override | submission_id, expected_head_revision, component/criterion scores, reason_code, note | §25.3 | evaluation_id, head_revision | EvaluationHeadChanged | expected revision | HEAD_CHANGED, VALIDATION_FAILED |
| ApproveQuestionVersion | Staff content.approve | question_version_id, row_version | §25.6 | status | — | row_version | STATE_INVALID |
| PublishQuestionVersion | Staff content.publish | question_version_id | §25.6 | status, compatible_with_previous | QuestionVersionPublished | state guard | STATE_INVALID, VALIDATION_FAILED (suite not validated) |
| RequestRegrade | Staff regrade.request | scope, target, notification_policy | §25.4 | regrade_request_id | — | header key | VALIDATION_FAILED (no compatible target) |
| ApproveRegrade | Staff regrade.approve, recent auth | regrade_request_id, row_version | §25.4 | status RUNNING | — | row_version | FORBIDDEN (approver = requester, always) [FD-1], STATE_INVALID |
| MergeLearners | Staff learner.merge, recent auth | survivor_id, duplicate_id, preview_id | §25.11 | merge_id | LearnerMerged | preview_id | CONFLICT (not ACTIVE), STATE_INVALID |
| ImportRoster | Staff roster.import | file upload ref | UploadTX → ValidateRosterImport job | import_id, preview when ready | — | file hash | VALIDATION_FAILED |
| CommitRosterImport | Staff roster.import | import_id | chunk jobs | status | EnrollmentStarted per row | import_id | STATE_INVALID |
| ImportQuestions / CommitQuestionImport | Staff content.author | file ref / import_id | as roster | drafts created | — | file hash | VALIDATION_FAILED |
| RequestElevatedAccess | Platform staff | tenant_ids, reason, ticket, duration ≤ 4 h | platform TX | grant_id (REQUESTED) | — | ticket_ref | VALIDATION_FAILED |
| ApproveElevatedAccess | Platform staff ≠ requester | grant_id | platform TX | ACTIVE | — | grant_id | FORBIDDEN |
| WithdrawConsent / GrantConsent | Learner/Guardian via consent page; Staff on request | subject, purposes, grantor | §25.7 | consent states | ConsentChanged | (subject, purpose, status) | CONSENT_GRANTOR_INVALID |
| RequestDeletion / ApproveDeletion | Staff consent.manage / deletion.approve (Owner, recent auth) | subject | Privacy TX; execute_after = approval + 7 days [W10-3] | deletion_request_id | PurgeStoreRequested… (after hold) | subject open-unique | CONFLICT |
| RequestOwnDeletion | LEARNER_HOME / GUARDIAN_HOME session [W10-1] | — (subject from session) | Privacy TX, source LEARNER_SELF / GUARDIAN_SELF | deletion_request_id | — | subject open-unique | CONFLICT |
| CancelDeletion | Owner, deletion.cancel, during hold [W10-3] | deletion_request_id | Privacy TX → CANCELLED | status | — | state guard | STATE_INVALID |
| ExportSubjectData | Owner, Admin, data.export.subject, recent auth [W10-5] | subject | export job | export_id (file 7 days) | — | header key | FORBIDDEN |
| ExportOrganizationData | Owner, data.export.organization, recent auth; also during termination grace [W10-5, W11 SB-9] | — | export job | export_id | — | header key | FORBIDDEN |
| ExportAssignmentResults | Teacher in scope, Admin, Owner, report.export, recent auth [W9-3] | assignment_id | export job | CSV export_id | — | header key | FORBIDDEN (out of scope) |
| FinishChallenge | Learner session [W5-2] | student_challenge_id | Challenge engagement TX | COMPLETED | ChallengeCompleted | state guard | STATE_INVALID |
| RejectLateSubmission | Staff evaluation.review [W4-6] | submission_id | Submission TX (LATE_REJECTED, TEACHER) | status | LateSubmissionRejected | state guard | STATE_INVALID |
| FlagForSafeguarding | any staff, safeguarding.flag [W7-5] | submission_id, category, note | Review TX (restricted SAFEGUARDING task) | task_id | — | (submission, flagger) | — |
| SetAiFeatureSwitches | Owner, Admin, ai.settings [W7-3] | ai_marking_enabled, ai_generation_enabled | Tenancy settings TX (audited; narrows entitlements only) | settings | — | row_version | ENTITLEMENT_REQUIRED |
| ExtendAssignment | Staff challenge.manage [W4-4] | assignment_id, new due_at / closes_at (later only) | Challenge TX | assignment | — | row_version | VALIDATION_FAILED (earlier time) |
| AcceptLateSubmission | Staff evaluation.review | submission_id | Submission TX + CreatePendingEvaluation | status | EvaluationHeadChanged | state guard | STATE_INVALID |
| ExchangeCapabilityToken | anonymous POST | token | §25.9 | session cookie | — | — | NOT_FOUND (uniform), RATE_LIMITED, OTP_REQUIRED |
| RequestOtp / VerifyOtp | Learner/Guardian session | contact_point_id? / code | Identity TX | elevated scope | — | challenge id | RATE_LIMITED, LOCKED |

**Queries** (all cursor-paginated by `(created_at, id)`, page ≤ 100, tenant from RLS):

| Query | Actor / scope | Read model | Filters |
|---|---|---|---|
| ListAssignments | Staff (course/cohort scope) | challenge tables | status, course, cohort, date range |
| GetAssignmentProgress | Staff | rm_student_challenge_status | status, cohort |
| GetLearnerChallenge | Learner (session scope) | challenge + StudentQuestionView | — |
| GetLearnerResult | Learner (session scope) | head → UX state + reveal | — |
| GetLearnerProgress | Learner (LEARNER_HOME) | topic_state via pseudonym | course |
| ListReviewQueue | Staff (scope) | review_task | type, status, priority, cohort, assignee |
| GetEvaluationDetail | Staff | evaluation + context + criteria (evidence rendered from submission) | — |
| GetCohortTopicMap | Staff | rm_cohort_topic | cohort, topic |
| GetGuardianReport | Guardian (snapshot scope) | report_snapshot body | — |
| ListDeliveries | Staff | comms.delivery | purpose, status, source |
| GetUsage | OWNER/ADMIN (billing.view) | usage_ledger_entry aggregates | pool, period |
| GetUsageStatement | OWNER (billing.view) | statement (PROPOSED DEFAULT, W11 IN-3) | period |
| GetItemGrade / GetChallengeGrade | Staff in scope; learner own | Evaluation [W6-3, W6-4] | submission / student challenge |
| GetConsentCoverage | OWNER/ADMIN | consent tables | purpose, cohort |

# 29. Testing Contracts

| Area | Required tests | Gate |
|---|---|---|
| Tenancy | table-category registry vs RLS; cross-tenant endpoint suite (every endpoint as tenant B with tenant A ids → NOT_FOUND); pooled-connection leak test; job tenant mismatch → POISON; resolver functions return ids only | Phase 1 CI |
| Leakage | student DTO snapshot tests; canary markers for keys, aliases, hidden tests, reference solutions, rubrics, prompts, private notes; architecture test that Assessment never imports evaluator views | Phase 1 CI (grows with modules) |
| Privacy | purge-handler registration for every S3/S4 column/prefix; sensitive-logging test (canary learner text never in logs/traces); deletion end-to-end; restore + ledger replay drill | Phase 1 CI / Phase 9 |
| Evaluation authority | property test: concurrent override/regrade/compose/auto-confirm never yield two current evaluations, never move a human_locked head by machine; results immutable (trigger test); composer rejects AI output for deterministic components; X2 rule | Phase 1b / 4 |
| Learning | property test: live projection == rebuild; out-of-order and duplicate head events; supersession cancels reinforcement; REPEATED_MISCONCEPTION (C6): retries of one item never trigger it, one question repeated in two challenges never triggers it, two distinct questions with the same tag 29 days apart never trigger it, a result correction that removes a tag clears it on recompute, and it never creates or cancels reinforcement; policy scope (C7): a course-scoped topic is calculated under its course's ACTIVE version and an organization-wide topic under the organization's, even when the evidence comes from challenges in different courses; publishing a course version rebuilds only that course's topics; every TopicState/TopicTrajectory row carries the version used; C7-A: a course-scoped topic in a course without an ACTIVE course version is calculated under the organization version, and publishing a first course version rebuilds it under the course version; C7-B: a topic scope change rebuilds affected learners under the newly applicable version with the same TopicState key and topic id; W8 (rev. 1.5): one open item per learner × topic, 7-day topic spacing, 48 h delay, third item in a rolling 7 days postponed not dropped, 14-day unscheduled expiry, NO_ELIGIBLE_QUESTIONS expiry sends no message, a PENDING observation contributes zero, an earlier unanswered appearance is not a repeat (W8-3), out-of-scope evidence-strip units carry no question text, answer content or link (W8-C1) | Phase 5 |
| Deterministic strategies | normalization library test corpus (Arabic diacritics, alef variants, taa marbuta, Eastern Arabic digits, decimal separators, units); tri-state outcomes | Phase 4 |
| AI | golden-set gates per capability × language × response type; injection suite (student responses, documents); leak-check suite; schema-repair behaviour; retry vs regeneration idempotency | Phase 6 |
| Code | reference solution passes; known-wrong variant rejected; hidden-test output never in learner DTO; student outcomes not retried; provider failures retried → hold → review; escape and exhaustion suite against real provider | Phase 4 / 9 |
| Queue | lease expiry and re-claim; dead letter and replay; admission control under contention (R1); weighted priority minimum shares; no transaction across I/O (lint + test) | Phase 1 / 9 benchmark |
| Communication | webhook signature, replay window, dedupe, rank monotonicity; consent at dispatch race; shared-account opt-out suppression | Phase 7 |
| Identity | token pre-fetch safety (GET inert); replay after revoke; device limit; OTP rate limits and lockout; membership revocation effective next request | Phase 3 |
| Scheduling | DST transitions per zone; duplicate scheduler instances; chunk re-runs; late joiner; leaver cancellation | Phase 3 |
| Load | cohort-deadline burst profile (ADR-023) | Phase 9 |
| Waves 2–11 reconciliation | SC1 family grants survive resend; SC2 no token in stored body; SC3/SC4 reinforcement resolve and revalidate at open; late path from ABANDONED(EXPIRED) only [W5-C1]; LATE_REJECTED reasons [W4-6]; no head for LATE_HELD/LATE_REJECTED [W6-C5]; approver ≠ requester [FD-1]; UNCONFIRMED_SEMANTIC at 14 days [W6-2]; hint leak on every step [W7-C2]; DISABLED AI switch [W7-3]; guardian link end revocation scope [W4-C7]; deletion hold and cancel [W10-3]; organization purge precedence [W10-C2]; SETTLED_LATE [W11-C3]; no second AI operation for a started step [W11-C4]; storage exhaustion never rejects learner work [W11-C7]; OTP sent when MESSAGING exhausted [W11-4]; status mapping [W11-C1] | per owning phase |

# 30. Observability Contracts

**Trace spans (names):** `http.<command>`, `tx.<module>.<command>`, `job.<name>`, `ai.operation` (attrs: capability, route_id, provider, model_snapshot, status, tokens, cost_micro, latency), `codeexec.run` (tests, outcome counts), `comms.dispatch` (channel, account_ref, status), `resolver.<function>`. Attribute allow-list only; `tenant_id` and `correlation_id` on every span.

**Metrics:**

| Metric | Labels | SLO / alert |
|---|---|---|
| evaluation_decision_latency_seconds | strategy, response_type | AI p95 < 60 s |
| evaluation_deadline_exceeded_total | strategy | < 1 % |
| head_cas_conflicts_total | writer_origin | alert on spike |
| review_rate | tenant tier, capability | above target → alert |
| review_backlog_age_seconds | task_type | p90 < 48 h |
| queue_lag_seconds | priority | P0 p95 < 30 s |
| dead_letter_total | job | any P0/P1 → page (authoritative over ADR-023's minimum) [W1 F-2] |
| ai_validation_failure_rate, ai_injection_flag_rate, ai_leak_rate | capability, route | thresholds |
| ai_spend_micro | pool | vs forecast |
| codeexec_provider_error_rate | provider | < 1 % |
| delivery_success_rate | channel_account | > 97 % |
| reservation_expired_total | pool | leak indicator |
| resolver_calls_total | function | anomaly alert |
| consent_denied_total | purpose | informational |
| budget_pool_utilization_ratio | pool | 80% / 100% warnings (product, W11-5) |
| budget_hold_active_total | pool | alert on sustained holds |
| usage_reconciliation_diff_micro | provider | above threshold → operator alert [W11 UL-6] |
| reservation_settled_late_total | pool | informational [W11-C3] |

**Audit events** (schema `audit`, append-only, tenant-scoped; platform-level audit events recorded under the platform organization [W1 F-1]): subscription and entitlement changes (visible in the organization's audit log) [W11 SB-3], AI switch changes [W7-3], safeguarding flags [W7-5], exports [W9-3, W10-5], deletion cancellations and retention shortening [W10-3, W10-4], role changes, invitations, capability grant issue/revoke, elevation and break-glass statements, overrides, confirmations, dispute resolutions, regrade approvals, question approvals/publications, consent changes, deletion requests/approvals/completions, merges, imports committed, policy version publications, topic scope changes (C7-B), channel account changes, secret rotations.

# 31. Open Decisions / Sign-Off Gates

**A. Already decided (do not reopen):** modular monolith; PostgreSQL authoritative with native queue; no Redis for correctness; forced RLS and DB roles; ActorContext kinds; external staff IdP; capability sessions; ContactPoint model; consent split; ADR-011 authority model; replace-semantics learning; organization-scoped LearningPolicy; approved HintSets only; code judging outside the sandbox; RevealPolicy pinned at assignment; domain-only billing; reservations with pools.

**B. Implementation defaults (this document; change without ADR):** UUIDv7; text + CHECK enums; micro-unit amounts; permission matrix (subject to locked wave decisions); retention periods (subject to LG-10 / LG-11); SLA defaults; chunk sizes; job retry parameters; regrade preview validity 24 h; UNKNOWN minor status treated as MINOR; separate reinforcement assignments. *Now LOCKED by waves (no longer implementation defaults):* practice-run quotas 20 / 100 [W5-1, W7-C3]; late hold expiry 14 days [W4-6]; MESSAGING exhaustion behaviour [W11-4].

**Corrections requiring ADR amendment (Section 3):** X1, X7 → ADR-012; X2 → ADR-015 + Rule 9; X3, X8 → ADR-011; X4, X13 → ADR-013; X5, X6 → ADR-017; X11 → ADR-006; X9, X10, X12 → ADR-009 / ADR-020. **Recorded in the ADR set V1.4 (reconciled)** together with the Wave 2–11 amendments.

**ADR-014 amendment (rev. 1.5, Wave 8):** the reinforcement creation rule (W8-1: one open item per learner × topic, 7-day topic spacing, 48-hour delay, rolling 7-day cap of 2 with postponement, 14-day unscheduled expiry) lives in LearningPolicyVersion `reinforcement`; Challenge reports an unplannable item through `MarkReinforcementUnplannable` and the item expires with reason NO_ELIGIBLE_QUESTIONS (W8-C2). Learning decides need; Challenge decides when and how; trajectory and signals are never inputs (D13).

**C. Product sign-off:** WhatsApp account model (gate 1); reveal default (gate 4; constrained by W4-C1: answer-revealing content never before closes_at); confidence thresholds and confirm delay (gate 8); AI quality gates (gate 9); safeguarding policy (gate 10, with legal; automated detection off in V1, W7-5). **Resolved:** code languages (gate 2) → Python 3 only [W7-1]; practice runs in V1 (X9) → yes, with limits [W5-1]; late-hold expiry (X10) → 14 days then LATE_REJECTED (HOLD_EXPIRED) [W4-6, W5-C1]. **Closed conflicts (rev. 1.7):** U1 `overrun_pct` default 0%; U2 `max_learners` counts ACTIVE learners, point-in-time (§35).

**D. Legal sign-off:** consent legal basis per market (gate 5); minors' grantor rules (gate 6); aggregate use and k (gate 7); safeguarding (gate 10). **Legal gates (all OPEN):** LG-1 audit retention vs termination; LG-2 staff personal-data deletion; LG-3 minors; LG-4 consent acquisition and attestation; LG-5 withdrawal effects and consent history; LG-6 teaching-material rights and subprocessors; LG-7 integrity facts; LG-8 automated marking and human review; LG-9 AI and code-execution providers; LG-10 retention periods, deletion and subject-access deadlines, anonymized aggregates, 35-day backups, exemptions; LG-11 financial record retention, e-invoicing, suspension notice, trial terms.

**E. Engineering benchmark / proof:** queue library and admission control under the cohort burst (gate 12, R1); golden-set calibration (gates 8–9); restore drill with ledger replay; forced-RLS and cross-tenant suites; head CAS and projection property tests.

**F. External provider verification:** WhatsApp business verification, template rules, messaging tiers, OTP template consent requirements; AI provider regions, retention and zero-retention terms; sandbox provider isolation and code retention; document extractor Arabic OCR quality and retention; email provider deletion support.

# 32. Implementation Readiness Matrix

### 32.1 Ownership, execution and failure

| Capability | Data owner | Decision owner | Sync / async | Failure behaviour | Versioned artifacts |
|---|---|---|---|---|---|
| Staff access | Identity | Identity | sync | deny | — |
| Learner/guardian access | Identity | Identity | sync | uniform 404; OTP when needed | — |
| Roster and import | Roster | Roster | async import | row errors, preview | import files |
| Consent | Privacy | Privacy | sync gate | deny → fallback path | ConsentPolicyVersion |
| Content authoring | Content | Content | sync | validation errors | QuestionVersion bundle |
| AI generation | Content (workflow), AI (execution) | teacher approval | async | visible failure | PromptVersion, ModelSnapshot |
| Document ingestion | Content | Content | async | FAILED with reason | extraction artifact |
| Challenge scheduling | Challenge | Challenge | async | chunk retry | assignment pins |
| Delivery | Communication | producer (what), Communication (how) | async | retry → FAILED → producer fallback | template versions |
| Submission | Assessment | Assessment | sync | idempotent replay | frozen versions |
| Deterministic evaluation | Evaluation | Evaluation | sync (inline) | none (pure) | normalizer version |
| AI evaluation | Evaluation | policy, then teacher | async | hold → review | prompt, snapshot, policies |
| Code evaluation | Evaluation, Code Execution | Evaluation | async | retry → hold → review | test suite, runtime digest |
| Practice runs | Assessment | Assessment | async | visible error | test suite |
| Review and override | Review, Evaluation | teacher | sync decision | 409 on conflict | — |
| Disputes | Evaluation | teacher | async | SLA escalation | — |
| Regrade | Evaluation | approver | async | per-item failure | target version |
| Learning and reinforcement | Learning, Challenge | Learning (what), Challenge (when) | async | recompute | LearningPolicyVersion |
| Reporting | Reporting | Reporting | async | retry | snapshots |
| Billing and usage | Tenancy | platform admin | sync reserve | exhaustion rules | plan versions |
| Safeguarding | Evaluation, Review | organization | async | restricted task | — |
| Deletion | Privacy | OWNER | async | per-store retry | classification register |

### 32.2 Boundaries, data, verification and gates

| Capability | Tenant boundary | External provider data | Deletion | Observability | Key tests | Blocking sign-off |
|---|---|---|---|---|---|---|
| Staff access | membership + RLS | IdP subject, email | user anonymized | login, resolver metrics | cross-tenant, revocation | — (X1 recorded in ADR-012, V1.4) |
| Learner/guardian access | grant scope | OTP via channel | R7 | exchange metrics | pre-fetch, replay, device limit | gate 3; OTP provider check |
| Roster and import | tenant | — | anonymize | import metrics | dedupe, siblings | — |
| Consent | tenant | — | R6 events | consent metrics | dispatch race | gates 5, 6 |
| Content authoring | tenant | — | R1 | publish audit | compatibility, leakage | — |
| AI generation | tenant operations | prompts, documents | R3 | AI metrics | gates, injection | gate 9 (light) |
| Document ingestion | tenant | documents | R2 | extractor metrics | malware, injection | extractor check |
| Challenge scheduling | tenant | — | R1 | lag metrics | DST, duplicates | — |
| Delivery | ChannelAccount mapping | contact, message | R5 | delivery metrics | webhooks, opt-out | gate 1 |
| Submission | session scope | — | R2 | submit latency | double submit, DTO canaries | — |
| Deterministic evaluation | tenant | — | R1 | latency | normalization corpus | — |
| AI evaluation | tenant operations | learner answers | R3, R2 | AI metrics, review rate | gates, CAS, injection | gates 8, 9 (X2 recorded in ADR-015, V1.4) |
| Code evaluation | tenant | learner code | R4 | provider error rate | escape, leakage | sandbox check (gate 2 resolved, W7-1) |
| Practice runs | session | learner code | R4 | quotas | quotas | — (X9 resolved, W5-1) |
| Review and override | scope | — | R1 | backlog age | CAS conflicts | — |
| Disputes | scope | — | R2 (text) | dispute metrics | window, limits | — |
| Regrade | tenant | AI re-evaluation | R1 | progress | human lock | — |
| Learning and reinforcement | pseudonyms | — | by pseudonym | projection lag | equality, ordering | — |
| Reporting | tenant + consent | report bodies | R8 | generation metrics | corrections | — |
| Billing and usage | tenant | — | R6, R11 | spend, holds | reservation leaks, SETTLED_LATE, status mapping, learner-cap counting | LG-11 (U1, U2 closed) |
| Safeguarding | tenant, restricted | — | restricted class | counts only | routing | gate 10 |
| Deletion | tenant | provider deletion | external ledger | task status | end-to-end, restore | gates 5–7 |

# 33. Recommended Implementation Order

The V1.3 phase plan stands. Changes from this document:

1. **Phase 1 (Foundation):** add `cm_resolver` and resolver functions (X1), table-category registry and CI test (§6.3), platform organization (X7), audit schema, processed_event convention, deletion ledger storage (X11).
2. **Phase 1b (Walking skeleton):** implement the head with the corrected revision rule (X3) and `human_locked` (X8) from the start; include one override and one regrade in the skeleton so the CAS path is proven early.
3. **Phase 2:** Roster before Content (Content course scoping and teacher scopes depend on Roster ids).
4. **Phase 3:** capability sessions, OTP, consent, reveal policy, late-submission hold (X10).
5. **Phase 4:** authority-tagged components (X2) and GenerateFeedback separation (X5) in the composer before any AI strategy spike; PracticeRun confirmed (X9 resolved by W5-1).
6. Phases 5–9 unchanged.

# 34. Architecture-to-Code Handoff Checklist

- [x] ADR amendments for X1–X13 and Waves 2–11 recorded in the ADR set V1.4 (reconciled); owner sign-off of that set is part of the freeze checklist.
- [ ] Table-category registry created; every table in Sections 5–18 assigned; CI enforces forced RLS or registration.
- [ ] Database roles, resolver functions and TenantTransaction wrapper implemented and tested.
- [ ] Module schemas and architecture tests (no cross-schema access, no provider SDKs outside adapters, Assessment cannot import evaluator views).
- [ ] Classification register rows for every S2–S4 column and payload prefix, each with a purge handler.
- [ ] Event envelope, processed_event convention and payload_version handling implemented once and reused.
- [ ] Queue library benchmark plan prepared (gate 12).
- [ ] Head CAS and learning projection property tests written before feature work in Phases 4–5.
- [ ] Student DTO canary test harness in place before the first student endpoint.
- [ ] Owners and dates confirmed for every open sign-off gate (1 and 3–12; gate 2 resolved by W7-1) and legal gates LG-1 to LG-11 (X9 and X10 resolved).
- [x] Conflicts U1 and U2 (§35) decided by the product owner (rev. 1.7).
- [ ] Provider verification tasks (Section 31 F) started as Phase 1 operational tracks.

**Next step:** complete the implementation-contract freeze checklist (Reconciliation Report). Schema generation from Sections 5–18 and 22–23 starts only after the freeze is signed off.

# 35. Reconciliation Register (rev. 1.6)

This section records the cross-wave reconciliation. Every item has an origin tag, and the tag appears in the section where it was applied. The full item-by-item matrix, covering Wave 1 carried items, Spec Kit SC1–SC4, DM X1–X13 and every Wave 2–11 decision and correction, is in the **Reconciliation Report**. It is generated from the tags in this document, Spec Kit Part 1 (reconciled) and the ADR set V1.4 (reconciled).

### 35.1 Scope applied

| Source | Applied in this document |
|---|---|
| Wave 1 carried wording (J-6, F-1, F-2, F-5; FD-1, FD-4) | §5, §21 header, §24, §28, §30 |
| Spec Kit Part 1 SC1–SC4 | §5.2, §5.B, §9, §14.1, §19 C31, §24 CapabilityGrant, §25.8, §25.10 |
| Wave 2 (W2-1…W2-6, W2-C1…W2-C4) | §5.1–5.5, §5.B, §6.1, §19, §20, §24 |
| Wave 3 (W3-1…W3-4, W3-C1…W3-C4) | §5.4, §8, §27 |
| Wave 4 (W4-1…W4-6, W4-C1…W4-C7) | §5, §9, §10, §14, §21, §24, §28 |
| Wave 5 (W5-1…W5-5, W5-C1…W5-C4) | §3 X9, §9, §10, §24, §25.1, §28 |
| Wave 6 (W6-1…W6-6, W6-C1…W6-C5) | §5.4, §10, §11, §13, §14, §15, §19, §21, §24 |
| Wave 7 (W7-1…W7-5, W7-C1…W7-C3) | §5.4, §6.1, §7, §8, §13, §15, §16, §27, §28 |
| Wave 8 (W8-1…W8-3, W8-C1…W8-C4) | applied at rev. 1.5 (§5.4, §12, §17, §19, §21, §25.8, §29, §31); unchanged |
| Wave 9 (W9-1…W9-5, W9-C1…W9-C4) | §4, §5.4, §17, §28 |
| Wave 10 (W10-1…W10-5, W10-C1…W10-C3) | §4, §5.4, §7, §11, §12, §17, §21, §27, §28 |
| Wave 11 (W11-1…W11-5, W11-C1…W11-C7) | §4, §6.1, §14, §15, §16, §18, §21, §24, §25.10, §27, §30, §31 |

**No change required:** W2-3 and W2-4 are already consistent with §5 and ADR-016. W4-C4 is resolved by W4-5. W11-C5 is resolved by W11-4. **Learning Trajectory Model:** not reopened. The W2-5 display note is satisfied by §17 (W8-C1), and the W8-3 clarification is recorded in LTM rev. 14 (D9).

### 35.2 Conflicts found during reconciliation — CLOSED (rev. 1.7)

| # | Conflict | Product-owner decision (LOCKED) | Applied in |
|---|---|---|---|
| U1 | Budget pool overrun: ADR-021 (Accepted) said "bounded overrun (proposed 2%)"; Wave 11 BP-2 said `overrun_pct` default 0%. | V1 default `overrun_pct` = **0%**. Wave 11 BP-2 is authoritative; ADR-021's older 2% proposal is superseded. The reservation overshoot from approximate sharded reads remains a technical concurrency characteristic, not a commercial budget-overrun allowance. | §18 `budget_pool`, Reserve rule; ADR-021 |
| U2 | What counts toward `max_learners` (W11-U1) was undefined. | Only learners whose current status is **ACTIVE** count; INACTIVE, MERGED and DELETED do not. Evaluated **point-in-time** at learner creation or reactivation, not as a period peak. The W11-3 rule is unchanged: up to 10% over → allowed and shown as overage; above 10% → new creation and reactivation blocked; existing learners are never disabled for crossing the limit. | §18 learner cap; ADR-021 |

**Clarification US-1 (LOCKED, rev. 1.8):** the usage statement reports the number of ACTIVE learners at the end of the statement period. This is reporting only and does not change U2's point-in-time learner-cap enforcement.

No unresolved conflicts remain.

### 35.3 Legal gates (unchanged, OPEN)

LG-1 to LG-11 remain OPEN. No retention period, deletion deadline, subject-access deadline, anonymized-aggregate retention, backup persistence, deletion exemption or financial-record duration in this document is legally approved.
