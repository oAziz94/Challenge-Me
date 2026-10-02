# Challenge Me — V1 Spec Kit — Part 2, Wave 8: Learning

> Capability: the Learning module as a running capability: evidence intake from evaluation heads, observations, evidence units, TopicState, TopicTrajectory, learning signals, reinforcement items, LearningPolicyVersion management, recalculation and rebuild, and the learner, teacher and report read models (SPEC-055 to 060).
>
> Status: APPROVED and CLOSED. W8-1 to W8-3 locked; W8-C1 to W8-C4 reconciled; reconciliation applied to Domain Model rev. 1.5, Spec Kit Part 1 (J10, J11) and the LTM D9 note; LG-1 to LG-9 carried forward and OPEN. Specification only; no implementation.
>
> Authoritative inputs: Learning Trajectory Model rev. 13 (LTM, CLOSED; incorporated by reference, not restated or reopened), Waves 1–7 (closed), Spec Kit Part 1 (J10–J12), Domain Model rev. 1.4 (DM §12, §17, §19–21, §29), ADR-011, ADR-014, ADR-016, ADR-019, approved C1–C11, C7-A, C7-B, D1, D9, D11–D17.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 8 decisions as locked at closure; the Wave 8 Closure at the end lists what remains open.

**Relationship to the Learning Trajectory Model.** The LTM is closed and authoritative for how evidence, current ability, trajectory, signals, windows, strength, minimum evidence and learner and guardian display are calculated. This wave does not restate its formulas or change its parameters. It specifies what the LTM left to the capability: how evidence arrives from the other waves, how reinforcement items are created and handed to Challenge, who manages learning rules, how rebuilds run, and what each audience can read. Where this wave cites an LTM value marked PROPOSED DEFAULT there, it stays a proposed default.

# 1. Capability Overview

**Plain language.** Learning turns marked answers into an honest, up-to-date picture of what each learner knows. It groups each question's tries into one piece of evidence, works out each learner's level on each topic (Strong, Developing, Needs practice, Not enough evidence), shows teachers which way each learner is moving and why, and decides when a learner needs extra practice. Everything it shows can be recalculated from the underlying results and always changes when a result changes.

**Learning owns:** observations, evidence units, TopicState, TopicTrajectory, learning signals, trajectory transitions, reinforcement items and their revalidation, LearningPolicyVersions, projection rebuilds, and the learner-safe and report-safe read projections.

**Learning does not own:**

| Boundary | Learning uses | The other module decides | Source |
|---|---|---|---|
| Learning vs Evaluation | `EvaluationHeadChanged` and a content-free summary with `performance_score` | Evaluation decides results; Learning never re-marks and never uses the item grade (W6-3) | EXISTING (ADR-011) + LOCKED (C2, W6-3) |
| Learning vs Assessment | Submission context (student challenge, item, server time, hints used, timing status) | Assessment owns attempts and timing | EXISTING (C5) + Wave 5 |
| Learning vs Content | Question identity, version difficulty, topic weights, topic mappings and scope | Content owns topics and versions | EXISTING (C3, C5, C7-B) + Wave 3 |
| Learning vs Challenge | Reinforcement items and revalidation | Challenge decides when and how reinforcement is delivered, selects its questions (W4-1) and never decides need | LOCKED (D13, W4-C5, RF-1 to RF-7) |
| Learning vs Reporting | Filtered projections | Reporting builds dashboards, guardian reports and snapshots (Wave 9) | EXISTING (DM §17) + LOCKED (D12) |
| Learning vs Roster | Pseudonyms | Roster resolves pseudonyms for permitted modules | EXISTING (DM §5.B, SC3) |

# 2. Actors

| Actor | Role here | Source |
|---|---|---|
| System (projection handler, recompute jobs, aging sweep, rebuild runner) | Records observations, recomputes, creates and cancels reinforcement items | EXISTING (DM §12.3, C4) |
| Challenge | Revalidates and schedules reinforcement; reports delivery and planning outcomes | EXISTING (DM §9.3) + Wave 4 |
| Owner, Admin | Create and publish organization and course LearningPolicyVersions (only they; not teachers); request per-learner repair rebuilds | LOCKED (W8-2) |
| Teacher (in scope) | Reads learner and cohort learning views | EXISTING (LTM §17) |
| Learner | Reads own topic states and improving messages with LEARNER_HOME | LOCKED (D11) |
| Guardian | Receives reports only (D12, Wave 9) | LOCKED (D12) |
| Platform operator | Tenant-wide rebuilds and repairs | LOCKED (W8-2) |

