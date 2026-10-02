# Challenge Me — V1.3 Architecture Review — Remediation Report

> Scope: remediation of all findings from the V1.2 Implementation Architecture review and the V1.2
>
> ADR reconciliation.
>
> Documents produced: ADR set V1.3 (ADR-001 to ADR-025) and Implementation Architecture V1.3.

# 1. Verdict After Remediation

**APPROVED FOR IMPLEMENTATION — with sign-off gates.**

All 38 open findings (2 P0, 13 P1, 18 P2, 5 P3) now have an architectural resolution recorded in an ADR and reflected in the implementation architecture. No P0 or P1 finding remains open as an architectural gap.

Twelve resolutions rest on a **proposed default** that a named owner must confirm (legal basis for consent, WhatsApp account model, code languages, numeric thresholds and similar). The architecture is designed so each default can change without a domain-model change, so implementation can start now; each sign-off has a phase deadline in Section 5.

The re-review found six residual observations introduced by the fixes themselves (2 P2, 4 P3). None blocks implementation. They are listed in Section 7.

This remediation and its re-review were produced by the same reviewer. Before Phase 1 exits, have ADR-011 (evaluation authority) and ADR-012 (tenant context) reviewed independently by the engineers who will implement them. These two ADRs carried the P0 findings, and an author reviewing their own fix is the weakest form of review.

# 2. What Changed

| Document | V1.2 | V1.3 |
|---|---|---|
| ADR set | 10 ADRs, 6 cross-ADR rules | 25 ADRs (9 amended, 15 new), 11 cross-ADR rules, sign-off register |
| Implementation architecture | 37 sections, 13 modules | 37 sections revised, 14 modules (Roster added), revised implementation sequence |
| Product definition | unchanged | unchanged; no product capability was removed or added beyond onboarding and safeguarding workflows required by existing commitments |

**Product identity check.** Every intentional product decision is preserved: AI generation and evaluation, open-response and code evaluation, controlled assistance from approved HintSets, production multi-tenancy, PostgreSQL-native queue, no Redis requirement, external staff IdP, learner capability sessions, no payment gateway in V1, modular monolith with separately scaled processes.

# 3. Resolution of the P0 Findings

## F1 — Evaluation decision model (ADR-011)

**Was:** OVERRIDDEN written onto existing records while history was "append-oriented"; no authoritative current evaluation; regrade and override could both win a race. **Now:**

- Evaluation results are immutable after PENDING; only lifecycle status changes.
- Every Evaluation has an origin; human origins outrank machine origins.
- `ResponseEvaluationHead` is the single authority for the current result, changed only by compare-and-set on its revision.
- Machine writers never move a human-authored head; they store a candidate and open a ReviewTask.
- "Overridden" is a derived label. No FAILED evaluation state: run failures live on EvaluationRun and escalate to NEEDS_REVIEW.
- A published internal-to-learner state mapping; bulk regrades through RegradeRequest. **Race from the review, re-traced:** the teacher override and the rubric-fix regrade both read head revision 7. The override commits first and moves the head to revision 8 with `human_authored = true`. The regrade's compare-and-set on revision 7 fails; it re-reads, finds a human-authored head and files a candidate plus ReviewTask. Learning receives exactly one head change. Resolved.
## F2 — Tenant-context mechanics (ADR-012)

**Was:** goals without mechanics; owner-role connections, session-scoped settings and the dequeue path could silently disable RLS.

**Now:**

- Four database roles; the runtime role is never the owner and cannot bypass RLS.
- RLS enabled **and forced** on every tenant table, with fail-closed policies.
- Transaction-local context set only by the TenantTransaction wrapper; session-level SET prohibited by lint.
- Dequeue under a queue-only role, domain work under the runtime role with the job's tenant; a missing entity under RLS is POISON with a security alert.
- SystemActor for scheduler, webhooks, workers, projections and regrades.
- Webhook tenant resolution from trusted mappings only.
- Break-glass access with second-person approval, expiry and full audit.
- CI gates from Phase 1. **Leak scenario from the review, re-traced:** a worker cannot connect as owner (the migrator role is pipeline-only); even if an owner connection were used, forced RLS still applies. A job carrying tenant A with tenant B's entity ID loads nothing and dead-letters with an alert. A pooled connection cannot carry context between transactions because settings are transaction-local. Resolved.
# 4. Finding-by-Finding Resolution Tracker

