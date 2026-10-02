# Challenge Me — V1 Spec Kit — Part 2, Wave 5: Answering

> Capability: the learner's answering session inside a student challenge — attempts, drafts, hints, practice runs, submission, timing and late submissions, retries, question order and finishing, the reveal gate, answer integrity facts, and the learner-facing boundary to marking (SPEC-033 to 041).
>
> Status: APPROVED and CLOSED. W5-1 to W5-5 locked; W5-C1 to W5-C4 reconciled; LG-7 remains an open legal / compliance gate. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–4 (closed; Wave 4 rev. 3), Spec Kit Part 1 (J5–J7, JV5, X9, X10, X12, G8, G10), Domain Model rev. 1.4 (DM §10, §25.1), ADR set V1.3 (ADR-007, ADR-009, ADR-011, ADR-020), Architecture V1.3, Learning Trajectory Model rev. 13 (LTM), approved C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17. The five Content rules (Wave 3) and the Wave 4 decisions are hard constraints.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 5 decisions as locked at closure; the Wave 5 Closure at the end lists what remains open. Marking, results, confidence, review and disputes are Wave 6 and are referenced here only at the boundary.

# 1. Capability Overview

**Plain language.** Once a learner is inside their challenge, Answering is everything they do: open a question, type an answer that saves itself, ask for a hint, run their code against the example tests, submit, and possibly try again. Challenge Me stores one submission per attempt, stamped with the server's time, and hands it to marking. (This is about Challenge Me's own record; it does not claim exactly-once execution at outside providers, J-6.) Answering also decides what the learner may see about correct answers and when, and records a small set of neutral facts that help teachers spot unusual work.

**Module.** Answering is the **Assessment Runtime** module (EXISTING, DM §10).

**Assessment Runtime owns:** attempts, drafts, hint events, practice runs, submissions and their timing status (ON_TIME, LATE_ACCEPTED, LATE_HELD, LATE_REJECTED), the student-safe question and reveal views returned to learners, and integrity facts.

**Assessment Runtime does not own:**

| Boundary | Assessment provides | The other module decides | Source |
|---|---|---|---|
| Assessment vs Content | Uses only StudentQuestionView, HintStepView and StudentRevealView | Content defines the frozen question version; Assessment never reads protected answer material | EXISTING (DM §8.5, §10.5) + Wave 3 rules |
| Assessment vs Challenge | Attempts against items of a student challenge; engagement facts (STARTED, COMPLETED) | Challenge owns the student challenge, its items, its window (opens, due, closes) and its status | EXISTING (DM §9) + Wave 4 |
| Assessment vs Evaluation | The stored submission and a call to `CreatePendingEvaluation` | Evaluation decides every result, score, confidence and authority; Assessment never marks | EXISTING (ADR-011, DM §11) |
| Assessment vs Learning | Submission facts (server time, hints used, attempt order, timing status) | Learning builds evidence units (D1) and learning state; Assessment never computes progress | EXISTING (DM §12) + LOCKED (D1, D9, D16) |
| Assessment vs Code Execution | Practice-run requests with visible tests only | Code Execution runs code in the sandbox | EXISTING (ADR-009, X9) |
| Assessment vs Identity | Uses the session's actor and scope | Identity owns grants, sessions, device limits and one-time codes | EXISTING (ADR-016) + Wave 2 |

**Carried-forward constraints:** drafts are never marked; one final submission per attempt; server time decides timing; the learner never sees protected answer material; answer-revealing content waits until the assignment's closes_at (W4-C1); LATE_HELD work contributes nothing until accepted, and LATE_REJECTED is terminal (W4-6); submissions after due and before close are ON_TIME and shown to teachers as "after due" (W4-2).

# 2. Actors

| Actor | What they do here | Source |
|---|---|---|
| Learner | Opens items, starts attempts, saves drafts, requests hints, runs practice code, submits, retries, finishes | ADR-020, J6–J7 |
| Person holding a minor's link (usually a guardian) | Uses the learner's session; the session is the learner's, not the guardian's | EXISTING (Wave 4 §12 note) |
| Guardian in guardian home | No answering rights | LOCKED (W2-1, Wave 4 §2) |
| Teacher, Admin, Owner (in scope) | View attempts and submissions; accept or reject late work; view integrity facts; never edit a submission | EXISTING (DM §10) + §6 |
| System actor | Expiry of attempts at close; late-hold expiry; practice-run completion | ADR-012 |
| Code Execution | Runs practice code against visible tests | ADR-009 |
| Evaluation | Receives submissions for marking (Wave 6) | ADR-011 |

# 3. Core Lifecycle

```
Learner session (challenge link or learner home) -> student challenge overview
  -> open item: StudentQuestionView (no protected material)
  -> StartAttempt (attempt_no = 1) -> student challenge STARTED (first attempt)
  -> SaveDraft (repeatedly; never marked)
  -> RequestHint (next approved step only) / RunPractice (visible tests only; W5-1)
  -> SubmitResponse (one transaction; no outside calls):
       store Submission -> timing status -> attempt SUBMITTED
       -> ON_TIME / LATE_ACCEPTED: CreatePendingEvaluation (rule-only plans marked inline)
       -> LATE_HELD: teacher review task; nothing marked
  -> result state shown per reveal gate (result states: Wave 6)
  -> retry only if the previous result is visible and below full marks, the policy allows
     another attempt and closes_at has not passed (W5-3): StartAttempt (attempt_no = 2) ...
  -> every item has a submission, or learner chooses Finish Challenge (W5-2): COMPLETED
     (engagement only; retries and unanswered items remain possible until close)
  -> at closes_at: no new attempts; OPEN attempts ABANDONED (reason EXPIRED); drafts kept;
     answer-revealing content becomes available; read-only review for 14 days (W4-C2)
```

