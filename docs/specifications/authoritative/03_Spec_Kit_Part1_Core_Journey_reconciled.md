# Challenge Me — V1 Spec Kit — Part 1: Glossary, Lifecycle & Core Journey

> FROZEN 2026-09-30 (reconciled revision, including the DI-2 wording alignment in J9). Changes require formal change control.
>
> Status: Reconciled revision (cross-wave reconciliation after Wave 11). Approved Wave 2–11 decisions and SC1–SC4 applied in place with tags such as [W5-2]; original proposals are kept where a checkpoint question is shown, with the resolving decision noted. See Section 9.
>
> Revision note: J10 and J11 updated for Wave 8 closure (evidence units per D1; reinforcement rule W8-1; unplannable reinforcement W8-C2; cap postponement W8-C3).
>
> Sources: Implementation Architecture V1.3 (Arch), ADR set V1.3 (ADR-nnn), Remediation Report V1.3, Domain Model & Implementation Contract V1.3 (DM §n; corrections X1–X16).

# 1. What the Spec Kit Is

The Spec Kit describes **what Challenge Me does** in each important workflow: what the teacher, learner, guardian or system does, what the system must check, what changes, what the user sees, and what happens when something goes wrong. It is the behavioral contract between the product owner and the engineering team.

It sits between the domain model and the code:

```
Architecture (how the system is built)
  -> Domain Model (what data and rules exist)
    -> Spec Kit (what the system does, step by step)    <- this document
      -> PostgreSQL / Prisma schema
        -> Implementation
```

It is not an architecture document, a database design or code. When a spec needs a technical term, it points to the Domain Model section that defines it.

**This is Part 1.** It contains the glossary, the core lifecycle, and the complete **core journey**: from a teacher publishing a question to the teacher's dashboard showing the learner's result. Writing this journey first surfaced four places where the approved documents conflict and eight behaviors nobody has decided yet (Section 6). The remaining ~95 capability specifications will be written after you review this part.

# 2. How to Read It

Every journey stage starts with **plain language** (who wants what, and what happens), followed by the **technical contract** for engineers and QA.

| Label | Meaning |
|---|---|
| DECIDED | Comes from the approved V1.3 documents. Not reopened here. |
| PROPOSED DEFAULT | A behavior the specification needs; the author proposes it. Engineering can build it, but the product owner may change it. Each one says who decides, by when, and what changes if it changes. |
| OPEN — PRODUCT OWNER | Needs your decision. The spec shows the proposed default so work is not blocked. |
| OPEN — LEGAL | Needs legal confirmation, usually per country. |
| SPEC CORRECTION | Two approved documents conflict, or an approved rule would cause a visible bug. The smallest fix is stated. |
| ARCHITECTURE GAP | The architecture cannot support a required behavior. **None were found in the core journey.** |

**Product Owner Checkpoints** appear at the end of each group of stages. They are short, plain questions. Answering them is the main output of this review.

**Worked example used throughout.** Ms. Salma teaches a Grade 10 mathematics cohort ("10-B") at a tutoring center. Youssef is a learner in 10-B; his mother's phone is the family's WhatsApp number, which his younger sister Nour (also a learner) shares.

# 3. Glossary in Plain English

| Term | Plain meaning |
|---|---|
| Organization | A customer: a tutoring center, test-prep company or training provider. Everything in Challenge Me belongs to exactly one organization. |
| Staff | People who work for the organization and sign in with a normal account: owners, admins, teachers. |
| Role and scope | What a staff member may do (role) and where (scope): the whole organization, one course, or one cohort. A teacher scoped to cohort 10-B cannot see cohort 10-C. |
| Learner | A student. Learners do not need a password account. |
| Guardian | A parent or responsible adult linked to one or more learners. |
| Contact point | A phone number or email address. It is **not** a person: one family phone can be linked to several learners and a guardian. |
| Course / Cohort | A course is a subject offering (e.g. "Grade 10 Math"); a cohort is a group of learners taking it together (e.g. "10-B"). |
| Enrollment | A learner's membership in a cohort. |
| Question | A logical question ("the quadratic equation question"). It can have several versions over time. |
| Question version | One exact, frozen copy of a question: the text the learner sees plus everything used to mark it (answer key, rubric, tests, hints). Once published it never changes; edits create a new version. |
| Response type | What kind of answer is expected: single or multiple choice, true/false, number, short text, long answer, structured answer, code, or code explanation. |
| Response specification | The part of a question version that says what a valid answer looks like and how it is marked. |
| Rubric | Criteria and score levels a teacher (or AI) uses to judge an open answer. |
| Test suite | For code questions: the test cases, the teacher's reference solution, and known-wrong solutions used to check the tests themselves. |
| Hint set | An approved, ordered list of hints for a question. In V1 learners only ever see approved hints; the AI never invents hints live. |
| Challenge | A set of questions sent to learners. **Challenge definition** = the reusable plan (e.g. "every Sunday, 5 questions on algebra"); **Assignment** = one specific sending (e.g. "Sunday 5 Oct"); **Student challenge** = one learner's personal copy of that assignment, with its questions frozen. |
| Grading policy | The organization's rules for scoring: retries, hint penalties, how AI and automatic scoring combine, when AI results are confirmed. The version in force is fixed when an assignment is created. |
| Reveal policy | What a learner may see after answering (score, feedback, correct answer, explanation) and when. Fixed per assignment. |
| Capability link | A private link sent to a learner (or guardian). Opening it gives access to exactly one thing, such as one student challenge, without a password. |
| One-time code (OTP) | A 6-digit code sent to a learner's verified phone or email to unlock more than one challenge (e.g. their history). |
| Attempt | One try at one question. The grading policy decides how many tries are allowed. |
| Submission | The learner's final answer for an attempt. Exactly one per attempt; it is saved before any marking starts. |
| Draft | Work in progress, saved automatically. Drafts are never marked. |
| Practice run | Running code against the visible tests before submitting. Never marked. (X9 resolved: yes, 20 per attempt, 100 per learner per day [W5-1, W7-C3]) |
| Evaluation | One marking of one submission. Once it has a result, the result never changes; a new marking creates a new evaluation. |
| Evaluation run | One step of marking, such as "automatic check" or "AI rubric scoring" or "run the code". An evaluation may have several. |
| Current result (evaluation head) | The single evaluation that currently counts for a submission. Only one can count at a time. |
| Deterministic marking | Rule-based marking with a definite answer (choice matched, number within tolerance, code passed tests). It owns objective correctness. |
| Semantic AI marking | AI judging whether a short text answer means the same as an accepted answer, used **only** when rule-based matching cannot decide. |
| AI rubric marking | AI scoring an open answer against a rubric's quality criteria. |
| Confidence | A score from 0 to 1 that Challenge Me calculates about an AI result (from agreement between runs, whether the AI's quoted evidence really appears in the answer, and the model's measured accuracy). The AI's own claim of confidence is ignored. |
| Provisional / Confirmed | Provisional = a result shown but not yet final. Confirmed = final unless a teacher changes it or a regrade replaces it. |
| Needs review | A result that a teacher must look at before it counts fully. |
| Override | A teacher replacing the current result with their own. Teacher decisions always outrank machine results. |
| Human-locked | A result a teacher has authored or confirmed. Automated processes can never silently replace it. |
| Dispute | A learner, guardian or staff member asking for a result to be looked at again. |
| Regrade | Re-marking many submissions at once, usually because a key or rubric was fixed. |
| Learning observation | What Challenge Me records about a learner from one submission's current result: score, topics, mistakes, whether hints were used. When the result changes, the observation is replaced, not added to. |
| Topic state | Challenge Me's current summary of a learner on a topic: Strong, Developing, Needs practice, or Not enough evidence. Always recalculated from observations. |
| Learning policy | The organization's rules for turning observations into topic states and deciding when practice is needed. |
| Reinforcement | Extra practice the system schedules when a learner needs it. **Learning** decides *what* needs practice; **Challenge** decides *when and how* it is sent, after checking it is still needed. |
| Channel consent | Permission to message a contact point on a channel for a purpose (e.g. WhatsApp challenge messages). |
| Processing consent | Permission to process a learner's data for a purpose (e.g. AI marking, guardian reports). Recorded per learner, not per phone. |
| Budget pool | The organization's allowance for costly services (AI marking, AI generation, messaging, code execution, storage). Running out never loses student work. |
| Review queue | Teachers' list of items needing a human decision. |

---

# 4. The Core Challenge Me Lifecycle

```
TEACH        Teacher runs a session (outside Challenge Me)
PRACTICE     Teacher publishes questions and schedules a challenge
RESPOND      Learner opens a private link, answers, submits
EVALUATE     Rules, AI or code execution mark the answer; teacher reviews when needed
MEASURE      Each result becomes a learning observation; topic states are recalculated
REINFORCE    If a learner needs practice, a reinforcement item is created,
             re-checked, and delivered as a follow-up challenge
UNDERSTAND   Teacher and owner see results and topic states on dashboards and reports
TEACH BETTER Teacher adjusts the next session
```

**The core chain of concepts (preserved exactly, DM §4):**

```
Question -> QuestionVersion -> ResponseSpecification -> Response (Submission)
  -> EvaluationPlan -> EvaluationRun -> Evaluation -> ResponseEvaluationHead
    -> Learning Observation -> TopicState -> ReinforcementItem
```

**Four rules that shape every stage:**

