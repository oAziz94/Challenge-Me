# Challenge Me — V1 Spec Kit — Part 2, Wave 4: Challenges & Delivery

> Capability: challenge definitions, assignments and student challenges; selection; materialization; scheduling and recurrence; due dates, closing and late work; learner access through capability links; WhatsApp, email and web delivery; delivery and engagement states; reminders; expiry and cancellation; cohort changes; reinforcement delivery (SPEC-023 to 029, 061 to 066 as they concern challenges).
>
> Status: APPROVED and CLOSED (rev. 3). W4-1 to W4-6 locked (W4-1 preserves Part 1 G4 exactly; W4-6 uses LATE_REJECTED with reason); W4-C1 to W4-C7 reconciled. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–3 (closed), Spec Kit Part 1 (J2–J5, J11, SC1–SC4, G5 as carried forward), Domain Model rev. 1.4 (DM), Architecture V1.3, ADR set V1.3, Learning Trajectory Model rev. 13 (LTM), approved C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17. The five Content rules closed in Wave 3 are hard constraints.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 4 decisions as locked at closure; the Wave 4 Closure at the end lists what remains open.

# 1. Capability Overview

**Plain language.** Challenge decides **what practice is assigned, to whom, when, and how it is delivered**. A teacher sets up a recurring plan (a challenge definition). Each scheduled date produces one assignment. Shortly before it opens, every targeted learner gets a personal copy (a student challenge) with its questions frozen. When it opens, Challenge asks Communication to send each learner (or, for minors, their guardian) a private link. Learners open the link, answer, and finish before the challenge closes. Reminders, expiry, cancellations and learners joining or leaving cohorts are handled without ever changing a learner's frozen copy.

**Challenge is responsible for:** assignments, targets, schedules, selection, materialization, deadlines, deciding that a delivery or reminder should happen, to whom, when and why, and delivering reinforcement that Learning has decided is needed.

**Challenge is not responsible for:** whether an answer is correct (Evaluation), a learner's learning state or whether they need reinforcement (Learning), how a message reaches a phone (Communication), or who may access what (Identity).

**The three entities are never collapsed:**

| Entity | Meaning | Not |
|---|---|---|
| ChallengeDefinition | Recurring or template intent: targets, selection rule, schedule, grading policy, reveal settings | Not one learner's work; not a dated assignment |
| ChallengeAssignment | One dated occurrence: pins selection rule snapshot, schedule times, targets, GradingPolicyVersion and RevealPolicy | Does not choose LearningPolicyVersion (C7) |
| StudentChallenge | One learner's materialized copy with frozen QuestionVersions | Never changed by later content or roster edits |

**Binding Content rules (Wave 3):** Question is the lasting identity and QuestionVersion the frozen bundle; published versions are never edited; a student challenge keeps its exact versions; retired versions stay valid for existing challenges, marking, history and permitted regrades; Content never decides results or computes progress.

# 2. Actors

| Actor | Authority | Source |
|---|---|---|
| Owner, Admin | Every challenge action in the organization | LOCKED (FD-1) |
| Teacher (organization, course or cohort scope) | Challenge actions only where **every** target of the definition or assignment is inside their scope | LOCKED (FD-1) + §6 |
| Learner | Opens links, answers, completes, within session scope | ADR-016, Wave 2 |
| Guardian | Receives minors' links by default (W2-1); holds no learner-answering rights beyond the link they receive | LOCKED (W2-1) |
| System actor | Scheduler, materializer, reminder sweeper, expiry sweeper, reinforcement planner | ADR-012 |
| Communication | Sends, retries, tracks delivery status | EXISTING (ADR-004, DM §14) |
| Learning | Decides reinforcement and revalidates it | EXISTING (ADR-014), LOCKED (D13) |
| Messaging providers | WhatsApp and email only; no SMS provider is used in V1 (the SMS adapter interface is kept for later) | EXISTING + LOCKED (W4-5) |

# 3. Core Lifecycles

## 3.1 From definition to learner

```
ChallengeDefinition (ACTIVE, RRULE + IANA zone)
  -> scheduler expands occurrences ahead (idempotent per local occurrence time)
  -> at opens_at − lead time: ChallengeAssignment created (pins grading policy version,
     reveal policy, selection rule snapshot, targets, opens/due/closes)
  -> materialization in chunks: one StudentChallenge per targeted learner, versions frozen
  -> at opens_at: assignment OPEN; each StudentChallenge AVAILABLE; DeliveryRequested
  -> Communication: consent checks, grant issue, send, status
  -> learner: link GET (inert) -> POST exchange -> OPENED -> STARTED -> COMPLETED
  -> 24 h before due: one reminder if not started (G5)
  -> after due_at, before closes_at: submissions accepted normally, shown as "after due" (W4-2)
  -> at closes_at: unfinished StudentChallenges EXPIRED; assignment CLOSED;
     answer-revealing content released (W4-C1); read-only review for 14 days (W4-C2)
```

## 3.2 Ad hoc ("send now")

A definition with no recurrence and a single assignment whose opens_at is now or a chosen time. Everything else is identical.

## 3.3 Reinforcement

```
Learning: ReinforcementItem PENDING (decided by Learning; D13)
  -> Challenge PlanReinforcement: revalidate (1) -> REINFORCEMENT assignment for one learner
  -> materialize (single learner) -> at opens_at: revalidate (2)
     -> invalid: StudentChallenge CANCELLED, nothing delivered
     -> valid: AVAILABLE, delivered like any challenge
```

# 4. Behavioral Rules

## 4.1 ChallengeDefinition

| # | Rule | Label |
|---|---|---|
| CD-1 | A definition holds targets (cohorts or a learner set), a selection rule, an optional recurrence rule (RRULE) with an IANA time zone, a window (open duration, due offset, close offset), a grading policy reference, reveal settings and a title. | EXISTING (DM §9.2) |
| CD-2 | Recurrence is expanded with a mature RRULE and time-zone library; Challenge Me does not implement recurrence semantics. | EXISTING (ADR-022) |
| CD-3 | States: DRAFT, ACTIVE, PAUSED, ARCHIVED. Only ACTIVE definitions produce occurrences. | EXISTING (DM §9.2) |
| CD-4 | Editing a definition affects only occurrences whose assignment has **not yet been created**. Existing assignments are never changed by a definition edit; they are edited individually (§4.6). | PROPOSED DEFAULT (implements "recurrence edits never become historical edits") |
| CD-5 | Pausing stops new occurrences; resuming does not create occurrences for the paused period. | PROPOSED DEFAULT |
| CD-6 | Archiving a definition stops future occurrences and leaves its assignments untouched. | PROPOSED DEFAULT |
| CD-7 | Targets and the grading policy are validated against the creator's scope and the organization at save time and again at each assignment creation. | EXISTING (DM §9.3) |

## 4.2 Scheduling and recurrence

