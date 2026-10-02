# Challenge Me — V1 Spec Kit — Part 2, Wave 6: Evaluation

> Capability: marking plans and strategies, rule-based and AI marking, code marking, composition, confidence, result lifecycle (provisional, needs review, confirmed), the authoritative result head, teacher review, confirmation and override, disputes, regrades, feedback, item and challenge grades, learner-facing result states, and the contract to Learning and Reporting (SPEC-042 to 054).
>
> Status: APPROVED and CLOSED. W6-1 to W6-6 locked; W6-C1 to W6-C5 reconciled; LG-8 remains an OPEN legal / compliance gate. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–5 (closed), Spec Kit Part 1 (J8, J9, JV1–JV7, G6, G7, G8, gates 8–10), Domain Model rev. 1.4 (DM §11, §13, §25.2–25.3, §26), ADR set V1.3 (ADR-010, ADR-011, ADR-013, ADR-015, ADR-017, ADR-019, ADR-020, ADR-021) with corrections X2–X6, X8, Architecture V1.3, Learning Trajectory Model rev. 13 (LTM, incl. C2), approved C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17. The five Content rules, the Wave 4 decisions and the Wave 5 binding rules are hard constraints.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 6 decisions as locked at closure; the Wave 6 Closure at the end lists what remains open. The AI Platform and Code Execution internals (routes, prompts, gates, sandbox) are Wave 7; this wave uses them only through their contracts.

# 1. Capability Overview

**Plain language.** Evaluation decides how good an answer is. Simple answers are marked by exact rules at once. Open answers are marked by AI against the teacher's rubric, and code is run against tests. Every result says how much it can be trusted. Trusted AI results are shown as provisional and become final after a delay; uncertain ones go to a teacher. Teachers can confirm, correct or re-mark answers, learners can dispute a result, and whole groups of answers can be re-marked when a question is fixed. A teacher's decision is never silently overwritten by a machine.

**Evaluation owns:** marking plans, evaluation runs, component and criterion results, confidence, the result lifecycle, the one authoritative current result per submission (the **head**), confirmation, override, disputes, regrades, feedback, grading policies and confidence policies, and item and challenge grades.

**Evaluation does not own:**

| Boundary | Evaluation provides | The other module decides | Source |
|---|---|---|---|
| Evaluation vs Assessment | Result state and allowed result content for the learner view | Assessment owns submissions, attempts, timing and the reveal gate; Evaluation never creates or edits a submission | EXISTING (DM §10–11) + Wave 5 |
| Evaluation vs Content | Uses EvaluatorQuestionView of the pinned version | Content owns keys, rubrics, tests, hints; Evaluation never edits them | EXISTING (DM §8.5) + Wave 3 rules |
| Evaluation vs Learning | `EvaluationHeadChanged` and a content-free summary with `performance_score` before grading adjustments | Learning builds evidence units, TopicState, trajectory and reinforcement; Evaluation never computes learning state | EXISTING (DM §12, ADR-014) + LOCKED (C2, D1, D13) |
| Evaluation vs AI Platform | Capability requests (`EvaluateResponse`, `GenerateFeedback`) | AI Platform owns routes, prompts, validation, idempotency and usage (Wave 7) | EXISTING (ADR-017) |
| Evaluation vs Code Execution | Source and test **inputs** | Code Execution only runs code; comparison with expected output happens in Evaluation's trusted worker | EXISTING (ADR-009) |
| Evaluation vs Review | Creates and completes review tasks | Review is a queue only; it never executes decisions (X4) | EXISTING (DM §13) |

**Binding rules carried in:** one submission per attempt; LATE_HELD and LATE_REJECTED submissions are never marked (W4-6); retries never bypass reveal and answer-revealing content never appears before closes_at (W4-C1, Wave 5); COMPLETED is engagement-only (W5-C3); jobs and providers may run more than once (J-6), and the head is what makes the result authoritative.

# 2. Actors

| Actor | Role here | Source |
|---|---|---|
| System (composer, deadline sweep, auto-confirm job, regrade runner) | Runs plans, composes, decides lifecycle | ADR-011, ADR-015 |
| AI Platform | Runs `EvaluateResponse` and `GenerateFeedback` | ADR-017 |
| Code Execution | Runs learner code in the sandbox | ADR-009 |
| Teacher (organization, course or cohort scope) | Reviews, confirms, overrides, grades teacher-review steps, resolves disputes, requests and approves regrades (never own) | LOCKED (FD-1, DM §5.4) |
| Owner, Admin | As teacher, organization-wide; publish grading and confidence policies | LOCKED (FD-1) + PROPOSED DEFAULT (policies) |
| Safeguarding lead | Sees restricted safeguarding tasks only | EXISTING (DM §5.4, §13) |
| Learner | Sees own result state; raises disputes on own responses | EXISTING (DM §5.4) |
| Guardian | Raises disputes only with GUARDIAN_HOME elevation; sees results only through D12 reports | EXISTING (DM §5.4) + LOCKED (D12) |

# 3. Core Lifecycle

```
Assessment SubmitResponse (ON_TIME / LATE_ACCEPTED) -> CreatePendingEvaluation (same TX):
  Evaluation PENDING + EvaluationContext pinned + plan + head (revision 1)
  rule-only plan -> composed inline -> CONFIRMED (INSTANT), head revision 2
  otherwise -> step jobs (AI_RUBRIC, AI_SEMANTIC, CODE_EXECUTION, TEACHER_REVIEW)
-> RecordRunResult per step (idempotent) -> ComposeEvaluation when required steps finish
-> decision:
     confidence >= auto-confirm threshold, no SEMANTIC_AI  -> PROVISIONAL + auto-confirm at +48 h
     review threshold <= confidence, or SEMANTIC_AI         -> PROVISIONAL (teacher confirms)
     below review threshold / review condition / deadline   -> NEEDS_REVIEW + ReviewTask
-> head revision +1 on result arrival and on confirmation (X3) -> EvaluationHeadChanged
-> GenerateFeedback (after result; leak-checked; write-once)
-> teacher: Confirm (human-locked) | Override (new evaluation, human-locked)
-> learner: Dispute -> review -> UPHELD (new DISPUTE_RESOLUTION evaluation) | REJECTED
-> staff: Regrade request -> preview -> approval (not own) -> REGRADE evaluations
```