1. **Student work is saved first.** A submission is stored before any marking begins. Nothing (an AI outage, a budget limit, a missing consent) can lose it. (Arch §11, ADR-021)
2. **One result counts at a time, and teachers win.** Every submission has exactly one current result. Machine results never silently replace a teacher's decision. (ADR-011, X8)
3. **Rules own correctness; AI owns quality.** If rule-based marking decided an answer is right or wrong, AI can never change that. AI decides correctness only for short text that rules could not decide, and those results are never instantly final. (ADR-015, X2)
4. **Progress is recalculated, not accumulated.** When a result changes, the learner's topic state is rebuilt from the current results, so corrections never leave "ghost" marks behind. (ADR-014)

# 5. End-to-End Core Journey

## 5.0 Journey overview

| Stage | What happens | Capability specs covered |
|---|---|---|
| J1 | Teacher creates and publishes a question | SPEC-012, 019, 020 |
| J2 | Teacher creates and schedules a challenge | SPEC-023, 024, 025 |
| J3 | Challenge Me prepares each learner's copy | SPEC-026 |
| J4 | Challenge Me sends the challenge link | SPEC-027, 061, 062, 063 |
| J5 | Learner opens the link | SPEC-030, 031, 033 |
| J6 | Learner starts, answers, uses hints, drafts save | SPEC-034, 036, 037 |
| J7 | Learner submits | SPEC-038, 041 |
| J8 | Challenge Me marks the answer | SPEC-042, 043, 044, 045, 046 |
| J9 | The result becomes provisional, confirmed or reviewed; learner sees it | SPEC-035, 047, 048, 049, 050, 054 |
| J10 | Result becomes a learning observation; topic state updates | SPEC-055, 056, 057 |
| J11 | Reinforcement is created, re-checked and delivered | SPEC-029, 058, 059, 060 |
| J12 | Teacher dashboard shows the result | SPEC-085 |
| JV | Journey variants: override, slow AI, no AI consent, budget exhaustion, late work, result changes after it was seen | SPEC-040, 051, 052, 053, 093 |

**The story in one paragraph.** Ms. Salma publishes three questions on quadratic equations: a multiple-choice question, a short-text question ("What is the name of b² − 4ac?"), and a two-line explanation question marked by rubric. She schedules a Sunday challenge for cohort 10-B. On Sunday at 4 pm Challenge Me prepares a personal copy for each of the 24 learners and sends each a WhatsApp message with a private link. Youssef opens his link, answers, uses one hint on the explanation question, and submits. The multiple-choice answer is marked immediately. His short answer "the discriminant" matches the key immediately; had he written "the thing that tells you how many roots", AI would have judged its meaning and the result would stay provisional until confirmed. His explanation is scored by AI against the rubric twice; the two runs agree and the evidence checks out, so the result is provisional and will confirm itself in 48 hours unless someone disputes it. Each result becomes a learning observation; Youssef's "Discriminant" topic moves to Developing, his "Solving quadratics" topic moves to Needs practice, and a reinforcement item is created. On Tuesday Challenge Me re-checks that he still needs practice (he does), and sends a short follow-up challenge. Ms. Salma's dashboard shows 10-B's completion, scores and topic map throughout.

## J1 — Teacher creates and publishes a question

**Purpose.** Put a question into the question bank in a frozen, approved form that can be sent to learners and marked reliably.

**Actors.** Teacher (author), teacher/admin with approval rights (approver). AI assistance is covered in SPEC-013 to 016 and is optional here.

**User story.** *As a teacher, I want to write a question with its answer key, rubric and hints, have it checked, and publish it, so that I can use it in challenges and trust that it is marked the same way for everyone.*

**Happy path (plain language).**
1. Ms. Salma writes the question text, picks the response type and enters what counts as correct (answer key, accepted alternatives, a rubric for open answers, test cases and a reference solution for code, optional hints).
2. She tags it with topics (e.g. 60% "Discriminant", 40% "Quadratics").
3. She submits it for approval. An approver reviews and approves it. (If the organization allows direct publishing, she can publish her own question in one step.)
4. She publishes it. From now on this exact version never changes. If she later fixes a typo in the answer key, that creates version 2; learners who already received version 1 keep version 1.

**System behavior.**
- Creates `Question` and a `QuestionVersion` in DRAFT; rubric, test suite and hint set are separate versions pinned into the bundle at publish (DM §8.1).
- Publishing checks: every pinned rubric/test suite/hint set version is published; for code questions, the test suite has passed validation (reference solution passes all tests; every known-wrong variant fails at least one); topic weights sum to 100%; response specification is valid for its type.
- On publish, computes whether the version is *evaluation-compatible* with the previous published version (student-visible content unchanged; DM §8.2) and sets it as the question's current published version.

**Preconditions.** Staff member has an active membership with `content.author` (write) and `content.approve`/`content.publish` (approve/publish) in the question's course scope (DM §5.4).

**Inputs and validation.**

| Input | Validation |
|---|---|
| Response type | one of the nine V1 types |
| Student content (text, options, media, visible tests) | required fields per type; media uploaded and malware-scanned |
| Response specification | per type: e.g. choice key exists among options; numeric tolerance ≥ 0 and units; short text mode CLOSED or OPEN_SEMANTIC with at least one accepted answer; code language from the approved list |
| Rubric version | criteria weights sum to 1; each criterion mapped to a score component |
| Test suite version (code) | ≥ 1 visible and ≥ 1 hidden test (PROPOSED DEFAULT); reference solution; ≥ 1 known-wrong variant |
| Topic weights | topics exist in the organization; weights sum to 1 |

**State changes.** QuestionVersion DRAFT → IN_REVIEW → APPROVED → PUBLISHED (or DRAFT → PUBLISHED with direct publish). Question.current_published_version set. (DM §8.4)

**Synchronous work.** Validation, state change, compatibility calculation. **Asynchronous work.** Test suite validation runs code in the sandbox (SPEC-017, 075); a ReviewTask is created for approval; `QuestionVersionPublished` event.

**External providers.** Only for code questions: the reference solution and known-wrong variants are executed by the code execution provider during validation. No learner data leaves.

**Authorization and tenant boundary.** Authoring and approval are scoped to the question's course (or organization-wide questions for org-scoped roles). Questions belong to the organization, not the author.

**Idempotency and concurrency.** Two people publishing two versions of the same question at the same moment are serialized; the later one becomes current. Editing a published version is refused: a new version is created instead.

**Failure behavior.**

| Case | Behavior |
|---|---|
| Validation failure | publish refused with the specific reason (e.g. "Test suite not validated") |
| Test validation fails | suite marked VALIDATION_FAILED with per-test results; teacher fixes tests or reference solution |
| Sandbox provider down | validation waits and retries; question cannot be published until validated |
| Not authorized | refused; nothing changes |

**User-facing result.** Teacher sees version number, status, and whether the new version is "compatible" (allowed as a regrade target for learners who saw the previous version).

**Events / jobs / notifications.** `QuestionVersionPublished`; `ValidateTestSuite`; approval ReviewTask. No learner notifications.

**Audit.** Submit-for-approval, approve, reject, publish, retire, with actor and version.

**Privacy.** No learner data. Answer keys, hidden tests and reference solutions are protected material and never reach any learner screen (DM §8.5).

**Acceptance criteria.**
- A published question version cannot be modified by any path; edits create a new version.
- A code question cannot be published unless its reference solution passes all tests and each known-wrong variant fails at least one.
- A learner-facing view of the question contains none of: answer key, accepted alternatives, wrong-answer list, tolerance, rubric, hidden tests, reference solution, explanation (before reveal).
- `compatible_with_previous` is false whenever the prompt, options, media, response input shape or visible tests change.

**Test scenarios.** Publish each response type; publish with an unpublished pinned rubric (refused); edit a published version (refused; new draft offered); code suite where a known-wrong variant passes every test (refused); concurrent publish of two versions; canary test that protected fields never appear in the student view.

**Open decisions.** Minimum visible/hidden test counts for code (PROPOSED DEFAULT above). Whether direct publish is on by default for new organizations (PROPOSED DEFAULT: off).

**Sources.** DM §8, ADR-008, ADR-009, ADR-020, Arch §9.

## J2 — Teacher creates and schedules a challenge

**Purpose.** Decide which learners get which questions, when, and under which marking and reveal rules.

**Actors.** Teacher with `challenge.manage` in the target course/cohort scope.

**User story.** *As a teacher, I want to schedule a weekly practice challenge for my cohort so that learners practice between sessions without me sending anything manually.*

**Happy path.**
1. Ms. Salma creates a challenge for cohort 10-B: fixed questions (the three above) or a rule ("5 published questions from topic Quadratics, mixed difficulty").
2. She picks a schedule ("every Sunday at 16:00, open for 48 hours") in the organization's time zone, the grading policy (organization default), and the reveal settings (default: score and feedback right away; correct answers and explanations after the due time).
3. She activates it. Challenge Me creates each Sunday's assignment ahead of time.

**System behavior.**
- Creates a `ChallengeDefinition` (targets, selection rule, recurrence rule and IANA time zone, grading policy reference, reveal policy).
- The scheduler creates one `ChallengeOccurrence` per scheduled date (unique per definition and local time, so duplicates are impossible even with several schedulers) and one `ChallengeAssignment` per occurrence.
- **At assignment creation the GradingPolicyVersion in force and the reveal policy are pinned.** Later policy edits never change an existing assignment.
- A one-off ("send now") challenge creates a definition and a single ad-hoc assignment.