# 4. Behavioral Rules

## 4.1 Entering and navigating

| # | Rule | Label |
|---|---|---|
| E-1 | A learner answers only through a learner session whose scope includes the student challenge: a STUDENT_CHALLENGE session from a challenge link or staff-issued link, or a LEARNER_HOME session after a one-time code. Guardian-home sessions never answer. | EXISTING (ADR-016, Wave 2, W2-2) |
| E-2 | Every request resolves the item through Challenge's `GetAnswerableItem` (student challenge in scope, AVAILABLE, OPENED or STARTED, current server time before closes_at). A request for another learner's item returns NOT_FOUND. | EXISTING (DM §10.1) |
| E-3 | The overview shows the challenge title, due time, close time when later than due, each item's state (not started, draft saved, submitted with its result state, retry available) and hints used. | EXISTING (J5) + PROPOSED DEFAULT (fields) |
| E-4 | Questions may be answered in any order. The learner may choose **Finish Challenge** with items unanswered; a confirmation lists the unanswered items first. After finishing, the learner may still return to unanswered items until closes_at. Unanswered items are "not attempted", never zero, and produce no learning evidence. | LOCKED (W5-2, G10) |
| E-5 | OPENED is recorded on the first actual open of the student challenge in any valid learner session, whether access came from a challenge link, learner home or a staff-issued link. A messaging-channel READ event never creates OPENED. | LOCKED (W5-C4) |

## 4.2 Attempts

| # | Rule | Label |
|---|---|---|
| AT-1 | `StartAttempt` creates attempt 1 for an item, or returns the existing OPEN attempt (idempotent). The first attempt in the challenge moves the student challenge to STARTED. | EXISTING (DM §10, J6) |
| AT-2 | A retry is offered only when **all** hold: the previous attempt has a result visible to the learner (a visible provisional result qualifies; "Evaluating…" does not); that result is below full marks; the pinned grading policy allows another attempt (attempt_no ≤ `attempts.max`); closes_at has not passed. If the pinned reveal policy hides the score, no retry is offered. A retry never bypasses the reveal policy: offering a retry reveals nothing the policy does not already show. | LOCKED (W5-3) + EXISTING (DM §10.1) |
| AT-3 | Each attempt uses the same frozen question version (the student challenge item); a retry never selects a new version. | LOCKED (Wave 3 rule 3) |
| AT-4 | Attempt states: OPEN, SUBMITTED, ABANDONED. ABANDONED carries a reason: EXPIRED (the attempt was OPEN when closes_at passed) or CANCELLED (student challenge cancelled). ABANDONED (EXPIRED) may still receive its one queued submission through the late path within the late window (T-3, T-4); ABANDONED (CANCELLED) is terminal. | LOCKED (W5-C1) |
| AT-5 | Attempt order is the server order of submissions, which D1 uses (first and final eligible attempt). Assessment never reorders attempts; a late-accepted attempt keeps its original server submission position. | LOCKED (D1, late-held decision) |
| AT-6 | There is no per-learner countdown timer in V1; the only time limits are the assignment's opens, due and close times. | PROPOSED DEFAULT (no source introduces a timer) |

## 4.3 Drafts

| # | Rule | Label |
|---|---|---|
| DR-1 | The client saves the draft every few seconds while the learner types and on leaving the item; one draft per attempt, overwritten, with an optimistic version check. | EXISTING (DM §10, J6) |
| DR-2 | Drafts are never evaluated, never produce learning evidence and are never auto-submitted, including at close. | EXISTING (ADR-020, LTM §3) |
| DR-3 | Two devices editing the same attempt: the later save wins after a version check, and the other device is told its view is out of date and shown the newer draft. | EXISTING (J6) |
| DR-4 | After close, drafts stay viewable by the learner in read-only review; they are learner content (R2). | EXISTING (J6, DM §24) |
| DR-5 | Teachers do not see drafts; they see only whether an item has a draft in progress. | PROPOSED DEFAULT |

## 4.4 Hints

| # | Rule | Label |
|---|---|---|
| H-1 | Hints come only from the approved hint set pinned in the frozen question version; one step at a time, in order; no AI-generated hints for learners in V1. | EXISTING (ADR-007, DM §8.5) |
| H-2 | Each revealed step records a HintEvent (attempt, step). `hints_used` is stored on the submission. | EXISTING (DM §10.2) |
| H-3 | Hints are refused for a SUBMITTED or ABANDONED attempt and after closes_at. | EXISTING (J6) |
| H-4 | The grading-policy hint penalty (Evaluation, Wave 6) and the Learning hint factor (LTM §4) consume `hints_used`; Assessment applies neither. | EXISTING |
| H-5 | Hints revealed in earlier attempts of the same item remain visible on a retry, count as used, and are included in the retry's `hints_used`. Assessment only records hint usage; any grading penalty is Evaluation's (Wave 6). | LOCKED (W5-4) |

## 4.5 Practice runs (code)

| # | Rule | Label |
|---|---|---|
| PR-1 | Practice runs exist in V1 for code questions. | LOCKED (W5-1, X9) |
| PR-2 | A practice run executes the learner's current code against the question version's **visible tests only**; hidden tests are never used, exposed or counted. | LOCKED (W5-1) |
| PR-3 | A practice run never creates a submission, an evaluation or learning evidence, and never changes attempt order. | LOCKED (W5-1) |
| PR-4 | Limits: 20 runs per attempt and 100 per learner per day; a run above the limit is refused, not queued. | LOCKED (W5-1) |
| PR-5 | Practice runs consume the CODE_EXECUTION budget. When it is exhausted, practice runs are refused ("Running code is temporarily unavailable; you can still submit"); submission is **always** allowed. | LOCKED (W5-1) |
| PR-6 | No practice runs after the attempt is submitted or after closes_at. | LOCKED (W5-1) |
| PR-7 | Practice output is learner content (R4); it is shown to the learner and not to teachers. | EXISTING (DM §10.2 R4) + PROPOSED DEFAULT (not shown to teachers) |