| # | Rule | Label |
|---|---|---|
| S-1 | Occurrence identity is (definition, local occurrence date-time); duplicates are impossible even with several scheduler instances (unique key + per-definition lock). | EXISTING (ADR-022, DM §9.2) |
| S-2 | Times are computed in the definition's IANA time zone; a 16:00 challenge stays at 16:00 local time across daylight-saving changes. | EXISTING (ADR-022) |
| S-3 | A local time that does not exist (spring-forward gap) moves to the next valid minute; an ambiguous local time (fall-back) uses the first occurrence. | PROPOSED DEFAULT |
| S-4 | The scheduler records occurrences up to 14 days ahead so teachers see what is coming; the assignment itself is created at opens_at minus the materialization lead time (60 minutes). | PROPOSED DEFAULT |
| S-5 | **Missed occurrence** (scheduler unavailable): on recovery, if the occurrence has not reached its closes_at, the assignment is created and opened immediately with its original due and close times, and teachers are notified that it opened late; otherwise it is recorded as MISSED and not created. | PROPOSED DEFAULT |
| S-6 | Organization quiet hours and weekend days never move opens_at, due_at or closes_at; they only affect message timing (§4.9). | PROPOSED DEFAULT |

## 4.3 ChallengeAssignment

| # | Rule | Label |
|---|---|---|
| CA-1 | At creation the assignment pins: the ACTIVE GradingPolicyVersion of the chosen grading policy, the RevealPolicy, a snapshot of the selection rule, the targets and opens_at, due_at and closes_at. Pinned fields never change afterwards. | EXISTING (ADR-008, ADR-020, DM §9.3) |
| CA-2 | The assignment never selects or pins a LearningPolicyVersion; learning rules follow topic scope (C7, C7-A). | LOCKED (C7, C7-A) |
| CA-3 | Challenge holds only the grading policy version id; Evaluation and Learning consume it under their contracts. Challenge never reads or changes evaluation results. | EXISTING (ADR-011, DM §9) |
| CA-4 | opens_at ≤ due_at ≤ closes_at; closes_at defaults to due_at and a teacher may set it later. A submission after due_at and before closes_at is accepted normally (ON_TIME timing status, never LATE_HELD), marked and counted normally, and shown to teachers as "after due". "Late" (LATE_ACCEPTED, LATE_HELD, LATE_REJECTED) always means after closes_at. | LOCKED (W4-2) |
| CA-5 | Assignment kinds: SCHEDULED, AD_HOC, REINFORCEMENT. | EXISTING |
| CA-6 | Grading policy default for new organizations comes from platform defaults (Part 1 G1). | PROPOSED DEFAULT (G1) |

## 4.4 Selection

| # | Rule | Label |
|---|---|---|
| SEL-1 | Only **current published versions of non-archived questions** can be selected. | LOCKED (W3-C2) |
| SEL-2 | **FIXED**: an ordered list of Questions. The version frozen for each learner is the Question's current published version at that learner's materialization. | EXISTING (ADR-008, Wave 3 CC-2) |
| SEL-3 | FIXED shortfall: a question that is archived or has no current published version at materialization is skipped and the teacher informed; if none remain, the assignment does not open and the teacher is informed. | EXISTING (J3, Wave 3 CC-4) |
| SEL-4 | **RULE_BASED**: filters on topics (a question qualifies for a topic when its version's weight for that topic is at least 0.5), difficulty mix (from the version's difficulty, W3-C1), objectives, response types and course; plus a count. | EXISTING (DM §9.2) + PROPOSED DEFAULT (0.5 threshold) |
| SEL-5 | A rule naming a retired or merged topic resolves it through TopicMapping to its current topics. | PROPOSED DEFAULT |
| SEL-6 | Selection is per learner for RULE_BASED and uses a stored seed, so the same inputs produce the same selection. | EXISTING (DM §9.3) |
| SEL-7 | No Question appears twice in one student challenge. A variant is a different Question (D9) and may appear alongside its original. | PROPOSED DEFAULT + LOCKED (D9) |
| SEL-8 | RULE_BASED shortfall: materialize with the questions found; a learner whose selection is empty gets no student challenge and is listed for the teacher. | PROPOSED DEFAULT |
| SEL-9 | **Reproducibility record** per student challenge: selection rule snapshot, seed, the frozen items (question id, version id, order) and the candidate-pool size and hash at selection time. The frozen items are the authoritative record; re-running selection later is not expected to reproduce them, because the pool changes. | EXISTING (DM §9.2) + PROPOSED DEFAULT (pool hash) |
| SEL-10 | Normal challenges do not exclude recently answered questions. Reinforcement selection follows RF-6 (W4-1). | PROPOSED DEFAULT + LOCKED (W4-1) |

## 4.5 Materialization

| # | Rule | Label |
|---|---|---|
| M-1 | Timing: starts when the assignment is created (opens_at − 60 minutes); late joiners materialize on enrollment while the assignment is not yet closed. | EXISTING (DM §9.3) + PROPOSED DEFAULT (lead time) |
| M-2 | Transaction: chunks of at most 500 learners; each chunk is one transaction that, for each learner still targeted and ACTIVE, selects versions, freezes items and creates the StudentChallenge (MATERIALIZED). | EXISTING (ADR-022, DM §25.5) |
| M-3 | Idempotency: unique (assignment, learner); re-running a chunk creates nothing new. Concurrent late-joiner and chunk runs converge on one student challenge. | EXISTING (DM §26) |
| M-4 | Per-learner all-or-nothing: a student challenge is created with all its selected items in one step, or not at all. Across the assignment, materialization is partial by design (per learner). | PROPOSED DEFAULT |
| M-5 | Cancellation during materialization: each chunk checks the assignment is still SCHEDULED, MATERIALIZING or OPEN inside its transaction; a cancelled assignment stops further chunks; any student challenges already created are cancelled by the cancellation handler. | EXISTING (DM §24) made precise |
| M-6 | Frozen items never change. Later content edits, retirements, archives, topic changes, roster changes or policy edits do not alter them (binding Content rule 3). | LOCKED (Wave 3) |
| M-7 | A learner who is INACTIVE, MERGED or DELETED at chunk time is skipped. | EXISTING (DM §26) |

## 4.6 Assignment and schedule changes

| # | Rule | Label |
|---|---|---|
| AC-1 | Before opening: opens, due and close times, title and targets may be edited; pinned grading policy version and reveal policy may not. | PROPOSED DEFAULT |
| AC-2 | After opening (assignment OPEN): only due_at and closes_at may change, and only to later times (extend, never shorten), for the whole assignment. There are no per-learner deadline overrides in V1. Non-terminal student challenges take the new times; EXPIRED, COMPLETED and CANCELLED ones stay as they are (an expired student challenge stays expired). Answer reveal (W4-C1) and the read-only review period (W4-C2) follow the new closes_at. A CLOSED assignment cannot be extended. Every extension is audited. | LOCKED (W4-4) |
| AC-3 | A due-time change moves a pending, unsent reminder to the new due time; a reminder already sent is never followed by a second one (R-4). | LOCKED (W4-4, G5 carried forward) |
| AC-4 | Cancelling an assignment: all non-terminal student challenges become CANCELLED (ASSIGNMENT_CANCELLED); queued deliveries and reminders are cancelled; grants are revoked. Cancellation stops future activity; it never erases submitted work: submissions already made are kept, marking continues, and results count as normal learning evidence. A LATE_HELD submission on a cancelled assignment still follows L-6. | EXISTING (DM §24) + LOCKED (W4-3) |

## 4.7 Due, close and late work