# 4. Behavioral Rules

## 4.1 Evaluation creation and pinning

| # | Rule | Label |
|---|---|---|
| EV-1 | An evaluation is created only for an evaluable submission: ON_TIME or LATE_ACCEPTED. LATE_HELD submissions get one when accepted; LATE_REJECTED submissions never get one. | EXISTING (DM §25.1) + LOCKED (W4-6) |
| EV-2 | Every evaluation pins an immutable EvaluationContext: presented and evaluation question versions, grading policy version (from the assignment), confidence policy version, rubric, test suite, runtime image digest, normalizer version, plan, AI-consent state, context hash. | EXISTING (DM §11.2) |
| EV-3 | The evaluation question version is the presented version, except in a regrade to a compatible successor (§4.9). | EXISTING (ADR-008, DM §11.8) |
| EV-4 | Submissions on a cancelled assignment are marked normally (W4-3). | LOCKED (W4-3) |
| EV-5 | Creation makes no outside call; AI and code steps run as jobs after commit. | EXISTING (DM §25.1) |

## 4.2 Marking plans and strategies

| # | Rule | Label |
|---|---|---|
| PL-1 | Default plans by response type: choice, true/false, numeric → DETERMINISTIC; short text CLOSED → DETERMINISTIC (no determination = incorrect); short text OPEN_SEMANTIC → DETERMINISTIC, then AI_SEMANTIC only on NO_DETERMINATION; long text → AI_RUBRIC, 2 runs; structured → per-field DETERMINISTIC and AI_RUBRIC; code → CODE_EXECUTION, optional AI_RUBRIC quality; code explanation → AI_RUBRIC. | EXISTING (DM §11.6) as PROPOSED DEFAULT plan table |
| PL-2 | Without AI_PROCESSING consent at plan time, or with no permitted AI route in the region, AI steps are replaced by TEACHER_REVIEW. | EXISTING (ADR-019, DM §11.6) |
| PL-3 | Consent is re-checked immediately before each AI call; if withdrawn, the step is cancelled, any result discarded and the plan switches that step to TEACHER_REVIEW. If the call was already in flight, Challenge Me cannot guarantee the provider did not receive it; the output is discarded and provider deletion is used where available. | EXISTING (ADR-019) + LOCKED (J-6) |
| PL-4 | Deterministic normalization (Arabic and Western digits, Arabic letter variants and diacritics, whitespace, case) follows ADR-010 and is versioned. | EXISTING (ADR-010) |
| PL-5 | **Authority rule:** a component decided by a deterministic strategy (MATCH_CORRECT, MATCH_INCORRECT, or code test comparison) can never be produced or changed by AI; AI may supply correctness only through `on_no_determination`, labelled SEMANTIC_AI; only a HUMAN result replaces a deterministic one. | EXISTING (X2, DM §11.6) |
| PL-6 | Code: the sandbox receives only source, test inputs, runtime image and limits; expected outputs and reference solutions never enter it; comparison happens in the trusted worker. Learner mistakes (wrong output, time limit, crash) are results and are never retried. | EXISTING (ADR-009) |
| PL-7 | An optional AI quality component that cannot be produced follows the policy's `on_missing`: platform default RENORMALIZE (score from correctness alone), organization may choose REVIEW. | EXISTING (DM §11.2) + PROPOSED DEFAULT (RENORMALIZE) |
| PL-8 | Step deadlines: AI 15 minutes, code 30 minutes; after the deadline the evaluation becomes NEEDS_REVIEW (DEADLINE_EXCEEDED or BUDGET_HOLD_EXPIRED). | EXISTING (J8) as PROPOSED DEFAULT |
| PL-9 | Budget: AI steps reserve STUDENT_EVALUATION, code steps CODE_EXECUTION; when exhausted, steps are held until the deadline, then NEEDS_REVIEW; submissions are never refused. | EXISTING (ADR-021, JV4) |
| PL-10 | AI output that fails validation gets one repair attempt, then confidence 0 → NEEDS_REVIEW. Suspected prompt injection → confidence 0 → NEEDS_REVIEW. | EXISTING (ADR-017, J8) |
| PL-11 | Idempotency: one run per (evaluation, step); a retried job reuses a successful AI operation (request id, X6); a provider call may still execute twice in a rare failure window (J-6), but only one run result is recorded. | EXISTING (X6) + LOCKED (J-6) |

## 4.3 Composition, grading and scores