## 4.6 Submission

| # | Rule | Label |
|---|---|---|
| SU-1 | `SubmitResponse` is one transaction with no outside calls: lock the attempt; check scope; validate the answer against the input schema; store the Submission (one per attempt, idempotency key, presented question version, server receive time, client time, hints used, content hash); set timing status; attempt → SUBMITTED; unless LATE_HELD, call `CreatePendingEvaluation`; if LATE_HELD, create a LATE_SUBMISSION review task. | EXISTING (DM §25.1, J7) |
| SU-2 | The submission is stored before any marking work; no later failure loses it. | EXISTING (ADR-011, J7) |
| SU-3 | Idempotency: the same key and same content returns the original outcome; the same attempt with different content returns "Already submitted". Two devices submitting at once are serialized by the attempt lock; exactly one Submission row is stored. | EXISTING (DM §25.1) |
| SU-4 | Submitted content is never edited by anyone. It can only be purged by an approved deletion (Wave 10). | EXISTING (DM §10, §24) |
| SU-5 | Input limits: code 64 KB; long text 10,000 characters; short text 500 characters; structured answers validated per field. Over-limit answers are refused with a field-level message and nothing is stored. | PROPOSED DEFAULT (J7; short-text limit new) |
| SU-6 | Without AI_PROCESSING consent the learner still submits normally; Evaluation's plan uses rule-based and teacher-review steps only. | EXISTING (ADR-018, Wave 2 C-10) |
| SU-7 | When the organization is SUSPENDED, submissions are refused with a read-only notice, drafts are kept, and already-stored submissions continue to be marked. | LOCKED (FD-2) + EXISTING |
| SU-9 | "One submission per attempt" describes Challenge Me's stored record only. Jobs and outside providers downstream of a submission (marking steps, code execution, AI) may run more than once in rare failure windows (J-6); Evaluation owns the authoritative evaluation head and any regrade or supersession behavior (Wave 6). | LOCKED (J-6) + EXISTING (ADR-011) |
| SU-8 | The learner sees "Submitted ✓" immediately and then the result state from Evaluation under the reveal gate (§4.9). | EXISTING (J7, J9) |

## 4.7 Timing and late submissions

| # | Rule | Label |
|---|---|---|
| T-1 | Timing is decided by `server_received_at` only. At or before closes_at: ON_TIME (including after due_at, shown to teachers as "after due", W4-2). After closes_at and within the policy grace (default 0): LATE_ACCEPTED, marked normally. Beyond grace: LATE_HELD. | EXISTING (ADR-020, X10) + LOCKED (W4-2) |
| T-2 | A LATE_HELD submission is not marked and contributes nothing. A teacher accepts it (→ LATE_ACCEPTED, marking starts) or rejects it (→ LATE_REJECTED, reason TEACHER); with no acceptance within 14 days it becomes LATE_REJECTED (reason HOLD_EXPIRED). | LOCKED (W4-6) |
| T-3 | A late submission can only complete an attempt that was OPEN when the challenge closed (for example an answer queued on a phone that was offline), now ABANDONED (EXPIRED). No attempt can be started after closes_at. The original server submission position remains authoritative. | LOCKED (W5-C1) |
| T-3a | **Exception to read-only review, not a reopening of answering.** During the read-only review period (W4-C2) the learner cannot start attempts, retry, save drafts, reveal hints or run practice code. The single exception: a submission already queued from an attempt that was OPEN when the challenge closed may still arrive and is processed through the late-submission path. | LOCKED (W5-C2) |
| T-4 | Late submissions are accepted into the late path until the end of the read-only review period (closes_at + 14 days); after that the link is no longer valid and nothing is stored. | PROPOSED DEFAULT (aligned with W4-C2) |
| T-5 | Offline behavior of the web app: it keeps the current attempt's draft on the device and can queue **one** submission for an attempt that is already OPEN, with its idempotency key, and sends it when back online. It cannot start attempts, reveal hints or run practice code offline. | PROPOSED DEFAULT (implements ADR-020 offline grace) |
| T-6 | A submission arriving for a CANCELLED student challenge is refused ("This challenge was cancelled"); the server-side draft is kept. | PROPOSED DEFAULT |
| T-7 | The teacher's late-work view shows whether the submission arrived after answer-revealing content became available (Wave 4 L-7). | EXISTING (Wave 4 L-7) |

## 4.8 Completion

| # | Rule | Label |
|---|---|---|
| C-1 | The student challenge becomes COMPLETED when every item has at least one submission, or when the learner explicitly chooses Finish Challenge (W5-2). Assessment calls Challenge's `RecordEngagement(COMPLETED)`. | LOCKED (W5-C3, W5-2) |
| C-2 | COMPLETED is an **engagement** state, not a grading state: evaluation and result states never decide it; any timing status counts as a submission for completion (a LATE_HELD submission counts, while still contributing zero learning evidence until accepted); permitted retries continue until closes_at; a retry after COMPLETED never moves the student challenge back to STARTED. | LOCKED (W5-C3) |
| C-2a | Submissions arriving after closes_at (the late path) meet a student challenge that is already EXPIRED; its engagement status does not change (Wave 4 §5.4). The C-2 rule therefore matters for teacher counts of items submitted, not for reopening a closed challenge. | EXISTING (Wave 4 §5.4) |
| C-3 | Unanswered items in a completed or expired challenge are "not attempted", never a zero score, and produce no learning evidence. | EXISTING (LTM §3, G10 default) |