| # | Rule | Label |
|---|---|---|
| L-1 | Answering is possible until the student challenge's closes_at. After that, answering is disabled. | EXISTING (J6, DM §9.4) |
| L-2 | Server time decides timing; client clocks are recorded but never trusted. | EXISTING (ADR-020) |
| L-3 | A submission received after closes_at (after due_at alone is not late; CA-4) (for example an offline submission synced later) is: within the grace window (default 0) → LATE_ACCEPTED automatically; beyond it → LATE_HELD for a teacher decision. | EXISTING (ADR-020, X10) |
| L-4 | LATE_HELD contributes nothing while held. A teacher may accept it (LATE_HELD → LATE_ACCEPTED), which starts evaluation; the attempt keeps its original server submission position; acceptance never reorders attempts; first/final recalculation and middle-attempt behavior follow the Learning Trajectory Model. Never-accepted late work contributes nothing. | LOCKED (late-held decision, D1) |
| L-5 | Challenge supplies the window (closes_at, grace) and the student challenge context. Assessment owns submission timing status and the accept/reject commands; Learning owns the evidence calculation. | EXISTING (DM §10, §12) |
| L-6 | A LATE_HELD submission is held for 14 days. A teacher may accept it before then (LATE_HELD → LATE_ACCEPTED, L-4) or reject it. With no acceptance within 14 days it becomes the terminal outcome **LATE_REJECTED** (reason HOLD_EXPIRED; a teacher rejection records reason TEACHER). LATE_REJECTED is distinct from any generic rejection so the late-work reason stays explicit; it is never evaluated and contributes no learning evidence; the stored content is kept under normal retention. D1 attempt ordering and FIRST_AND_FINAL semantics are unchanged. | LOCKED (W4-6, X10) |
| L-7 | The teacher's late-work view shows whether the submission was received after correct answers were revealed for that assignment. | PROPOSED DEFAULT |

## 4.8 Learner access (applies Wave 2; no new access model)

| # | Rule | Label |
|---|---|---|
| LA-1 | Learners and guardians are never IdP users; access starts only with a capability grant; there is no phone-number or email login. | LOCKED (Wave 2, W2-3) |
| LA-2 | Grants are opaque random values stored hashed; the link's GET shows an inert page; POST exchanges the token for a session and removes it from the visible address; link-preview crawlers never consume or activate grants. | EXISTING (ADR-016) |
| LA-3 | A STUDENT_CHALLENGE grant opens exactly one student challenge for one learner; shared phones never allow sibling access. | LOCKED (Wave 2) |
| LA-4 | Each message gets its own grant; new grants do not revoke earlier ones for the same learner and challenge; the device limit (3) counts across them; a fourth device needs a one-time code. | EXISTING (SC1) |
| LA-5 | STUDENT_CHALLENGE grants stay valid for **14 days after closes_at** in read-only mode: no answering, no new attempts, results viewable, review only. An extension of closes_at (AC-2) moves this period with it. | LOCKED (W4-C2) |
| LA-6 | Revocation: student challenge CANCELLED; enrollment ended; learner INACTIVE, MERGED or DELETED; contact point unlinked; staff "reset link"; security event; `GuardianLinkEnded` (LA-6a). | EXISTING (Wave 2) |
| LA-6a | On `GuardianLinkEnded`, Identity revokes the learner-subject capability grants (learner and student-challenge grants) for **that learner** that were issued to **that guardian's** contact points. Grants issued to the same contact point for other learners the guardian is still linked to, and grants issued to other recipients, are not revoked. | LOCKED (W4-C7, applying W2-C4) |
| LA-7 | Replay: a used link can be exchanged again on the same or another device within the device limit; a revoked or expired link shows the uniform "no longer valid" page. | EXISTING (ADR-016, J5) |
| LA-8 | One-time-code step-up to learner home follows Wave 2 (code to an active linked contact point; correct code verifies it; bound to that learner). Codes are sent by WhatsApp or email only; there is no SMS one-time code in V1. | LOCKED (W2-C3, W4-5) |
| LA-9 | Opening a link never verifies a contact point. | LOCKED (W2-C3) |
| LA-10 | Staff-issued (copy or print) links: Owners, Admins and in-scope teachers, only when the organization enables it (off by default), audited, normal grant rules. | LOCKED (W2-2) |

## 4.9 Delivery

| # | Rule | Label |
|---|---|---|
| DL-1 | Challenge decides whether, to whom, when and why; it emits `DeliveryRequested` with purpose, learner, student challenge, capability scope and expiry. Communication decides how: provider calls, status and channel retries. | EXISTING (ADR-013, DM §9.3, §14) |
| DL-2 | V1 channels: WhatsApp, email, and web (the learner home list and staff-issued links). No SMS in V1: no SMS challenge messages, no SMS one-time codes, no SMS fallback when WhatsApp or email is unavailable. The SMS adapter interface is kept for future use. No web push or other channel is added. | LOCKED (brief, W4-5) |
| DL-3 | Recipients follow W2-1: MINOR and UNKNOWN → guardian contact points; ADULT → the learner's; organization setting can change this. | LOCKED (W2-1) |
| DL-4 | Channel order: WhatsApp, then email. If a delivery FAILS permanently, Challenge requests the next eligible channel once. If no channel is eligible, no message is sent; the challenge remains reachable through learner home (after a one-time code) and staff-issued links where enabled. | EXISTING (J4 proposed) — PROPOSED DEFAULT |
| DL-5 | Channel consent is checked when the delivery is queued and again immediately before the provider call; if withdrawn in between, the delivery is CANCELLED. If withdrawal happens while the provider call is already in flight, Challenge Me cannot guarantee the provider did not receive it; the result is recorded, no further messages are sent, and provider deletion is used where available. | EXISTING (ADR-019) + LOCKED (J-6) |
| DL-6 | Messages are held outside quiet hours and weekend-day restrictions; they are never dropped for timing, only delayed, and EXPIRE if the student challenge closes first. | EXISTING (J4) |
| DL-7 | Duplicate protection: one challenge message per (student challenge, purpose, sequence); staff resends create a new sequence number and are audited (limit 3 resends per student challenge). A rare external duplicate remains possible (J-6). | EXISTING (DM §14) + PROPOSED DEFAULT (resend limit) |
| DL-8 | WhatsApp READ is a delivery fact. It never marks a student challenge OPENED; OPENED comes only from a link exchange. | EXISTING (J4, DM §9.4) |
| DL-9 | Message bodies are stored without link tokens. | EXISTING (SC2) |
| DL-10 | Delivery failures and outcomes appear to teachers per learner (sent, delivered, read, failed, blocked by consent, no reachable contact). | EXISTING (J4) |

## 4.10 Reminders (G5 carried forward)

| # | Rule | Label |
|---|---|---|
| R-1 | One reminder per student challenge, 24 hours before due_at, only if the student challenge is not yet STARTED, respecting quiet hours, consent and delivery eligibility. | LOCKED (G5 carried forward) |
| R-2 | If 24 hours before due falls in quiet hours, the reminder waits for the next allowed window; if that window starts after due_at, the reminder is skipped. | PROPOSED DEFAULT |
| R-3 | The reminder re-checks, at send time, that the student challenge is still AVAILABLE or OPENED (not STARTED, COMPLETED, EXPIRED or CANCELLED); otherwise it is cancelled. | PROPOSED DEFAULT |
| R-4 | A due-time extension moves a pending, unsent reminder to 24 hours before the new due time; if the reminder was already sent, no second reminder is created. | LOCKED (W4-4) |
| R-5 | Consent withdrawal, assignment cancellation or learner removal cancels a pending reminder. | EXISTING (ADR-019) |
| R-6 | A failed reminder is retried by Communication's normal rules; no channel fallback for reminders. | PROPOSED DEFAULT |
| R-7 | A reminder never creates a StudentChallenge or a second one; it reuses the existing student challenge and issues a new grant for the message (LA-4). | LOCKED (brief) + EXISTING (SC1) |