**Preconditions.** Targets are cohorts or learners of the same organization inside the teacher's scope; the grading policy has an ACTIVE version; the organization is not suspended; the selection rule can find at least the requested number of published questions (checked again at materialization).

**Inputs and validation.** Title; targets; selection rule (FIXED question ids, or RULE with topic filters, count, difficulty mix); schedule (valid recurrence rule, valid time zone, window length > 0) or opens/due/closes times (opens < due ≤ closes); grading policy; reveal policy (each item has a valid timing).

**State changes.** ChallengeDefinition DRAFT → ACTIVE. ChallengeAssignment DRAFT → SCHEDULED (pins set).

**Synchronous / asynchronous.** Definition creation is synchronous. Occurrence and assignment creation run in the scheduler (`CreateOccurrences`, hourly).

**External providers.** None.

**Authorization and tenant boundary.** Every target must be inside the teacher's scope; a teacher scoped to 10-B cannot target 10-C.

**Idempotency and concurrency.** Duplicate "create" requests with the same idempotency key return the same challenge. Two scheduler instances cannot create the same occurrence twice.

**Failure behavior.** Invalid schedule, targets out of scope, or no ACTIVE grading policy → refused with reason. Daylight-saving transitions are resolved from the time zone database (a 16:00 challenge stays at 16:00 local time).

**User-facing result.** Teacher sees the challenge, its next occurrences, and the pinned policy names.

**Events / jobs.** `CreateOccurrences` (scheduler). No notifications yet.

**Audit.** Create, activate, pause, archive; assignment cancellation.

**Acceptance criteria.**
- Changing the grading policy after an assignment is SCHEDULED does not change that assignment's pinned policy version.
- No two assignments exist for the same definition and local occurrence time.
- A challenge cannot target a cohort outside the creator's scope.

**Test scenarios.** Weekly schedule across a DST change (zones that observe DST); two scheduler instances; policy change after scheduling; out-of-scope target; RULE selection with too few published questions (warning at creation, handled at materialization — see J3).

**SPEC CORRECTION / GAP.** **G1 — Default policies.** Assignments need an ACTIVE GradingPolicyVersion, ConfidencePolicyVersion and LearningPolicyVersion, but no document says where a new organization's first versions come from. PROPOSED DEFAULT: when an organization is created, Challenge Me copies platform-provided default policies into it as version 1 (ACTIVE). Owner: product. Deadline: before Phase 3 exit. If changed: organizations must configure policies before the first challenge, adding an onboarding step.

**Sources.** DM §9, ADR-022, ADR-008 (pinning), ADR-020 (reveal), Arch §10.

### PRODUCT OWNER CHECKPOINT — Teacher setup (J1–J2)

1. Should a teacher be able to publish their own questions without a second person approving them? (Proposed default for new organizations: no — approval required; the owner can switch it on.)
2. When a teacher fixes a mistake in an answer key, should already-marked answers be re-marked automatically, or only when the teacher asks for a regrade? (Current design: only when the teacher asks.)
3. Should every organization start with ready-made default marking and progress rules that it can adjust later? (Proposed: yes.)
4. What should learners see by default: score immediately, correct answers after the due time? (Proposed: yes, as described. Sign-off gate 4.)
5. For code questions, is Python only acceptable for launch? (Sign-off gate 2.)

## J3 — Challenge Me prepares each learner's copy (materialization)

**Purpose.** Give each targeted learner a personal, frozen copy of the assignment so that later edits to questions never change what a learner is answering.

**Actors.** System (scheduler).

**Plain behavior.** Shortly before the challenge opens, Challenge Me looks up everyone enrolled in 10-B, picks the questions (the same for everyone with fixed questions; per learner for a rule-based challenge), and freezes the exact question versions in each learner's copy. A learner who joins 10-B while the challenge is still open gets their own copy immediately. A learner who leaves 10-B has any unfinished copy cancelled (not "expired", so reports can tell the two apart).

**System behavior.**
- `MaterializeAssignmentChunk` processes up to 500 learners per transaction. Each creates a `StudentChallenge` (MATERIALIZED) and its frozen `StudentChallengeItem`s (question id + question version id). Uniqueness on (assignment, learner) makes re-running a chunk harmless.
- Rule-based selection uses the published versions at materialization time and a stored random seed, so the selection is reproducible for audit.
- At the opening time the assignment becomes OPEN and each student challenge becomes AVAILABLE, which triggers delivery (J4).
- Late joiner: `EnrollmentStarted` → materialize for that learner if the assignment has not closed.
- Leaver: `EnrollmentEnded` → unfinished student challenges become CANCELLED (reason ENROLLMENT_ENDED) unless the learner is still targeted another way; their links are revoked.

**Preconditions.** Assignment SCHEDULED; learners ACTIVE and enrolled.

**State changes.** ChallengeAssignment SCHEDULED → MATERIALIZING → OPEN. StudentChallenge (new) MATERIALIZED → AVAILABLE.

**Idempotency and concurrency.** Chunk re-runs, the late-joiner handler and the chunk job racing each other all converge on one student challenge per learner (unique constraint; losers do nothing). A learner merged into another learner during materialization is skipped.

**Failure behavior.**

| Case | Behavior |
|---|---|
| Rule finds fewer published questions than requested | PROPOSED DEFAULT: materialize with the questions available and flag the assignment to the teacher; if zero questions, do not open and notify the teacher |
| Chunk job crashes | retried; already-created copies are untouched |
| Organization suspended | materialization paused until reactivation |

**User-facing result.** Teacher sees "24 of 24 prepared" on the assignment. Learners see nothing yet.

**Events / jobs.** `MaterializeAssignmentChunk`, `OpenStudentChallenges`, `DeliveryRequested` per learner at opening.

**Audit.** Counts only (bulk system action); cancellations are audited.

**Acceptance criteria.**
- Publishing a new question version after materialization does not change any existing student challenge.
- A learner enrolled at any time before closing has exactly one copy.
- A leaver's unfinished copy is CANCELLED with a reason, never EXPIRED.

**Test scenarios.** 5,000-learner assignment (chunking); chunk re-run; late joiner racing the chunk job; leaver who remains targeted through another cohort; merge during materialization; rule-based selection reproducibility from seed.

**Sources.** DM §9.3–9.4, §25.5, ADR-008, ADR-022, Arch §10.

## J4 — Challenge Me sends the challenge link

**Purpose.** Get a private link to the right person on the right channel, only with permission.

**Actors.** System (Challenge requests delivery; Communication delivers).

**Plain behavior.** When Youssef's copy opens, Challenge Me decides who to message (for a minor, per the organization's setting), which channel to use (WhatsApp if permitted, otherwise email, otherwise no message), checks permission, and sends a message that names Youssef and contains a link that opens only his challenge. Because Nour shares the same phone, she receives her own separate message naming her. Messages respect the organization's quiet hours and weekend. If sending fails, Challenge Me retries; if it still fails, the teacher can see it and the next channel is tried.

**System behavior.**
- Challenge emits `DeliveryRequested` (purpose CHALLENGE; learner id; capability scope = this student challenge; template key; expiry = challenge expiry). Communication owns the Delivery from then on (X13).
- `CreateDelivery`: resolve contact points linked to the learner for purpose CHALLENGE_DELIVERY (Roster); **consent check #1** (channel consent for that contact, channel and purpose; suppression list on shared accounts); pick channel by order; create Delivery (CREATED).
- Throughput scheduler moves deliveries to QUEUED within quiet-hour windows and the channel account's rate limits, with jitter.
- `DispatchDelivery`: **consent check #2**; issue (or reuse — see SC1) the capability grant; render the approved template version; send outside any database transaction; record SENT with the provider's message id.
- Webhooks move SENT → DELIVERED → READ. **WhatsApp "read" does not mean the learner opened the challenge** (engagement is tracked separately in J5).

**Preconditions.** Student challenge AVAILABLE; learner has at least one contact point with the needed consent, or the web-only path applies (G2).

**External providers.**

| Data leaving | Why | Interface | Provider failure |
|---|---|---|---|
| phone number or email, learner first name, challenge title, link | deliver the challenge | WhatsAppProvider / EmailProvider (ChannelProvider) | retry with backoff; RETRYING → FAILED after the attempt cap; `DeliveryFailed` lets Challenge try the next channel (PROPOSED DEFAULT) |

**Authorization and tenant boundary.** System actor for the organization. The channel account used is the one assigned to the organization (per-organization or platform-shared — sign-off gate 1). Inbound replies and status updates are matched to the organization only from trusted provider identifiers.

**Idempotency and concurrency.** Delivery idempotency key = (purpose, student challenge, attempt of delivery) — one challenge message per learner per assignment unless a reminder or resend is requested. Consent withdrawal between queueing and sending is caught by check #2 and the delivery is CANCELLED.

**Failure behavior.**

| Case | Behavior |
|---|---|
| No channel consent | no message on that channel; next eligible channel; if none, see G2 |
| Opt-out received (STOP) | channel consent withdrawn; on a shared account the number is suppressed for every organization on that account |
| Provider rejects template | delivery FAILED; teacher alerted; template marked for review |
| Messaging budget exhausted | PROPOSED DEFAULT: WhatsApp/email deferred to next period; learner can still use the web path |
| Outside quiet hours | held until the window opens (never dropped) |

**User-facing result.** Learner/guardian receives: "Hi Youssef, your Grade 10 Math challenge is ready. Open it here: [link]. Available until Tuesday 16:00." Teacher sees delivery status per learner (sent / delivered / failed).