## 4.9 Reveal gate

| # | Rule | Label |
|---|---|---|
| RV-1 | `GetRevealState` decides what a learner may see for an item from the pinned RevealPolicy, the current server time, the student challenge status and the evaluation head. | EXISTING (DM §10.4) |
| RV-2 | Answer-revealing content (correct answer, explanation, model solution and anything equivalent) is never shown before the assignment's closes_at, whatever the policy says. A policy value AFTER_DUE_DATE or AFTER_CHALLENGE_COMPLETE for these fields means "not before closes_at". | LOCKED (W4-C1) |
| RV-3 | Score and feedback follow the pinned policy (default IMMEDIATE). Feedback content safety (no answer leakage in AI feedback) is Evaluation's responsibility (Wave 6). | EXISTING (DM §10.4) |
| RV-4 | After close, the learner sees results and allowed reveals read-only for 14 days through the challenge link (W4-C2), and afterwards through learner home. | LOCKED (W4-C2) + EXISTING |
| RV-5 | Reveal content is read only through StudentRevealView; the student DTO, snapshot and canary tests of DM §10.5 apply to every learner response, including errors. | EXISTING (DM §10.5) |

## 4.10 Integrity facts (SPEC-041)

| # | Rule | Label |
|---|---|---|
| IN-1 | Only server-side integrity facts are recorded: time from opening an item to submitting it; number of devices and sessions used; submissions made after answer-revealing content became available; identical normalized long-text or code submissions within one assignment. | LOCKED (W5-5), subject to LG-7 |
| IN-2 | Integrity facts never automatically change a score, a result, a timing status or learning evidence; they are never shown to learners or guardians; they are shown to in-scope teachers, Admins and Owners as neutral facts, never as an accusation. | LOCKED (W5-5) |
| IN-3 | No browser monitoring, paste tracking, camera, microphone, screen recording, lockdown browser or third-party proctoring. | LOCKED (W5-5) |
| IN-4 | Staff views of integrity facts are audited. | LOCKED (W5-5) |
| IN-5 | Collecting and showing integrity facts remains subject to **LG-7**; the product decision does not resolve the legal question. | LEGAL / COMPLIANCE GATE |

# 5. State Models

## 5.1 Attempt

| From | To | Trigger | Guard | Side effects |
|---|---|---|---|---|
| — | OPEN | StartAttempt | item answerable; attempt 1, or retry conditions of AT-2 (W5-3) | student challenge STARTED (first attempt) |
| OPEN | SUBMITTED | SubmitResponse | scope; valid answer | evaluation or late review task |
| OPEN | ABANDONED (EXPIRED) | closes_at | — | draft kept |
| OPEN | ABANDONED (CANCELLED) | student challenge cancelled | — | draft kept |
| ABANDONED (EXPIRED) | SUBMITTED | queued late SubmitResponse (exception to read-only review, T-3a) | within late window (T-4); one submission only | timing LATE_ACCEPTED or LATE_HELD; original server position kept (W5-C1) |
| ABANDONED (CANCELLED) | any | — | **invalid** | — |
| SUBMITTED | any | — | **invalid** | — |

## 5.2 Submission timing status (owned here)

| From | To | Trigger | Audit |
|---|---|---|---|
| — | ON_TIME / LATE_ACCEPTED / LATE_HELD | SubmitResponse (T-1) | no |
| LATE_HELD | LATE_ACCEPTED | teacher accepts within 14 days | yes |
| LATE_HELD | LATE_REJECTED (TEACHER) | teacher rejects | yes |
| LATE_HELD | LATE_REJECTED (HOLD_EXPIRED) | 14 days without acceptance | yes (system) |
| LATE_ACCEPTED / LATE_REJECTED / ON_TIME | any other | **invalid** | — |

## 5.3 Draft

Created on first save → updated (version check) → frozen when the attempt is SUBMITTED or ABANDONED → purged with learner content retention (R2).

## 5.4 Practice run

QUEUED → RUNNING → COMPLETED / FAILED. Refused requests create no row.

## 5.5 Student challenge engagement (owned by Challenge; transitions triggered here)

AVAILABLE → OPENED (first actual open in any valid learner session: challenge link, learner home or staff-issued link; W5-C4) → STARTED (first attempt) → COMPLETED (every item submitted, or Finish Challenge; W5-C3). COMPLETED is an engagement state; retries continue without reverting it. Challenge's EXPIRED and CANCELLED transitions are unchanged (Wave 4 §5.4).

# 6. Permissions and Tenant Boundaries

| Action | Learner (own session scope) | Guardian home | Owner | Admin | Teacher (org / course / cohort) |
|---|---|---|---|---|---|
| Open items, start attempts, save drafts, request hints, submit, Finish Challenge | ✓ | ✗ | ✗ | ✗ | ✗ |
| Practice runs | ✓ | ✗ | ✗ | ✗ | ✗ |
| View own results and allowed reveals | ✓ | per D12 reports only | — | — | — |
| View submissions and attempt history | — | ✗ | ✓ | ✓ | ✓ in scope |
| See that a draft exists (not its content) | — | ✗ | ✓ | ✓ | ✓ in scope |
| Accept or reject late work | — | ✗ | ✓ | ✓ | ✓ in scope |
| View integrity facts (audited; LG-7) | ✗ | ✗ | ✓ | ✓ | ✓ in scope |
| Edit or delete a submission | ✗ | ✗ | ✗ | ✗ | ✗ |
| Submit on a learner's behalf | ✗ | ✗ | ✗ | ✗ | ✗ |