# 3. Core Lifecycle

```
EvaluationHeadChanged {submission, revision, status, origin}
 -> ProjectObservation (idempotent on submission + revision; stale revisions ignored)
      + submission context (Assessment) + version metadata (Content)
 -> learning_event (RECORDED / REPLACED / RETRACTED)
 -> RecomputeTopicState(learner, affected topics, as_of)   [coalesced per learner]
      evidence units (D1) -> TopicState (D15) + TopicTrajectory + six signals (D14)
      -> TrajectoryTransition if anything displayed changed
      -> reinforcement rule on TopicState only (D13)
           -> create / cancel / supersede ReinforcementItem -> events to Challenge
Challenge: revalidate (plan) -> REINFORCEMENT assignment -> revalidate (open) -> deliver
Daily aging sweep: recompute learners whose windows or decay changed (C4)
Policy publish / topic mapping / scope change / merge: projection_rebuild
```

# 4. Behavioral Rules

## 4.1 Evidence intake

| # | Rule | Label |
|---|---|---|
| IN-1 | One observation per evaluable submission, replace semantics, keyed by submission; only a higher head revision replaces it; duplicates and out-of-order events change nothing. | EXISTING (DM §12.3) |
| IN-2 | The observation takes `performance_score` (before grading adjustments), hints used, attempt number, server submission time, student challenge, item, question id, version difficulty, topic weights, assignment kind and status class. It never takes the adjusted total or the item grade. | LOCKED (C2, C3, C5, W6-3) |
| IN-3 | Eligibility and status weights follow LTM §3: CONFIRMED 1.0; human-locked 1.0; PROVISIONAL 0.5; NEEDS_REVIEW 0; PENDING none; drafts and practice runs never; LATE_HELD not while held; LATE_ACCEPTED at its original position; LATE_REJECTED never; unanswered never. | LOCKED (LTM §3, D1, W4-6, W5-2) |
| IN-4 | An unconfirmed SEMANTIC_AI result remains PROVISIONAL (W6-2) and keeps provisional weight, including after its 14-day review task is created. | LOCKED (W6-2) + LTM §3 |
| IN-5 | Submissions on a cancelled assignment and submissions made before a learner left a cohort are normal evidence. | LOCKED (W4-3) + EXISTING |
| IN-6 | Reinforcement answers are normal evidence; only the D9 repeat-exposure factor, by question identity, reduces weight. | LOCKED (D9, D16) |
| IN-7 | An earlier appearance of a question that produced no evidence unit (for example left unanswered) does **not** make a later answered appearance a repeat. Only an earlier answered, countable evidence unit establishes repeat exposure. Recorded as the approved clarification of LTM D9. | LOCKED (W8-3, D9) |
| IN-8 | Learning stores pseudonyms only; no learner content, names or contact data. | EXISTING (DM §12.2) |

## 4.2 Calculation

| # | Rule | Label |
|---|---|---|
| CA-1 | Evidence units, current ability, TopicState, TopicTrajectory, signals, strength and minimum evidence are computed exactly as the LTM defines, as one pure function of eligible evidence, topic mappings, the applicable LearningPolicyVersion and `as_of`. | LOCKED (LTM §2, §4–§11, §16.2) |
| CA-2 | The applicable version per topic: the course version for a course-scoped topic if ACTIVE, else the organization version; the organization version for organization-wide topics. Never chosen by an assignment. | LOCKED (C7, C7-A) |
| CA-3 | Recompute jobs are coalesced per learner; a live recompute and a full rebuild for the same `as_of` give identical results. | EXISTING (LTM §16.2, DM §29) |
| CA-4 | A daily aging sweep recomputes learners whose windows, horizon or decay changed with the date. | LOCKED (C4) |
| CA-5 | Every change to direction, stability, strength, active signals or applicable policy version writes an append-only TrajectoryTransition with its reason. | LOCKED (LTM §16.3) |

## 4.3 Reinforcement items