**Events / jobs / notifications.** `DeliveryRequested`, `CreateDelivery`, `DispatchDelivery`, `ProcessWebhookEvent`, `DeliveryFailed`.

**Audit.** Capability grant issue; opt-outs. Delivery metadata (not bodies) kept.

**Privacy.** Message bodies are kept 30 days (R5). **See SC2:** the link token must not be stored inside the saved message body.

**Acceptance criteria.**
- No message is sent to a contact point without matching channel consent at both queueing and sending time.
- Two learners sharing one phone receive two separate messages, each naming the learner and each with a link that opens only that learner's challenge.
- A WhatsApp "read" status never marks a student challenge as opened.
- A delivery never regresses in status because webhooks arrive out of order.

**Test scenarios.** Siblings on one phone; consent withdrawn after queueing; duplicate webhook; READ before DELIVERED; provider outage; template rejected; quiet hours; shared-account opt-out affecting a second organization.

**Open decisions.** G2 (web-only path), G9 (who receives the link for a minor), G5 (reminders), sign-off gate 1 (WhatsApp account model).

**Sources.** DM §14, §9.3, §25.10, ADR-004, ADR-019, ADR-024, X7, X13, Arch §17.

## J5 — Learner opens the link

**Purpose.** Let the learner in without a password, while making the link useless to anyone who should not have it.

**Actors.** Learner (or guardian holding the phone). Link-preview bots and email security scanners also "visit" links.

**Plain behavior.** Tapping the link shows a simple page with a "Start" button. Only pressing it signs the learner into **this challenge only**. Preview bots never press the button, so they cannot use up or trigger anything. The link works on up to three devices (e.g. the family phone and a laptop); a fourth device needs a one-time code. To see other challenges or progress history, the learner enters a one-time code sent to their verified phone or email.

**System behavior.**
- A new link (reminder, resend) never invalidates earlier links for the same learner and challenge; the device limit counts across all of them; only a staff "reset link" or a security event revokes them [SC1].
- `GET /c/{token}`: inert landing page; no state change; no learner data shown; no caching; no referrer sent.
- `POST` exchange: resolve the token hash to its organization (audited resolver, X1); check grant ACTIVE and unexpired; count devices; create a session (cookie, ≤ 12 hours for challenge scope); redirect to a URL without the token; record engagement **OPENED** on the student challenge.
- Session scope = one student challenge. History needs OTP step-up (SPEC-032). One-time codes may be sent to any active linked contact point, verified or not; a correct code verifies that contact point; opening a link never verifies it; verification proves possession, not identity or consent [W2-C3]. No SMS channel in V1 [W4-5].

**Preconditions.** Grant ACTIVE; student challenge not CANCELLED. After close the link opens a read-only review for 14 days (closes_at + 14 days; moves with an extension) [W4-C2, W4-4]; afterwards results are reached through learner home.

**Authorization and tenant boundary.** The session carries the organization, learner and scope; every later request is limited to that scope. Unknown, revoked and expired tokens all return the same "This link is no longer valid" page (no hint which case applies).

**Idempotency and concurrency.** Pressing Start twice creates two sessions on the same device record, harmless. Device-limit check locks the grant during exchange.

**Failure behavior.**

| Case | Behavior |
|---|---|
| Link forwarded to a class group | works on up to 3 devices; then OTP to the learner's verified contact is required |
| Link expired or revoked (e.g. learner left the cohort) | "This link is no longer valid. Ask your teacher for a new one." |
| Too many attempts from one address | rate-limited |

**User-facing result.** The challenge overview: title, due time, list of questions, progress.

**Audit.** Every exchange (device and network fingerprints are hashed). OTP requests and results.

**Acceptance criteria.**
- A GET on the link never changes any state or reveals learner data.
- A session from a challenge link cannot read any other challenge, result history or learner.
- The token never appears in any URL after the exchange, in logs, or in referrer headers.

**Test scenarios.** Link-preview fetch then real open; fourth device; revoked grant; expired challenge; session trying another student challenge id (NOT_FOUND); token in logs (must be absent).

**Open decisions.** Session lifetime and device limit (sign-off gate 3).

**Sources.** DM §5.1–5.5, §25.9, ADR-016, X1, Arch §6.

### PRODUCT OWNER CHECKPOINT — Delivery and access (J3–J5)

1. For learners under 18, who should receive the challenge link: the learner's own contact, the guardian's, or both? (G9) *(Resolved: W2-1 — organization setting; MINOR and UNKNOWN → guardian only; ADULT → learner)*
2. If a learner has no WhatsApp or email permission, how should they get their link — should the teacher be able to copy or print it from the dashboard? (G2) *(Resolved: W2-2 — staff-issued links, off by default, audited)*
3. Should Challenge Me send a reminder before a challenge is due if the learner hasn't started it? If so, when? (G5) *(Resolved: Wave 4 — one reminder 24 h before due if not started; moves with a due-time change)*
4. If WhatsApp fails, should Challenge Me automatically try email? (Proposed: yes.)
5. Is it acceptable that a forwarded link works on up to three devices before a code is needed? (Proposed default; sign-off gate 3.)
6. When the messaging allowance runs out, is it acceptable that messages wait until the next billing period while learners can still use existing links? (Proposed default.) *(Resolved: W11-4 — one-time codes and consent requests are always sent as overage; challenge messages and reminders wait and expire when the challenge closes; reports wait for the next period; existing and staff-issued links keep working)*

---

## J6 — Learner starts, answers, uses hints; drafts save automatically

**Purpose.** Let the learner work through questions comfortably on a phone, with approved help, without losing work.

**Actors.** Learner.

**Plain behavior.** Youssef opens question 1; an attempt starts. His typing is saved as a draft every few seconds (drafts are never marked). On the explanation question he taps "Hint"; the first approved hint appears, and the hint count is recorded (the grading policy may apply a small penalty). For code questions he may run his code against the visible tests before submitting (X9 resolved by W5-1).

**System behavior.**
- `StartAttempt`: checks the item belongs to the session's student challenge and the attempt limit from the pinned grading policy; creates `Attempt` (OPEN, attempt_no); student challenge → STARTED on the first attempt.
- The question is shown only through the student-safe view (no key, rubric, hidden tests or solutions; DM §8.5).
- `SaveDraft`: overwrites the attempt's draft (optimistic version check). Never creates an evaluation.
- `RequestHint`: reveals the next step of the HintSetVersion **frozen inside the question version**; records a `HintEvent`; cannot skip steps. The AI never generates hints for learners in V1 (ADR-007).
- `RunPractice`: runs code against visible tests only; results shown; never marked; limits 20 per attempt and 100 per learner per day, owned and enforced by Assessment [W5-1, W7-C3]; refused when the CODE_EXECUTION budget is exhausted.
- Retry offered only when all W5-3 conditions hold, including a result visible to the learner that is below full marks (performance score) and a reveal policy that does not hide the score [W5-3, W6-C1]. Hints revealed in earlier attempts stay visible and count in the retry's hints used [W5-4].
- Questions may be answered in any order; the learner may finish with questions unanswered (`FinishChallenge`; unanswered = "Not attempted", never wrong) [W5-2].

**Preconditions.** Session scope includes the student challenge; challenge AVAILABLE/OPENED/STARTED and not past closing.

**Idempotency and concurrency.** Starting the same attempt twice returns the existing one. Two tabs saving drafts: the later save wins after a version check; the learner is warned.

**Failure behavior.** Challenge closed → answering disabled; drafts remain viewable. Hint set missing → Hint button hidden. Practice provider down → "Running code is temporarily unavailable; you can still submit."

**User-facing result.** Question, response box, draft-saved indicator, Hint button with "Hints used: 1", practice results for visible tests.

**Privacy.** Drafts and practice code are learner content (drafts R2; practice output R4).

**Acceptance criteria.**
- Drafts are never evaluated and never produce learning observations.
- A hint shown to a learner always comes from the approved hint set pinned in the frozen question version.
- A practice run never uses hidden tests and never creates an evaluation.

**Test scenarios.** Two-tab draft conflict; hint ladder order; hint after submission (refused); practice run quota; attempt beyond the policy maximum (refused).

**Open decisions.** None. X9 resolved by W5-1; G10 resolved by W5-2.

**Sources.** DM §10, §8.5, ADR-007, ADR-020, X9.

## J7 — Learner submits