| # | Rule | Label |
|---|---|---|
| CO-1 | The composer takes each component from its owning step, applies `on_missing`, asserts the authority rule, and computes the result once. The result block is immutable once set. | EXISTING (DM §11.6, ADR-011) |
| CO-2 | Each evaluation records two scores: **performance score** (normalized across components, before grading adjustments) and **total score** (after the policy's hint penalty for that attempt's `hints_used` and the retry weight for that attempt's number). The retry weight is applied exactly once, here. | EXISTING (DM §11.6) + LOCKED (C2, W6-C4) |
| CO-3 | "Full marks" for the Wave 5 retry rule means performance score = maximum; a hint penalty alone never makes a fully correct answer "below full marks". | LOCKED (W6-C1) |
| CO-4 | Hint penalty uses `hints_used` as recorded by Assessment, including hints carried from earlier attempts (W5-4). | LOCKED (W5-4) + EXISTING |
| CO-5 | **Item grade** = the best total score among the item's evaluated attempts. Attempts without an evaluable result (LATE_HELD, LATE_REJECTED) are excluded; the item grade is shown as provisional while the selected attempt's result is provisional. Selection never re-applies the retry weight. This is a grading rule only: Learning evidence continues to follow D1 (FIRST_AND_FINAL, α = 0.5), unaffected by the item grade. | LOCKED (W6-3, W6-C4) + LOCKED (D1, C2) |
| CO-6 | **Challenge grade** = earned item points / points of **all** items in the student challenge. Unanswered items earn no points and are displayed as "Not attempted", never "0" or "Wrong"; the unanswered count is shown alongside the grade. Unanswered items still produce no learning evidence (W5-2). | LOCKED (W6-4) |
| CO-7 | Learning receives `performance_score`, hints used and attempt number, never the adjusted total, so hints and retries are not counted twice. | LOCKED (C2) |

## 4.4 Confidence and decision

| # | Rule | Label |
|---|---|---|
| CF-1 | Confidence exists only when AI contributed: the lowest of run agreement, evidence verification rate and the route's measured accuracy; 0 on any validation failure or injection flag. | EXISTING (DM §11.7, ADR-015) |
| CF-2 | Thresholds come from the pinned ConfidencePolicyVersion and never go below the platform floor (proposed 0.4). Values, the floor and the auto-confirm delay are **sign-off gate 8**. | EXISTING + sign-off gate 8 |
| CF-3 | Decision: rules only → CONFIRMED (INSTANT); confidence ≥ auto-confirm threshold and no SEMANTIC_AI → PROVISIONAL with auto-confirm; review threshold ≤ confidence, or SEMANTIC_AI correctness → PROVISIONAL without auto-confirm; otherwise or any review condition → NEEDS_REVIEW with a ReviewTask. | EXISTING (ADR-015, DM §11.4) |
| CF-4 | SEMANTIC_AI correctness is never confirmed instantly or automatically (`semantic_correctness.auto_confirm_allowed` stays false by default). An unconfirmed SEMANTIC_AI result stays PROVISIONAL, appears in the teacher's "to confirm" list, counts at the learning policy's provisional weight, and after 14 days Evaluation creates an EVALUATION_REVIEW task with review reason **UNCONFIRMED_SEMANTIC**, escalated to the appropriate admin scope. It is never auto-confirmed. | EXISTING (X2) + LOCKED (W6-2, W6-C2) |
| CF-5 | Auto-confirm runs at result time + delay (48 hours) and does nothing if the head revision changed or a dispute is open. | EXISTING (DM §11.4) + gate 8 (delay) |

## 4.5 The head (authoritative current result)

| # | Rule | Label |
|---|---|---|
| HD-1 | Exactly one head per **evaluable** submission (ON_TIME, LATE_ACCEPTED); LATE_HELD and LATE_REJECTED submissions have none. | LOCKED (W6-C5) |
| HD-2 | Every head change is a compare-and-set on `revision`. The revision increases when the current evaluation changes, when its result arrives and when it is confirmed (X3). Each change emits `EvaluationHeadChanged` in the same transaction. A lost compare-and-set re-reads and re-decides; it is never retried blindly. | EXISTING (ADR-011, X3) |
| HD-3 | `human_locked` = the current evaluation was authored by a human (TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION) or confirmed by a human. Auto-confirm does not lock. | EXISTING (X8) |
| HD-4 | A machine writer (AUTOMATED, REGRADE) finding `human_locked` stores its result as a **candidate** (NEEDS_REVIEW, CONFLICT_WITH_HUMAN) and does not move the head. If the candidate's result equals the human result, no review task is created. | EXISTING (X8, DM §11.3) + PROPOSED DEFAULT (JV1 equal-result rule) |
| HD-5 | An AUTOMATED result from an evaluation that is no longer current is discarded (SUPERSEDED); a REGRADE result replaces a non-locked head. | EXISTING (DM §11.3) |
| HD-6 | Scores never change after an evaluation leaves PENDING; every change is a new evaluation. | EXISTING (ADR-011) |

## 4.6 Teacher review, confirmation and override

| # | Rule | Label |
|---|---|---|
| TR-1 | Review tasks: EVALUATION_REVIEW (48 h SLA), CONFLICT_WITH_HUMAN (72 h), DISPUTE (72 h); past the SLA they escalate to scope admins; they never auto-resolve. | EXISTING (DM §13) + PROPOSED DEFAULT (SLAs) |
| TR-2 | Decisions are commands to Evaluation (`ConfirmEvaluation`, `OverrideEvaluation`, `GradeTeacherReview`, `ResolveConflictCandidate`, `ResolveDispute`), which complete the review task in the same transaction; a lost compare-and-set shows "This result changed — review the new version". | EXISTING (X4) |
| TR-3 | Confirm: PROVISIONAL or NEEDS_REVIEW → CONFIRMED (HUMAN), human-locked. Bulk confirm: up to 200 per action; items whose revision changed meanwhile are skipped and listed. | EXISTING + PROPOSED DEFAULT (200) |
| TR-4 | Override: a new TEACHER_OVERRIDE evaluation, CONFIRMED, human-locked, with a mandatory reason category (MARKING_ERROR, RUBRIC_INTERPRETATION, ACCEPTED_ALTERNATIVE, OTHER) and an optional note. | EXISTING + PROPOSED DEFAULT (categories) |
| TR-5 | Teachers see the answer, how it was marked, criterion levels with evidence highlighted from the stored answer, AI confidence and the plan; never the AI prompt text. | EXISTING (J12) + PROPOSED DEFAULT (no prompt text) |
| TR-6 | Review, confirmation, override and dispute handling for work submitted before a learner left a cohort stays with teachers in scope of the cohort that originally assigned the work (routing by the assignment's cohort), **limited strictly to those submissions**. It does not widen the teacher's general learner-access scope (no other history, progress or new work of that learner), consistent with W2-5. | LOCKED (W6-6) |
| TR-7 | Safeguarding concerns raised during marking create a restricted SAFEGUARDING task for the safeguarding lead only and never change the result; detection and routing policy are **sign-off gate 10**. | EXISTING (DM §13) + gate 10 |

## 4.7 Feedback

| # | Rule | Label |
|---|---|---|
| FB-1 | Feedback for AI-marked answers is generated after the result is set, from the immutable criterion results; it never changes a score. | EXISTING (X5) |
| FB-2 | Leak check: feedback must not contain the answer key, accepted answers, reference solution, model solution, the version's explanation, or hidden-test data. One regeneration on a leak; a second leak → feedback WITHHELD, score stands, flagged. | EXISTING (X5) + LOCKED (W6-C3) |
| FB-3 | Feedback is written in the language of the question version. | PROPOSED DEFAULT |
| FB-4 | Deterministic results show correct / incorrect and the score; they show no correct option before closes_at. | LOCKED (W4-C1) |

## 4.8 Disputes

| # | Rule | Label |
|---|---|---|
| DI-1 | A learner may dispute their own result; a guardian only with GUARDIAN_HOME elevation. | EXISTING (DM §5.4) |
| DI-2 | A dispute is possible only on a result whose score is visible to the learner (PROVISIONAL or CONFIRMED), within the policy window (14 days from the result becoming visible), at most one open per submission, not on a result already produced by a dispute resolution. | EXISTING (DM §11.2) + PROPOSED DEFAULT (visible-score and one-resolution conditions) |
| DI-3 | Opening a dispute suspends auto-confirm and creates a DISPUTE review task. The learner picks a reason category and may add text (learner content, S2); dispute text is never sent to AI. | EXISTING (JV7) + PROPOSED DEFAULT (no AI) |
| DI-4 | Upheld → new DISPUTE_RESOLUTION evaluation (human-locked); rejected → result unchanged, and the reviewer may confirm it; the learner sees the outcome. | EXISTING (DM §11.8) |
| DI-5 | A learner may withdraw an open dispute. | EXISTING |

## 4.9 Regrades

| # | Rule | Label |
|---|---|---|
| RG-1 | Request → preview → approval → execution. The approver is never the requester (FD-1); approval requires recent authentication (Wave 1 S-8). | LOCKED (FD-1) + EXISTING |
| RG-2 | Targets: a compatible successor question version, or a new grading policy version. A submission whose presented version is not in the target's compatibility chain is skipped as incompatible. | EXISTING (ADR-008, DM §11.8) |
| RG-3 | Scope: question, versions, assignments or submissions, limited to what both requester and approver can access. | EXISTING + PROPOSED DEFAULT (scope intersection) |
| RG-4 | Preview shows counts and deterministic re-scores; AI steps are estimated, not executed. | EXISTING (DM §11.8) |
| RG-5 | Each item creates a REGRADE evaluation with a new context; human-locked heads get candidates grouped into one review group per request. | EXISTING (DM §11.8, X8) |
| RG-6 | Learner notification policy per request: NONE, CHANGED_ONLY or MATERIAL_ONLY (default CHANGED_ONLY); notification means the "Updated result" state in the learner view only; no message is sent (W6-1). A change is **material** when correctness flips or the total score changes by at least 10% of the maximum. | EXISTING + LOCKED (W6-1) + PROPOSED DEFAULT (default policy, materiality) |
| RG-7 | A regrade never changes a published question version and never changes a frozen student challenge item (Wave 3 rules 2–4). | LOCKED (Wave 3) |

## 4.10 Learner-facing result states

| Internal state | Learner sees | Label |
|---|---|---|
| PENDING, within 20 seconds | Evaluating… | EXISTING (J9) |
| PENDING, beyond 20 seconds | Evaluating — you can continue to another question | EXISTING (J9) + W5-2 |
| PROVISIONAL | Score and feedback, clearly labelled "Provisional" | EXISTING + LOCKED (W6-5) |
| NEEDS_REVIEW | Your teacher will review this | EXISTING |
| CONFIRMED | Final result | EXISTING |
| Result replaced after being seen | Updated result, with a reason category (Reviewed by your teacher; Dispute resolved; Question corrected) | EXISTING (JV6) |

Learners never see "failed", confidence values, review reasons or AI details. All content passes the reveal gate (Wave 5 RV-1 to RV-5). No message tells the learner that a delayed result is ready; the learner sees it the next time they open the challenge (W6-1, G6). The item grade (best attempt) and challenge grade (all items, with "Not attempted" count) follow CO-5 and CO-6.

# 5. State Models

## 5.1 Evaluation

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | PENDING | CreatePendingEvaluation, Regrade | context pinned | runs enqueued; head created (first) | no |
| PENDING | CONFIRMED (INSTANT) | composer | deterministic only; no review condition | result set; head +1 | no |
| PENDING | PROVISIONAL | composer | confidence ≥ review threshold; no review condition | result set; head +1; auto-confirm if eligible; feedback | no |
| PENDING | NEEDS_REVIEW | composer / deadline sweep | review condition | result if any; ReviewTask; head +1 if current | no |
| PROVISIONAL | CONFIRMED (AUTO) | auto-confirm job | delay elapsed; no open dispute; revision unchanged; not SEMANTIC_AI unless allowed | head +1 | no |
| PROVISIONAL / NEEDS_REVIEW | CONFIRMED (HUMAN) | teacher | head compare-and-set | head +1; human-locked | yes |
| PENDING / PROVISIONAL / NEEDS_REVIEW / CONFIRMED | SUPERSEDED | new current evaluation | head compare-and-set | runs cancelled if PENDING | via new evaluation |
| NEEDS_REVIEW (candidate) | DISCARDED | reviewer rejects candidate | candidate | task completed | yes |
| CONFIRMED | PROVISIONAL / NEEDS_REVIEW | — | **invalid** | — | — |
| SUPERSEDED / DISCARDED | any | — | **invalid** | — | — |

Human-authored evaluations (TEACHER_PRIMARY, TEACHER_OVERRIDE, DISPUTE_RESOLUTION) start CONFIRMED (HUMAN).

## 5.2 Evaluation run

QUEUED → RUNNING → SUCCEEDED / FAILED / TIMED_OUT; failure classes INFRASTRUCTURE, RATE_LIMITED, PROVIDER, VALIDATION, DOMAIN, CANCELLED, BUDGET (EXISTING, DM §11.2).

## 5.3 Dispute

OPEN → UNDER_REVIEW → UPHELD / REJECTED; OPEN / UNDER_REVIEW → WITHDRAWN (learner). Terminal: UPHELD, REJECTED, WITHDRAWN.

## 5.4 Regrade request

DRAFT → PREVIEWING → PREVIEWED → APPROVED → RUNNING → COMPLETED / FAILED; DRAFT … PREVIEWED → CANCELLED. Items: PENDING → DONE / NO_CHANGE / SKIPPED_HUMAN / FAILED.

## 5.5 Review task (Review module; unchanged)

OPEN → ASSIGNED → RESOLVED; → ESCALATED (SLA); → CANCELLED (subject superseded, deleted, consent withdrawn); EXPIRED only for owner-defined fallbacks.

# 6. Permissions and Tenant Boundaries

| Action | Owner | Admin | Teacher (org / course / cohort, in scope) | Safeguarding lead | Learner | Guardian |
|---|---|---|---|---|---|---|
| View evaluation detail | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Confirm, bulk confirm, override, grade teacher-review steps | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Resolve conflict candidates and disputes | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Request regrade | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Approve regrade | ✓ (not own) | ✓ (not own) | ✓ (not own) | ✗ | ✗ | ✗ |
| Publish grading or confidence policy versions | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| See safeguarding tasks | ✓ only if no lead | ✗ | ✗ | ✓ | ✗ | ✗ |
| See own result state | — | — | — | — | ✓ | via D12 reports |
| Raise dispute | — | — | — | — | ✓ own | ✓ with GUARDIAN_HOME |

Permissions follow the DM §5.4 matrix (LOCKED FD-1). Publishing policies is Owner/Admin only (PROPOSED DEFAULT; teachers choose among existing versions, Wave 4). A teacher never approves their own regrade. All records are tenant-owned; AI and code calls carry the organization and never mix tenants.

# 7. Data Ownership

| Data | Owner | Versioned / immutable | Retention | Rebuild |
|---|---|---|---|---|
| Evaluation, context, component and criterion results | Evaluation | result block immutable | R1 (+R2 references) | not derived |
| Head | Evaluation | revisioned | R1 | not derived (authoritative) |
| Code test results | Evaluation | immutable | R4 observations, R1 outcome | not derived |
| Feedback | Evaluation | write-once | R2 | regenerable only by X5 path |
| Disputes, regrade requests | Evaluation | audited | R1 (text S2) | not derived |
| Grading and confidence policies | Evaluation | versions immutable once ACTIVE | R1 | — |
| AI operation records and payloads | AI Platform | — | R1 records; R3 payloads (90 days) | — |
| Review tasks | Review | — | R1; events R6 | — |
| Item and challenge grades | Evaluation (rule) | derived | — | recomputed from heads |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Assessment → Evaluation | A (same TX) | `CreatePendingEvaluation` | start marking |
| Evaluation → AI Platform | B (job) | `EvaluateResponse`, `GenerateFeedback` | AI steps, feedback |
| Evaluation → Code Execution | B (job) | execution request (source, inputs, limits) | code steps |
| Evaluation → Privacy & Consent | A | consent check at plan time and before each AI call | ADR-019 |
| Evaluation → Tenancy | A | budget reservation (STUDENT_EVALUATION, CODE_EXECUTION) | ADR-021 |
| Evaluation → Review | A | `CreateReviewTask`, `CompleteTask`, `CancelTask` | human work |
| Evaluation → Learning, Reporting, Assessment | B | `EvaluationHeadChanged` | learning, dashboards, learner view |
| Learning → Evaluation | A (read) | `GetEvaluationSummary` (performance score, total score, status class, hints used, attempt number, misconception tags; no content) | evidence units (C2) |
| Assessment → Evaluation | A (read) | `GetLearnerResult` (student-safe) | learner view |
| Evaluation → Reporting | B | `DisputeOpened`, `DisputeResolved`, `RegradeCompleted` | dashboards |

No new module. New or changed items: `performance_score` on the evaluation (C2); review reason UNCONFIRMED_SEMANTIC and its 14-day job (W6-2, W6-C2); `GetItemGrade` and `GetChallengeGrade` queries (W6-3, W6-4); review routing and access for former-cohort submissions (W6-6).

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| AI provider slow or down | Retry; evaluation PENDING until the deadline; then NEEDS_REVIEW (DEADLINE_EXCEEDED) |
| AI output invalid | One repair; then confidence 0 → NEEDS_REVIEW |
| Injection suspected | Confidence 0 → NEEDS_REVIEW |
| Code infrastructure failure | Retry, hold, then NEEDS_REVIEW at the deadline |
| Learner code crashes or times out | Normal result (tests fail); never retried |
| Budget exhausted | Held; NEEDS_REVIEW (BUDGET_HOLD_EXPIRED) at the deadline |
| Consent withdrawn mid-step | Step cancelled, output discarded, TEACHER_REVIEW (PL-3) |
| Job runs twice | Run record and AI request id deduplicate; a second provider call is possible (J-6); one result recorded |
| Worker crash after AI success, before storing | Retry finds the successful AI operation and reuses it (X6) |
| Override while AI still running | Override becomes current and locked; the AI result becomes a candidate (HD-4) |
| Auto-confirm vs override vs dispute race | Head compare-and-set; one wins; others re-decide or show "result changed" |
| Bulk confirm with changed items | Changed items skipped and listed (TR-3) |
| Events to Learning duplicated or out of order | Learning keeps only higher revisions (DM §12) |
| Organization suspended | Marking of stored submissions continues (FD-2); regrades cannot be approved |
| Feedback generation fails | Score stands; feedback absent or WITHHELD |

# 10. Privacy / Consent

- **What leaves Challenge Me:** for AI steps, the answer text with learner name and ids removed, the question and rubric; for code, the source and test inputs. Never the learner's identity, contact data or learning data. (EXISTING, J8)
- **Consent:** AI_PROCESSING checked at plan time and before each call (PL-2, PL-3). Without it, open answers go to teacher review.
- **Minors:** consent for AI processing of minors' answers follows LG-3 and LG-4. Whether automatic marking and auto-confirmation without human involvement are acceptable for learners, especially minors, is **LG-8** (new).
- **Dispute text:** learner content (S2); never sent to AI.
- **AI payloads:** kept 90 days (R3); operation records kept for accountability.
- **Telemetry:** no answers, feedback text, rubric text, dispute text, prompts or learner names.

# 11. Audit / Observability

**Audited:** human confirm, bulk confirm, override (with reason), teacher-review grading, conflict resolution, dispute open and resolution, regrade request, preview, approval, cancellation, policy version publication, review assignment and escalation, safeguarding task access.

**Metrics:**

| Metric | Purpose |
|---|---|
| Marking latency by strategy (p50, p95); share over deadline (target < 1%) | marking health |
| Decisions by outcome (INSTANT, PROVISIONAL auto, PROVISIONAL manual, NEEDS_REVIEW) and review reason | trust mix, queue load |
| AI validation failures, repair rate, injection flags | AI quality |
| Code provider errors, holds | code health |
| Review queue size, age, SLA breaches, escalations | teacher workload |
| Auto-confirm executions and skips (changed, disputed) | lifecycle |
| Override rate by strategy and question | marking quality signal |
| Disputes opened, upheld rate | fairness signal |
| Feedback leaks and withheld feedback | leak prevention |
| Regrade items by outcome | regrade health |
| Budget holds | cost |

**Never in telemetry:** answers, feedback, rubric or prompt text, dispute text, learner names, tokens.

**Teacher visibility:** per answer: result state, score, provisional or review marker, criterion levels with evidence, confidence, plan, history of evaluations (who and why), disputes, regrades.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Arabic digits "٣٫٥" vs key 3.5 | Normalized; MATCH_CORRECT | EXISTING (ADR-010) |
| Paraphrase on CLOSED short text | Incorrect (no AI) | EXISTING |
| Code prints "PASSED" | Compared with expected output; still fails | EXISTING |
| Two long-answer runs disagree | Low agreement → lower confidence | EXISTING |
| Override while AI running, AI agrees | Candidate stored; no review task | PROPOSED DEFAULT (HD-4) |
| Override while AI running, AI disagrees | Candidate + CONFLICT_WITH_HUMAN task | EXISTING |
| Dispute opened the hour before auto-confirm | Auto-confirm skipped | EXISTING |
| Regrade hits a human-confirmed result | Candidate grouped for review; head unchanged | EXISTING |
| Correct answer with hints | Performance score full; total reduced by penalty; no retry offered (CO-3) | correction W6-C1 |
| Late work accepted after close | Marked normally; result visible under the reveal gate | LOCKED (W4-6) |
| Assignment cancelled after submission | Marked normally (W4-3) | LOCKED |
| Learner left the cohort before marking finished | Original cohort's teachers review, confirm, override and resolve disputes for those submissions only | LOCKED (W6-6) |
| Feedback leaks twice | Withheld; score stands | EXISTING |
| Learner without AI consent answers an essay | Teacher review; "Your teacher will review this" | EXISTING |
| Semantic result never confirmed | Stays PROVISIONAL; at 14 days an EVALUATION_REVIEW task (UNCONFIRMED_SEMANTIC) escalates to admins; never auto-confirmed | LOCKED (W6-2) |
| Scores 0.8, then 0.6 on a retry (weight 0.8 → 0.48) | Item grade 0.8 (best); Learning still uses first and final attempts (D1) | LOCKED (W6-3, D1) |
| 10 questions, 7 answered, 6.0 points earned of 10 | Grade 6.0 / 10, "3 not attempted"; the 3 are not shown as 0 | LOCKED (W6-4) |

# 13. Decisions (locked at closure)

No Wave 6 product decision remains open.

| ID | Locked decision | Applied in |
|---|---|---|
| W6-1 | No delayed-result notification in V1; the learner sees the result the next time they open the challenge. | §4.10, RG-6 |
| W6-2 | Unconfirmed SEMANTIC_AI results stay PROVISIONAL, appear in the "to confirm" list, and after 14 days create an EVALUATION_REVIEW task (UNCONFIRMED_SEMANTIC) escalated to the appropriate admin scope; semantic correctness is never auto-confirmed. | CF-4 |
| W6-3 | Item grade = best weighted total among evaluated attempts; the retry weight is applied exactly once inside each attempt's total and never re-applied in selection. Separate from Learning evidence, which keeps FIRST_AND_FINAL 50/50 (D1). | CO-2, CO-5 |
| W6-4 | Challenge grade uses all questions as the denominator; unanswered questions earn no points, are shown as "Not attempted" (never "0" or "Wrong"), and the unanswered count is shown with the grade. | CO-6 |
| W6-5 | Provisional AI results are visible to learners, clearly labelled "Provisional". | §4.10 |
| W6-6 | Review, confirmation, override and disputes for work submitted before a learner left a cohort stay with the originally assigning cohort's teachers, strictly for those submissions; no widening of general learner access; consistent with W2-5. | TR-6 |

## Legal / compliance gates

### LG-8 — Automated marking and automatic confirmation (OPEN)

Whether results produced and confirmed without human involvement (INSTANT rule results, AI auto-confirm) are acceptable for learners, especially minors, and what human-review right must be offered. Proposed behavior: disputes (DI-1 to DI-5) provide human review on request; SEMANTIC_AI correctness is never auto-confirmed. Counsel must determine, per market, whether automated marking and automatic confirmation without human involvement are permissible, especially for minors, and what human-review rights are required. **Acknowledged; not approved or resolved.**

LG-1 to LG-7 carried forward. **Sign-off items (not legal gates):** gate 8 (confidence thresholds, auto-confirm delay, floor), gate 9 (AI quality gates, Wave 7), gate 10 (safeguarding routing, product and legal).

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| EV-1 … EV-5 | DM §11, §25.1, W4-3, W4-6 | EXISTING / LOCKED |
| PL-1 … PL-11 | DM §11.6, ADR-009, ADR-010, ADR-015, ADR-017, ADR-019, ADR-021, X2, X6, J-6 | EXISTING; PL-7, PL-8 PROPOSED |
| CO-1, CO-2, CO-4, CO-7 | DM §11.6, C2, W5-4 | EXISTING / LOCKED |
| CO-3 | W5-3, W6-C1 | LOCKED |
| CO-5 | G8, W6-3, W6-C4, D1 | LOCKED |
| CO-6 | W5-2, W6-4 | LOCKED |
| CF-1 … CF-5 | ADR-015, DM §11.7, X2, gate 8 | EXISTING; CF-4 LOCKED (W6-2, W6-C2) |
| HD-1 … HD-6 | ADR-011, X3, X8, DM §11.3 | EXISTING; HD-1 LOCKED (W6-C5) |
| TR-1 … TR-5, TR-7 | DM §13, X4, J9, J12, gate 10 | EXISTING / PROPOSED |
| TR-6 | W2-5, W6-6 | LOCKED |
| FB-1 … FB-4 | X5, W4-C1, W6-C3 | EXISTING / LOCKED |
| DI-1 … DI-5 | DM §5.4, §11.8, JV7 | EXISTING / PROPOSED |
| RG-1 … RG-7 | FD-1, ADR-008, DM §11.8, Wave 3, W6-1 | LOCKED / EXISTING / PROPOSED |
| §4.10 | J9, JV6, ADR-011, W6-1, W6-5 | EXISTING / LOCKED |

# 15. Behavioral Acceptance Criteria

**Creation and plans**
1. No evaluation exists for a LATE_HELD or LATE_REJECTED submission; accepting late work creates one.
2. Every evaluation has an immutable context naming the question version, grading and confidence policy versions, normalizer version and plan.
3. A rule-only answer is CONFIRMED (INSTANT) inside the submission transaction.
4. Semantic AI runs only after NO_DETERMINATION on an OPEN_SEMANTIC short-text question.
5. A deterministic or code-test component is never produced or changed by AI.
6. No AI call is made for a learner without AI_PROCESSING consent at plan time and at dispatch; such answers go to teacher review.
7. Expected outputs and reference solutions never enter the sandbox.
8. A learner's code crash or timeout is a result and is never retried.
9. A job retry never creates a second run result; a successful AI operation is reused.
10. An AI or code step past its deadline, or held for budget past its deadline, produces NEEDS_REVIEW; the submission is never refused.

**Scores and confidence**
11. Every evaluation records a performance score before adjustments and a total score after the hint penalty and retry weight.
12. Learning receives the performance score, never the adjusted total.
13. A fully correct answer with hints is not "below full marks" for the retry rule.
14. Confidence is null for deterministic-only evaluations and 0 after any validation failure or injection flag.
15. No configured review threshold is below the platform floor.
16. SEMANTIC_AI correctness is never auto-confirmed unless the grading policy allows it.

**Head and lifecycle**
17. Exactly one head exists for every evaluable submission, and none for LATE_HELD or LATE_REJECTED submissions.
18. The head revision increases on a new current evaluation, on result arrival and on confirmation, and each increase emits one `EvaluationHeadChanged`.
19. A machine result never replaces a human-authored or human-confirmed head; it becomes a candidate, with a review task only if its result differs.
20. An evaluation's score never changes after it leaves PENDING.
21. Auto-confirm does nothing when the head changed or a dispute is open.
22. Two concurrent overrides: one succeeds; the other sees "This result changed".
23. Bulk confirm of 200 items with 3 changed meanwhile confirms 197 and lists 3.

**Feedback and learner view**
24. Feedback never contains the answer key, accepted answers, reference solution, model solution, explanation or hidden-test data; after a second leak it is withheld and the score stands.
25. Feedback generation never changes a score.
26. Learners never see "failed", confidence, review reasons or AI details.
27. A result changed after the learner saw it shows "Updated result" with a reason category.
28. No correct option is shown for a deterministic item before closes_at.

**Disputes and regrades**
29. A dispute is possible only on a visible score, within 14 days, one open at a time; it suspends auto-confirm and creates a review task.
30. Dispute text is never sent to AI.
31. An upheld dispute creates a human-locked DISPUTE_RESOLUTION evaluation.
32. A teacher cannot approve their own regrade.
33. A regrade skips submissions whose presented version is outside the target's compatibility chain.
34. A regrade never changes a human-locked head; it creates grouped candidates.
35. A regrade never changes a question version or a frozen student challenge item.

**Permissions and privacy**
36. A teacher cannot view or act on evaluations outside their scope.
37. Only Owners and Admins publish grading or confidence policy versions.
38. Safeguarding tasks are visible only to the safeguarding lead (or the Owner if none).
39. No answer, feedback, rubric, prompt or dispute text appears in telemetry.
40. AI requests carry no learner name, id or contact data.

**Wave 6 decisions**
41. No message is sent when a delayed result becomes available; the learner sees it on the next open of the challenge (W6-1).
42. An unconfirmed SEMANTIC_AI result is still PROVISIONAL after 14 days, is never auto-confirmed, and at 14 days exactly one EVALUATION_REVIEW task with reason UNCONFIRMED_SEMANTIC exists, routed to the admin scope (W6-2, W6-C2).
43. For attempts scoring 0.8 (attempt 1) and 0.6 × 0.8 = 0.48 (attempt 2), the item grade is 0.8; the 0.8 retry weight appears only inside attempt 2's total (W6-3, W6-C4).
44. The item grade never influences Learning evidence; evidence units still combine first and final attempts at 50/50 (D1).
45. A challenge with 10 questions, 7 answered and 6 points earned shows 6 / 10 with "3 not attempted"; no unanswered question is displayed as "0" or "Wrong" (W6-4).
46. A PROVISIONAL result is shown to the learner with the label "Provisional" (W6-5).
47. After a learner transfers cohorts, a teacher of the original cohort can confirm, override and resolve disputes on submissions from that cohort's assignment, and cannot see the learner's other history, progress or new work (W6-6).
48. A LATE_HELD or LATE_REJECTED submission has no head and no item-grade contribution (W6-C5).
49. Feedback that restates the version's model solution or explanation fails the leak check (W6-C3).
50. A correct answer that used a hint is not offered a retry (W6-C1).

---

# Wave 6 Closure

**Status: APPROVED and CLOSED.**

## Binding rules for later waves

1. Exactly one authoritative head per evaluable submission; every change is a compare-and-set that increments the revision and emits `EvaluationHeadChanged`.
2. Scores never change after an evaluation leaves PENDING; every change is a new evaluation.
3. A machine result never replaces a human-authored or human-confirmed result.
4. A deterministic or code-test component is never produced or changed by AI; SEMANTIC_AI correctness is never auto-confirmed.
5. Grading and learning are separate: the item grade uses the best weighted attempt (W6-3); Learning uses `performance_score` and D1 FIRST_AND_FINAL evidence (C2), never the item grade.
6. Feedback never changes a score and never reveals answer-revealing material.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W6-1 | No delayed-result notification in V1; the result is visible on the next open of the challenge. |
| W6-2 | Unconfirmed SEMANTIC_AI results stay PROVISIONAL, appear in the "to confirm" list, and after 14 days create an EVALUATION_REVIEW task with reason UNCONFIRMED_SEMANTIC, escalated to the appropriate admin scope; never auto-confirmed. |
| W6-3 | Item grade = best weighted total among evaluated attempts; retry weight applied exactly once inside each attempt's total_score, never re-applied in selection; Learning keeps FIRST_AND_FINAL 50/50 (D1). |
| W6-4 | Challenge grade over all questions; unanswered questions earn no points and show "Not attempted" (never "0" or "Wrong"); unanswered count shown alongside the grade. |
| W6-5 | Provisional AI results visible to learners, clearly labelled "Provisional". |
| W6-6 | Review, confirmation, override and disputes for work submitted before a learner left a cohort stay with the originally assigning cohort's teachers, strictly limited to those submissions; general learner-access scope is not widened; consistent with W2-5. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W6-C1 | "Full marks" for the retry rule means performance score (before grading adjustments) = maximum. |
| W6-C2 | Review reason UNCONFIRMED_SEMANTIC; Evaluation creates an EVALUATION_REVIEW task at 14 days, routed to the admin scope. |
| W6-C3 | The feedback leak check also covers the version's model solution and explanation. |
| W6-C4 | Each evaluation's total already includes its attempt's retry weight; item-grade selection never re-applies it. |
| W6-C5 | Exactly one head per evaluable submission (ON_TIME, LATE_ACCEPTED); none for LATE_HELD or LATE_REJECTED. |

## 3. Legal / compliance gates

**LG-8 (OPEN — acknowledged, not approved or resolved):** counsel must determine, per market, whether automated marking and automatic confirmation without human involvement are permissible, especially for minors, and what human-review rights are required. Proposed behavior only: disputes provide human review on request; SEMANTIC_AI correctness is never auto-confirmed.

LG-1 to LG-7 carried forward unchanged. Sign-off items (not legal gates): gate 8 (confidence thresholds, auto-confirm delay, floor), gate 9 (AI quality gates, Wave 7), gate 10 (safeguarding routing, product and legal).

## 4. Remaining non-blocking proposed defaults

Default plan table (PL-1); optional AI quality on_missing RENORMALIZE (PL-7); deadlines 15 min AI, 30 min code (PL-8); no review task when a candidate equals the human result (HD-4); SLAs 48 h / 72 h / 72 h with escalation (TR-1); bulk confirm 200 (TR-3); override reason categories (TR-4); no prompt text shown to teachers (TR-5); feedback in the question's language (FB-3); disputes only on a visible score and not on a dispute resolution (DI-2); dispute text never sent to AI (DI-3); regrade scope limited to requester and approver scope (RG-3); regrade notification default CHANGED_ONLY and 10% materiality (RG-6); learner latency message at 20 s; policy publishing by Owner and Admin only.

## 5. Domain Model and ADR reconciliation items

| Document | Section | Change |
|---|---|---|
| DM | §11.2 `evaluation` | Add `performance_score` beside `total_score`; `total_score` includes the attempt's hint penalty and retry weight exactly once (C2, W6-C4). |
| DM | §11.1 head invariant | One head per evaluable submission; none for LATE_HELD or LATE_REJECTED (W6-C5). |
| DM | §11.2 `review_reason`, §13, §21 job catalog | Add UNCONFIRMED_SEMANTIC; 14-day job creating the EVALUATION_REVIEW task routed to the admin scope (W6-2, W6-C2). |
| DM | §11.5 feedback | Leak check includes the model solution and explanation (W6-C3). |
| DM | §11.8 queries | `GetItemGrade` (best weighted total among evaluated attempts, W6-3) and `GetChallengeGrade` (all items as denominator, "Not attempted" count, W6-4). |
| DM | §11.8 disputes | Disputes only on visible scores; one resolution per submission; no AI on dispute text. |
| DM | §5.4, §13 routing | Review tasks for a submission route by the assignment's cohort; teachers of that cohort keep evaluation, override and dispute rights for those submissions only after the learner leaves (W6-6). |
| DM | §10.4 / learner result view | "Provisional" label (W6-5); no RESULT_READY delivery purpose in V1 (W6-1). |
| DM | §19 EvaluationSummary | Performance score, total score, hints used, attempt number (C2); the item grade is never part of it. |
| DM | §10.1 retry invariant (Wave 5) | "Full marks" uses performance score (W6-C1). |
| ADR-011 | head | One head per evaluable submission; candidate without task when equal. |
| ADR-015 | confidence | Unconfirmed semantic escalation at 14 days; never auto-confirmed (W6-2). |
| ADR-017 | feedback leak check | Model solution and explanation included (W6-C3). |
| Carried forward (unchanged) | Wave 2 to 5 reconciliation items | Not reopened. |

**STOP — Wave 6 closed. Wave 7 not started.**