| # | Rule | Label |
|---|---|---|
| RI-1 | Reinforcement need is decided only from the current TopicState and the reinforcement rules of the applicable LearningPolicyVersion; trajectory and signals are never inputs. | LOCKED (D13, C11) |
| RI-2 | **Creation rule.** While the learner is eligible (RI-7) and the topic's TopicState is NEEDS_PRACTICE: at most **one open item** (PENDING or SCHEDULED) per learner and topic; no new item on a topic within **7 days** of the last delivered reinforcement on that topic; an item's due time is **48 hours** after creation; at most **2** items scheduled or delivered per learner in any **rolling 7 days**, and when the cap is reached the item's due time moves to the first time within the cap (**postponed, never dropped**); an item not scheduled within **14 days** of creation EXPIRES. Learning decides need; Challenge decides when and how delivery occurs; trajectory and signals never trigger reinforcement. | LOCKED (W8-1, W8-C3, D13) |
| RI-3 | Learning enforces the weekly reinforcement cap at item creation; Challenge never enforces it. | LOCKED (W4-C5) |
| RI-4 | An item's basis is the TopicState that satisfied the rule, its policy version, and the observation ids and head revisions behind it. | LOCKED (C11) |
| RI-5 | `RevalidateReinforcementItem` returns INVALID if any basis revision is no longer current and the rule no longer holds, or if the learner is no longer eligible (RI-7). Challenge calls it at planning and at opening. | EXISTING (SC4, DM §12.4) |
| RI-6 | A newer item for the same learner and topic supersedes a PENDING one; changes that remove the need cancel PENDING and SCHEDULED items. | EXISTING (DM §12.4) |
| RI-7 | No item is created or kept for a learner who is INACTIVE, merged away or deleted, or who has no active enrollment in a course where the topic applies (for an organization-wide topic: any active enrollment). | EXISTING (J11) + PROPOSED DEFAULT (enrollment test) |
| RI-8 | If Challenge cannot plan reinforcement because no eligible question exists (Wave 4 RF-6), it calls `MarkReinforcementUnplannable`; the item becomes EXPIRED with reason NO_ELIGIBLE_QUESTIONS and the outcome is shown on the teacher's learner row; no notification is sent. | LOCKED (W8-C2) |
| RI-9 | Items and their outcomes are visible to teachers on the learner row; no teacher or learner notification is sent about item creation or cancellation. | PROPOSED DEFAULT (Part 1 J12 checkpoint: dashboard only) |

## 4.4 Learning rules (LearningPolicyVersion)

| # | Rule | Label |
|---|---|---|
| LP-1 | Versions are immutable once ACTIVE; one ACTIVE per organization and per course. Every organization starts with platform defaults as version 1 (Part 1 G1). | EXISTING (DM §12.1, G1) |
| LP-2 | Only Owners and Admins create and publish organization- and course-scoped LearningPolicyVersions. Course teachers (and all other teachers) have no learning-policy management permission in V1. | LOCKED (W8-2) |
| LP-3 | Publication shows preview counts of affected learners and topics, is audited, and rebuilds exactly the topics whose applicable version changes. | LOCKED (W8-2) + EXISTING (DM §12.3) |
| LP-4 | Values locked by the LTM (D1, D15, C6) can still be changed only through a new version; the platform defaults keep the locked values. | LOCKED (D15 note) |
| LP-5 | Transitions caused by a policy change carry reason POLICY_CHANGE and are excluded from the "recent changes" view. | LOCKED (LTM §15) |

## 4.5 Rebuild and repair

| # | Rule | Label |
|---|---|---|
| RB-1 | Rebuild reasons: POLICY_CHANGE, TOPIC_MAPPING, TOPIC_SCOPE_CHANGE, MERGE, REPAIR. | EXISTING (DM §12.2, C7-B) |
| RB-2 | Owners and Admins may request a per-learner repair rebuild; tenant-wide rebuilds are platform-operator operations only. Both are audited. | LOCKED (W8-2) |
| RB-3 | A rebuild never rewrites past transitions or sent report snapshots; it adds transitions for resulting changes. | LOCKED (LTM §16.3, D12) |
| RB-4 | While a rebuild is running, views show the last completed values with "Recalculating" and the rules version. | PROPOSED DEFAULT |
| RB-5 | Learner merge: the duplicate's observations move to the survivor's pseudonym; the survivor is rebuilt. Learner deletion: observations are RETRACTED and the pseudonym's rows purged. | EXISTING (DM §12.2, §25.11) |