## 4.11 Reinforcement delivery

| # | Rule | Label |
|---|---|---|
| RF-1 | Learning alone decides that reinforcement is needed (from TopicState and reinforcement rules). Trajectory and learning signals never trigger it. Challenge never decides need. | LOCKED (D13, C11) |
| RF-2 | Challenge decides when and how: on `ReinforcementItemCreated` it revalidates with Learning; if valid, it creates a REINFORCEMENT assignment for that learner and materializes it; opens it at the item's earliest due time within delivery windows. | EXISTING (DM §9.3, §25.8) |
| RF-3 | Revalidation happens at planning and again when the reinforcement student challenge opens; if the item was invalidated, superseded or no longer qualifies, the student challenge is CANCELLED (reason REINFORCEMENT_INVALIDATED) and nothing is sent. | EXISTING (SC4) + W4-C6 reason |
| RF-4 | Learning owns and enforces the reinforcement frequency cap when creating items. Challenge owns timing, the delivery window and channel constraints, and never enforces the pedagogical frequency cap itself. | LOCKED (W4-C5) |
| RF-5 | Reinforcement answers are normal evidence; repeated questions get the D9 repeat-exposure factor exactly as in normal challenges. | LOCKED (D9, D16) |
| RF-6 | Reinforcement selection (Part 1 G4, exact): select **up to 3** published questions on the target topic (topic weight ≥ 0.5), excluding questions the learner answered in the previous 14 days. If eligible questions exist, only they are used: 1 or 2 eligible questions means 1 or 2 are sent, never topped up with repeats. Only when the eligible pool is empty are repeats allowed, and then **only from questions the learner previously got wrong** on the target topic; each repeated question receives the existing D9 repeat-exposure factor. Grading policy: the course's default; the organization default when the topic is organization-wide. Whether an earlier answer was wrong comes from Evaluation's recorded result; Challenge never judges correctness. If the pool is empty and the learner has no previously wrong question on the topic, the selection is empty and no reinforcement student challenge is created (SEL-8 applied). | LOCKED (W4-1, G4) + PROPOSED DEFAULT (empty wrong-question pool) |
| RF-7 | A reinforcement challenge window: open for 72 hours (PROPOSED DEFAULT); reminders do not apply to reinforcement (PROPOSED DEFAULT). | PROPOSED DEFAULT |

## 4.12 Cohort and roster changes

| Situation | Behavior | Label |
|---|---|---|
| Learner joins before the assignment is created | Included at materialization | EXISTING |
| Joins after assignment creation, before or after opening, before close | Late joiner: own materialization with current published versions, same close time; delivered when AVAILABLE | EXISTING (DM §9.3, J3) |
| Joins after close | Nothing | EXISTING |
| Leaves before materialization | Not materialized | EXISTING |
| Leaves after materialization | Non-terminal student challenge CANCELLED (ENROLLMENT_ENDED) unless still targeted another way; grants revoked; completed ones and submitted work unchanged | EXISTING (DM §9.3, Wave 2 E-4) |
| Transfer between cohorts | End + start in one transaction (Wave 2 E-5): the old cohort's open challenges cancelled, the new cohort's open assignments materialized; history never rewritten | EXISTING |
| Learner INACTIVE | No new materialization; open student challenges stay but links are revoked; reactivation before close allows a new link | EXISTING (Wave 2 L-7) + PROPOSED DEFAULT |
| Learner merged | Duplicate's open student challenges re-pointed or cancelled (LEARNER_MERGED) | EXISTING (DM §25.11) |
| Teacher scope changes | Changes what the teacher can see and manage from the next request; never changes assignments or student challenges | EXISTING (Wave 1 R-9) |

## 4.13 Expiry

At closes_at, non-terminal student challenges become EXPIRED; open attempts become ABANDONED; drafts are kept; the assignment becomes CLOSED; undelivered messages EXPIRE. Results remain viewable read-only through the review period (LA-5). (EXISTING DM §9.4, §24; LA-5 per W4-C2.)

# 5. State Models

## 5.1 ChallengeDefinition

DRAFT → ACTIVE ↔ PAUSED; ACTIVE / PAUSED → ARCHIVED (terminal). Audited.

## 5.2 ChallengeOccurrence (new status field)

PLANNED → ASSIGNMENT_CREATED; PLANNED → MISSED (S-5); PLANNED → SKIPPED (definition paused or archived before creation).

## 5.3 ChallengeAssignment

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | DRAFT | teacher / scheduler | targets in scope | — | staff only |
| DRAFT | SCHEDULED | teacher publish / scheduler | policy pinned; reveal pinned | — | yes |
| SCHEDULED | MATERIALIZING | system at opens_at − lead | — | chunks | no |
| MATERIALIZING | OPEN | system at opens_at | ≥ 1 student challenge | StudentChallenges AVAILABLE; deliveries | no |
| MATERIALIZING | CANCELLED | system | zero learners or zero questions | teacher informed | yes |
| OPEN | OPEN (extended) | staff | new due_at / closes_at later than current; whole assignment | non-terminal student challenges take new times; unsent reminder moved | yes |
| OPEN | CLOSED | system at closes_at | — | expiry; answer reveal; review period starts | no |
| DRAFT … OPEN | CANCELLED | staff | scope | §4.6 AC-4 | yes |
| any | edit pinned fields | — | **invalid** | — | — |

## 5.4 StudentChallenge (engagement)

| From | To | Trigger | Invalid | Side effects |
|---|---|---|---|---|
| — | MATERIALIZED | materialization | — | — |
| MATERIALIZED | AVAILABLE | opens_at | before opens_at | DeliveryRequested |
| AVAILABLE | OPENED | link exchange for this scope | WhatsApp READ | — |
| OPENED | STARTED | first attempt | — | pending reminder cancelled |
| STARTED | COMPLETED | all items submitted, or finished early (G10, not yet decided) | — | `ChallengeCompleted` |
| AVAILABLE / OPENED / STARTED | EXPIRED | closes_at | — | attempts ABANDONED |
| any non-terminal | CANCELLED | ASSIGNMENT_CANCELLED, ENROLLMENT_ENDED, LEARNER_MERGED, LEARNER_DELETED, STAFF, REINFORCEMENT_INVALIDATED | from COMPLETED or EXPIRED | grants revoked; deliveries and reminders cancelled |

The brief's engagement states (OPENED, STARTED, COMPLETED, EXPIRED) are the learner-facing part of this machine; MATERIALIZED, AVAILABLE and CANCELLED are system states that already exist in DM §9.4.

## 5.5 Delivery (Communication)

CREATED → QUEUED → SENDING → SENT → DELIVERED → READ; SENDING → RETRYING → SENDING; → FAILED; → EXPIRED; CREATED / QUEUED / RETRYING → **CANCELLED** (consent withdrawn, source cancelled; W4-C3). Status only moves forward by rank; out-of-order webhooks are ignored.

## 5.6 Reminder

Scheduled (as a delayed delivery request) → sent / skipped (started, completed, closed, no eligible channel, window passed) / cancelled. A due-time extension moves a scheduled reminder; it never creates a second one.

## 5.7 Late-work timing status (owned by Assessment; shown for context)