Status key: **Resolved** — decided and binding. **Resolved — sign-off** — designed around a proposed default awaiting its owner.

| ID | Pri | Finding | Resolution | Where | Status |
|---|---|---|---|---|---|
| F1 | P0 | Evaluation record and authority | immutable results, origins, head pointer with CAS, derived OVERRIDDEN, UX mapping | ADR-011; Arch 13, 15 | Resolved |
| F2 | P0 | Tenant-context mechanics | DB roles, forced fail-closed RLS, transaction-local context, SystemActor, dequeue path, break-glass | ADR-012; Arch 8 | Resolved |
| F3 | P1 | Roster has no owner | new Roster module owning learners, guardians, contact points, courses, cohorts, enrollments | ADR-013, ADR-003; Arch 4, 7 | Resolved |

| ID | Pri | Finding | Resolution | Where | Status |
|---|---|---|---|---|---|
| F4 | P1 | Learning projection semantics | observations keyed by head revision; replace-not-accumulate; shared pure function; property test | ADR-014; Arch 16 | Resolved |
| F6 | P1 | Regrade across versions | presented vs evaluation version; evaluation-compatibility rule | ADR-008; Arch 9, 12 | Resolved |
| F7 | P1 | Partial failure and confirmation | per-step on_missing; decision rule with auto-confirm; platform floor | ADR-015; Arch 12, 14 | Resolved — sign-off (thresholds) |
| F8 | P1 | Capability sessions | opaque hashed grants; GET-inert / POST-exchange; challenge-scoped default; OTP for history; revocation | ADR-016; Arch 6 | Resolved — sign-off (values) |
| F9 | P1 | Code trust boundary | inputs-only sandbox; per-test isolation; judging in trusted worker; runtime digest; outcome classes | ADR-009; Arch 21 | Resolved — sign-off (languages) |
| F10 | P1 | Queue capabilities and worker discipline | acceptance criteria; no transaction across I/O; leases; admission control; weighted priority; failure classes | ADR-001; Arch 26 | Resolved |
| F11 | P1 | AI reproducibility, drift, fallback | reproducibility defined as auditability; dated snapshots; gated routes; fallback only to gated pairs | ADR-017; Arch 18 | Resolved — sign-off (gate thresholds) |
| F12 | P1 | Payload outside purgeable stores | classification register with purge handlers; evidence by offset; deletion fan-out; deletion ledger after restore | ADR-006; Arch 22 | Resolved |
| F13 | P1 | Bulk onboarding and consent acquisition | RosterImport, QuestionImport, batch ConsentRequests, coverage dashboard | ADR-018; Arch 24 | Resolved — sign-off (legal basis) |
| F14 | P1 | WhatsApp account model | superset design; trusted tenant resolution; opt-out scope; throughput; default and deadline | ADR-004; Arch 17 | Resolved — sign-off (account model) |
| F22+ N2 | P1 | Consent model and races | ChannelConsent vs ProcessingConsent with grantor; checks at enqueue and dispatch | ADR-019, ADR-003; Arch 23 | Resolved — sign-off (minors' rules) |
| N1 | P1 | Deterministic authority vs hybrid short text | tri-state outcomes; CLOSED vs OPEN_SEMANTIC modes | ADR-010, ADR-015 | Resolved |
| F5 | P2 | Inter-module event delivery | two permitted mechanisms; queue as outbox; no post-commit in-memory events | ADR-013; Arch 5 | Resolved |
| F15 | P2 | Golden-set data rights, regional matrix | sourcing rules; k ≥ 10 aggregates; regional capability matrix | ADR-005, ADR-017 | Resolved — sign-off (legal) |
| F16 | P2 | Reveal policy and student-safe contract | StudentQuestionView; canary tests; RevealPolicy pinned at assignment | ADR-020; Arch 11 | Resolved — sign-off (default) |
| F17 | P2 | Policy ownership leak | LearningPolicyVersion owns learning rules; only Challenge/Reporting create delivery intents | ADR-014, ADR-013 | Resolved |
| F18 | P2 | Review coupling; Teacher Review duplication | owners create tasks, Review emits ReviewResolved; Teacher Review → TEACHER_PRIMARY | ADR-013, ADR-015 | Resolved |
| F19 | P2 | Budget reservations | expiring reservations, sweeper, reconciliation, sharded counters, pools | ADR-021; Arch 25 | Resolved |
| F20 | P2 | Scheduler idempotency and time zones | RRULE + IANA zone; unique occurrences; advisory lock; chunked materialization; CANCELLED for leavers | ADR-022; Arch 10 | Resolved |

| ID | Pri | Finding | Resolution | Where | Status |
|---|---|---|---|---|---|
| F21 | P2 | Topic identity and version proliferation | stable topics with TopicMapping; hint changes evaluation-compatible | ADR-008 | Resolved |
| F23 | P2 | Bulk regrade | RegradeRequest with preview, approval, chunking, grouped review, notification policy | ADR-011 | Resolved |
| F24 | P2 | Arabic evidence verification | shared versioned normalization library used by matching and evidence | ADR-010, ADR-015 | Resolved |
| F25 | P2 | Job versioning and migrations | payload_version N/N−1; consumer-first deploys; expand/contract | ADR-001, ADR-023 | Resolved |
| F26 | P2 | Privileged path, webhooks, storage, secrets | break-glass grants; webhook replay/dedupe/monotonic; KMS envelope encryption; malware scan | ADR-012, ADR-024 | Resolved |
| F27 | P2 | Rate limiting and OTP provider | edge + PostgreSQL limits; OtpSender capability | ADR-016 | Resolved |
| F28 | P2 | AIOperation vs EvaluationRun duplication | AIOperation authoritative; runs derive state; cost only in ledger | ADR-017 | Resolved |
| F29 | P2 | Safeguarding outcome | SafeguardingSignal routed to a safeguarding role | ADR-025 | Resolved — sign-off (policy) |
| F30 | P2 | Attempts, offline, late submissions | Attempt/Submission model; drafts separate; LATE flag with teacher decision | ADR-020 | Resolved |
| F31 | P2 | DR, SLOs, alerting | RPO/RTO, SLO table, burn-rate alerts, runbooks, restore drills | ADR-023 | Resolved — sign-off (targets) |
| N3 | P2 | Learner merge semantics | Link vs MergeLearners; no cross-tenant merge; events not rewritten | ADR-003 | Resolved |
| F33 | P3 | Confidence threshold floor | platform minimum; organizations may only tighten | ADR-015 | Resolved |
| F34 | P3 | Correction notifications | material threshold; batched into next report | ADR-011 | Resolved |
| F35 | P3 | Projection rebuild granularity | per learner / learner × topic / tenant | ADR-014 | Resolved |
| F36 | P3 | Golden-set prioritization | strict gates for evaluation; lighter for generation | ADR-017 | Resolved |
| N4 | P3 | Hint pinning wording | transitive pinning through QuestionVersion | ADR-007 | Resolved |

F32 (short-text and structured strategies) was closed earlier by ADR-010 and is now further refined by N1.

# 5. Sign-off Gates

| # | Decision | Default designed in | Owner | Deadline |
|---|---|---|---|---|
| 1 | WhatsApp account model | per-organization accounts, shared fallback | Product / commercial | End of Phase 3 |
| 2 | V1 code languages | Python 3 | Product | Before Phase 4 code strategy |
| 3 | Session lifetimes, OTP limits | ADR-016 values | Security lead | Phase 3 exit |
| 4 | Default reveal policy | score/feedback now; answers after due date | Product | Phase 3 exit |

| # | Decision | Default designed in | Owner | Deadline |
|---|---|---|---|---|
| 5 | Consent legal basis per market | ADR-018 flow | Legal, per market | Before first customer in each market |
| 6 | Minors' grantor rules | guardian grant for minors | Legal, per market | Before first customer in each market |
| 7 | Aggregate use contract and de-identification | k = 10 | Legal | Before launch |
| 8 | Confidence thresholds, confirm delay, floor | 48 h delay, 0.4 floor | Product + AI lead, after calibration | Before AI evaluation launch |
| 9 | Golden-set gate thresholds | per language and response type | AI lead | Before AI evaluation launch |
| 10 | Safeguarding policy | route to safeguarding lead | Product + legal | Before launch with minors |
| 11 | RPO/RTO and SLO targets | ADR-023 table | Engineering lead | Before Phase 9 |
| 12 | Queue library | ADR-001 criteria | Engineering lead | After benchmark, before production sizing |

# 6. Items That Implementation Must Prove

These are not open decisions; they are claims the architecture makes that only implementation can verify.

1. **Queue benchmark** under the cohort-deadline burst (5,000 learners, 80% within 20 minutes, 60/30/10 deterministic/AI/code), including the admission-control table under contention.
2. **Golden-set calibration**, especially Arabic, before thresholds in gates 8 and 9 can be signed off.
3. **Sandbox provider security review**: isolation model, retention terms, escape and exhaustion tests against the real provider.
4. **Restore drill** including automatic re-application of the deletion ledger.
5. **Forced-RLS coverage and cross-tenant suite** passing continuously from Phase 1.
6. **Projection equality property test** (live vs rebuild) and **head compare-and-set concurrency test**.

# 7. Residual Observations From the Re-review

The fixes introduce trade-offs. None is blocking; each is recorded so it isn't rediscovered as a surprise.

### [P2] R1 — The admission-control table can itself become a hot spot

Per-provider token rows are contended by every worker during a burst. **Mitigation:** include admission control in the ADR-001 benchmark; if contention appears, shard tokens per provider account or grant tokens in small batches per worker.

### [P2] R2 — AI evaluation launch depends on data procurement

Confidence thresholds and gates cannot be signed off without calibrated golden sets, and ADR-005 rules out using raw customer essays. Commissioned Arabic grading data is therefore on the critical path for AI evaluation. **Mitigation:** procurement starts in Phase 1 (already in the revised sequence); deterministic, code and teacher-review strategies are not blocked by it.

### [P3] R3 — LearningPolicy changes rewrite current TopicState

Because LearningPolicyVersion is organization-scoped rather than pinned per assignment, a policy change re-projects historical TopicState. This is intentional (TopicState spans assignments) and each TopicState records its policy version. **Mitigation:** show "calculated under policy version X" in teacher views and log policy changes as audit events.

### [P3] R4 — Schema-per-module and foreign keys

Cross-module foreign keys would couple module schemas and migrations. **Recommendation:** no foreign keys across module schemas; references are IDs validated through public services, with a nightly reconciliation job for orphaned references. Foreign keys within a module schema remain mandatory.

### [P3] R5 — Conservative opt-out scope on a shared WhatsApp account

If the shared-account model is chosen, one opt-out suppresses every organization on that account. This is the safe reading of provider obligations but has commercial impact. It is one of the inputs to sign-off gate 1.

### [P3] R6 — Capability grants require a database lookup at exchange

Opaque grants trade a lookup per exchange for revocability. Sessions use cookies afterwards, so the cost occurs once per link open. No action needed beyond indexing `token_hash`.

# 8. Before and After

|  | P0 | P1 | P2 | P3 | Total open |
|---|---|---|---|---|---|
| V1.2 architecture review | 2 | 13 | 17 | 4 | 36 |
| After ADR reconciliation | 2 | 13 | 18 | 5 | 38 |
| After V1.3 remediation | 0 | 0 | 2 (residual) | 4 (residual) | 6 residual, non-blocking |

Plus 12 sign-off gates with owners and deadlines.

# 9. The Five Rework Risks, Revisited

| Risk from the review | Status in V1.3 |
|---|---|
| 1. Evaluation authority model | Resolved by ADR-011 and ADR-014; proven early by the Phase 1b walking skeleton and the CAS/projection property tests. |
| 2. Tenant-context plumbing | Resolved by ADR-012; enforced by CI gates from the first commit. |
| 3. Roster, contact points and consent | Resolved by ADR-003, ADR-013, ADR-018 and ADR-019; built in Phases 2–3 before delivery depends on it. Legal inputs remain sign-off gates 5 and 6. |
| 4. Queue and worker discipline | Resolved by ADR-001 and ADR-013; library choice and capacity proven by the benchmark (gate 12, R1). |
| 5. Version compatibility and topic identity | Resolved by ADR-008; regrade semantics exercised by RegradeRequest in Phase 4. |

# 10. Recommended Next Steps

1. Circulate ADR-011 and ADR-012 to the implementing engineers for independent review.
2. Assign owners and dates to the twelve sign-off gates.
3. Start the Phase 1 operational tracks: WhatsApp business verification, sandbox provider review, Arabic golden-set procurement, subprocessor inventory.
4. Begin Phase 1 with the database roles, TenantTransaction wrapper and CI gates, then build the Phase 1b walking skeleton before expanding any single module.