## 4.6 Read models

| # | Rule | Label |
|---|---|---|
| RM-1 | **Teacher view** (learner × topic, cohort × topic) follows LTM §17, limited to the teacher's scope; names come from Reporting's pseudonym resolution, never from Learning. | LOCKED (LTM §17) + EXISTING |
| RM-2 | TopicState and TopicTrajectory are calculated from all of the learner's evidence (one per learner and topic). In the teacher's evidence strip, units outside the teacher's authorization (another cohort's or course's work, or former-cohort work not covered by W6-6) expose **only date, score band and markers**; never question text, answer content or answer links. Presentation and authorization only; Learning calculations are unchanged. | LOCKED (C7, W8-C1) |
| RM-3 | **Learner view** (LEARNER_HOME only): topic state for topics with evidence, and "You're improving on [topic]" only when IMPROVING with strength ≥ MODERATE; nothing else. The projection exposes only state and `show_improving_message`. | LOCKED (D11) |
| RM-4 | **Guardian reports** read the same filtered projection; frozen in snapshots (Wave 9). | LOCKED (D12) |
| RM-5 | No learning alerts or notifications to anyone in V1; PERSISTENT_DIFFICULTY appears first in the cohort view by fixed ordering. | LOCKED (D17) |
| RM-6 | Reinforcement items appear on the learner row: pending, scheduled, delivered, cancelled (with reason) or expired (with reason). | PROPOSED DEFAULT |

# 5. State Models

## 5.1 Observation status class

PENDING (head without an authoritative result; contributes zero evidence) → PROVISIONAL / REVIEW_PENDING / CONFIRMED (per head) → replaced by the next revision; → RETRACTED (learner deletion). PENDING added by W8-C4 (DM rev. 1.5).

## 5.2 ReinforcementItem

| From | To | Actor | Guard / reason |
|---|---|---|---|
| — | PENDING | projection | RI-2 creation rule (W8-1); due time postponed when the cap is reached (W8-C3) |
| PENDING | SCHEDULED | Challenge | revalidation at planning succeeded |
| PENDING / SCHEDULED | CANCELLED | projection or Challenge | rule no longer holds; basis changed; learner ineligible; revalidation failed; consent or deletion |
| PENDING | SUPERSEDED | projection | newer item for same learner and topic |
| SCHEDULED | DELIVERED | Challenge | reinforcement student challenge AVAILABLE |
| PENDING / SCHEDULED | EXPIRED | sweep or Challenge | not scheduled within 14 days (W8-1); `MarkReinforcementUnplannable` → NO_ELIGIBLE_QUESTIONS (W8-C2) |
| terminal | any | — | **invalid** |

## 5.3 Projection rebuild

REQUESTED → RUNNING → COMPLETED / FAILED; FAILED can be re-requested (REPAIR).

## 5.4 LearningPolicyVersion

DRAFT → ACTIVE → RETIRED (when replaced); ACTIVE is immutable.

# 6. Permissions and Tenant Boundaries

| Action | Owner | Admin | Teacher (org / course / cohort) | Learner | Guardian |
|---|---|---|---|---|---|
| View learner × topic and cohort × topic learning views | ✓ | ✓ | ✓ in scope (RM-2 for out-of-scope units) | ✗ | ✗ |
| View own topic states and improving messages | — | — | — | ✓ LEARNER_HOME | ✗ |
| Receive guardian report | — | — | — | — | ✓ with consents (Wave 9) |
| Create and publish learning rules (preview, audited) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Request per-learner repair rebuild | ✓ | ✓ | ✗ | ✗ | ✗ |
| Create or cancel a reinforcement item manually | ✗ | ✗ | ✗ | ✗ | ✗ |