LATE_HELD → LATE_ACCEPTED (teacher accepts within 14 days); LATE_HELD → LATE_REJECTED (teacher rejects, reason TEACHER; or 14 days pass, reason HOLD_EXPIRED). LATE_ACCEPTED and LATE_REJECTED are terminal. Challenge supplies the window; it does not own these transitions (L-5).

# 6. Permissions and Tenant Boundaries

A teacher may act on a definition or assignment only if **every** target (cohort or learner) is inside their scope; content selected must be visible in their scope (their course's questions and organization-wide questions).

| Action | Owner | Admin | Teacher (org) | Teacher (course) | Teacher (cohort) |
|---|---|---|---|---|---|
| Create definition | ✓ | ✓ | ✓ | ✓ targets in own courses | ✓ targets in own cohort |
| Edit definition (future occurrences) | ✓ | ✓ | ✓ | ✓ if all targets in scope | ✓ if all targets in scope |
| Schedule, activate, pause, archive | ✓ | ✓ | ✓ | ✓ in scope | ✓ in scope |
| Edit or reschedule an assignment before opening; extend after opening (§4.6) | ✓ | ✓ | ✓ | ✓ in scope | ✓ in scope |
| Cancel an assignment | ✓ | ✓ | ✓ | ✓ in scope | ✓ in scope |
| View assignments and progress | ✓ | ✓ | ✓ | ✓ in scope | ✓ own cohort |
| Materialize | system only; staff can "open now" on a not-yet-open ad hoc assignment in scope | | | | |
| Resend a learner's challenge message | ✓ | ✓ | ✓ | ✓ in scope | ✓ own cohort |
| Staff-issued (copy/print) link | ✓ if enabled | ✓ if enabled | ✓ in scope if enabled | ✓ in scope if enabled | ✓ own cohort if enabled |
| Accept / reject late work | ✓ | ✓ | ✓ | ✓ in scope | ✓ own cohort |
| Choose grading policy (existing versions only) | ✓ | ✓ | ✓ | ✓ | ✓ |

Cohort-scoped teachers never act on assignments that also target cohorts outside their scope. Grading policy creation belongs to Wave 6. All records are tenant-owned; jobs carry the organization; grants and deliveries never cross organizations.

# 7. Data Ownership

| Data | Owner | Decision owner | Source of truth | Versioned / pinned | Deletion | Rebuild |
|---|---|---|---|---|---|---|
| ChallengeDefinition, Occurrence | Challenge | teacher / scheduler | challenge tables | definitions edited forward only | R1 | occurrences re-derivable from RRULE |
| ChallengeAssignment | Challenge | teacher / scheduler | challenge tables | pins grading policy, reveal, selection snapshot | R1 | not derived |
| StudentChallenge + frozen items | Challenge | materializer | challenge tables | items immutable | R1; learner deletion per Wave 10 | not derived (authoritative) |
| ReinforcementPlan | Challenge | Challenge (timing) | challenge tables | — | R1 | re-plannable from Learning items |
| Delivery, messages, webhook events | Communication | Communication | comms tables | — | R1 metadata, R5 bodies (30 days) | not derived |
| Grants, sessions | Identity | Identity | identity tables | — | R7 | not derived |
| Submission timing status | Assessment | teacher (late decision) | assessment tables | — | R2 | not derived |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Challenge → Content | A (read) | `SelectQuestionsForChallenge` | current published versions of non-archived questions |
| Challenge → Roster | A (read) | `ListActiveEnrollments`, learner status | targets, late joiners |
| Roster → Challenge | B | `EnrollmentStarted`, `EnrollmentEnded`, `LearnerMerged`, `LearnerDeactivated` | materialization, cancellation |
| Challenge → Evaluation | A (read) | grading policy active version id | pin at assignment creation |
| Challenge → Communication | B | `DeliveryRequested` (CHALLENGE, REMINDER, REINFORCEMENT, RESEND) | delivery |
| Communication → Challenge | B | `DeliveryFailed`, delivery status | fallback, teacher view |
| Communication → Identity | A | `IssueCapabilityGrant` | link at dispatch |
| Identity → Challenge | A | `RecordEngagement(OPENED)` on exchange | engagement |
| Assessment → Challenge | A | `GetAnswerableItem`, `RecordEngagement(STARTED / COMPLETED)` | answering |
| Learning → Challenge | B | `ReinforcementItemCreated`, `ReinforcementItemCancelled` | reinforcement |
| Challenge → Learning | A (read) | `RevalidateReinforcementItem` | revalidation (twice) |
| Challenge → Roster | A (restricted) | `ResolveLearners(pseudonyms)` | reinforcement targeting (SC3) |
| Challenge → Reporting | B | `ChallengeCompleted`, assignment and student challenge status events | dashboards |
| Tenancy → Challenge | B | `OrganizationSuspended / Reactivated` | pause scheduling and delivery (FD-2) |

No new module is introduced. New fields only: occurrence status (§5.2), cancel reason REINFORCEMENT_INVALIDATED (W4-C6), review-period grant expiry (W4-C2), late-rejection reason (W4-6). Responsibilities are unchanged: Content → frozen QuestionVersion; Challenge → assignment and materialization; Assessment → submission timing; Evaluation → result; Learning → learning meaning; Communication → provider delivery; Identity → access.

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Queue unavailable | Commands that enqueue jobs fail in the same transaction (nothing half-done); the scheduler retries on its next run; missed occurrences follow S-5 |
| Worker crash during materialization | Lease expires; chunk reruns; unique keys prevent duplicates |
| Duplicate scheduler execution | Per-definition lock + unique occurrence key; the second run does nothing |
| Materialization race (late joiner vs chunk) | Unique (assignment, learner); the loser does nothing |
| Assignment cancelled during materialization | M-5 |
| Provider timeout | Communication retries (RETRYING) with backoff; after the cap, FAILED → Challenge requests the next channel once (DL-4) |
| Provider duplicate / worker crash after successful send | A second message is possible (J-6); the provider message id reconciles status |
| Webhook duplicate | De-duplicated by provider event id |
| Webhook out of order | Status never moves backwards |
| WhatsApp unavailable | Deliveries retry, then fail over to email where eligible; never to SMS (W4-5) |
| Email unavailable | Retry; then FAILED; teacher sees the failure |
| Learner opens an expired or revoked link | Uniform "no longer valid" page; during the 14-day review period after close the link opens results read-only (W4-C2) |
| Capability replay | Allowed within device limit; beyond it, a one-time code is required |
| One-time-code abuse | 3 sends per 15 minutes per contact point; lockout after 5 wrong codes (Wave 2) |
| Consent withdrawn | DL-5; pending reminders cancelled |
| Assignment cancelled while messages are sending | Queued ones cancelled; in-flight ones may arrive; the link then shows "no longer valid" |
| Reminder races with learner starting | The reminder re-checks status in its dispatch transaction and is skipped if STARTED (R-3); a reminder already handed to the provider may still arrive |
| Organization suspended | No new occurrences, assignments or deliveries; open student challenges read-only; submitted work continues to be marked (FD-2) |

# 10. Privacy / Consent

- **Data sent to messaging providers:** contact value, learner or guardian first name, challenge title, due time and link. Never answers, scores or learning data. (EXISTING DM §14)
- **Channel consent** governs every message; **processing consent** is not involved in delivery. (ADR-019)
- **Minors:** recipients per W2-1; legal questions remain with **LG-3 and LG-4** (not decided here).
- **Withdrawal:** DL-5 and J-6 limitations.
- **Telemetry:** no names, contact values, tokens, question text or answers.
- **Deletion:** Wave 10; student challenges and deliveries of a deleted learner are handled by the registered purge handlers.

# 11. Audit / Observability

**Audited:** definition create, edit, activate, pause, archive; assignment create (staff), edit, reschedule, cancel, "open now"; missed occurrences; resend; staff-issued links (W2-2); deadline extensions; late-work accept, reject and hold expiry (LATE_REJECTED, HOLD_EXPIRED); reinforcement cancellations at revalidation (system, reason recorded).

**Metrics:**

| Metric | Purpose |
|---|---|
| Assignments by state; opened late; missed occurrences | assignment lifecycle |
| Materialization duration, failures, shortfalls (FIXED skipped, RULE empty) | materialization health |
| Delivery latency (AVAILABLE → SENT → DELIVERED) by channel | delivery performance |
| Delivery outcomes by channel and reason, including consent-blocked and no-reachable-contact | delivery success |
| Provider error rate by provider account | provider health |
| Link exchanges, exchange failures, device-limit triggers | access health |
| One-time-code sends, failures, lockouts | abuse and friction |
| Queue lag for P1 (delivery) | backlog |
| Reminders scheduled, sent, skipped by reason | reminder behavior |
| Student challenges expired vs completed per assignment | engagement |
| Reinforcement planned, cancelled at revalidation, delivered | reinforcement flow |

**Never in telemetry:** learner names, contact values, tokens, message bodies, question text, answers.

**Teacher visibility:** per assignment: prepared, delivered, opened, started, completed, expired, cancelled counts; per learner: delivery status and reason, engagement state, last activity, late-work items; missed or late-opened occurrences.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Question retired between assignment creation and materialization | Its current published version (if a newer one exists) is frozen; if the question is archived, it is skipped (SEL-3) | EXISTING |
| Question published v3 after some learners materialized v2 | Early learners keep v2; late joiners get v3 | EXISTING (binding rule 3) |
| Definition edited while an assignment is open | The open assignment is unchanged (CD-4) | PROPOSED DEFAULT |
| Two cohorts, learner in both, both targeted | One student challenge per assignment per learner | EXISTING |
| Same definition targets cohort A and a learner already in A | Still one student challenge | EXISTING |
| Due time before the reminder window when created (short challenge) | No reminder | PROPOSED DEFAULT |
| Challenge opened by the guardian's phone for a minor | Session is the learner's (link bound to the learner); the guardian can answer on the learner's behalf in practice | EXISTING; product note |
| Offline submission received after answers were revealed | LATE_HELD with a flag for the teacher (L-7) | PROPOSED DEFAULT |
| Learner transfers mid-challenge after starting | Old cohort's student challenge CANCELLED; submitted answers keep their results; new cohort's open assignments materialize | EXISTING |
| Reinforcement item cancelled before creation event arrives | Challenge keeps a tombstone and ignores the late event | EXISTING (DM §20) |
| Reinforcement becomes invalid after the message was sent | At opening it was valid; later invalidation does not retract the open challenge (PROPOSED DEFAULT); new items follow normal rules | PROPOSED DEFAULT |
| Organization changes quiet hours | Affects future message timing only | PROPOSED DEFAULT |
| Daylight-saving gap at 02:30 | Moves to 03:00 (S-3) | PROPOSED DEFAULT |
| No contact point for a learner | No message; teacher sees "no reachable contact" | EXISTING |
| Guardian link ends for a minor with an open challenge | Learner-subject grants for that learner issued to that guardian's contact points revoked (LA-6a); grants for the guardian's other linked learners untouched; a new link can be sent to another eligible recipient | LOCKED (W2-C4, W4-C7) |
| Deadline extended after some learners expired | They stay EXPIRED; the rest take the new times (AC-2) | LOCKED (W4-4) |
| Assignment cancelled after some learners submitted | Their submissions are kept, marked and counted (AC-4) | LOCKED (W4-3) |
| Late work held on a cancelled assignment | Still decided under L-6; LATE_REJECTED after 14 days without acceptance | LOCKED (W4-3, W4-6) |
| Reinforcement topic with only 2 eligible questions | Those 2 are sent; no repeats added (RF-6) | LOCKED (W4-1) |
| Reinforcement topic with no eligible question (all answered in the last 14 days) | Repeats drawn only from questions the learner previously got wrong; repeat-exposure factor applies (RF-6) | LOCKED (W4-1) |
| No eligible question and no previously wrong question | Empty selection; no reinforcement student challenge (RF-6, SEL-8) | PROPOSED DEFAULT |
| Submission after due, before close | Accepted normally; shown as "after due"; not late (CA-4) | LOCKED (W4-2) |

# 13. Decisions (locked at closure)

No Wave 4 product decision remains open.

| ID | Locked decision | Applied in |
|---|---|---|
| W4-1 | Reinforcement selection preserves Part 1 G4 exactly: select **up to 3** published questions on the target topic (topic weight ≥ 0.5), excluding questions the learner answered in the previous 14 days. If eligible questions exist, only they are used: 1 or 2 eligible questions means 1 or 2 are sent, never topped up with repeats. Only when the eligible pool is empty are repeats allowed, and then **only from questions the learner previously got wrong** on the target topic; each repeated question receives the existing D9 repeat-exposure factor. Grading policy: the course's default; the organization default when the topic is organization-wide. The earlier proposal to top up a short pool with previously missed questions is **not** adopted. | RF-6, SEL-10 |
| W4-2 | due_at may be earlier than closes_at; submissions after due and before close are accepted normally, shown to teachers as "after due", never LATE_HELD; closes_at defaults to due_at; answer-revealing content waits until closes_at. | CA-4, L-3, W4-C1 |
| W4-3 | Submitted work is retained when an assignment is cancelled; marking continues; results count as normal learning evidence. Cancellation stops future activity and never erases submitted work. | AC-4 |
| W4-4 | After opening, due_at and closes_at may only be extended, for the whole assignment; no per-learner overrides in V1; expired student challenges stay expired; pending unsent reminders move with the new due time; no second reminder is created. | AC-2, AC-3, R-4 |
| W4-5 | No SMS in V1: no SMS challenge messages, no SMS one-time codes, no SMS fallback. The SMS provider abstraction is kept for future use. | DL-2, LA-8, §2 |
| W4-6 | LATE_HELD is held for 14 days; teacher acceptance before then → LATE_ACCEPTED; a teacher rejection → LATE_REJECTED (reason TEACHER); no acceptance within 14 days → LATE_REJECTED (reason HOLD_EXPIRED). LATE_REJECTED is the single terminal late-work outcome; LATE_REJECTED_BY_TEACHER is not used. Never-accepted late work contributes no learning evidence. D1 ordering and FIRST_AND_FINAL are preserved. | L-6, §5.7 |

## Legal / compliance gates

LG-3 (minors) and LG-4 (consent acquisition, first contact) govern who may be messaged and on what basis; LG-5 (withdrawal) governs retention. No new legal gate is introduced by this wave. LG-1 to LG-6 are carried forward.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| Entity separation §1 | DM §9, J2–J3 | EXISTING |
| CD-1 … CD-3, CD-7 | DM §9.2–9.3, ADR-022 | EXISTING |
| CD-4 … CD-6 | new | PROPOSED DEFAULT |
| S-1, S-2 | ADR-022 | EXISTING |
| S-3 … S-6 | new | PROPOSED DEFAULT |
| CA-1, CA-3, CA-5 | ADR-008, ADR-011, ADR-020, DM §9 | EXISTING |
| CA-2 | C7, C7-A | LOCKED |
| CA-4 | ADR-020 + W4-2 | LOCKED |
| SEL-1 | W3-C2 | LOCKED |
| SEL-2, SEL-3, SEL-6, SEL-9 (items, seed) | ADR-008, DM §9, J3, Wave 3 CC-2/CC-4 | EXISTING |
| SEL-4 (0.5), SEL-5, SEL-7, SEL-8, SEL-9 (pool hash), SEL-10 | new | PROPOSED DEFAULT |
| M-1 … M-3, M-5, M-7 | DM §9.3, §24–26, ADR-022 | EXISTING |
| M-4 | new | PROPOSED DEFAULT |
| AC-1 | new | PROPOSED DEFAULT |
| AC-2 … AC-4 | DM §24, W4-3, W4-4 | LOCKED |
| M-6 | Wave 3 rule 3 | LOCKED |
| L-1 … L-3, L-5 | ADR-020, X10, DM §10 | EXISTING |
| L-4 | late-held decision, D1 | LOCKED |
| L-6 | X10, W4-6 | LOCKED |
| LA-1 … LA-10 | ADR-016, Wave 2 (W2-2, W2-3, W2-C3), SC1 | EXISTING / LOCKED; LA-5 W4-C2; LA-6a W4-C7; LA-8 W4-5 |
| DL-1 … DL-10 | ADR-004, ADR-013, ADR-019, DM §14, J4, W2-1, J-6, SC2, W4-5 | EXISTING / LOCKED; DL-4, DL-7 limit PROPOSED |
| R-1, R-7 | G5 as carried forward in the Wave 4 brief | LOCKED |
| R-2, R-3, R-5, R-6 | new / ADR-019 | PROPOSED DEFAULT / EXISTING |
| R-4 | W4-4 | LOCKED |
| RF-1, RF-5 | D13, C11, D9, D16 | LOCKED |
| RF-2, RF-3 | DM §9.3, §25.8, SC4 | EXISTING |
| RF-4 | W4-C5 | LOCKED |
| RF-6 | G4, W4-1 | LOCKED |
| RF-7 | new | PROPOSED DEFAULT |
| §4.12 | DM §9.3, Wave 2 E-4/E-5/L-7, Wave 1 R-9 | EXISTING |

# 15. Behavioral Acceptance Criteria

**Definitions, scheduling, assignments**
1. Editing a recurring definition changes only occurrences whose assignment has not been created; no existing assignment's pinned fields change.
2. Two scheduler instances never create two assignments for the same definition and local occurrence time.
3. A weekly 16:00 challenge opens at 16:00 local time on both sides of a daylight-saving change.
4. An occurrence missed while the scheduler was down opens late if its close time has not passed, and is recorded as MISSED otherwise.
5. An assignment pins its grading policy version and reveal policy at creation; later policy changes do not affect it; no LearningPolicyVersion is stored on it.

**Selection and materialization**
6. Only current published versions of non-archived questions are selected.
7. A FIXED question archived before materialization is skipped and the teacher informed; if nothing remains, the assignment does not open.
8. No question appears twice in one student challenge.
9. For RULE_BASED selection, the stored seed, rule snapshot and frozen items are recorded for every student challenge.
10. Re-running a materialization chunk creates no duplicate student challenges; a late joiner racing the chunk ends with exactly one.
11. A student challenge's frozen versions never change after materialization, whatever happens to content, roster or policies.
12. Cancelling an assignment during materialization stops further chunks and cancels any student challenges already created.

**Access and delivery**
13. A WhatsApp READ status never sets a student challenge to OPENED; only a link exchange does.
14. Link-preview GETs never change state or consume a grant.
15. A reminder link does not invalidate the original link; four devices on one challenge require a one-time code.
16. For 14 days after closes_at, the link opens results read-only and allows no answering and no new attempts; after that it shows "no longer valid".
17. No message is sent without channel consent at queue time and at send time; consent withdrawn between them cancels the delivery.
18. For MINOR and UNKNOWN learners, challenge messages go to guardian contact points by default.
19. A permanently failed WhatsApp delivery triggers one email attempt when email is eligible.
20. Staff resends are limited to 3 per student challenge and each is audited.
21. Message bodies stored by Challenge Me never contain a link token.

**Reminders**
22. At most one reminder per student challenge is sent, 24 hours before due, only if not started, only in allowed hours, and never after due.
23. A learner who starts after the reminder was scheduled does not receive it, unless it had already been handed to the provider.
24. A due-time change reschedules an unsent reminder and never causes a second reminder.
25. A reminder never creates a student challenge.

**Late work**
26. A submission received after close beyond grace is LATE_HELD and contributes nothing until accepted.
27. Accepting late work does not change attempt order; the accepted attempt keeps its original server submission position.

**Reinforcement**
28. No reinforcement assignment is created or delivered unless Learning created a reinforcement item and revalidation succeeded at planning and at opening.
29. A reinforcement item invalidated before opening results in a CANCELLED student challenge (REINFORCEMENT_INVALIDATED) and no message.
30. A declining trajectory or a learning signal alone never produces a reinforcement challenge.

**Cohort changes and scope**
31. A learner who leaves a cohort has their unfinished challenges for it cancelled; completed challenges and submitted work remain.
32. A cohort-scoped teacher cannot edit, cancel or resend for an assignment that also targets another cohort.
33. A learner transferred between cohorts receives the new cohort's open assignments and keeps history from the old one unchanged.

**Wave 4 decisions**
34. Reinforcement selects up to 3 target-topic questions (weight ≥ 0.5) the learner has not answered in the previous 14 days; with 1 or 2 eligible questions it sends only those and adds no repeats (W4-1).
34a. When no eligible question exists, reinforcement repeats only questions the learner previously got wrong on the target topic, never a question they got right, and each repeat carries the D9 repeat-exposure factor (W4-1).
35. A reinforcement assignment pins the course's default grading policy, or the organization default for an organization-wide topic (W4-1).
36. A submission after due_at and before closes_at is accepted with ON_TIME timing status, marked and counted normally, and shown to teachers as "after due" (W4-2).
37. No correct answer, explanation, model solution or other answer-revealing content is shown before the assignment's closes_at (W4-2, W4-C1).
38. Cancelling an assignment keeps every submission already made; marking continues and the results count as learning evidence (W4-3).
39. After opening, a request to move due_at or closes_at earlier, or to change them for one learner, is refused; an extension applies to every non-terminal student challenge and leaves EXPIRED ones expired (W4-4).
40. Extending due_at moves an unsent reminder to the new due time; a learner already reminded gets no second reminder (W4-4).
41. No SMS is sent for any purpose, including one-time codes and fallback, and no SMS provider call is made in V1 (W4-5).
42. A LATE_HELD submission not accepted within 14 days becomes LATE_REJECTED with reason HOLD_EXPIRED; a teacher rejection produces LATE_REJECTED with reason TEACHER; in both cases it is never evaluated and contributes no learning evidence, and no LATE_REJECTED_BY_TEACHER status exists (W4-6).
43. The weekly reinforcement cap is enforced only by Learning at item creation; Challenge contains no frequency-cap check (W4-C5).
44. When a guardian link ends, that learner's grants issued to that guardian's contact points are revoked, while the same contact point's grants for another learner still linked to that guardian keep working (W4-C7).

---

# Wave 4 Closure

**Status: APPROVED and CLOSED.**

## Binding responsibilities (preserved; no module takes over another's)

| Module | Owns |
|---|---|
| Content | the frozen QuestionVersion (the five Wave 3 Content rules) |
| Challenge | definitions, assignments, selection, materialization, timing of delivery and reinforcement |
| Assessment | submission timing status, including LATE_HELD, LATE_ACCEPTED, LATE_REJECTED |
| Evaluation | results |
| Learning | learning meaning, reinforcement need and the reinforcement frequency cap |
| Communication | provider delivery, delivery status, channel retries |
| Identity | access: grants, sessions, one-time codes |

ChallengeDefinition → ChallengeAssignment → StudentChallenge remain three separate entities. D13 (trajectory and signals never independently trigger reinforcement), D9/D16 (reinforcement answers are normal evidence; repeats carry the repeat-exposure factor) and Wave 1 J-6 (no exactly-once claim at outside providers) are preserved.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W4-1 | **Approved with correction; exact G4 preserved.** Up to 3 published target-topic questions (weight ≥ 0.5), excluding questions answered in the previous 14 days. If eligible questions exist, use only them (1 or 2 means 1 or 2; no top-up). Only if the eligible pool is empty, allow repeats specifically from questions the learner previously got wrong; repeats receive the D9 repeat-exposure factor. Grading policy = course default; organization default for organization-wide topics. |
| W4-2 | due_at may be earlier than closes_at; submissions between due and close are accepted normally, shown as "after due", never LATE_HELD; closes_at defaults to due_at; answer-revealing content waits until closes_at. |
| W4-3 | Submitted work on a cancelled assignment is kept; marking continues; results count as normal learning evidence. Cancellation stops future activity; it never erases submitted work. |
| W4-4 | After opening, due_at and closes_at may only be extended, for the whole assignment; no per-learner overrides in V1; expired student challenges stay expired; pending unsent reminders move with the new due time; no second reminder is created. |
| W4-5 | No SMS in V1: no SMS challenge messages, no SMS one-time codes, no SMS fallback. The SMS provider abstraction is kept for future use. |
| W4-6 | LATE_HELD for 14 days; acceptance before then → LATE_ACCEPTED; teacher rejection → LATE_REJECTED (reason TEACHER); expiry → LATE_REJECTED (reason HOLD_EXPIRED). LATE_REJECTED_BY_TEACHER is not used, because expiry is not a teacher decision. Never-accepted late work contributes no learning evidence. D1 ordering and FIRST_AND_FINAL preserved. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W4-C1 | Correct answers, explanations, model solutions and equivalent answer-revealing material stay hidden until closes_at, never only due_at. |
| W4-C2 | STUDENT_CHALLENGE grants stay valid 14 days after closes_at, read-only: no answering, no new attempts, results viewable. |
| W4-C3 | CANCELLED is kept as a delivery state. |
| W4-C4 | Resolved by W4-5: no SMS in V1; the abstraction is kept. |
| W4-C5 | Learning owns the reinforcement frequency cap; Challenge owns timing, delivery window and channel constraints and does not enforce the pedagogical cap. |
| W4-C6 | REINFORCEMENT_INVALIDATED is the StudentChallenge cancel reason when reinforcement fails revalidation. |
| W4-C7 | On `GuardianLinkEnded`, revoke learner-subject grants for the affected learner issued to the affected guardian's contact points; unrelated grants on the same contact point (other learners still linked) are not revoked. |

## 3. Legal / compliance gates (carried forward)

LG-1 to LG-6 remain open, unchanged. Wave 4 introduces no new gate. LG-3, LG-4 and LG-5 continue to govern recipients for minors, first contact and withdrawal.

## 4. Remaining non-blocking proposed defaults

Definition edits apply forward only (CD-4); pause without backfill (CD-5); archive leaves assignments (CD-6); daylight-saving gap and overlap handling (S-3); occurrences 14 days ahead, assignment at opens − 60 minutes (S-4, M-1); missed-occurrence handling (S-5); quiet hours affect messages only (S-6); topic qualification weight 0.5 for normal RULE_BASED selection (SEL-4); merged-topic resolution in rules (SEL-5); no duplicate question per challenge (SEL-7); RULE shortfall handling (SEL-8); candidate-pool hash (SEL-9); no recency exclusion in normal challenges (SEL-10); per-learner all-or-nothing materialization (M-4); pre-opening edits allowed (AC-1); reveal-after-late flag for teachers (L-7); channel fallback once, WhatsApp to email (DL-4); resend limit 3 (DL-7); reminder quiet-hours, re-check and failure handling (R-2, R-3, R-6); reinforcement window 72 hours with no reminders (RF-7); INACTIVE learners keep open challenges without links; reinforcement invalidated after opening is not retracted; quiet-hours changes apply forward only.

**Remaining proposed default under W4-1:** if the eligible pool is empty and the learner has no previously wrong question on the target topic, the selection is empty and no reinforcement student challenge is created (SEL-8 applied). Whether an answer was wrong is taken from Evaluation's recorded result.

## 5. Domain Model and ADR reconciliation items

| Document | Section | Change |
|---|---|---|
| DM | §9.2 `challenge_occurrence` | Add status PLANNED, ASSIGNMENT_CREATED, MISSED, SKIPPED. |
| DM | §9.2 `student_challenge.cancel_reason` | Add REINFORCEMENT_INVALIDATED (W4-C6). |
| DM | §9.2–9.3 `challenge_assignment` | closes_at defaults to due_at and may be later (W4-2); after opening, extend-only for the whole assignment, no per-learner overrides, audited (W4-4); record occurrence lateness. |
| DM | §9.2 student challenge / items | Selection record: rule snapshot, seed, candidate-pool size and hash (SEL-9). |
| DM | §9.3 / §25.8 reinforcement planning | Selection per W4-1 (exact G4): up to 3 eligible questions, no top-up; repeats only from previously wrong questions when the eligible pool is empty; grading policy = course default, organization default for organization-wide topics. |
| DM | §10 `submission.timing_status`, dm4 Submission state table | Replace LATE_REJECTED_BY_TEACHER with LATE_REJECTED plus `late_rejection_reason` (TEACHER, HOLD_EXPIRED) in the enum and both transitions; hold period 14 days locked (W4-6); "after due" is a display derived from due_at, not a timing status (W4-2). |
| DM | §5.2 `capability_grant` | STUDENT_CHALLENGE grants expire at closes_at + 14 days, read-only after close; expiry moves with an extension (W4-C2, W4-4). |
| DM §10.4, ADR-020 | RevealPolicy | Answer-revealing content waits for closes_at; AFTER_DUE_DATE is interpreted as after close (W4-C1). |
| DM | §12.2 / §9.3 | Reinforcement frequency cap enforced only by Learning at item creation; Challenge enforces timing, window and channel constraints (W4-C5). |
| DM §14, ADR-016 | channels, OtpSender | No SMS channel or SMS OtpSender active in V1; the adapter interface is retained for later (W4-5). |
| DM | §5.5 / §20 | `GuardianLinkEnded` revocation scope per W4-C7. |
| DM | §21 job catalog | Reminder scheduling (with move on extension); review-period expiry; missed-occurrence handling; late-hold expiry at 14 days. |
| Carried forward (unchanged) | Wave 2 and Wave 3 reconciliation items | Not reopened. |

**STOP — Wave 4 closed. Wave 5 not started.**