"In scope" means the learner's enrollment is inside the teacher's scope (Wave 1 FD-1). Staff never answer for learners in V1 (PROPOSED DEFAULT). All records are tenant-owned; every learner request is limited to the session's organization, learner and scope; cross-learner requests return NOT_FOUND (EXISTING, ADR-016).

# 7. Data Ownership

| Data | Owner | Source of truth | Retention class | Notes |
|---|---|---|---|---|
| Attempt | Assessment | assessment.attempt | R1 | order used by D1 |
| Submission metadata | Assessment | assessment.submission | R1 | timing, hints used, hashes |
| Submission content | Assessment | assessment.submission content / object storage | R2 | purgeable separately (DM §10.2) |
| Draft | Assessment | assessment.draft | R2 | never evaluated |
| HintEvent | Assessment | assessment.hint_event | R1 | — |
| PracticeRun | Assessment | assessment.practice_run | R4 | W5-1 |
| Integrity facts | Assessment | integrity facts record (W5-5) | with submission metadata (no content) | LG-7 |
| Result, score, confidence | Evaluation | evaluation tables | — | Wave 6 |
| Evidence units, learning state | Learning | learning projections | — | rebuildable |

# 8. Cross-Module Contracts

| From → To | Mechanism | Contract | Purpose |
|---|---|---|---|
| Assessment → Challenge | A | `GetAnswerableItem` | item, frozen version, window, status |
| Assessment → Challenge | A | `RecordEngagement(STARTED / COMPLETED)` | engagement |
| Identity / Assessment → Challenge | A | `RecordEngagement(OPENED)` | first open in any learner session (W5-C4) |
| Assessment → Content | A (read) | `GetStudentQuestionView`, `HintStepView`, `StudentRevealView` | safe learner views |
| Assessment → Evaluation | A (same transaction) | `CreatePendingEvaluation` | marking (Wave 6) |
| Assessment → Evaluation | A (read) | evaluation head for the learner result view | result state (Wave 6) |
| Assessment → Review | A | `CreateReviewTask(LATE_SUBMISSION)` | teacher late-work decision |
| Assessment → Code Execution | B (job) | practice execution request (visible tests) | practice runs (W5-1) |
| Assessment → Learning | B | `ResponseSubmitted`, `LateSubmissionHeld`, `LateSubmissionAccepted`, `LateSubmissionRejected` | evidence eligibility (D1) |
| Assessment → Reporting | B | submission and attempt status events (no content) | teacher dashboards |

No new module. New or changed items: attempt abandon reason; `FinishChallenge` command (W5-2); integrity facts (W5-5); `LateSubmissionRejected` with reason.

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Connection drops during submit; client resends | Same idempotency key → original outcome; no duplicate (SU-3) |
| Two devices submit the same attempt | Attempt lock serializes; one wins; the other gets "Already submitted" |
| Two devices start the same item | Unique (student challenge, item, attempt_no); both get the same attempt |
| Draft save conflict | Version check; later save wins; other device warned (DR-3) |
| Session expires mid-answer (12 hours) | Draft already saved server-side; the learner re-opens the link (same device does not count again) |
| Device goes offline | Draft kept on the device; one queued submission sent on reconnect (T-5) |
| Submission arrives after close | Late path (T-1 to T-4) |
| Evaluation or AI provider down | Submission stored; marking waits (Wave 6); learner sees "Evaluating…" |
| Code Execution down during practice | "Running code is temporarily unavailable; you can still submit" |
| Budget exhausted | Submissions accepted; practice runs refused (PR-5) |
| Worker crash after practice run succeeded, before result stored | Run may execute twice (J-6); the learner sees one result; never marked |
| Marking job or provider call after a submission runs twice | The Submission is still one row; Evaluation's evaluation head decides the authoritative result (Wave 6); J-6 applies |
| Queued submission arrives during the review period | Processed through the late path (T-3a); nothing else is accepted |
| Queue unavailable | `SubmitResponse` still commits (marking jobs are rows in the same database); if the transaction cannot commit, nothing is stored and the client retries with the same key |
| Student challenge cancelled while learner is answering | Next request shows "This challenge was cancelled"; draft kept; later submission refused (T-6) |
| Organization suspended | SU-7 |

No outside service is called inside `SubmitResponse` (EXISTING). Jobs may run more than once; practice-run execution at the provider is not claimed to be exactly-once (LOCKED, J-6).

# 10. Privacy / Consent

- **Answers, drafts and practice code are learner content**: submissions and drafts R2, practice output R4; stored separately from metadata so they can be purged (EXISTING).
- **Processing consent:** without AI_PROCESSING the learner answers normally and marking avoids AI (SU-6). Practice runs use only the code execution sandbox, not AI (EXISTING, ADR-009).
- **Telemetry:** never answers, drafts, code, practice output, question text, hints' text, tokens or learner names.
- **Integrity facts:** only the four server-side facts of IN-1; no browser monitoring; content hashes only, never answer content, in telemetry; subject to LG-7.
- **Minors:** answering itself adds no new rule; LG-3 continues to govern consent for minors.
- **Deletion:** Wave 10; the purge handlers for submission content, drafts and practice output are already registered (DM §24).

# 11. Audit / Observability