Reinforcement is never created by hand in V1 (PROPOSED DEFAULT; need is Learning's decision, RI-1). All Learning rows are tenant-owned and keyed by pseudonym.

# 7. Data Ownership

| Data | Stored / derived | Source of truth | Rebuildable | Retention |
|---|---|---|---|---|
| Observations | stored, replace semantics | derived from heads | yes | R1 |
| Learning events | append-only | history of observation changes | — | R1 |
| Evidence units, TopicState, TopicTrajectory, signals | derived projections | no | yes | R1 |
| Trajectory transitions | append-only | history of displayed values | not rewritten | R1 |
| Reinforcement items | stored | Learning's decision | re-derivable for PENDING only | R1 |
| LearningPolicyVersions | stored, immutable when ACTIVE | yes | — | R1 |
| Report snapshots | Reporting | what was sent | no | per Wave 9 |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Evaluation → Learning | B | `EvaluationHeadChanged` | intake |
| Learning → Evaluation | A (read) | `GetEvaluationSummary` | performance score, status, hints, attempt, tags |
| Learning → Assessment | A (read) | submission context | units (C5) |
| Learning → Content | A (read) | version metadata, topic mappings, scope | units, topics |
| Content → Learning | B | `TopicMappingChanged`, `TopicScopeChanged` | rebuild |
| Roster → Learning | B | `LearnerMerged`, `LearnerDeactivated`, `EnrollmentEnded` | rebuild, item eligibility |
| Learning → Challenge | B | `ReinforcementItemCreated`, `ReinforcementItemCancelled` | delivery |
| Challenge → Learning | A | `RevalidateReinforcementItem`, `MarkReinforcementScheduled`, `MarkReinforcementDelivered`, `MarkReinforcementUnplannable(NO_ELIGIBLE_QUESTIONS)` | item state |
| Learning → Reporting | A (read) | `GetTopicStates`, teacher learning views, filtered learner and report projections | dashboards, reports |
| Privacy → Learning | A | pseudonym purge | deletion |

No new module. New items: observation status class PENDING (W8-C4); `MarkReinforcementUnplannable` and reason NO_ELIGIBLE_QUESTIONS (W8-C2); restricted evidence-strip entries (W8-C1).

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Duplicate or out-of-order head events | Ignored unless revision is higher |
| Summary fetch fails | Job retries (Wave 1 policy); the observation stays at its previous revision |
| Many head changes for one learner (regrade) | Recompute coalesced per learner |
| Recompute job crashes | Re-run; pure function, same result |
| Rebuild fails midway | Marked FAILED; views keep last completed values; repair re-run |
| Item created then cancelled before Challenge sees creation | Tombstone; late creation event ignored (DM §20) |
| Revalidation at opening fails | Challenge cancels (REINFORCEMENT_INVALIDATED, Wave 4) |
| Learner deleted during recompute | Purge wins; recompute finds no pseudonym and stops |
| Aging sweep missed a day | Next run recomputes with the current `as_of`; result identical to a daily run |

# 10. Privacy / Consent

- Learning holds pseudonyms and derived numbers only; no answers, names or contacts (DM §12).
- Processing-consent withdrawal (AI_PROCESSING) does not retract evidence already produced (Wave 2 C-9); LG-5 governs.
- Guardian reports need GUARDIAN_REPORTING consent and REPORTS channel consent (D12, Wave 2).
- Deletion retracts observations and purges pseudonym rows (Wave 10).
- Profiling: learning states and signals are educational assessments shown to staff; learners see only states and positive messages (D11). Whether any automated-decision rule applies to learning states is covered by the LG-8 question for results, not a new gate.
- Telemetry: no pseudonyms joined with names, no answers, no topic-state values per learner.

# 11. Audit / Observability

**Audited:** learning-rules publication (with preview counts); topic mapping and scope changes (Content); repair and tenant-wide rebuilds; reinforcement expiries for NO_ELIGIBLE_QUESTIONS (system).

**Metrics:** head-event to observation lag; recompute latency and backlog; coalescing ratio; rebuild duration and failures; live-vs-rebuild property-test results (CI); aging sweep duration; reinforcement items by outcome (created, scheduled, delivered, cancelled by reason, expired by reason); share of topic states by class (aggregate only).

**Teacher visibility:** LTM §17 plus reinforcement item status on the learner row (RM-6) and "Recalculating" during rebuilds (RB-4).

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Teacher overrides a result | Observation replaced; recompute; transition RESULT_CORRECTED; items revalidated | LOCKED (LTM §13) |
| Regrade across 500 learners | Coalesced recompute; transitions REGRADE; no notifications | LOCKED (LTM §14) |
| Unconfirmed semantic result reaches 14 days | Still provisional weight; review task exists (W6-2) | LOCKED |
| Late work accepted and becomes the first attempt | Unit recomputed with the new first attempt at 0.5 / 0.5 | LOCKED (D1) |
| Retry after COMPLETED | Joins the same unit; COMPLETED unaffected | LOCKED (W5-C3, D1) |
| Attempt 1 performance 0.8; retry performance 0.6 (total 0.48) | Item grade 0.8 (best total); evidence unit 0.5 × 0.8 + 0.5 × 0.6 = 0.70 from performance scores | LOCKED (C2, D1, W6-3) |
| Organization-wide topic answered in two courses | One TopicState from all evidence; each teacher sees out-of-scope units without content | LOCKED (C7) + W8-C1 |
| Learner transfers cohort | Evidence kept; new teacher sees former-cohort units restricted (W2-5, W8-C1) | LOCKED |
| Needs practice but no questions available | Item EXPIRED (NO_ELIGIBLE_QUESTIONS); visible to teacher | correction W8-C2 |
| Weekly cap reached | Item created with a postponed due time; never dropped | LOCKED (W8-1, W8-C3) |
| Question left unanswered in an earlier challenge, answered later | Not a repeat; full weight (no repeat-exposure factor) | LOCKED (W8-3) |
| Course teacher tries to publish course learning rules | Refused | LOCKED (W8-2) |
| Learning rules published mid-day | Rebuild; POLICY_CHANGE transitions hidden from "recent changes" | LOCKED (LTM §15) |
| Learner deleted | Observations retracted; states disappear; sent reports unchanged | EXISTING |

# 13. Decisions (locked at closure)

No Wave 8 product decision remains open.

| ID | Locked decision | Applied in |
|---|---|---|
| W8-1 | Reinforcement is created while the learner is eligible and the topic is NEEDS_PRACTICE, with one open item per learner and topic, 7-day topic spacing, 48-hour delay, a rolling 7-day cap of 2 scheduled or delivered items (postpone, never drop), and expiry if not scheduled within 14 days. Learning decides need; Challenge decides when and how; trajectory and signals never trigger reinforcement. | RI-2 |
| W8-2 | Only Owners and Admins create and publish organization and course LearningPolicyVersions (preview counts, audited, rebuild exactly the affected topics); Owners and Admins may request per-learner repair rebuilds; tenant-wide rebuilds are platform-operator operations; no learning-policy permission for course teachers in V1. | LP-2, LP-3, RB-2 |
| W8-3 | An earlier unanswered appearance does not make a later answered appearance a repeat; only an earlier answered, countable evidence unit establishes repeat exposure. | IN-7; LTM D9 note |

## Legal / compliance gates

No new legal gate. LG-1 to LG-9 are carried forward and remain OPEN; none is resolved or reopened here. LG-3 (minors), LG-5 (withdrawal effects) and LG-8 (automated decisions) touch this capability.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| IN-1 … IN-6, IN-8 | DM §12.3, LTM §3, C2, C3, C5, D1, D9, D16, W4-3, W4-6, W5-2, W6-2, W6-3 | EXISTING / LOCKED |
| IN-7 | LTM D9, W8-3 | LOCKED |
| CA-1 … CA-5 | LTM §2–§16, C4, C7, C7-A | LOCKED |
| RI-1, RI-3, RI-4 | D13, C11, W4-C5 | LOCKED |
| RI-2 | DM §12.2, J11, W8-1, W8-C3 | LOCKED |
| RI-5, RI-6 | SC4, DM §12.4 | EXISTING |
| RI-7, RI-9 | J11 | EXISTING / PROPOSED |
| RI-8 | J11, Wave 4 RF-6, W8-C2 | LOCKED |
| LP-1, LP-4, LP-5 | DM §12.1, G1, D15, LTM §15 | EXISTING / LOCKED |
| LP-2 | DM §5.4, W8-2 | LOCKED |
| LP-3, RB-2 | W8-2 | LOCKED |
| RB-4, RM-6 | new | PROPOSED DEFAULT |
| RB-1, RB-3, RB-5 | DM §12, LTM §16, D12 | EXISTING / LOCKED |
| RM-1, RM-3 … RM-5 | LTM §17–§18, D11, D12, D17 | LOCKED |
| RM-2 | W2-5, W6-6, C7, W8-C1 | LOCKED |
| §5.1 | DM §12.2, W8-C4 | LOCKED |

# 15. Behavioral Acceptance Criteria

The LTM §20 invariants and acceptance criteria apply unchanged. In addition:

**Intake**
1. Only a higher head revision changes an observation; duplicates and reordered events leave it unchanged.
2. The observation's score is the performance score; changing the grading policy's hint penalty or retry weight never changes any learning value.
3. The item grade (W6-3) is never read by Learning.
4. A head in PENDING yields an observation of class PENDING that contributes nothing.
5. A LATE_HELD submission contributes nothing; after acceptance it joins its unit at its original server position.
6. A LATE_REJECTED submission never produces evidence.
7. An unconfirmed SEMANTIC_AI result counts at provisional weight before and after its 14-day review task.
8. Submissions on a cancelled assignment are counted as evidence.
9. No Learning row contains a learner name, contact value or answer content.

**Calculation**
10. For any learner and `as_of`, the live projection equals a full rebuild.
11. A missed aging-sweep day is fully caught up by the next run.
12. Publishing a course version recalculates exactly that course's course-scoped topics; publishing an organization version recalculates organization-wide topics and course-scoped topics of courses without an ACTIVE course version.
13. Every TopicState and TopicTrajectory records the applicable `policy_version_id`, never one chosen by an assignment.
14. Policy-change transitions do not appear in "recent changes".

**Reinforcement**
15. No reinforcement item is created, kept or cancelled on the basis of trajectory direction, stability, strength or any signal.
16. No item is created for a topic in INSUFFICIENT_EVIDENCE, DEVELOPING or STRONG.
17. Learning, not Challenge, enforces the weekly cap.
18. An item for a learner who is INACTIVE or has no eligible enrollment is not created, and an existing one is cancelled.
19. When Challenge finds no eligible question, the item becomes EXPIRED (NO_ELIGIBLE_QUESTIONS), appears on the learner row and sends no message.
20. A teacher override that lifts the topic out of NEEDS_PRACTICE cancels pending and scheduled items for it.
21. No person can create or cancel a reinforcement item by hand.

**Read models and permissions**
22. A teacher never sees question text or answer links for evidence units outside their authorization, although those units count in the state they see.
23. A former-cohort teacher sees answer links only for submissions covered by W6-6.
24. The learner view shows only topic states and the improving message, and requires LEARNER_HOME.
25. A challenge-scoped learner session cannot read progress.
26. No learning notification or alert is sent to any teacher, learner or guardian.
27. Only Owners and Admins can create or publish learning rules; a course teacher's attempt is refused; publication is audited with its preview counts (W8-2).
28. Owners and Admins can request a per-learner repair rebuild; it is audited and changes nothing if evidence is unchanged.
29. A rebuild never alters past transitions or sent report snapshots.
30. After a learner merge, the survivor's states equal a rebuild from the combined evidence.

**Wave 8 decisions**
31. With one PENDING item on a topic, no second item is created for that learner and topic (W8-1).
32. No item is created on a topic within 7 days of the last reinforcement delivered on it (W8-1).
33. A new item's due time is 48 hours after creation (W8-1).
34. A third item within a rolling 7 days is created with a due time moved to the first slot within the cap; it is never discarded (W8-1, W8-C3).
35. An item not scheduled within 14 days of creation becomes EXPIRED (W8-1).
36. Publishing learning rules rebuilds exactly the topics whose applicable version changes, and no others (W8-2).
37. A tenant-wide rebuild cannot be requested by an Owner or Admin; only by a platform operator (W8-2).
38. A question left unanswered in an earlier challenge and answered later carries no repeat-exposure factor; a question answered earlier and answered again does (W8-3, D9).
39. An out-of-scope evidence-strip unit returns only date, score band and markers; the API response contains no question text, answer content or link (W8-C1).
40. When Challenge reports no eligible questions, the item is EXPIRED with reason NO_ELIGIBLE_QUESTIONS, the teacher's learner row shows it, and no message is sent (W8-C2).
41. A PENDING observation contributes zero evidence; when its result arrives, the same observation is replaced by the next revision (W8-C4).

---

# Wave 8 Closure

**Status: APPROVED and CLOSED.** The Learning Trajectory Model stays CLOSED and unchanged except for the W8-3 clarification recorded against D9 (LTM revision 14).

## Binding rules for later waves

1. Learning decides reinforcement need from the current TopicState only; Challenge decides when and how; trajectory and learning signals never trigger reinforcement.
2. Learning uses performance scores and D1 evidence units, never the item grade or adjusted totals.
3. One TopicState and TopicTrajectory per learner and topic, calculated from all evidence under the applicable policy version; authorization limits only what is displayed (W8-C1).
4. Learning projections are deterministic and rebuildable; rebuilds never rewrite past transitions or sent report snapshots.
5. No learning alert or notification is sent to anyone in V1.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W8-1 | Reinforcement while eligible and NEEDS_PRACTICE: one open item per learner and topic; 7-day topic spacing; 48-hour delay; rolling 7-day cap of 2 scheduled or delivered items, postponed not dropped at the cap; expiry if not scheduled within 14 days. |
| W8-2 | Only Owners and Admins create and publish organization and course LearningPolicyVersions (preview counts, audited, rebuild exactly the affected topics); Owners and Admins request per-learner repair rebuilds; tenant-wide rebuilds are platform-operator operations; no learning-policy permissions for course teachers in V1. |
| W8-3 | An earlier unanswered appearance does not make a later answered appearance a repeat; only an earlier answered, countable evidence unit establishes repeat exposure (clarifies D9). |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W8-C1 | Calculation uses all learner evidence; out-of-authorization strip units expose only date, score band and markers; never question text, answer content or answer links. |
| W8-C2 | `MarkReinforcementUnplannable` → item EXPIRED (NO_ELIGIBLE_QUESTIONS) → shown on the teacher's learner row → no notification. |
| W8-C3 | A weekly-cap collision postpones the item; it is never silently dropped. |
| W8-C4 | Observation status class PENDING; contributes zero evidence until an authoritative result exists. |

## 3. Legal / compliance gates

No new gate. LG-1 to LG-9 carried forward and OPEN; none resolved or reopened. LG-3, LG-5 and LG-8 touch this capability.

## 4. Remaining non-blocking proposed defaults

Enrollment test for reinforcement eligibility (RI-7); "Recalculating" during rebuilds (RB-4); reinforcement item status on the learner row (RM-6); no manual reinforcement in V1. LTM values that are PROPOSED DEFAULTS there (D2–D8, the D9 factor value 0.5, D10 wording, parameters of the five non-C6 signals) remain proposed defaults.

## 5. Reconciliation applied

| Document | Change applied |
|---|---|
| Domain Model rev. 1.5 | §5.4 `learning_policy.manage` and `learning.rebuild` (Owner, Admin; tenant-wide rebuilds platform only); §12.2 observation status class PENDING; LearningPolicyVersion `reinforcement` parameters (48 h, 7-day spacing, one open per topic, 2 per rolling 7 days with postponement, 14-day expiry); reinforcement_item `expiry_reason` (UNSCHEDULED_14_DAYS, NO_ELIGIBLE_QUESTIONS) and cancel reason LEARNER_INELIGIBLE; §12.4 creation rule, W8-3 note, `MarkReinforcementScheduled / Delivered / Unplannable`; §17 evidence-strip authorization; §19 contract C13a; §21 `ExpireReinforcementItems` job; §25.8 creation and unplannable path; §29 Wave 8 tests; §31 ADR-014 amendment. |
| ADR-014 | Amendment recorded in Domain Model §31 (rev. 1.5): creation rule in LearningPolicyVersion; unplannable path. The ADR set PDF itself is not regenerated in this step. |
| Spec Kit Part 1 | J10: evidence units (D1), PENDING counts nothing, G3 marked superseded. J11: W8-1 rule, W8-C2 unplannable behavior, W8-C3 postponement. |
| Learning Trajectory Model | Revision 14: D9 row records the approved W8-3 clarification; nothing else changed. |

Reconciliation items recorded at the closures of Waves 2 to 7 remain listed in those waves and are not applied by this step.

**STOP — Wave 8 closed. Wave 9 not started.**