**Purpose.** Capture the final answer safely — one stored submission per attempt — then start marking. (This describes Challenge Me's stored record; downstream jobs and providers may run more than once, J-6 [W5 SU-9].)

**Actors.** Learner.

**Plain behavior.** Youssef taps Submit. His answer is saved immediately and cannot be changed. If his connection drops and his phone resends, nothing is duplicated. Marking starts: multiple-choice results appear instantly; answers that need AI or code show "Evaluating…". If he submits after the challenge closed but within the grace window he gets a normal result; beyond it, the work is kept and his teacher decides within 14 days (X10 resolved by W4-6).

**System behavior (one transaction; DM §25.1).**
1. Lock the attempt; check it is OPEN (or ABANDONED because the challenge expired, for a queued offline submission within the late window [W5-C1]) and in the session's scope. A read-only review session may submit only in that single late case [W5-C2].
2. Validate the answer against the question's input schema.
3. Store the `Submission` (one per attempt; idempotency key; the question version the learner saw; server receive time; hints used; content hash). Client clocks are recorded but never trusted.
4. Timing status from server time: ON_TIME, LATE_ACCEPTED (within grace; default grace 0) or LATE_HELD (beyond grace).
5. Attempt → SUBMITTED.
6. Unless LATE_HELD: `CreatePendingEvaluation` — creates the Evaluation (PENDING), pins the EvaluationContext, builds the EvaluationPlan, and creates the current-result record (revision 1). **Rule-only plans are marked inside the same transaction** and become CONFIRMED immediately.
7. LATE_HELD: a teacher review task is created instead.
8. If every item now has a submission (or the learner used `FinishChallenge`), the student challenge becomes COMPLETED — an engagement state only, never reverted by retries [W5-2, W5-C3, W5-C4].

Nothing in this transaction calls an outside service.

**Inputs and validation.** Student challenge, item, attempt, answer (typed per question), idempotency key, client time. Answer must match the input schema (e.g. one option for single choice; number format; code size limit — PROPOSED DEFAULT 64 KB; long text limit — PROPOSED DEFAULT 10,000 characters).

**Idempotency and concurrency.** Same key and same content → returns the original result. Same attempt, different content → "Already submitted". Two devices submitting at once → the attempt lock serializes; one wins.

**Failure behavior.**

| Case | Behavior |
|---|---|
| Invalid answer | refused with field-level message; nothing stored |
| Challenge closed, within grace | stored, LATE_ACCEPTED, marked normally |
| Beyond grace | stored, LATE_HELD, not marked until a teacher accepts it; teacher rejection or 14 days without a decision → LATE_REJECTED with reason TEACHER or HOLD_EXPIRED [W4-6] |
| AI or code service down | submission still stored; marking waits (J8) |
| Budget exhausted | submission still stored; marking held and re-checked every 5 minutes, no second AI operation if one already started for the step; at the deadline sent to review (never refused) [W11-C4]; storage exhaustion never rejects it [W11-C7] |
| No AI consent | submission stored; the plan uses rule-based and teacher-review steps only |

**User-facing result.** "Submitted ✓" plus the result state (J9).

**Events / jobs.** `EvaluationHeadChanged` (always); step jobs for AI and code steps.

**Audit.** Late-work decisions. Submissions themselves are domain records, not audit events.

**Privacy.** The answer is sensitive learner content (R2), stored separately from metadata so it can be purged.

**Acceptance criteria.**
- A submission is stored before any evaluation work, and no failure after that point loses it.
- At most one submission exists per attempt; retries with the same key are harmless.
- LATE_HELD submissions create no evaluation until accepted.

**Test scenarios.** Double tap; resend after timeout; two devices; submit exactly at closing (server time decides); clock-skewed client; submission with AI down; LATE_HELD then accepted; LATE_HELD then expired (X10).

**Open decisions.** Answer size limits (PROPOSED DEFAULT). X10 resolved by W4-6 / W5-C1; G10 resolved by W5-2.

**Sources.** DM §10, §25.1, ADR-020, ADR-011, X10, X12, Arch §11.

## J8 — Challenge Me marks the answer

**Purpose.** Produce a reliable result using the right kind of marking for each question type.

**Actors.** System; AI provider and code execution provider when applicable; teacher for teacher-review steps.

**Plain behavior.** Each question type has a marking plan:

| Question type | Marking plan (PROPOSED DEFAULT, DM §11.6) |
|---|---|
| Choice, true/false, number | Rules only → final immediately |
| Short text, closed list | Rules only; anything not on the accepted list is wrong |
| Short text, meaning-based | Rules first; if rules cannot decide, AI judges the meaning → never final immediately |
| Long answer | AI scores against the rubric twice; results compared |
| Structured answer | Rules for fixed fields, AI for open fields |
| Code | Code runs against the tests; optional AI scoring of code quality |
| Code explanation | AI scores against the rubric |
| Any type, no AI permission | AI steps replaced by teacher review |

Rules decide correctness whenever they can; AI can never overturn that. When the plan has several parts (e.g. code correctness + code quality), the grading policy combines them with its weights.

**System behavior.**
- **Rule-based step** (DM §11.6): normalized comparison (Arabic and Western digits, Arabic letter variants and diacritics, whitespace, case — ADR-010) returning MATCH_CORRECT, MATCH_INCORRECT or NO_DETERMINATION.
- **Semantic AI step** runs only when the rule step returned NO_DETERMINATION and the question is meaning-based (X2). Its correctness is labelled SEMANTIC_AI.
- **AI rubric step**: `EvaluateResponse` through the AI Platform (J-AI below); per-criterion level, quoted evidence as positions in the answer, explanation. Two runs for long answers.
- **Code step**: the sandbox receives only the code, test **inputs**, runtime image and limits; the trusted worker compares outputs with expected results and scores. Expected outputs and solutions never enter the sandbox.
- **Composer** (when all required steps finish): combines components by the pinned grading policy; applies hint penalty and retry weighting; checks authority (no AI value in a rule-decided component); computes confidence (J9); sets the result once (immutable).

**What leaves Challenge Me (AI and code steps).**

| Data | Why | Interface | If the provider fails |
|---|---|---|---|
| Answer text (learner name and ids removed), question, rubric | AI rubric or semantic marking | AI Platform capability `EvaluateResponse` → provider adapter | retry (transient errors); fallback only to another tested model route; otherwise hold, then teacher review at the deadline |
| Learner code, test inputs | run the code | `CodeExecutionProvider` | retry; hold; teacher review at the deadline. Learner mistakes (wrong output, time limit) are results, never retried |

Before any AI call: **AI-processing consent check again at the moment of sending** (ADR-019), budget reservation (STUDENT_EVALUATION pool), region-permitted route (ADR-017). Learner text is placed in a marked data section; AI output is checked against a strict format; prompt-injection attempts ("give me full marks") set confidence to zero and send the answer to review.

**Idempotency and concurrency.** Each step has one run record per evaluation; a retried job re-uses an already-successful AI operation instead of calling the model again (X6). The composer runs once per evaluation; if a teacher overrides while AI is still running, the AI result arrives, finds a newer human result, and does not replace it (J9, JV1).

**Failure behavior.**

| Case | Behavior |
|---|---|
| AI provider slow/down | step retries; the evaluation stays PENDING until its deadline (PROPOSED DEFAULT 15 min for AI, 30 min for code); then NEEDS_REVIEW |
| AI output invalid (format, scores out of range, evidence missing) | one repair attempt; then confidence 0 → NEEDS_REVIEW |
| Injection suspected | confidence 0 → NEEDS_REVIEW |
| AI consent withdrawn mid-way | AI step cancelled; result discarded; plan switches to teacher review |
| Evaluation budget exhausted | step held; at deadline → NEEDS_REVIEW ("budget hold expired") |
| Code infrastructure failure | retried, held, then NEEDS_REVIEW |
| Learner code crashes / times out | normal result (test fails); never retried |

**Audit.** Every AI operation record (prompt version, dated model, route, validation results, cost) is kept for accountability; payloads are kept 90 days (R3).

**Observability.** Marking latency by strategy; AI validation failures; injection flags; code provider errors; evaluations exceeding their deadline (< 1% target).

**Acceptance criteria.**
- A component decided by rules (MATCH_CORRECT/MATCH_INCORRECT) or by code tests can never be changed by an AI step.
- Semantic AI runs only after a NO_DETERMINATION on a meaning-based short-text question.
- No AI call is made for a learner without current AI-processing consent at dispatch time.
- Expected outputs, reference solutions and hidden-test outputs never enter the sandbox and never appear to the learner.
- A job retry never produces a second model call for the same run when a valid result already exists.

**Test scenarios.** Arabic numeric answer "٣٫٥" vs key 3.5; alef/hamza variants in short text; paraphrase on CLOSED vs OPEN_SEMANTIC; long answer with runs disagreeing; injection text in an essay; AI outage past deadline; code that forges "PASSED" on stdout (still fails comparison); fork bomb; consent withdrawn while running; budget exhausted; composite code+quality where quality fails (renormalize or review per policy).

**Open decisions.** Deadlines for AI/code marking (PROPOSED DEFAULTS above); gates 8, 9 (confidence thresholds, quality gates).

**Sources.** DM §11.6, §15, §16, §25.2, ADR-009, ADR-010, ADR-015, ADR-017, ADR-019, X2, X6, Arch §12, §18, §21.

## J9 — The result becomes provisional, confirmed or reviewed; learner sees it

**Purpose.** Decide how much to trust a result, show it honestly, and bring in a teacher where needed, without making teachers check everything.

**Actors.** System; teacher (confirm, review, override); learner (views; may dispute).

**Plain behavior.**
- **Rule-only results** are final immediately.
- **AI results with high confidence** are shown as *provisional* and become final automatically after 48 hours unless a teacher changes them or someone disputes them.
- **AI results with medium confidence**, and all meaning-based short-text results, stay provisional until a teacher confirms them (teachers can confirm many at once).
- **Low-confidence or failed results** go to the teacher's review queue; the learner sees "Your teacher will review this."
- A teacher can confirm a result as it is (it then becomes human-locked) or replace it with their own (an override).
- Feedback text for AI-marked answers is generated after the score is fixed, and is checked so it never reveals the answer key or hidden tests.

**System behavior.**
- **Confidence** (DM §11.7): calculated only when AI contributed; the lowest of run agreement, evidence verification rate, and the route's measured accuracy; zero on any validation failure or injection flag. Thresholds come from the pinned ConfidencePolicyVersion, never below the platform floor.
- **Decision** (ADR-015, DM §11.4): rules only → CONFIRMED (INSTANT); confidence ≥ auto-confirm threshold and no semantic correctness → PROVISIONAL + `AutoConfirmEvaluation` at +48 h; review threshold ≤ confidence < auto-confirm threshold, or any semantic correctness → PROVISIONAL without auto-confirm; below review threshold or any review condition → NEEDS_REVIEW + ReviewTask.
- **Current result**: every change goes through compare-and-set on the result record's revision. The revision also increases when the result first arrives and when it is confirmed (X3), so Learning sees every meaningful change.
- **Confirm** (teacher): PROVISIONAL/NEEDS_REVIEW → CONFIRMED (HUMAN); result becomes human-locked (X8).
- **Override** (teacher): a new evaluation with origin TEACHER_OVERRIDE, CONFIRMED, with a mandatory reason; the previous evaluation becomes SUPERSEDED; the result is human-locked. If someone else changed the result a moment earlier, the teacher sees "This result changed — review the new version" (no silent overwrite; X4).
- **Auto-confirm** checks, at run time, that the result has not changed and no dispute is open; otherwise it does nothing.
- **Feedback** (X5): `GenerateFeedback` from the fixed criterion results; answer-leak check; one regeneration on a leak; a second leak → feedback withheld, score stands, flagged.
- **Learner view** follows the pinned reveal policy: score and feedback now, labelled "Provisional" while provisional [W6-5]; answer-revealing content (answers, explanations, model solutions) never before the assignment's closes_at, whatever the policy says [W4-C1].
- **Unconfirmed meaning-based results** stay PROVISIONAL in the teacher's "to confirm" list; after 14 days an EVALUATION_REVIEW task (UNCONFIRMED_SEMANTIC) is escalated to the admin scope; never auto-confirmed [W6-2].
- **Item grade** = the best weighted total among the item's evaluated attempts [W6-3]; **challenge grade** uses all items as the denominator and shows a "Not attempted" count, never 0 for unanswered [W6-4].
- **Disputes** only on a score visible to the learner, within 14 days, at most one open per submission, not on a result produced by a dispute resolution; dispute text is never sent to AI [W6 DI].
- Feedback leak check also covers the model solution and explanation [W6-C3].

**Learner-facing states (ADR-011).**

| Internal state | Learner sees |
|---|---|
| PENDING, within latency budget | Evaluating… |
| PENDING, beyond latency budget (PROPOSED DEFAULT 20 s) | Evaluating — you can continue to the next question |
| PROVISIONAL | Provisional result: score + feedback |
| NEEDS_REVIEW | Your teacher will review this |
| CONFIRMED | Final result |
| Result replaced after the learner saw it | Updated result, with the reason category (e.g. "Reviewed by your teacher") |

Learners never see "failed".

**Authorization.** Confirm and override require `evaluation.confirm` / `evaluation.override` in the cohort's scope. Learners see only their own results within their session scope.

**Idempotency and concurrency.** Confirm and override carry the revision the teacher was looking at; a stale revision gets "result changed". Auto-confirm, dispute and override racing each other are resolved by the same compare-and-set (DM §26).

**Failure behavior.** Review queue items escalate after 48 hours (PROPOSED DEFAULT) to course/org admins. Feedback generation failure never changes the score.

**Notifications.** No delayed-result notification in V1; the learner sees the result on the next open (G6 resolved by W6-1).

**Audit.** Human confirm, override (with reason), bulk confirm, review assignment and escalation.

**Acceptance criteria.**
- Exactly one evaluation is current for every submission at all times.
- A machine result never replaces a result a teacher authored or confirmed; it becomes a candidate with a review task instead.
- Semantic AI correctness is never confirmed automatically unless the grading policy explicitly allows it (default: not allowed).
- An evaluation's score never changes after it leaves PENDING; changes always create a new evaluation.
- Learner-facing feedback never contains the answer key, accepted answers, reference solution or hidden-test data.

**Test scenarios.** Auto-confirm vs override race; override with stale revision; bulk confirm of 200 with a few changed meanwhile; dispute opened before auto-confirm; low-confidence essay → review → teacher grades; feedback leak twice → withheld; learner view before/after due time.

**Open decisions.** Gate 8 (thresholds, 48 h delay, floor). G6 resolved by W6-1; G7 resolved by W6-2.

**Sources.** DM §11.3–11.8, §13, §25.2–25.3, ADR-011, ADR-015, ADR-017, ADR-020, X3, X4, X5, X8, Arch §13–15.

### PRODUCT OWNER CHECKPOINT — Answering and results (J6–J9)

1. Should learners be able to run their code against the example tests before submitting? (X9, proposed yes.) *(Resolved: W5-1)*
2. What should happen to work submitted after the deadline: kept for the teacher to accept or reject within 14 days? (X10.) *(Resolved: W4-6, W5-C1)*
3. Should learners see AI scores marked "provisional" straight away, or only after a teacher or the 48-hour window confirms them? (Proposed: show provisional.)
4. Should a learner be notified when a delayed result is ready, or just see it next time they open the link? (G6) *(Resolved: W6-1 — no notification)*
5. If a teacher never confirms a meaning-based short-answer result, what should happen — stay provisional, or confirm automatically after some time? (G7) *(Resolved: W6-2)*
6. Must learners answer questions in order, and may they finish a challenge with questions left unanswered? (G10) *(Resolved: W5-2)*
7. If a learner retries a question, which try counts for the score: the latest, the best, or a weighted combination? (G8) *(Resolved: W6-3 — best weighted total)*

---

## J10 — The result becomes a learning observation; topic state updates

**Purpose.** Turn individual results into an up-to-date picture of what each learner knows, which stays correct when results change.

**Actors.** System.

**Plain behavior.** Every time a submission's current result appears or changes, Challenge Me records one observation for that submission (score, topics with their weights, mistakes matching known misconceptions, whether hints were used, which try it was). Provisional results count half; results waiting for a teacher count zero; final results count fully (PROPOSED DEFAULT learning policy). All tries on the same question in one challenge form **one evidence unit**: the first and the final try count 50% each (approved D1), so retrying never multiplies evidence; a result still being marked counts nothing (W8-C4). Youssef's topic states are then recalculated from his evidence units (Learning Trajectory Model; Wave 8). If a teacher later overrides a result, that submission's observation is replaced and his topic states are recalculated, so the old result leaves no trace.

**System behavior (DM §12.3).**
- `EvaluationHeadChanged` → `ProjectObservation` (keyed by submission + revision): ignores stale or duplicate revisions; fetches a content-free summary from Evaluation; upserts the observation (replace semantics); appends a learning event.
- `RecomputeTopicState` for the affected topics: a pure calculation from the effective observations, topic mappings (merged/renamed topics) and the organization's ACTIVE LearningPolicyVersion; produces Strong / Developing / Needs practice / Not enough evidence, and learning signals such as REPEATED_MISCONCEPTION (same misconception tag in ≥ 2 distinct evidence units across ≥ 2 distinct questions within 28 days; retries never count separately — APPROVED C6, see Learning Trajectory Model §9).
- Learning stores learners by pseudonym, not name or id.

**Idempotency and concurrency.** Events may arrive twice or out of order; only a higher revision replaces an observation. Recalculation from the full set makes concurrent updates converge; a live recalculation and a full rebuild must produce identical results (tested property).

**Failure behavior.** Projection job failures retry; a stuck learner can be rebuilt individually. A LearningPolicyVersion change rebuilds all affected learners; dashboards show "calculated under policy vN".

**User-facing result.** None directly; feeds J11 and J12.

**Acceptance criteria.**
- For any learner, topic state computed live equals topic state computed by a full rebuild.
- Replacing a result changes that submission's contribution exactly once (no double counting).
- Duplicate or out-of-order result events do not change the outcome.

**Test scenarios.** Provisional → confirmed → overridden sequence; events delivered in reverse order; topic merge; learner merge; policy change rebuild; retry attempts on the same item form one evidence unit (D1).

**Open decisions.** None. G3 is superseded by D1 (approved); learning-policy values follow the Learning Trajectory Model and Wave 8.

**Sources.** DM §12, ADR-014, X3, Arch §16.

## J11 — Reinforcement is created, re-checked and delivered

**Purpose.** Send extra practice when, and only when, a learner still needs it.

**Actors.** System (Learning decides what; Challenge decides when and how).

**Plain behavior.** Youssef's "Solving quadratics" topic is now Needs practice. Challenge Me creates a reinforcement item to be sent after a delay (APPROVED W8-1: one open item per topic; no new item within 7 days of the last on that topic; sent 48 hours after creation; at most 2 per learner in any rolling 7 days, postponed rather than dropped at the cap; expires if not scheduled within 14 days). Before scheduling it, and again right before sending it, Challenge Me checks that he still needs practice: if a teacher changed his result in the meantime and he is no longer Needs practice, nothing is sent. Otherwise he receives a short follow-up challenge on that topic, through the same delivery path as J4.

**System behavior.**
- `RecomputeTopicState` creates a `ReinforcementItem` (PENDING, basis = the observations and revisions that justified it) → `ReinforcementItemCreated`.
- `PlanReinforcement` (Challenge): **revalidation** (Learning checks that every basis revision is still current and the rule still holds) → if invalid: CANCELLED; if valid: create a REINFORCEMENT assignment for the learner and materialize it; item → SCHEDULED.
- At opening time, **revalidate again (SC4)**; then deliver as in J4.
- Later changes that remove the need cancel pending items (`ReinforcementItemCancelled`).

**Preconditions.** Learner active and enrolled; delivery allowed (consent, frequency cap, quiet hours).

**Idempotency and concurrency.** One plan per reinforcement item. A cancellation arriving before the creation event is remembered (tombstone), so a late creation event does not resurrect it.

**Failure behavior.** No suitable questions → Challenge reports it (`MarkReinforcementUnplannable`), the item EXPIRES with reason NO_ELIGIBLE_QUESTIONS and the outcome shows on the teacher's learner row; no notification is sent (W8-C2). Learner no longer enrolled where the topic applies → cancelled. Frequency cap reached → postponed, never dropped (W8-C3).

**User-facing result.** Learner: a message such as "A short practice set on Solving quadratics is ready." Teacher: reinforcement shown on the learner's row.

**Acceptance criteria.**
- No reinforcement is delivered if, at opening time, its basis is no longer current or the learner no longer needs practice on that topic.
- Reinforcement never exceeds the learning policy's frequency cap per learner.

**Test scenarios.** Override between creation and opening (cancelled); cancellation before creation event; frequency cap; no questions for topic; learner left cohort.

**SPEC CORRECTIONS / GAPS.** SC3 (Challenge must be able to turn a pseudonym back into a learner), SC4 (second revalidation), G4 (how reinforcement questions are chosen and which grading policy applies).

**Sources.** DM §12.4, §9.3, §25.8, ADR-014, Arch §16.

## J12 — Teacher dashboard shows the result

**Purpose.** Give the teacher an accurate, current view of who did what and what the class needs.

**Actors.** Teacher (own scope), admins, owner.

**Plain behavior.** Ms. Salma sees for the Sunday challenge: prepared/delivered/opened/completed counts; each learner's score with a marker for provisional or awaiting review; items in her review queue; and a topic map for 10-B (how many learners are Strong, Developing, Needs practice, Not enough evidence per topic). Clicking a learner shows each answer, how it was marked, the AI's criterion scores with the highlighted evidence, and buttons to confirm or override. Each learner row shows the challenge grade (W6-4: all items as denominator, "Not attempted" count), provisional and review markers and an "after due" marker; completion comes from engagement [W9-C2]. The topic map also shows direction counts and a fixed "needs attention" ordering, with no alerts [W9-C3]. In-scope teachers can export assignment results as CSV (recent authentication, audited) [W9-3].

**System behavior.**
- Read models updated from events: per-student-challenge status and scores (`EvaluationHeadChanged`, `ChallengeCompleted`, delivery events); cohort topic map (topic-state changes); review queue statistics.
- Evaluation detail is read on demand, with evidence rendered from the stored answer (evidence is stored as positions, not copied text).
- Read models are eventually consistent: typically within seconds (PROPOSED DEFAULT target: 95% of updates visible within 30 seconds).

**Authorization and tenant boundary.** Teachers see only cohorts in their scope; owners/admins see the organization.

**Failure behavior.** A lagging read model shows "Last updated [time]"; a rebuild tool exists for repair.

**Acceptance criteria.**
- A teacher never sees a learner or cohort outside their scope, except the assignment-cohort rule for work submitted before a learner left (W6-6) and the evidence-strip limits of W8-C1.
- Deleted learners appear only in aggregates [W10-2].
- Dashboard scores match each submission's current result after events are processed.
- Provisional and needs-review results are visibly distinguished from final results.

**Test scenarios.** Teacher with two cohort scopes; override reflected on the dashboard; read model rebuild; 5,000-learner assignment page performance.

**Sources.** DM §17, §23, Arch §27, §34.

### PRODUCT OWNER CHECKPOINT — Progress, reinforcement and dashboard (J10–J12)

1. Should a provisional AI result count toward a learner's progress before it is confirmed? (Proposed: at half weight.)
2. When a learner gets a question wrong and then right on a retry, should both tries count toward progress, or only the latest? (G3)
3. How soon after a weak result should practice be sent, and how many practice sets per week at most? (Proposed: after 48 hours, max 2 per week.)
4. Should reinforcement use different questions on the same topic, or may it repeat the question the learner got wrong? (G4)
5. Should teachers be told when reinforcement is sent to their learners, or just see it on the dashboard? (Proposed: dashboard only.)
6. Is "results appear on the dashboard within about 30 seconds" acceptable? (Proposed default.)

## JV — Journey variants

| # | Variant | Behavior | Sources |
|---|---|---|---|
| JV1 | Teacher overrides while AI marking is still running | Override becomes current and human-locked; the running AI result arrives, is stored as a candidate, and does **not** replace it; no review task is created if the candidate agrees with the override (PROPOSED DEFAULT), otherwise a conflict review task is created. | DM §11.3, §25.2, X8 |
| JV2 | AI is slow or down | Learner sees "Evaluating — you can continue"; after the deadline the answer goes to review; no answer is lost. | DM §11.4, ADR-015 |
| JV3 | Learner has no AI-processing consent | The plan uses rule-based and teacher-review steps only; learner sees "Your teacher will review this" for open answers. | ADR-019, DM §7.3 |
| JV4 | Evaluation budget exhausted | AI steps held and re-checked every 5 minutes; no second AI operation for a step whose provider call started; at the deadline, teacher review. Submissions are never refused [W11-C4]. | ADR-021, DM §18 |
| JV5 | Late submission beyond grace | Stored as LATE_HELD; teacher accepts (marked normally) or rejects; after 14 days without a decision → LATE_REJECTED (reason HOLD_EXPIRED); teacher rejection → LATE_REJECTED (reason TEACHER). No evaluation head for either [W4-6, W6-C5]. | DM §24, W4-6 |
| JV6 | A result changes after the learner saw it (override, dispute, regrade) | Learner sees "Updated result" with the reason category; learning replaces the observation; reinforcement is revalidated; reports already sent get a correction only if the change is material. | ADR-011, ADR-014, DM §17 |
| JV7 | Learner disputes a provisional result | Auto-confirm is suspended; a teacher review task is created; upheld → new DISPUTE_RESOLUTION result; rejected → result unchanged (teacher may confirm). | DM §11.8, §24 |
| JV8 | Learner leaves the cohort mid-challenge | Unfinished copy cancelled; links revoked; submitted answers keep their results. | DM §9.3 |

---

# 6. Findings From the Core Journey

Writing the journey end to end exposed the following. **No ARCHITECTURE GAP was found**: every item fits within the approved architecture and needs either a small correction or a product decision.

## 6.1 Spec corrections (approved documents conflict or would cause a visible bug)

### SC1 — Resending a link would break the link the learner already has

**Where.** DM §24 (CapabilityGrant): "family revoke of older grants for same (subject, scope) when re-issued"; DM §25.10 issues a grant at every dispatch.
**Plain explanation.** If Youssef gets a reminder, the reminder's new link would silently kill the link in his first message. Learners would tap an old message and see "link no longer valid".
**Smallest fix.** Each message still gets its own new grant (only token hashes are stored, so an old token cannot be re-sent). But issuing a new grant **no longer revokes** earlier active grants for the same learner and scope; they all stay valid until the challenge expires. Earlier grants are revoked only by an explicit staff "reset link" action or a security event. The device limit applies across all of a learner's grants for that scope together, so extra links do not multiply the allowed devices.
**Status.** SPEC CORRECTION to DM §24; no ADR change. **Applied** in Domain Model rev. 1.6 (§5.2, §24, §25.10).

### SC2 — The private link would be stored inside the saved message body

**Where.** DM §14.1 (`delivery.body_ref`, R5 retention 30 days) and §25.10 (render body to payload store).
**Plain explanation.** The saved copy of each message would contain a working link for up to 30 days, turning an audit copy into a set of usable keys.
**Smallest fix.** Store the rendered body with the link replaced by a placeholder; the real token exists only in memory for the provider request.
**Status.** SPEC CORRECTION to DM §14/§25.10; aligns with ADR-006 (secrets never at rest in payloads). **Applied** in Domain Model rev. 1.6 (§14.1, §25.10).

### SC3 — Challenge cannot find the learner behind a reinforcement item

**Where.** DM §5.B: pseudonym resolution is "restricted to Learning, Reporting, Privacy"; DM §12 ReinforcementItem carries only `learner_pseudonym_id`; DM §9.3 Challenge must create an assignment for a learner.
**Plain explanation.** The module that sends practice cannot look up who the practice is for.
**Smallest fix.** Add Challenge to the modules allowed to call `ResolveLearners(pseudonyms)`, used only for reinforcement planning.
**Status.** SPEC CORRECTION to DM §5.B. **Applied** in Domain Model rev. 1.6 (§5.B, §19 C31, §25.8).

### SC4 — Reinforcement is re-checked too early

**Where.** ADR-014: "Immediately before delivery Challenge asks Learning to revalidate." DM §25.8 revalidates when planning, then materializes; delivery may be days later.
**Plain explanation.** A result corrected between planning (Monday) and sending (Wednesday) would still produce unnecessary practice.
**Smallest fix.** Revalidate at planning **and** when the reinforcement student challenge opens; cancel it (and send nothing) if invalid.
**Status.** SPEC CORRECTION to DM §25.8 to match ADR-014. **Applied** in Domain Model rev. 1.6 (§9, §25.8; cancel reason REINFORCEMENT_INVALIDATED [W4-C6]).

## 6.2 Undecided behaviors (gaps)

| # | Gap | Proposed default | Owner | Needed by | What changes if the default changes |
|---|---|---|---|---|---|
| G1 | Where a new organization's first grading, confidence and learning policies come from | Copy platform defaults as version 1 at organization creation | Product | Phase 3 exit | Onboarding gets a mandatory setup step |
| G2 | How a learner without WhatsApp/email permission gets a link | Staff can copy or print per-learner links from the assignment page (audited; same link rules) | Product | Phase 3 exit | Without it, those learners cannot take challenges until consent exists |
| G3 | How several tries on the same question count toward progress | All tries count as observations; the learning policy weights the latest try fully and earlier tries at half (configurable) | Product | Phase 5 start | Topic-state formula and tests change; no data-model change |
| G4 | How reinforcement questions are chosen, and which grading policy applies | Published questions on the target topic, not answered by the learner in the last 14 days, 3 questions; if none, allow repeats of wrong questions; grading policy = course default | Product | Phase 5 start | Selection rule changes; no data-model change |
| G5 | Reminders | One reminder 24 h before due if not started, within quiet hours | Product | Phase 3 exit | Adds or removes a scheduled job and template |
| G6 | Telling a learner that a delayed result is ready | No message; learner sees it on next open. Optional per-organization setting to notify | Product | Phase 4 exit | Adds a delivery purpose and template |
| G7 | Meaning-based short-answer results a teacher never confirms | Remain provisional; appear in the teacher's "to confirm" list; count at half weight; after 14 days, escalate to admins | Product | Phase 4 exit | If auto-confirm after N days is chosen, the grading policy flag is turned on per organization |
| G8 | Which try counts toward the item score | Latest submitted try, multiplied by the policy's retry weight (1.0, 0.8, 0.6) | Product | Phase 4 start | Scoring formula; no data-model change |
| G9 | Who receives challenge links for minors | Both the learner's own contact (if one exists and has consent) and the guardian contact, per organization setting (default: guardian only for minors) | Product + Legal | Phase 3 exit | Contact selection rule and consent flows |
| G10 | Question order and finishing early | Any order; learner may finish with unanswered questions (counted as not attempted, not wrong) | Product | Phase 3 exit | Navigation rule; completion logic |

**Resolution of the gaps (reconciled).**

| # | Resolved by | Resulting rule |
|---|---|---|
| G1 | Wave 4 CA-6, Wave 8 LP-1 (PROPOSED DEFAULT kept) | New organizations copy platform default policies as version 1 |
| G2 | W2-2 | Staff may copy or print a learner's link; off by default; audited; normal link rules |
| G3 | superseded by LTM D1 (Wave 8) | Evidence units per D1 |
| G4 | W4-1 (G4 wording preserved exactly) | Up to 3 eligible questions; repeats only from previously wrong questions when the eligible pool is empty; grading policy = course default (organization default for organization-wide topics) |
| G5 | Wave 4 (G5 carried forward) | One reminder 24 h before due if not started |
| G6 | W6-1 | No delayed-result notification in V1 |
| G7 | W6-2 | Stays provisional; 14-day escalation; never auto-confirmed |
| G8 | W6-3 | Best weighted total among evaluated attempts (latest-try proposal not adopted) |
| G9 | W2-1 | Organization setting; MINOR/UNKNOWN → guardian only; ADULT → learner |
| G10 | W5-2 | Any order; finish early; unanswered = Not attempted |

# 7. Product-Owner Decision Register (Part 1)

All decisions touched by the core journey, in one place. Format per decision: proposed default, owner, deadline, and what changes if the default changes.

| ID | Decision | Proposed default | Owner | Deadline | If changed |
|---|---|---|---|---|---|
| X9 | Practice runs against visible tests before submitting | Yes | Product | Before Phase 4 code work | If no: remove practice-run feature; nothing else changes — **RESOLVED: W5-1** |
| X10 | Late work beyond grace | LATE_HELD for teacher decision, 14 days, then treated as rejected | Product | Phase 3 exit | Hold duration or auto-accept rule changes — **RESOLVED: W4-6 (LATE_REJECTED with reason), W5-C1** |
| Gate 1 | WhatsApp account model | Per-organization accounts; shared fallback | Product / commercial | End of Phase 3 | Onboarding and opt-out scope |
| Gate 2 | Code languages | Python 3 | Product | Before Phase 4 code strategy | Runtime images and test harnesses — **RESOLVED: W7-1 (Python 3 only in V1)** |
| Gate 3 | Link session lifetime, device limit, OTP limits | 12 h sessions; 3 devices; 5 OTP tries | Security lead | Phase 3 exit | Access friction vs forwarding risk |
| Gate 4 | Default reveal policy | Score and feedback immediately; answers after due time | Product | Phase 3 exit | Learner result screen — **still OPEN; constrained by W4-C1: answer-revealing content never before closes_at (AFTER_DUE_DATE is read as after close)** |
| Gate 5 | Consent legal basis per market | Consent page flow | Legal | Before first customer per market | Onboarding flow |
| Gate 6 | Minors' consent grantor | Guardian for minors | Legal | Before first customer per market | Consent flow; G9 |
| Gate 7 | Aggregate data use, de-identification | k = 10 | Legal | Before launch | Analytics only |
| Gate 8 | Confidence thresholds, auto-confirm delay, floor | 48 h; floor 0.4 | Product + AI lead | Before AI marking launch | Review-queue volume |
| Gate 9 | AI quality gate thresholds | per language and type | AI lead | Before AI marking launch | Which models may mark |
| Gate 10 | Safeguarding policy | Route to safeguarding lead | Product + Legal | Before launch with minors | Review routing |
| Gate 11 | Recovery and service targets | ADR-023 table | Engineering lead | Before Phase 9 | Ops design |
| Gate 12 | Queue library | After benchmark | Engineering lead | Before production sizing | None visible to users |
| G1–G10 | See Section 6.2 | — | — | — | — |

# 8. Proposed Ordering for the Remaining Specifications

Written in waves so each wave can be reviewed before the next. Specs already covered in depth by the core journey (marked ✓) will be finalized in their wave using this journey as their base.

| Wave | Theme | Specs | Why this order |
|---|---|---|---|
| 1 | Foundations everything else relies on | SPEC-096 Tenant isolation, 001 Sign-in and organization selection, 003 Roles and scope, 097 Audit, 094–095 Jobs and retries | Phase 1 builds these first; every other spec assumes them |
| 2 | Getting learners in | 005–011 Roster (incl. import and merge), 078–079 Consent, 030–032 Link, session, OTP ✓, 002 Invitation, 004 Settings | Delivery and access cannot work without roster and consent; closes G2, G9 |
| 3 | Content | 012 ✓, 019 ✓, 020 ✓, 016–018 Rubric, test suite, hints, 022 Import, 021 Document ingestion, 013–015 AI generation | Needed before challenges; AI generation after manual authoring is solid |
| 4 | Challenges and delivery | 023–028 ✓ (create, schedule, assign, materialize, deliver, expire), 061–066 Communication | Closes G5, gate 1 |
| 5 | Answering | 033–038 ✓, 039 Practice (X9), 040 Late (X10), 041 Integrity | Depends on X9/X10 answers |
| 6 | Evaluation | 042–054 ✓ incl. override, dispute, regrade, feedback | Largest risk area; closes G6–G8 |
| 7 | AI and code platforms | 067–072 AI platform, 073–077 Code execution | Detailed contracts behind wave 6 |
| 8 | Learning | 055–060 ✓ | Closes G3, G4 |
| 9 | Reporting | 084–088 | Depends on learning and evaluation |
| 10 | Privacy lifecycle | 080–083 Withdrawal, deletion, retention, provider deletion | Cuts across every earlier wave |
| 11 | Billing and operations | 089–093 Billing and budgets, 098–100 Observability, restore, break-glass | Mostly internal; lower product-owner involvement |

After this ordering is approved, Part 2 will add Sections 7–18 of the Spec Kit (cross-cutting rules: errors, authorization, tenant isolation, AI, evaluation, code, privacy, communication, reporting, billing, jobs) alongside wave 1, and the traceability matrix and readiness checklist will be maintained as waves complete.

**This part stops here, pending product-owner review of the core journey, the four spec corrections, the ten gaps and the checkpoint questions.** *(Reconciled: the ordering above was executed as Waves 1–11, all CLOSED.)*

# 9. Reconciliation Status (cross-wave reconciliation after Wave 11)

- **Spec corrections:** SC1–SC4 applied to the Domain Model rev. 1.6 (Section 6.1).
- **Gaps:** G1–G10 resolved (Section 6.2 resolution table).
- **Decisions:** X9 (W5-1), X10 (W4-6, W5-C1) and gate 2 (W7-1) resolved; gates 1, 3, 4, 8, 9, 10, 12 remain sign-off items; gate 4 constrained by W4-C1.
- **Legal gates:** LG-1 to LG-11 OPEN; no proposed retention period, deadline or financial duration is legally approved.
- **Journeys changed in place:** J5 (W2-C3, W4-5, W4-C2, SC1), J6 (W5-1, W5-2, W5-3, W5-4, W7-C3), J7 (W4-6, W5-C1, W5-C2, W5-C3/C4, W11-C4/C7, J-6 wording), J9 (W4-C1, W6-1…W6-5, W6-C3, W6 DI), J12 (W6-4, W6-6, W9-C2, W9-C3, W9-3, W10-2), JV4, JV5. J10 and J11 were updated at Wave 8 and are unchanged.
- **Conflicts:** none touch Part 1. Billing conflicts U1 and U2 were closed by product-owner decision: `overrun_pct` default 0%; `max_learners` counts ACTIVE learners, point-in-time. See Domain Model §35.