**Audited:** late-work accept and reject; late-hold expiry; staff views of submission content (who viewed which learner's answer); staff views of integrity facts (W5-5). Submissions, drafts and hint events are domain records, not audit events (EXISTING, J7).

**Metrics (no content, no tokens, no names):**

| Metric | Purpose |
|---|---|
| Submit latency (p50, p95) and failures by reason (validation, already submitted, closed, suspended) | submission health |
| Idempotent replays | client resend behavior |
| Draft saves, conflicts, failures | autosave health |
| Hint requests per item and refusals | hint use |
| Practice runs: queued, latency, failures, quota refusals, budget refusals | practice health |
| Submissions by timing status; LATE_HELD age; hold expiries | late work |
| Offline-queued submissions received and their delay | offline behavior |
| Student DTO canary test results (CI) | leak prevention |

**Teacher visibility:** per learner and item: attempts, submission time, "after due" marker, timing status, hints used, draft in progress (yes/no), and integrity facts (IN-1) as neutral facts.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Submit at exactly closes_at | ON_TIME (server time ≤ closes_at) | EXISTING |
| Client clock ahead or behind | Ignored; server time decides | EXISTING |
| Learner submits after due, before close | ON_TIME; teacher sees "after due" | LOCKED (W4-2) |
| Draft left unsubmitted at close | Attempt ABANDONED (EXPIRED); draft kept; not marked; item "not attempted" | EXISTING |
| Phone offline at close with an answer ready | Queued submission sent on reconnect: LATE_ACCEPTED within grace, else LATE_HELD | EXISTING + W5-C1 |
| Queued submission after the review period | Refused; nothing stored (T-4) | PROPOSED DEFAULT |
| Retry requested while the previous answer is still "Evaluating…" | Not offered until a result is visible (AT-2) | LOCKED (W5-3) |
| Previous answer below full marks but reveal policy hides the score | No retry offered | LOCKED (W5-3) |
| Learner finishes early, then returns before close | May answer unanswered items; COMPLETED stays | LOCKED (W5-2, W5-C3) |
| Learner changes device between attempts | Allowed within the device limit | EXISTING |
| Guardian taps the minor's link and answers | Recorded as the learner's answer; product note for teacher training | EXISTING |
| Question version retired after the learner started | Learner keeps answering the frozen version | LOCKED (Wave 3 rule 4) |
| Learner leaves the cohort mid-answer | Student challenge CANCELLED; submitted answers kept; open attempt ABANDONED (CANCELLED) | EXISTING (Wave 4 §4.12) |
| Assignment deadline extended while an attempt is OPEN | Attempt continues under the new closes_at | LOCKED (W4-4) |
| Assignment cancelled after submissions | Submissions kept and marked (W4-3); open attempts ABANDONED (CANCELLED) | LOCKED (W4-3) |
| Same answer submitted by two learners | Both stored and marked normally; teachers see an "identical submission" fact | LOCKED (W5-5) |
| Hint set has no steps | Hint button hidden | EXISTING (J6) |
| Learner opens the challenge only from learner home | OPENED recorded (W5-C4) | LOCKED (W5-C4) |

# 13. Decisions (locked at closure)

No Wave 5 product decision remains open.

| ID | Locked decision | Applied in |
|---|---|---|
| W5-1 | Practice runs exist in V1: visible tests only; hidden tests never used, exposed or counted; 20 per attempt, 100 per learner per day; never a submission, evaluation or learning evidence; never changes attempt order; consumes CODE_EXECUTION budget; when exhausted, practice refused but submission always allowed; none after submission or close. | PR-1 … PR-7 |
| W5-2 | Any order; Finish Challenge allowed with unanswered items after a confirmation listing them; the learner may return to unanswered items until closes_at; unanswered = "not attempted", never zero, no learning evidence. | E-4, C-1, C-3 |
| W5-3 | Retry only when the previous result is visible (provisional qualifies, "Evaluating…" does not), below full marks, another attempt is allowed by the pinned policy, and closes_at has not passed; no retry when the reveal policy hides the score; retry never bypasses the reveal policy. | AT-2 |
| W5-4 | Earlier hints stay visible on a retry, count as used and are included in the retry's `hints_used`; Evaluation owns any penalty; Assessment only records usage. | H-5 |
| W5-5 | Server-side integrity facts only (IN-1); no browser monitoring or proctoring (IN-3); never automatic consequences, never shown to learners or guardians, neutral display to in-scope staff, audited views (IN-2, IN-4). Subject to LG-7, which this decision does not resolve. | IN-1 … IN-5 |

## Legal / compliance gates

### LG-7 — Learner integrity facts (open)

Recording and showing teachers behavioral facts about learners (timing, devices, duplicate answers), especially minors: lawful basis, transparency to learners and guardians, and retention. Product behavior is W5-5; counsel confirmation required per market. LG-1 to LG-6 are carried forward unchanged.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| E-1, E-2 | ADR-016, DM §10.1, Wave 2, W2-2 | EXISTING / LOCKED |
| E-3, AT-6, DR-5 | new | PROPOSED DEFAULT |
| E-4, C-1 (finish) | G10, W5-2 | LOCKED |
| E-5 | J5, DL-8, W5-C4 | LOCKED |
| AT-1 … AT-3, AT-5 | DM §10, J6, D1, Wave 3 rule 3 | EXISTING / LOCKED |
| AT-2 (when) | W5-3 | LOCKED |
| AT-4, §5.1 | DM §10 state table, W5-C1 | LOCKED |
| DR-1 … DR-4 | ADR-020, DM §10, J6 | EXISTING |
| H-1 … H-4 | ADR-007, DM §8.5, §10 | EXISTING |
| H-5 | W5-4 | LOCKED |
| PR-1 … PR-6 | X9, J6, W5-1 | LOCKED |
| PR-7 | new | PROPOSED DEFAULT |
| SU-1 … SU-4, SU-6, SU-8 | DM §25.1, J7, ADR-011, ADR-018 | EXISTING |
| SU-9 | J-6, ADR-011 | LOCKED |
| SU-5 | J7 | PROPOSED DEFAULT |
| SU-7 | FD-2 | LOCKED |
| T-1, T-2 | ADR-020, X10, W4-2, W4-6 | EXISTING / LOCKED |
| T-3 | J6, X10, W5-C1 | LOCKED |
| T-3a | W4-C2, W5-C2 | LOCKED |
| T-4 … T-6 | new | PROPOSED DEFAULT |
| C-1, C-2 | J7, DM §25.1, Wave 4 §5.4, W5-C3 | LOCKED |
| C-2a | Wave 4 §5.4 | EXISTING |
| RV-1 … RV-5 | DM §10.4–10.5, W4-C1, W4-C2 | EXISTING / LOCKED |
| IN-1 … IN-4 | SPEC-041, W5-5 | LOCKED |
| IN-5 | LG-7 | LEGAL / COMPLIANCE GATE |

# 15. Behavioral Acceptance Criteria

**Access and navigation**
1. A learner session can answer only items of the student challenge(s) in its scope; any other item id returns NOT_FOUND.
2. A guardian-home session cannot start an attempt, save a draft or submit.
3. Opening the challenge from learner home records OPENED; a WhatsApp READ status never does.

**Attempts and drafts**
4. Starting the same item twice returns the same OPEN attempt.
5. A retry uses the same frozen question version as the first attempt.
6. An attempt beyond the pinned policy's maximum is refused.
7. No attempt can be started after closes_at.
8. Drafts are never evaluated, never auto-submitted at close and never produce learning evidence.
9. Two devices saving drafts: the later save wins after a version check and the other device is warned.
10. Teachers can see that a draft exists but never its content.

**Hints and practice**
11. Hints appear one step at a time, in order, only from the hint set pinned in the frozen version.
12. A hint request on a submitted or abandoned attempt, or after close, is refused.
13. A practice run never uses hidden tests, never creates a submission or evaluation, and never changes attempt order.
14. The 21st practice run on one attempt, or the 101st by one learner in a day, is refused.
15. When the code-execution budget is exhausted, practice runs are refused and submissions are still accepted.

**Submission**
16. A submission is stored before any marking work, with the presented question version and server receive time.
17. The same idempotency key and content returns the original outcome; different content for a submitted attempt returns "Already submitted".
18. Two devices submitting one attempt at the same moment produce one stored Submission row (Challenge Me's record; no exactly-once claim for downstream providers, J-6).
19. `SubmitResponse` makes no outside network call.
20. No one can edit a stored submission.
21. An over-limit answer is refused and nothing is stored.
22. A learner without AI_PROCESSING consent can submit every response type.

**Timing and late work**
23. A submission received at or before closes_at is ON_TIME, including after due_at, and is shown to teachers as "after due" when after due_at.
24. A submission received after closes_at within grace is LATE_ACCEPTED and marked; beyond grace it is LATE_HELD and nothing is marked.
25. A LATE_HELD submission becomes LATE_ACCEPTED on teacher acceptance, LATE_REJECTED (TEACHER) on teacher rejection, and LATE_REJECTED (HOLD_EXPIRED) after 14 days without acceptance.
26. An attempt left OPEN at close can still receive its one queued submission through the late path until closes_at + 14 days; after that it is refused.
27. A late-accepted attempt keeps its original server submission position in attempt order.
28. A submission for a cancelled student challenge is refused and the draft is kept.

**Completion**
29. When every item has at least one submission of any timing status, or the learner chooses Finish Challenge, the student challenge becomes COMPLETED; no evaluation or result state affects this.
30. A permitted retry after COMPLETED is accepted and does not move the student challenge back to STARTED.
31. Unanswered items are shown as "not attempted" and produce no learning evidence.

**Reveal**
32. No correct answer, explanation or model solution reaches a learner before closes_at, whatever the pinned policy says.
33. The student DTO canary test finds no protected marker in any learner response, including error responses.
34. For 14 days after close the learner can view results and allowed reveals but cannot start attempts, save drafts or request hints.

**Integrity and privacy**
35. No integrity fact changes a score, result, timing status or learning evidence.
36. No integrity fact is shown to a learner or guardian.
37. Telemetry never contains answer content, drafts, code, practice output, question text or tokens.
38. Staff viewing a learner's submission content is audited.

**Wave 5 decisions**
39. No practice run is allowed after the attempt is submitted or after closes_at, and practice runs are refused while the CODE_EXECUTION budget is exhausted (W5-1).
40. Finish Challenge shows the unanswered items before confirming; after finishing, the learner can still answer them until closes_at (W5-2).
41. No retry is offered while the previous answer shows "Evaluating…", when its result is full marks, when the policy allows no further attempt, after closes_at, or when the reveal policy hides the score; a visible provisional result below full marks does allow a retry (W5-3).
42. A retry shows the hints revealed in earlier attempts and its submission's `hints_used` includes them (W5-4).
43. Only the four server-side integrity facts are recorded; no client-side monitoring event exists; staff views of integrity facts are audited (W5-5).
44. An attempt ABANDONED (CANCELLED) refuses any submission; an attempt ABANDONED (EXPIRED) accepts exactly one queued submission through the late path, keeping its server submission position (W5-C1).
45. During read-only review, attempts, retries, drafts, hints and practice runs are refused; only a queued submission from an attempt OPEN at close is processed, through the late path (W5-C2).
46. A LATE_HELD submission counts toward "every item has a submission" while contributing zero learning evidence until accepted (W5-C3).
47. Opening a challenge through a staff-issued link or learner home records OPENED; a channel READ event does not (W5-C4).
48. A marking or provider job that runs twice after a submission never creates a second Submission (SU-9, J-6).

---

# Wave 5 Closure

**Status: APPROVED and CLOSED.**

## Binding rules for later waves

1. Challenge Me stores **one submission per attempt**, before any marking work. This is a statement about Challenge Me's record, not exactly-once execution at outside providers (J-6). Evaluation owns the authoritative evaluation head, regrades and supersession (Wave 6).
2. Drafts and practice runs are never marked and never produce learning evidence.
3. Timing is decided by server time; LATE_HELD contributes nothing until accepted; LATE_REJECTED (TEACHER or HOLD_EXPIRED) is terminal.
4. Retries never bypass the reveal policy, and answer-revealing content never appears before closes_at.
5. COMPLETED is an engagement state, never a grading state.
6. Integrity facts never have automatic consequences and are never shown to learners or guardians.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W5-1 | Practice runs in V1: visible tests only (hidden tests never used, exposed or counted); 20 per attempt, 100 per learner per day; never a submission, evaluation or learning evidence; never changes attempt order; CODE_EXECUTION budget, refused when exhausted while submission is always allowed; none after submission or close. |
| W5-2 | Any order; Finish Challenge with unanswered items after a confirmation listing them; return to unanswered items until closes_at; unanswered = "not attempted", never zero, no learning evidence. |
| W5-3 | Retry only when the previous result is visible (provisional qualifies; "Evaluating…" does not), below full marks, allowed by the pinned policy, and before closes_at; no retry when the reveal policy hides the score. |
| W5-4 | Earlier hints stay visible, count as used and are included in the retry's `hints_used`; Evaluation owns penalties. |
| W5-5 | Server-side integrity facts only (time to submit, devices and sessions, submissions after answer reveal, identical normalized long-text or code within an assignment); no browser monitoring or proctoring; no automatic consequences; never shown to learners or guardians; neutral display to in-scope staff; views audited. Subject to LG-7. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W5-C1 | An attempt OPEN at closes_at becomes ABANDONED (EXPIRED) and may still receive its one queued submission through the late path within the late window; ABANDONED (CANCELLED) is terminal; the original server submission position is authoritative. |
| W5-C2 | Narrow **exception to read-only review**, not a reopening of answering: no new attempts, retries, drafts, hints or practice runs; only a submission already queued from an attempt OPEN at close is processed, through the late path. |
| W5-C3 | COMPLETED when every item has at least one submission (any timing status, LATE_HELD included) or the learner explicitly finishes; evaluation state never decides it; retries continue until close without reverting it; LATE_HELD still contributes zero evidence until accepted. |
| W5-C4 | OPENED on the first actual open in any valid learner session (challenge link, learner home, staff-issued link); a channel READ never creates it. |

## 3. Legal / compliance gates

**LG-7 (new, open):** learner integrity facts, especially for minors: lawful basis, transparency and retention. Not resolved by W5-5. LG-1 to LG-6 carried forward unchanged.

## 4. Remaining non-blocking proposed defaults

Overview fields (E-3); no per-learner timer (AT-6); teachers see only that a draft exists (DR-5); practice output not shown to teachers (PR-7); input limits 64 KB code, 10,000 characters long text, 500 characters short text (SU-5); late window ends with the review period, closes_at + 14 days (T-4); offline queue of one submission for an OPEN attempt, with no offline starts, hints or practice (T-5); submissions for a cancelled challenge refused with the draft kept (T-6); no staff answering on a learner's behalf; staff views of submission content audited.

## 5. Domain Model and ADR reconciliation items

| Document | Section | Change |
|---|---|---|
| DM | §10.2 `assessment.attempt`, §10 Attempt state table | Add `abandon_reason` (EXPIRED, CANCELLED); ABANDONED (EXPIRED) → SUBMITTED through the late path within the late window; ABANDONED (CANCELLED) terminal (W5-C1). |
| DM | §25.1 SubmitResponse | Accept ABANDONED (EXPIRED) attempts within the late window, keeping server order; completion when every item has any submission or on `FinishChallenge` (W5-C3, W5-2); "one submission per attempt" wording with the J-6 note. |
| DM | §10 commands | Add `FinishChallenge` (W5-2). |
| DM | §5.2 capability grant / session | Read-only review sessions refuse attempts, retries, drafts, hints and practice, with the single late-submission exception (W5-C2). |
| DM | §9.4 student challenge | OPENED from any valid learner session; COMPLETED is engagement-only and not reverted by retries (W5-C3, W5-C4). |
| DM | §10.1 retry invariant | Retry conditions of W5-3, including no retry when the reveal policy hides the score. |
| DM | §10.2 `hint_event`, `submission.hints_used` | Carried-forward hints count in the retry's `hints_used` (W5-4). |
| DM | §10.2 `practice_run` | Confirmed (X9 closed); limits 20 per attempt and 100 per learner per day; budget refusal; visible tests only (W5-1). |
| DM | §10 (new) integrity facts | Record of the four facts, owned by Assessment, no content, retained with submission metadata; audited staff views; LG-7 (W5-5). |
| DM | §20 events | `LateSubmissionAccepted` and `LateSubmissionRejected` (with reason) alongside `LateSubmissionHeld`. |
| ADR-009 | X9 amendment | Practice runs confirmed with W5-1 limits. |
| ADR-020 | X10 amendment | Late path from ABANDONED (EXPIRED) attempts; read-only review exception (W5-C1, W5-C2); retries never bypass reveal (W5-3). |
| Carried forward (unchanged) | Wave 2, 3 and 4 reconciliation items | Not reopened. |

**STOP — Wave 5 closed. Wave 6 not started.**
