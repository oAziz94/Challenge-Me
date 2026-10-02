# Challenge Me — V1 Spec Kit — Learning Trajectory Model (G11)

> Status: For product-owner approval. No implementation until approved.
>
> Sources: Domain Model & Implementation Contract V1.3 (DM §n, X-corrections), ADR set V1.3 (ADR-nnn), Implementation Architecture V1.3 (Arch §n), Spec Kit Part 1 (J-stages, G-gaps, SC-corrections).
>
> Approved inputs: G11 (trajectory is a first-class V1 learning output) and the principles listed in §0.
>
> Revision 2: D9 + D16 approved (reinforcement evidence; repeat exposure by question identity). Changed sections: §3, §4.1, §4.3 (new), §19.2, §19.3, §20, §21.8 (new), §22.
>
> Revision 3: D1 approved (FIRST_AND_FINAL, α = 0.5). Changed sections: §4, §4.1, §19.3, §20, §21.6, §22, §23 (C1).
>
> Revision 4: D1 clarified (chronological first and final attempts; unit pending while a required attempt awaits review). Changed sections: §4.1, §20, §21.6, §22.
>
> Revision 5: Late-held attempts approved (order by original submission; acceptance never reorders). Changed sections: §3, §4.1, §16.1, §20, §21.9 (new), §22.
>
> Revision 6: D11 approved (learner view: Option A). Changed sections: §18, §20, §22.
>
> Revision 7: D12 approved (guardian reports: Option A). Changed sections: §18.1 (new, replaces the D12 paragraph), §19.1, §20, §22.
>
> Revision 8: D13 approved (trajectory does not drive reinforcement). Changed sections: §2.4 (new), §9, §12, §13, §20, §21.7, §22.
>
> Revision 14: records the approved Wave 8 clarification W8-3 against D9 (§22) only. No model, parameter or other decision changed; this document remains CLOSED.
>
> Revision 13: C7-A (course policy fallback) and C7-B (topic scope changes) approved. Changed sections: §15, §16.1, §16.3, §20, §22, §23.
>
> Revision 12: C7 approved and reconciled (applicable policy by topic scope). Changed sections: §15, §16.1, §19.2, §20, §23.
>
> Revision 11: C6 approved and reconciled (REPEATED_MISCONCEPTION rule locked). Changed sections: §9, §19.3, §20, §22, §23.
>
> Revision 10: C10 and C11 reconciled in Domain Model rev. 1.1 (§23 status only).
>
> Revision 9: D14–D17 approved. Changed sections: §2.2, §9, §12, §14, §15, §17, §19.3, §20, §22, §23.

# 0. Approved Principles This Model Must Satisfy

| # | Principle (approved) | Where it is enforced in this model |
|---|---|---|
| P1 | Current ability determines the learner's present topic state | §2, §4.3 |
| P2 | Trajectory adds context about change over time | §1, §6 |
| P3 | Retries are kept as evidence but are not independent full evidence | §4 (evidence units) |
| P4 | Effective evidence comes from the current authoritative evaluation result | §3 |
| P5 | Teacher decisions outrank machine results | §13 |
| P6 | If an evaluation changes, learning recalculates | §13, §14, §16 |
| P7 | Learning projections are rebuildable and deterministic | §16, §19, §20 |
| P8 | No numeric "trajectory score" without a strong documented reason | §6.4 (none introduced) |
| P9 | Trajectory is explainable from its supporting evidence | §6.5, §17 |
| P10 | Trajectory must not silently contradict the current topic state | §2.3, §20 |

**Design stance.** A deterministic, policy-driven model: every output is a pure function of (the learner's eligible evidence, topic mappings, the active LearningPolicyVersion, and an "as of" date). No machine learning, no hidden state, no per-learner model training. All numeric parameters live in LearningPolicyVersion so they can be tuned later without changing the model.

# 1. What "Learning Trajectory" Means

**Plain language.** A topic state answers *"Where is this learner now on this topic?"* A trajectory answers *"Which way have they been moving, how steadily, and how sure are we?"* Two learners can both be "Developing" on quadratics: one climbing from weak results, the other slipping from strong ones. The teacher should treat them differently. The trajectory makes that visible, and always shows the answers it is based on.

**Contract.** For each (learner, topic), the Learning module derives a **TopicTrajectory** with four parts. None of them is a single score:

| Part | Values | Meaning |
|---|---|---|
| Direction | IMPROVING, DECLINING, NO_CLEAR_CHANGE, NOT_ENOUGH_EVIDENCE | Whether recent performance differs from earlier performance by more than normal ups and downs |
| Stability | CONSISTENT, VARIABLE, ERRATIC | How much results vary around their level within each period |
| Evidence strength | LOW, MODERATE, HIGH | How much we should trust the direction, with the reasons |
| Context | difficulty shift, coverage, provisional share, window dates, recent level band, active learning signals | What a teacher needs in order to interpret the direction |

# 2. Relationship Between Current Topic State and Trajectory

**Plain language.** Both come from the **same list of evidence**, under the **same policy**, at the **same moment**. The topic state is a level; the trajectory is a direction. A learner can be "Strong, but recent results are lower", or "Needs practice, but improving". Both statements are true together and are shown together. The trajectory never replaces or overrides the topic state.

## 2.1 Shared evidence layer

```
Evaluation head (authoritative result per submission)
  -> Learning observation (one per submission, replace semantics)          [DM §12, unchanged]
    -> Evidence unit (one per learner x student-challenge item;            [NEW, derived]
                      combines that item's attempts)
      -> Topic evidence (evidence unit x topic weight)                      [derived]
        -> TopicState   (level: current ability)                            [DM §12, recomputed from units]
        -> TopicTrajectory (direction, stability, strength, context)        [NEW, derived]
```

## 2.2 Current ability (existing TopicState, made precise)

Current ability = the **recency-weighted average** of topic evidence within the observation horizon:

```
ability = Σ (score_u × w_u × decay_u) / Σ (w_u × decay_u)
decay_u = 0.5 ^ (age_days_u / recency_half_life_days)
state   = INSUFFICIENT_EVIDENCE if fewer than min_state_units eligible evidence units   (checked first)
          STRONG          if ability ≥ strong_threshold
          DEVELOPING      if needs_practice_threshold ≤ ability < strong_threshold
          NEEDS_PRACTICE  if ability < needs_practice_threshold
```

**APPROVED — D15 (locked V1 defaults):** Strong ≥ 0.80; Developing ≥ 0.50 and < 0.80; Needs practice < 0.50; Insufficient evidence when fewer than 3 eligible evidence units; recency half-life 30 days. Current ability remains the recency-weighted average of eligible topic evidence; no other scoring model is used. These values are LearningPolicyVersion configuration (§19.3): they stay versioned and configurable, and a change goes through a new policy version and rebuild (§15). TopicState represents current demonstrated ability; TopicTrajectory represents direction and context and never replaces or overrides TopicState.

## 2.3 Non-contradiction rules

1. State and trajectory are computed in one calculation from one evidence snapshot, and both record the same `policy_version_id` and `as_of`.
2. If the state is INSUFFICIENT_EVIDENCE, the direction is NOT_ENOUGH_EVIDENCE.
3. IMPROVING requires the recent-window average to exceed the earlier-window average by at least the threshold. DECLINING requires the reverse. The direction cannot point the opposite way from the evidence shown beside it.
4. Every trajectory display shows the **recent level band** (the band that the recent-window average alone falls into). When it differs from the current state, the difference is shown explicitly (e.g. "Strong — recent results at Developing level"), never hidden.
5. The UI shows state first and trajectory second, and always as a pair. A trajectory label never appears without its state.

## 2.4 Trajectory and reinforcement (APPROVED — D13)

**Plain language.** Whether a learner gets extra practice is decided only by their current topic state and the existing reinforcement rules. The trajectory and its signals help the teacher understand what is happening; they never send practice on their own.

**Contract.**
- ReinforcementItems are created, revalidated and cancelled only from the current TopicState and the reinforcement rules of the active LearningPolicyVersion (DM §12.3–12.4, ADR-014, SC4).
- Direction (IMPROVING, DECLINING, NO_CLEAR_CHANGE, NOT_ENOUGH_EVIDENCE), stability, evidence strength and learning signals are **not inputs** to reinforcement creation, revalidation or cancellation.
- No second reinforcement trigger based on trajectory exists. A declining, improving, steady or inconsistent trajectory never creates a reinforcement assignment by itself.
- Trajectory may still reach reinforcement **indirectly** only through the shared evidence: the same new evidence that changes the trajectory may also change the topic state, and the topic state then decides reinforcement.

# 3. Eligible Trajectory Evidence

**Plain language.** Only final answers that have a current result count, using the result that currently stands (after any teacher change). Drafts, practice runs, work waiting for a late-work decision, and results waiting for teacher review do not count. Answers still marked "provisional" count at reduced weight.

| Source | Eligible? | Weight factor (status) | Source |
|---|---|---|---|
| Submission whose head is CONFIRMED (any origin) | yes | 1.0 | ADR-011, DM §12.3 |
| Head authored or confirmed by a teacher (human-locked) | yes | 1.0 always | X8, P5 |
| Head PROVISIONAL | yes | provisional_weight (0.5) | DM §12.3 |
| Head NEEDS_REVIEW (waiting for teacher) | no (weight 0) until decided | 0 | DM §12.3 |
| Head PENDING (no result yet) | no | — | ADR-011 |
| Superseded or discarded evaluations | never | — | ADR-011 |
| Drafts, practice runs | never | — | ADR-020, X9 |
| LATE_HELD submissions | no, not while held (APPROVED) | — | X10, late-held decision |
| LATE_ACCEPTED submissions (accepted by a teacher) | yes; joins its evidence unit at its **original submission position** (§4.1) | normal | X10, late-held decision |
| Late submissions never accepted | never | — | X10 |
| Unanswered questions in a completed or expired challenge | no (not a zero score) | — | G10 (PROPOSED DEFAULT) |
| Reinforcement challenge answers | yes (APPROVED D16) | normal; being a reinforcement never reduces weight. Only a repeated question gets the repeat-exposure factor (§4.3), exactly as in any other challenge | J11, D9 + D16 |
| Retracted observations (learner deletion) | never | — | DM §12.2 |

**Score used.** The evaluation's **performance score before grading adjustments**: the normalized result across the plan's components, without the grading policy's hint penalty or retry weighting. Learning applies its own treatment of hints and retries (§4), so using the adjusted grade would count those effects twice. See conflict C2.

**Topic contribution.** A unit contributes to each topic of its question version in proportion to the topic weight. Units whose topic weight for a topic is below `min_topic_weight` (PROPOSED DEFAULT 0.25) are excluded from that topic's trajectory, as too indirect, but still count toward its current state.

# 4. Retries Without Double Counting

**Plain language.** If Youssef gets a question wrong, reads the feedback and gets it right on the second try, both tries are kept and shown to the teacher. Together they count as **one piece of evidence**, not two. The approved V1 rule (D1) gives equal weight to what he could do unaided (first try) and what he could do after feedback (final try). Retrying never multiplies his evidence.

## 4.1 Evidence unit

```
Evidence unit key : (learner_pseudonym, student_challenge_id, item_ordinal)
Members           : the submitted attempts that are part of that item, in chronological order
                    (attempt_no = original server submission order; client clocks never used)
                    LATE_HELD attempts are not members while held; once accepted
                    (LATE_ACCEPTED) they are members at their original position
First attempt     : the chronologically FIRST submitted attempt of the item
Final attempt     : the chronologically LATEST submitted attempt of the item
Required attempts : the first and the final attempt (one attempt only: it is both)
Unit time         : original server submission time of the unit's first member attempt
Unit status       : PENDING while a required attempt has no authoritative result or awaits
                    review; COMPLETE once both required attempts have authoritative results
Unit score        : retry_combination(first_score, final_score)  (COMPLETE units only)
                    V1 (APPROVED D1): 0.5 × first + 0.5 × final
                    one attempt only: first = final, so unit score = that attempt's score
Unit weight       : status_factor × hint_factor × repeat_exposure_factor   (never > 1)
```

| retry_combination | Formula | Meaning |
|---|---|---|
| FIRST_AND_FINAL (**APPROVED V1 default, D1**, α = 0.5) | α × first + (1 − α) × final | Chronologically first attempt = unaided performance; chronologically latest attempt = demonstrated performance after feedback; each contributes 50% |
| FIRST_ONLY (alternative policy option, not the V1 default) | first | Strict unaided ability |
| FINAL_ONLY (alternative policy option, not the V1 default) | final | Credits feedback-driven learning fully |
| BEST (alternative policy option, not the V1 default) | max of attempts | Most generous; not recommended |

Approved D1 properties: all attempts remain stored and visible to teachers; all attempts within one student-challenge item remain one evidence unit; retries never create additional independent evidence (T3).

**Attempt order is fixed (APPROVED D1 clarification).** First and final are always chosen by chronological order, never by which results happen to be available. If the first or final attempt is awaiting review (or has no result yet), the whole evidence unit stays **pending** and contributes no evidence. A later attempt whose result is already available never becomes the "first attempt". When the required authoritative results exist, the unit is calculated from the chronological first and final attempts at 0.5 / 0.5. A middle attempt awaiting review does not hold the unit pending, because it does not enter the unit score; it stays stored and visible.

**Late-held attempts (APPROVED).** A LATE_HELD attempt is not evidence while it is held; first and final are chosen among the other member attempts. If a teacher accepts it (LATE_ACCEPTED), it joins the unit at the position given by its **original server submission order**. The time of acceptance never changes attempt order. An accepted late attempt can therefore become the first, a middle or the final attempt:

- becomes first or final → the unit is recomputed with FIRST_AND_FINAL (0.5 / 0.5) using the new first and final attempts;
- becomes a middle attempt → it is stored and visible and does not change the unit score.

Acceptance starts evaluation of that attempt (J7, X10). Until its authoritative result exists, the approved pending rule applies: if it is now the first or final attempt, the unit is pending. The change flows through the normal recomputation path (§16.1): evaluation head change → observation → evidence unit → topic state, trajectory and signals, with a TrajectoryTransition if anything displayed changes. If the unit's first member changes, its unit time moves to that attempt's original submission time, which can move the unit between windows (§5); this also goes through the normal recomputation.

- **Status factor** of a COMPLETE unit = the lower of the status factors of its first and final attempts (e.g. 0.5 if either is provisional). A PENDING unit has no score and weight 0 until it completes.
- **Hint factor** (PROPOSED DEFAULT 0.75 if any hint was used in the attempts used): hinted work is weaker evidence of independent ability. The score is not reduced.
- **Repeat-exposure factor** (rule APPROVED D9; factor value PROPOSED DEFAULT 0.5): applies when the same Question already appears in an earlier evidence unit for this learner within the horizon. The factor is decided by **question identity only**, never by assignment kind (§4.3). Repeats may reflect memory of the specific item rather than knowledge of the topic.
- All attempts remain stored as observations (DM §12.2), so the teacher can see every try.

## 4.2 Retry signals

Retries also produce signals instead of extra weight: **RETRY_RECOVERY** (first attempt below 0.5 and final attempt ≥ 0.8, in at least 2 units within the recent window) and **RETRY_DEPENDENCE** (more than half of recent units needed a retry to reach ≥ 0.8). See §9.

## 4.3 Reinforcement evidence and repeat exposure (APPROVED D9 + D16)

**Plain language.** Answers to reinforcement challenges count like any other answers. What matters is whether the learner has **seen the exact same question before**. A new question on the same topic counts fully, whether it arrives in a normal or a reinforcement challenge. The same question seen again counts at reduced weight, whether it arrives in a normal or a reinforcement challenge. Retrying within one challenge is not a repeat: those tries form one evidence unit (§4.1).

**Contract.**

| Situation | Evidence units | Repeat-exposure factor | Rule |
|---|---|---|---|
| Different Question on the same topic, in any challenge (normal or reinforcement) | separate units | not applied (1.0) | counts normally |
| Same Question in a later, different student challenge (normal or reinforcement) | separate units | applied to every later unit; the earliest unit within the horizon keeps 1.0 | question identity |
| Same Question, several attempts in the same student challenge | one unit | not applied | retry combination (§4.1) |

- **Question identity** = the logical Question (DM §8.1), not the QuestionVersion. A new version of the same Question is the same question for this rule. A variant saved as a separate Question is a different question.
- **Earliest-unit rule.** For each Question, the unit with the earliest unit time within the horizon keeps factor 1.0. Every later unit of that Question gets the factor. Ties are broken by (unit time, student_challenge_id, item_ordinal), so rebuilds give the same result (§16.2).
- **Assignment kind** (SCHEDULED, AD_HOC, REINFORCEMENT) is never an input to evidence weight. It is used only for display and for the PERSISTENT_DIFFICULTY signal (§9).
- **Coverage.** Repeated units of one Question count once toward distinct-question coverage (§8.2, §11).
- **Horizon.** A repeat is detected only against earlier units inside the observation horizon (§5). If the earlier unit has aged out, the later unit counts normally.

# 5. Recency and Observation Windows

**Plain language.** The trajectory compares the learner's **most recent sessions** with the **sessions just before them**, looking back at most about four months. A session is one challenge. One sitting is never split between "before" and "recent", so a single day's work can never be read as a trend.

```
Horizon              : units with unit time within the last horizon_days (PROPOSED 120) of as_of
Session              : one student challenge (all its units share a session)
Recent window        : the most recent whole sessions, added newest first until ≥ recent_min_units (3)
                       (stop adding sessions once recent_max_units (5) would be exceeded,
                        unless that leaves < 3 units)
Baseline window      : the whole sessions immediately before the recent window,
                       added until ≥ baseline_min_units (3), up to baseline_max_units (8)
Units outside both windows but inside the horizon: count toward current ability, not direction
```

The windows are counted in evidence, not in calendar weeks, because learners practice irregularly. The horizon keeps very old work from defining "earlier".

# 6. Direction

**Plain language.** Challenge Me compares the average of recent results with the average of earlier results. It calls the change "improving" or "declining" only if the difference is at least 10 percentage points **and** larger than the learner's normal ups and downs. Otherwise it says "no clear change". Two consecutive good answers are never enough.

## 6.1 Rule

```
m_b, m_r   = weighted mean unit score in baseline and recent windows
v_b, v_r   = weighted variance within each window
n_b, n_r   = sum of unit weights in each window
Δ          = m_r − m_b
noise      = sqrt(v_b / n_b + v_r / n_r)
threshold  = max(min_delta, noise_multiplier × noise)        PROPOSED: min_delta 0.10, multiplier 1.0
direction  = IMPROVING        if Δ ≥ threshold
             DECLINING        if Δ ≤ −threshold
             NO_CLEAR_CHANGE  otherwise
             NOT_ENOUGH_EVIDENCE if §11 minimums are not met (checked first)
```

## 6.2 Why this rule

- Simple to explain: "recent average 75% vs earlier 45%".
- Noise-aware: an erratic learner needs a bigger change before a direction is declared, which prevents "improving" from being announced after one lucky session.
- Rebuildable: no dependence on previously displayed values. There is deliberately no hysteresis, because hysteresis would make the result depend on history rather than on evidence.

## 6.3 Displayed labels (teacher)

| Direction | Stability | Teacher label |
|---|---|---|
| IMPROVING | any | Improving |
| DECLINING | any | Declining |
| NO_CLEAR_CHANGE | CONSISTENT | Steady |
| NO_CLEAR_CHANGE | VARIABLE | No clear change |
| NO_CLEAR_CHANGE | ERRATIC | Inconsistent |
| NOT_ENOUGH_EVIDENCE | — | Not enough evidence yet |

## 6.4 No numeric trajectory score

No single trajectory number is stored or shown. Δ, the window averages and the threshold are stored as **supporting evidence** for the explanation, but are not presented as a score, used for ranking, or sent to other modules as a metric. Reason: a single number would mix direction, noise and evidence strength, and would invite false comparisons between learners. Adding one later needs a documented decision.

## 6.5 Explanation contract

Every trajectory carries a structured explanation from which the UI builds its sentence, for example:

> "Improving: average 75% in the last 3 answers (12 Sep–23 Sep) vs 45% in the 3 before (14 Aug–28 Aug). The change is larger than the usual variation. Evidence: moderate (all results final, 5 different questions, 4 challenges)."

The explanation references only unit IDs inside the windows, so any claim it makes can be recomputed.

# 7. Consistency and Stability

**Plain language.** Stability describes how much results jump around, not whether they are going up. A learner steadily improving from 40% to 80% is consistent. A learner scoring 20%, 90%, 40%, 95% is erratic even if the average is rising.

```
pooled_within_sd = sqrt( (v_b × n_b + v_r × n_r) / (n_b + n_r) )     (variation around each window's own average,
                                                                        so a genuine trend is not counted as noise)
stability        = CONSISTENT if pooled_within_sd < 0.15
                   VARIABLE   if 0.15 ≤ pooled_within_sd < 0.30
                   ERRATIC    if pooled_within_sd ≥ 0.30                (PROPOSED DEFAULTS)
```

# 8. Question Difficulty and Topic Coverage

**Plain language.** If recent questions were much harder, lower recent scores may not mean the learner got worse, and higher scores on easier questions may overstate improvement. In V1, Challenge Me **does not silently adjust scores for difficulty**. It shows the direction from actual results and adds a visible note when the difficulty mix changed noticeably, and it lowers the evidence strength. It also checks that the evidence covers several different questions, not the same question repeatedly.

## 8.1 Difficulty

- Difficulty index: EASY = 1, MEDIUM = 2, HARD = 3. Missing difficulty counts as MEDIUM and is reported as "difficulty unknown".
- Difficulty is read from the **question version the learner was given**, so history cannot change when a label is edited later (see conflict C3).
- `difficulty_shift = mean_difficulty_recent − mean_difficulty_baseline`
  - ≥ +0.5 → context flag HARDER_RECENT_QUESTIONS; if the direction is DECLINING, the label reads "Declining (on harder questions)"
  - ≤ −0.5 → context flag EASIER_RECENT_QUESTIONS; if the direction is IMPROVING, the label reads "Improving (on easier questions)"
  - either flag lowers evidence strength by one level
- Difficulty-adjusted scoring (expected score per difficulty) is **not** in V1. It needs calibrated difficulty data, which V1 will start collecting. Candidate for V1.5 (decision D8).

## 8.2 Coverage

- `distinct_questions` = number of distinct Questions among units whose topic weight is at least `primary_topic_weight` (0.5) for this topic.
- `objective_coverage` = number of distinct objectives touched (informational).
- Coverage feeds the minimum evidence (§11) and evidence strength (§10).

# 9. Learning Signals

**Plain language.** Signals are specific observations a teacher can act on, such as "the same misconception keeps appearing". They are derived from the same evidence, are not scores, and each lists the answers behind it.

**APPROVED — D14.** Exactly these six signals are in V1; no others. Each signal:

- is derived from the effective evidence model (evidence units from current authoritative results, §3–§4);
- is recomputed whenever its underlying evidence changes (§16), and is never kept as a permanent counter;
- records its basis (the evidence units and head revisions behind it), so it is traceable to the evidence that caused it;
- uses the parameters of the active LearningPolicyVersion (`signals` section, §19.3);
- is contextual and diagnostic only: it is not a numeric score, not a reinforcement trigger (D13) and not a notification trigger (D17).

D14 approves the set of signals. The REPEATED_MISCONCEPTION parameters are APPROVED V1 defaults (C6). The parameter values of the other five signals remain PROPOSED DEFAULTS. All values live in LearningPolicyVersion and stay versioned.

| Signal | Rule (parameter values: PROPOSED DEFAULTS) | Clears when |
|---|---|---|
| REPEATED_MISCONCEPTION | **APPROVED V1 default (C6):** same misconception tag in ≥ 2 **distinct evidence units across ≥ 2 distinct questions** within 28 days. Retries of the same question never count as separate evidence. Fully recomputed from current evidence; never a running counter | MISCONCEPTION_RESOLVED |
| MISCONCEPTION_RESOLVED | after a repeated misconception, ≥ 2 later units on the topic score ≥ 0.8 without that tag | superseded by a new occurrence |
| PERSISTENT_DIFFICULTY | state NEEDS_PRACTICE, direction NO_CLEAR_CHANGE or DECLINING, evidence ≥ MODERATE, and ≥ 2 reinforcement sets delivered on the topic in the horizon | state leaves NEEDS_PRACTICE or direction becomes IMPROVING |
| RETRY_RECOVERY | §4.2 | no longer true on recompute |
| RETRY_DEPENDENCE | §4.2 | no longer true on recompute |
| HINT_DEPENDENCE | > 50% of recent-window units used hints | no longer true on recompute |

Signals are recomputed with the trajectory, so they are replaced when evidence changes and are never accumulated. Signals are teacher-facing context only: no signal, including PERSISTENT_DIFFICULTY, creates, schedules or cancels reinforcement (D13, §2.4). PERSISTENT_DIFFICULTY reads the count of reinforcement sets already delivered; it does not request more. The former Domain Model rule (2 occurrences within 14 days) has been replaced by this definition in DM rev. 1.2 §12.2 (C6, approved and reconciled).

# 10. Evidence Strength

**Plain language.** Evidence strength tells the teacher how much weight to give the direction. It is a level (low, moderate, high) with the reasons listed, not a percentage.

| Level | All of these hold (PROPOSED DEFAULTS) |
|---|---|
| HIGH | effective weight ≥ 8.0; ≥ 4 sessions; ≥ 6 distinct questions; ≥ 75% of weight from final (confirmed) results; stability not ERRATIC; no difficulty-shift flag |
| MODERATE | minimum evidence met (§11) and not HIGH, unless a LOW condition applies |
| LOW | minimum evidence met but any of: < 50% of weight from final results; ERRATIC; a difficulty-shift flag and the level would otherwise be MODERATE; > 50% of units hinted |

Downgrades are applied in order and the reasons are stored (e.g. `["MOSTLY_PROVISIONAL", "HARDER_RECENT_QUESTIONS"]`).

# 11. Minimum Evidence Before a Trajectory Is Declared

A direction other than NOT_ENOUGH_EVIDENCE requires **all** of:

| Requirement | PROPOSED DEFAULT | Why |
|---|---|---|
| Eligible units in the horizon | ≥ 6 | 3 per window |
| Baseline and recent windows each | ≥ 3 units | a comparison needs two groups |
| Sessions (distinct student challenges) | ≥ 3 total, ≥ 1 in each window | one sitting is not a trend |
| Time span (first baseline unit to last recent unit) | ≥ 7 days | change over time, not within one day |
| Distinct primary questions | ≥ 4 | not the same question repeatedly |
| Effective weight | ≥ 4.0 | provisional or hinted work alone cannot make a trend |
| Topic state | not INSUFFICIENT_EVIDENCE | rule 2.3.2 |

# 12. "Not Enough Evidence" Behavior

**Plain language.** When there is not enough evidence, Challenge Me says so and says **what is missing**, in terms a teacher can act on.

- Direction NOT_ENOUGH_EVIDENCE; stability and strength are not shown.
- `missing` lists every unmet requirement with the gap, e.g. `{units: 2 more, sessions: 1 more, span_days: 5 more}`, rendered as "Needs about 2 more answers on this topic in at least 1 more challenge, on a later day."
- The topic state is still shown, including when it is INSUFFICIENT_EVIDENCE.
- Nothing downstream (reinforcement, dashboards, reports) treats NOT_ENOUGH_EVIDENCE as positive or negative. Reinforcement ignores trajectory in every case (D13, §2.4), and no teacher alert exists for it (D17).

# 13. Teacher Overrides

**Plain language.** When a teacher changes a result, the old result disappears from the learner's evidence and the teacher's result takes its place at full weight. The topic state and trajectory are recalculated, and the teacher can see that the trajectory changed because a result was corrected.

**Contract.**
- An override moves the evaluation head (new revision, human-locked; ADR-011, X3, X8) → `EvaluationHeadChanged` → the observation is replaced → the evidence unit is recomputed → state, trajectory and signals are recomputed for the affected topics.
- Human-locked heads always carry status factor 1.0 (P5). A later machine regrade cannot change them (ADR-011), so it cannot change their evidence either.
- A TrajectoryTransition is recorded with reason RESULT_CORRECTED and the submission ID (§16.3).
- Pending reinforcement items whose basis changed are revalidated and cancelled if no longer valid (ADR-014, SC4). Revalidation checks the topic state and reinforcement rules only; the trajectory change caused by the override plays no part (D13).

# 14. Regrades

**Plain language.** A regrade (for example after an answer key is fixed) updates every affected result that a teacher has not personally decided. Trajectories update the same way. Because a regrade can touch many learners at once, trajectory recalculation is batched per learner. The teacher follows the regrade through the existing regrade status (DM §11.8, RegradeCompleted); no trajectory notification is sent (D17). Resulting trajectory changes appear on the dashboard with reason REGRADE.

**Contract.**
- Each regraded head change flows exactly like §13 but with reason REGRADE and the `regrade_request_id`.
- Recompute jobs are coalesced per learner (one per learner per regrade chunk; DM §21 RecomputeTopicState coalescing).
- Human-locked submissions are skipped by the regrade (ADR-011), so their evidence does not change.
- No learner-facing trajectory notification is sent. Reports already sent are corrected only through the material-correction rules (DM §17).

# 15. LearningPolicyVersion Changes

**Plain language.** If the organization changes its learning rules (for example what counts as "Strong", or how retries combine), every affected topic state and trajectory is recalculated under the new rules. Teachers see which rules version a result was calculated under. Trajectory labels may change for everyone at once, and that is recorded as a policy change, not as learners changing.

**Contract.**
- Trajectory parameters are a new `trajectory` section in LearningPolicyVersion (§19.3). LearningPolicyVersion remains organization/course-scoped and **not assignment-pinned** (ADR-014, preserved).
- **Applicable version (APPROVED C7, C7-A).** A course-scoped topic is calculated under the ACTIVE LearningPolicyVersion of its course when one exists; if the course has no ACTIVE course-specific version, the topic inherits the ACTIVE organization LearningPolicyVersion. An organization-wide topic always uses the ACTIVE organization LearningPolicyVersion.
- **Topic scope changes (APPROVED C7-B).** Changing a topic's scope changes which version applies. The change triggers the normal projection rebuild for the affected learners and topic under the newly applicable version, and the current TopicState and TopicTrajectory are recalculated under it. The topic keeps its identity and the TopicState keeps its key (learner + topic); no duplicate topic or new key is created. The scope change itself is audited (Domain Model §30). Earlier calculations stay traceable to their versions through TrajectoryTransitions and ReportSnapshots. The course in which a challenge was taken does not change this, and ChallengeAssignment never selects the policy. TopicState stays keyed by learner + topic. TopicState and TopicTrajectory for a learner × topic record the same applicable `policy_version_id` (T4).
- Publishing a version triggers a projection rebuild for the affected scope (DM §12.2 `projection_rebuild`, reason POLICY_CHANGE).
- Every TopicState and TopicTrajectory records `policy_version_id`. The teacher view shows "Calculated under learning rules vN (since date)".
- Transitions from a rebuild are recorded with reason POLICY_CHANGE and are excluded from the dashboard's "recent changes" view, so a rules change is not presented as learners changing. No notification is sent (D17).
- Report snapshots already sent keep what they showed (DM §17).

# 16. Recalculation and Rebuild

## 16.1 Triggers

| Trigger | Scope recomputed |
|---|---|
| ObservationRecorded / Replaced / Retracted (head change), including the first result of an accepted late attempt | learner × topics of that question version |
| TopicMappingChanged (merge/split) | affected topics, all learners with evidence |
| LearningPolicyVersion published, or a course left without an ACTIVE course version | topics whose applicable version changes (C7, C7-A): a course version → that course's course-scoped topics; the organization version → organization-wide topics and course-scoped topics of courses without an ACTIVE course version |
| TopicScopeChanged (C7-B) | that topic, all learners with evidence on it, under the newly applicable version |
| LearnerMerged | surviving learner |
| **Daily aging sweep** (new) | learners whose windows or horizon change because time passed (units aging out, decay) |
| Repair / manual rebuild | as requested |

## 16.2 Determinism

```
TopicState + TopicTrajectory + Signals = F(eligible observations, topic mappings,
                                           LearningPolicyVersion, question-version metadata,
                                           as_of_date)
```

- `as_of_date` is the calculation date (organization time zone, day granularity). It is stored with the result. The aging sweep recomputes on date change for affected learners only.
- A full rebuild for a given `as_of_date` must equal the live projection for that date (extends the DM §29 property test).
- Ordering ties are broken by (unit time, student_challenge_id, item_ordinal), so identical input always produces identical windows.

## 16.3 Trajectory transitions (history of what was shown)

Each time a recompute changes direction, stability, strength or active signals, an append-only `TrajectoryTransition` is written with the old and new values, the reason (NEW_EVIDENCE, RESULT_CORRECTED, REGRADE, POLICY_CHANGE, TOPIC_MAPPING, TOPIC_SCOPE_CHANGE, AGING, MERGE, DELETION) and the triggering reference. A transition is also written whenever the applicable `policy_version_id` changes, even if no displayed value changes, so that every calculation stays traceable to its version (C7-B). This is a **history of displayed values**, not a source of truth. A rebuild does not rewrite past transitions; it adds one for any resulting change. Its purpose is to answer the teacher's question "why did this change?".

# 17. What the Teacher Sees in V1

**Learner × topic (learner detail page):**
- State and trajectory pair, e.g. **Developing — Improving**, with stability and evidence strength shown as small labels.
- The explanation sentence (§6.5).
- An **evidence strip**: the units in the baseline and recent windows as dots in time order, each showing score, difficulty, provisional/final marker, retry and hint markers, and a link to the answer. This is a list of evidence, not a chart of a trajectory score.
- Active signals with their supporting answers.
- "Why did this change?" showing the latest transitions.
- The learning rules version used.

**Cohort × topic (cohort topic map):** counts per state (existing) plus counts per direction. Filters for Declining, Inconsistent, Persistent difficulty and Repeated misconception. Sorting by "needs attention" uses a fixed rule order (Persistent difficulty → Declining with strength ≥ MODERATE → Repeated misconception → Inconsistent), not a score.

**No automatic teacher alerts in V1 (APPROVED — D17).** There are no automatic teacher alerts or notifications for declining trajectories, persistent difficulty, inconsistent trajectories or any other trajectory signal. V1 has no notification rules, message templates, escalation workflows or alert thresholds for trajectory. Teachers see trajectories and signals on the dashboard and in reporting; PERSISTENT_DIFFICULTY appears at the top of the cohort view through the fixed "needs attention" ordering, which is a view order, not an alert. This keeps notifications out of V1 without preventing a future capability.

# 18. What the Learner Sees in V1

**APPROVED — D11 Option A.** This is a presentation decision only. It does not change how trajectory is calculated or stored.

**Plain language.** Learners see where they are on each topic. When they are clearly improving, with enough evidence behind it, they also see an encouraging message such as "You're improving on Quadratics." They are never shown declining or inconsistent labels, evidence strength, or any of the details teachers use to diagnose progress.

**Contract.**

| Learner sees | Condition |
|---|---|
| Current topic state (Strong, Developing, Needs practice, Not enough evidence yet) | always, for topics with evidence |
| Positive trajectory message, e.g. "You're improving on Quadratics." | only when direction = IMPROVING **and** evidence strength ≥ MODERATE |
| Nothing about direction | in every other case: DECLINING, NO_CLEAR_CHANGE (Steady, No clear change, Inconsistent), NOT_ENOUGH_EVIDENCE, or IMPROVING with LOW evidence strength |

**Never shown to learners in V1:** DECLINING or "Inconsistent" labels; stability; evidence strength or its reasons; difficulty-shift notes; window dates, averages, Δ or thresholds; learning signals (repeated misconception, persistent difficulty, retry or hint dependence); trajectory transitions ("why did this change?"); the learning-rules version.

- The absence of a message carries no meaning to the learner and is not replaced by any other wording.
- When a recompute changes the direction or strength so the condition no longer holds, the message disappears the next time the learner views progress. No learner notification is sent either way.
- The learner progress view requires the one-time-code step-up (LEARNER_HOME, ADR-016). A learner session scoped to a single challenge does not show progress.
- The learner-facing read model is a filtered projection of TopicState and TopicTrajectory. It exposes only the topic state and a boolean `show_improving_message`, so hidden fields cannot leak into the learner API.
- The full trajectory model stays available to teachers (§17).

## 18.1 What guardians see in reports (APPROVED — D12 Option A)

This is a presentation decision only. It does not change how trajectory is calculated or stored.

**Plain language.** Guardian reports show where the learner is on each topic. When the learner is clearly improving, with enough evidence behind it, the report also says so, in the same encouraging words used for the learner. Guardians never see declining or inconsistent labels, or any of the details teachers use to diagnose progress. Each report is kept exactly as it was sent.

**Contract.**

| Guardian report shows | Condition |
|---|---|
| The learner's current topic state per topic | always, for topics with evidence |
| Positive trajectory message using the same constructive wording as the learner message ("improving on [topic]") | only when direction = IMPROVING **and** evidence strength ≥ MODERATE at generation time |
| Nothing about direction | in every other case |

**Never shown to guardians in V1:** DECLINING or "Inconsistent" labels; stability; evidence strength or its reasons; difficulty notes; window dates, averages, Δ or thresholds; learning signals; trajectory transitions; the learning-rules version.

- **Frozen at generation.** The report is built from the TopicState and TopicTrajectory as of generation time. The ReportSnapshot stores exactly what was shown: topic states, which topics carried the improving message, the policy version and the as_of date. Later recalculation never changes a sent report (DM §17).
- **No negative follow-ups.** A later trajectory change (for example improving → no clear change or declining) never triggers a separate guardian notification or a correction snapshot on its own. The next scheduled report simply reflects current values. Correction snapshots continue to follow only the existing material-correction rules for results (DM §17, ADR-011), and any correction snapshot applies this same display rule.
- **Absence carries no meaning.** A topic without the message in one report after having it in an earlier one is not flagged or explained to the guardian.
- **Consent unchanged.** Guardian reports still require GUARDIAN_REPORTING processing consent and REPORTS channel consent (DM §17, ADR-019).
- The report generator reads a filtered projection containing only the topic state and a boolean `show_improving_message`, so hidden fields cannot enter a guardian report.
- Wording detail not decided here: the exact template phrasing for naming the learner in the guardian version of the message (report template copy).

# 19. Stored Versus Derived

## 19.1 Summary

| Data | Stored or derived | Source of truth? | Rebuildable? |
|---|---|---|---|
| Submissions, evaluations, evaluation heads | stored (Assessment, Evaluation) | yes | — |
| Learning observations (per submission) | stored, replace semantics (DM §12.2) | derived from heads | yes |
| Learning events | stored, append-only | audit of observation changes | — |
| Evidence units | derived projection (new) | no | yes |
| TopicState (extended with ability inputs) | derived projection | no | yes |
| TopicTrajectory | derived projection (new) | no | yes |
| Learning signals | derived projection (existing, rules updated) | no | yes |
| Trajectory transitions | stored, append-only history (new) | history of displayed values only | not rewritten |
| Report snapshots (incl. guardian topic states and improving messages as shown, D12) | stored, immutable (DM §17) | what was sent | no (by design) |

## 19.2 New and changed fields (behavioral contract; the schema comes later)

- **Observation** (DM §12.2) needs these additional fields for units, from Assessment and Content at projection time: `student_challenge_id`, `item_ordinal`, `question_id`, `difficulty` (from the question version), `performance_score` (before grading adjustments), `hints_used`, `assignment_kind` (SCHEDULED, AD_HOC, REINFORCEMENT; display and PERSISTENT_DIFFICULTY only, never weight — §4.3), `submitted_at` (server time), `status_factor`. See C2, C3, C5.
- **Evidence unit** (new projection): key, member observation IDs, unit time, first and final scores, unit score, factors, weight, difficulty, topic weights, session ID, `question_id`, `is_repeat_exposure`, `first_exposure_unit_id` (the earliest unit of the same Question within the horizon, when `is_repeat_exposure` is true).
- **TopicState** (extended): ability, unit count, effective weight, state, `as_of`, `policy_version_id`.
- **TopicTrajectory** (new projection): direction, stability, strength and reasons, window boundaries (unit IDs and dates), window means, variances and weights, Δ, threshold, difficulty shift, coverage counts, provisional share, recent level band, `missing` (if not enough evidence), `as_of`, `policy_version_id`, projection revision.
- **TrajectoryTransition** (new, append-only): learner pseudonym, topic, before and after (direction, stability, strength, signals, `policy_version_id`), reason, trigger reference, occurred time. The before/after policy version keeps historical calculations attributable to the version they were calculated under (C7).
- Learner identity: pseudonyms only (DM §12.2). No learner content in any of these rows. Retention class R1; deletion follows pseudonym deletion (DM §27).

## 19.3 LearningPolicyVersion `trajectory` section

Values marked APPROVED are the locked V1 defaults. All other values are PROPOSED DEFAULTS. Every value, approved or proposed, is LearningPolicyVersion configuration: versioned and configurable per organization or course.

```
state:      { strong_threshold: 0.80, needs_practice_threshold: 0.50,     # APPROVED D15
              recency_half_life_days: 30, min_state_units: 3 }       # APPROVED D15
evidence:   { provisional_weight: 0.5, review_pending_weight: 0,
              retry_combination: FIRST_AND_FINAL, retry_first_weight: 0.5,   # APPROVED D1
              hint_factor: 0.75,
              repeat_exposure_factor: 0.5,     # rule approved (D9); value proposed
              repeat_exposure_key: QUESTION_ID, # fixed by D9; not configurable by assignment kind
              min_topic_weight: 0.25, primary_topic_weight: 0.5,
              unanswered_counts_as_evidence: false }
windows:    { horizon_days: 120, recent_min_units: 3, recent_max_units: 5,
              baseline_min_units: 3, baseline_max_units: 8 }
minimums:   { units: 6, sessions: 3, span_days: 7, distinct_questions: 4, effective_weight: 4.0 }
direction:  { min_delta: 0.10, noise_multiplier: 1.0 }
stability:  { variable_sd: 0.15, erratic_sd: 0.30 }
difficulty: { shift_flag: 0.5, unknown_as: MEDIUM }
strength:   { high_weight: 8.0, high_sessions: 4, high_distinct_questions: 6,
              high_confirmed_share: 0.75, low_confirmed_share: 0.5, low_hinted_share: 0.5 }
signals:    # set of six signals APPROVED D14; parameter values proposed
            { misconception_window_days: 28, misconception_min_units: 2,        # APPROVED C6
              misconception_min_distinct_questions: 2,                          # APPROVED C6
              resolved_min_units: 2, resolved_score: 0.8,
              persistent_min_reinforcements: 2, hint_dependence_share: 0.5,
              retry_recovery_min_units: 2 }
```

Parameter changes create a new LearningPolicyVersion (immutable once ACTIVE) and trigger a rebuild (§15).

# 20. Invariants and Acceptance Criteria

**Invariants**

| # | Invariant |
|---|---|
| T1 | State, trajectory and signals are a pure function of (eligible observations, topic mappings, policy version, question-version metadata, as_of). |
| T2 | Only observations whose head is current and eligible (§3) contribute; superseded, discarded, draft, practice, LATE_HELD and review-pending results never do. |
| T3 | All attempts on one item of one student challenge form one evidence unit, whose weight never exceeds 1. |
| T4 | State and trajectory for a learner × topic share the same evidence snapshot, policy version and as_of. |
| T5 | INSUFFICIENT_EVIDENCE state implies NOT_ENOUGH_EVIDENCE direction. |
| T6 | IMPROVING implies recent mean − baseline mean ≥ threshold ≥ min_delta. DECLINING implies the reverse. |
| T7 | A human-locked head's evidence has status factor 1.0 and cannot be changed by machine processes. |
| T8 | No numeric trajectory score is exposed in any API, read model, report or event. |
| T9 | Every explanation references only units inside its windows, and its figures can be recomputed from them. |
| T10 | Live projection equals full rebuild for the same as_of. |
| T11 | Every change in displayed direction, stability, strength or signals has a TrajectoryTransition with a reason. |
| T12 | Trajectory rows contain pseudonyms and IDs only, never learner names or answer content. |
| T13 | Assignment kind (including REINFORCEMENT) is never an input to evidence weight. Only question identity decides repeat exposure. |
| T14 | For each Question within the horizon, exactly one evidence unit (the earliest) is not a repeat. Every later unit of that Question, in a different student challenge, carries the repeat-exposure factor. |
| T15 | Attempts within one student challenge item are never treated as repeat exposure; they are combined only by the retry policy. |
| T16 | Attempt order within an evidence unit is always original server submission order. No later event (result arrival, review decision, late-work acceptance) changes it. |
| T17 | A LATE_HELD attempt contributes nothing and is never the first or final attempt while held. |
| T18 | Learner-facing responses contain only the topic state and whether to show the improving message; no other trajectory field reaches a learner (D11). |
| T19 | Guardian report content contains only topic states and improving messages under the D11/D12 condition; no other trajectory field reaches a guardian, and a sent ReportSnapshot is never altered by later recalculation (D12). |
| T20 | Reinforcement creation, revalidation and cancellation depend only on TopicState and reinforcement policy; no trajectory field or learning signal is an input (D13). |
| T21 | The active signal set is exactly the six D14 signals. Each is a pure function of the effective evidence and the active LearningPolicyVersion, carries its basis, and is never accumulated as a counter. |
| T22 | No trajectory value or learning signal creates a teacher notification, alert, template use or escalation in V1 (D17). |
| T23 | Topic-state bands are read from the active LearningPolicyVersion; with the V1 defaults they are Strong ≥ 0.80, Developing 0.50–<0.80, Needs practice < 0.50, Insufficient evidence < 3 units (D15). |
| T24 | REPEATED_MISCONCEPTION is active only if ≥ 2 distinct evidence units across ≥ 2 distinct questions carry the same tag within 28 days (V1 policy); it is recomputed from current evidence each time and never maintained as a counter (C6). |
| T25 | The applicable LearningPolicyVersion is determined by topic scope only (course-scoped topic → its course's ACTIVE version, or the organization's ACTIVE version if the course has none; organization-wide topic → the organization's ACTIVE version). It is never chosen per assignment or per evidence course, and every TopicState and TopicTrajectory records it (C7). |

**Acceptance criteria**
1. A learner with three attempts on one item (scores 0, 0, 1) produces one unit of score 0.5 and weight 1 under the approved V1 rule (D1: FIRST_AND_FINAL, α = 0.5). The middle attempt is stored and visible but does not change the unit score.
2. With fewer than 6 units, fewer than 3 sessions, a span under 7 days or fewer than 4 distinct primary questions, the direction is NOT_ENOUGH_EVIDENCE and `missing` lists every unmet requirement.
3. A teacher override that changes a unit's score recomputes the affected topic states and trajectories in the same projection pass, and records a RESULT_CORRECTED transition.
4. A regrade that skips a human-locked submission leaves that submission's unit unchanged.
5. Publishing a new LearningPolicyVersion recomputes every affected trajectory under it, and each result shows the new version.
6. The daily aging sweep changes a trajectory when a unit ages out of the horizon, and records an AGING transition.
7. Two retries of the same item carrying the same misconception tag do not create REPEATED_MISCONCEPTION.
8. The teacher view never shows a trajectory label without the topic state beside it, and shows the recent level band when it differs from the state.
9. Property test: for randomized evidence histories, including out-of-order and duplicate head events, live projection equals rebuild (T10), and T3, T5 and T6 hold.
10. No API response, read model, report snapshot or event payload contains a field representing a single trajectory score (T8).
11. Question A in a normal challenge and a different Question B on the same topic in a reinforcement challenge both produce units with repeat-exposure factor 1.0 (§21.8 case 1).
12. Question A in a normal challenge followed by Question A in a reinforcement challenge: the second unit has the repeat-exposure factor applied and references the first as `first_exposure_unit_id` (§21.8 case 2).
13. The same outcome as criterion 12 holds when the repeat occurs in a normal scheduled challenge instead of a reinforcement challenge (T13).
14. Several attempts on Question A within one student challenge produce one unit, with no repeat-exposure factor (§21.8 case 3, T15).
15. A new QuestionVersion of Question A counts as the same question for repeat exposure. A separately saved variant Question counts as a different question.
16. If the first unit of Question A has aged out of the horizon, a later unit of Question A is not a repeat.
17. Attempts 1 (awaiting review) and 2 (final, result 1.0): the unit stays pending with weight 0. Attempt 2 is never used as the first attempt. When attempt 1 is decided (e.g. 0.4), the unit score = 0.5 × 0.4 + 0.5 × 1.0 = 0.7.
18. Attempts 1 (0.0), 2 (awaiting review) and 3 (1.0): the unit is complete with score 0.5, because attempt 2 is neither first nor final. Attempt 2 stays visible to the teacher.
19. Attempts 1 (1.0) and 2 (final, awaiting review): the unit stays pending; attempt 1 alone is not used as a one-attempt unit.
20. Attempts 1 (0.4), 2 (LATE_HELD, submitted between 1 and 3) and 3 (0.8): while held the unit score is 0.6 (attempts 1 and 3). After attempt 2 is accepted, it is a middle attempt and the unit score stays 0.6 (§21.9 example 1).
21. Attempts 1 (0.4), 3 (0.8) and 4 (LATE_HELD, submitted after 3): after acceptance, attempt 4 is the final attempt; the unit is pending until attempt 4 has its result, then equals 0.5 × 0.4 + 0.5 × (attempt 4 score) (§21.9 example 2).
22. Accepting a late attempt at any time produces the same attempt order as if it had been accepted immediately; acceptance time appears nowhere in the ordering.
23. A late attempt that is never accepted never enters the unit.
24. Accepting a late attempt that becomes first or final triggers the normal recomputation and a TrajectoryTransition if the displayed trajectory changes.
25. A learner whose topic is IMPROVING with MODERATE or HIGH evidence strength sees the topic state and "You're improving on [topic]".
26. A learner whose topic is IMPROVING with LOW evidence strength, or DECLINING, NO_CLEAR_CHANGE or NOT_ENOUGH_EVIDENCE, sees the topic state only, with no direction wording.
27. No learner-facing response (API, page or learner message) contains stability, evidence strength, signals, window figures, transitions or the learning-rules version (T18).
28. Changing D11's presentation rule changes no stored trajectory value and triggers no recomputation.
29. A guardian report generated while a topic is IMPROVING with MODERATE or HIGH evidence strength shows the topic state and the improving message; with LOW strength or any other direction it shows the topic state only.
30. No guardian report contains stability, evidence strength, difficulty notes, window figures, signals, transitions or the learning-rules version (T19).
31. After a report is sent, a recalculation that changes the trajectory leaves that ReportSnapshot byte-for-byte unchanged, and sends no guardian notification.
32. A trajectory change alone never creates a correction snapshot; correction snapshots arise only from the existing material result-correction rules.
33. Changing D12's presentation rule changes no stored trajectory value and triggers no recomputation.
34. A learner whose trajectory becomes DECLINING while the topic state stays STRONG or DEVELOPING receives no reinforcement because of the trajectory.
35. A learner in NEEDS_PRACTICE receives reinforcement under the existing policy whether the trajectory is IMPROVING, DECLINING, NO_CLEAR_CHANGE or NOT_ENOUGH_EVIDENCE.
36. Activating or clearing any learning signal (including PERSISTENT_DIFFICULTY) creates, schedules or cancels no reinforcement item.
37. Two learners with identical topic states and reinforcement history but different trajectories get identical reinforcement decisions.
38. Only the six D14 signals can be produced; after a result change removes the evidence behind a signal, the signal is cleared on recompute, and its record lists the evidence units that caused it.
39. With the V1 policy, ability 0.80 is STRONG, 0.50 is DEVELOPING, 0.4999 is NEEDS_PRACTICE, and a topic with 2 eligible evidence units is INSUFFICIENT_EVIDENCE regardless of ability (D15).
40. Publishing a LearningPolicyVersion with different thresholds changes the bands only through the normal policy rebuild (§15); no code change is required.
41. A learner turning DECLINING, INCONSISTENT or PERSISTENT_DIFFICULTY produces no teacher notification or message of any kind; the change is visible only on the dashboard and in reporting (D17).
42. A reinforcement answer to a new question counts at full weight; a reinforcement answer to a previously seen Question gets exactly the same repeat-exposure factor as a repeat in a normal challenge (D16 with D9).
43. Question A and a different Question B, both tagged with the same misconception 10 days apart, produce REPEATED_MISCONCEPTION. The same Question A answered with that tag in two different challenges does not (one distinct question). The same tag on two distinct questions 29 days apart does not (outside the 28-day window) (C6).
44. If a teacher override removes the misconception tag from one of the two units, REPEATED_MISCONCEPTION is cleared on the next recompute; no counter keeps it active (C6).
45. A learner answers questions on an organization-wide topic in two courses whose course policies differ: the TopicState and TopicTrajectory are calculated once, under the organization policy, and record its version (C7).
46. Publishing a new version for course X recalculates course X's course-scoped topics and leaves organization-wide topics and other courses' topics unchanged. Each recalculated row records the new version, and a POLICY_CHANGE transition records the old and new versions (C7).
47. A guardian report generated before the new version was published keeps the old version in its ReportSnapshot (C7, D12).
48. A course-scoped topic in a course with no ACTIVE course version is calculated under the organization's ACTIVE version and records it. When the course publishes its first version, the topic is rebuilt under the course version (C7-A).
49. Changing a topic from organization-wide to course-scoped (or the reverse) rebuilds all learners with evidence on it under the newly applicable version, keeps the same topic id and TopicState key, writes a TOPIC_SCOPE_CHANGE transition recording the old and new versions, and records an audit event for the scope change (C7-B).
50. A scope change that does not change the applicable version (for example, a move between two courses that both inherit the organization version) still records the audit event, and the rebuild produces no transition unless a value or version changes (C7-B).

# 21. Worked Examples

All numbers use the proposed defaults and were computed with the rules above. Scores are 0–1. Ages are days before `as_of`. Unit weight is 1 unless stated.

## 21.1 Improving

| Window | Units (score, age) | Mean |
|---|---|---|
| Baseline | 0.40 (40), 0.50 (35), 0.45 (30) | 0.45 |
| Recent | 0.70 (12), 0.80 (6), 0.75 (1) | 0.75 |

Δ = +0.30; noise = 0.033; threshold = max(0.10, 0.033) = 0.10 → **IMPROVING**. Pooled within-window SD = 0.041 → CONSISTENT. Current ability (recency-weighted) = 0.65 → DEVELOPING. Teacher sees **"Developing — Improving"**, recent level band Developing (0.75 is below 0.80).

## 21.2 Declining while still Strong (non-contradiction)

| Window | Units | Mean |
|---|---|---|
| Baseline | 0.95 (40), 0.90 (35), 1.00 (30) | 0.95 |
| Recent | 0.78 (10), 0.72 (5), 0.84 (1) | 0.78 |

Δ = −0.17 ≤ −0.10 → **DECLINING**; CONSISTENT. Ability = 0.839 → **STRONG**, because the older strong results still carry weight. Recent level band = Developing (0.78 is below 0.80). Teacher sees **"Strong — Declining; recent results at Developing level"**. Both statements are true and shown together (§2.3 rule 4).

## 21.3 Stable

Baseline 0.70, 0.75, 0.65 (mean 0.70); recent 0.70, 0.72, 0.68 (mean 0.70). Δ = 0.00 → NO_CLEAR_CHANGE; pooled SD 0.031 → CONSISTENT. Ability 0.698 → DEVELOPING. Label **"Developing — Steady"**.

## 21.4 Noisy performance

Baseline 0.20, 0.90, 0.40 (mean 0.50); recent 0.95, 0.25, 0.85 (mean 0.683). Δ = +0.183, but noise = 0.246, so threshold = 0.246 → **NO_CLEAR_CHANGE**. Pooled SD 0.302 → ERRATIC. Label **"Developing — Inconsistent"**; evidence strength LOW (ERRATIC). A naive "last score > previous score" rule would have reported this learner as improving (0.85 > 0.25) and before that as declining (0.25 < 0.95).

## 21.5 Insufficient evidence

Four units, all from one challenge on one day. Units 4 < 6; sessions 1 < 3; span 0 < 7 days. Direction **NOT_ENOUGH_EVIDENCE**. Missing: 2 more units, 2 more sessions, 7 more days. Topic state is computed (4 ≥ 3 units) and shown. Teacher sees "Not enough evidence yet: needs about 2 more answers on this topic in at least 2 more challenges, on later days."

## 21.6 Repeated retries

One item, three attempts: 0.0, 0.0, 1.0. Under the approved rule (D1: FIRST_AND_FINAL, α = 0.5): unit score = 0.5 × 0.0 + 0.5 × 1.0 = **0.5**, weight **1**.

| Naive treatment | Effect |
|---|---|
| Three independent observations | mean 0.33 with weight 3; retrying *lowers* and *over-weights* the evidence |
| Latest only | 1.0; the two failures disappear |
| Evidence unit (this model) | 0.5 with weight 1; both unaided failure and eventual success are represented once |

If this happens in two recent units, RETRY_RECOVERY is shown ("gets there after feedback"). All three attempts remain visible in the evidence strip.

**Pending variant.** If attempt 1 were awaiting teacher review while attempts 2 (0.0) and 3 (1.0) already had results, the unit would stay pending and contribute nothing. It would **not** be calculated as 0.5 × 0.0 + 0.5 × 1.0 using attempt 2 as the first. Once the teacher decides attempt 1 (say 0.0), the unit becomes 0.5 × 0.0 + 0.5 × 1.0 = 0.5.

## 21.7 Corrected result (teacher override)

Before: baseline 0.45, 0.50, 0.40; recent 0.55, 0.50, and a provisional AI essay score of 0.40 (weight 0.5). Recent mean = 0.50; Δ = +0.05 → NO_CLEAR_CHANGE; ability 0.475 → **NEEDS_PRACTICE**; a reinforcement item is pending.

The teacher overrides the essay to 0.80 (human-locked, weight 1). Recent mean = 0.617; Δ = +0.167; threshold 0.10 → **IMPROVING**. Ability 0.564 → **DEVELOPING**. Result: a transition (NO_CLEAR_CHANGE → IMPROVING, reason RESULT_CORRECTED); the pending reinforcement is revalidated and cancelled because the state is no longer NEEDS_PRACTICE. The new IMPROVING direction is not the reason (D13): had the state stayed NEEDS_PRACTICE, the reinforcement would have gone ahead despite the improving trajectory. The teacher sees "Developing — Improving (changed after your correction on 23 Sep)".

## 21.8 Reinforcement evidence and repeat exposure (D9 + D16)

Unit weights assume final results and no hints. The repeat-exposure factor uses the proposed value 0.5.

| Case | Units | Repeat-exposure factor | Weights | Contribution to the topic |
|---|---|---|---|---|
| 1. Question A in a normal challenge 0.40; new Question B in a reinforcement challenge 0.80 | 2 units, 2 distinct questions | 1.0 and 1.0 | 1 + 1 | weighted mean (0.40 + 0.80) / 2 = **0.60**; both count normally |
| 2. Question A in a normal challenge 0.40; the same Question A in a reinforcement challenge 1.00 | 2 units, 1 distinct question | 1.0 (first), 0.5 (repeat) | 1 + 0.5 | weighted mean (0.40 × 1 + 1.00 × 0.5) / 1.5 = **0.60**; the repeat counts, but at half weight |
| 2b. As case 2, but the repeat is in a normal scheduled challenge | same as case 2 | same as case 2 | same | same result: assignment kind does not matter (T13) |
| 3. Question A, three attempts in one student challenge: 0.0, 0.0, 1.0 | 1 unit | not applicable | 1 | unit score 0.5 by retry combination (§21.6); not a repeat (T15) |

Without the repeat-exposure factor, case 2 would give (0.40 + 1.00) / 2 = 0.70, and a learner could raise their topic result simply by re-answering one remembered question. Case 2 also contributes only one distinct question to coverage, so repeats alone cannot meet the minimum-evidence requirement (§11).

## 21.9 Late-held attempts

**Example 1 — accepted late attempt becomes a middle attempt.**

| Attempt (submission order) | Status | Score |
|---|---|---|
| 1 | ON_TIME | 0.4 |
| 2 | LATE_HELD, submitted between 1 and 3 | — |
| 3 | has an authoritative result | 0.8 |

While attempt 2 is held: first = 1, final = 3, unit score = 0.5 × 0.4 + 0.5 × 0.8 = **0.6**. The teacher accepts attempt 2 and it is marked (say 0.5). By original submission order it sits between 1 and 3, so it is a middle attempt: first = 1, final = 3, unit score stays **0.6**. Attempt 2 is visible in the evidence strip.

**Example 2 — accepted late attempt becomes the final attempt.**

| Attempt (submission order) | Status | Score |
|---|---|---|
| 1 | ON_TIME | 0.4 |
| 3 | ON_TIME | 0.8 |
| 4 | LATE_HELD, submitted after 3 | — |

While held: first = 1, final = 3, unit score **0.6**. After acceptance attempt 4 is the final attempt. Until attempt 4 has its authoritative result the unit is pending (approved pending rule). If attempt 4 is marked 0.9, the unit is recomputed from attempts 1 and 4: 0.5 × 0.4 + 0.5 × 0.9 = **0.65**. Attempt 3 becomes a middle attempt, stored and visible. The change flows through the normal recomputation path.

**What never happens.** If the teacher accepts attempt 2 in Example 1 a week after attempt 3 was submitted, attempt 2 still sits between 1 and 3. It does not become the final attempt because it was accepted last.

# 22. Decisions Requiring Product-Owner Approval

Each decision has a proposed default. Changing any of them changes only LearningPolicyVersion defaults or display wording, **not** the model or data structure, except D8 (V1.5) and D13.

| ID | Decision | Proposed default | If changed |
|---|---|---|---|
| D1 | How retries combine into one evidence unit | **APPROVED:** FIRST_AND_FINAL, α = 0.5 (chronologically first submitted attempt 50%, chronologically latest submitted attempt 50%; one unit per item; all attempts stored and visible). **Clarified and approved:** attempts keep chronological order; if the first or final attempt awaits review, the unit stays pending; a later attempt never becomes the first attempt because its result is available first. FIRST_ONLY, FINAL_ONLY and BEST remain policy options, not V1 defaults. **Late-held attempts (APPROVED):** not evidence while held; once accepted, positioned by original server submission order (never by acceptance time); may become first, middle or final; the unit is recomputed through the normal path when first or final changes | — |
| D2 | Hinted work weight | 0.75 (score not reduced) | Hints matter more or less to trajectory |
| D3 | Provisional AI results in trajectory | Count at 0.5; strength capped at LOW if < 50% final | Trajectory waits for confirmation (slower, surer) |
| D4 | Unanswered questions | Not evidence (not zero) | If counted as zero, skipping lowers state and trajectory |
| D5 | Look-back and window sizes | 120 days; recent 3–5 units; earlier 3–8 units | Faster or slower reaction to change |
| D6 | Minimum evidence for a trajectory | 6 answers, 3 challenges, 7 days, 4 distinct questions | Earlier trajectories (less reliable) or later ones |
| D7 | Size of change that counts as improving or declining | 10 points and above normal variation | More or fewer learners labeled as changing |
| D8 | Difficulty handling in V1 | Show actual results plus a "harder/easier questions" note; no score adjustment (adjustment in V1.5) | Adjusting in V1 needs calibrated difficulty data we do not yet have |
| D9 | Repeated exposure to the same question | **APPROVED (rule):** decided by question identity, in any challenge kind; applies to every later unit of the same Question (§4.3). **Still proposed:** factor value 0.5. **Clarification APPROVED (Wave 8, W8-3):** an earlier appearance that produced no evidence unit (e.g. the question was left unanswered) does **not** make a later answered appearance a repeat; only an earlier answered, countable evidence unit establishes repeat exposure | Factor value changes the weight of repeats only |
| D10 | Teacher labels and wording | Improving / Declining / Steady / No clear change / Inconsistent / Not enough evidence yet | Wording only |
| D11 | What learners see | **APPROVED: Option A.** Topic state always; "You're improving on [topic]" only when direction = IMPROVING and evidence strength ≥ MODERATE; nothing else from the trajectory is shown to learners. Presentation only: calculation and storage are unchanged (§18) | — |
| D12 | What guardians see in reports | **APPROVED: Option A.** Topic state always; the same constructive improving message only when direction = IMPROVING and evidence strength ≥ MODERATE; nothing else from the trajectory; report frozen in the ReportSnapshot; no separate negative trajectory notification. Presentation only (§18.1) | — |
| D13 | Whether trajectory affects reinforcement | **APPROVED:** trajectory does not independently drive reinforcement in V1. Reinforcement stays driven by the current topic state and the existing reinforcement policy; trajectory and signals are context only; no second trigger based on trajectory (§2.4) | — |
| D14 | Which signals are on in V1 | **APPROVED:** exactly six: REPEATED_MISCONCEPTION, MISCONCEPTION_RESOLVED, PERSISTENT_DIFFICULTY, RETRY_RECOVERY, RETRY_DEPENDENCE, HINT_DEPENDENCE. Derived, recomputed, never accumulated, traceable, policy-driven; not scores, not reinforcement or notification triggers. No additional signals. REPEATED_MISCONCEPTION parameters approved (C6); the other signals' parameter values remain proposed defaults (§9) | — |
| D15 | Topic-state thresholds and recency | **APPROVED (unchanged):** Strong ≥ 0.80; Developing ≥ 0.50 and < 0.80; Needs practice < 0.50; Insufficient evidence < 3 eligible units; half-life 30 days. Recency-weighted average; LearningPolicyVersion configuration (§2.2, §19.3) | — |
| D16 | Reinforcement answers as evidence | **APPROVED:** reinforcement answers are normal learning evidence; coming from a reinforcement challenge never by itself reduces evidence value; the only reduction is the D9 repeat-exposure factor, decided by Question identity, not assignment kind (§3, §4.3) | — |
| D17 | Teacher alerts for declining or persistent difficulty | **APPROVED:** no automatic teacher alerts or notifications for any trajectory direction or signal in V1; no notification rules, templates, escalation workflows or alert thresholds; dashboard and reporting only; future capability not precluded (§17) | — |
| C7-A | Course policy fallback | **APPROVED:** course-scoped topic uses its course's ACTIVE version when one exists, otherwise inherits the organization's ACTIVE version; organization-wide topic always uses the organization version; the version is recorded on TopicState and TopicTrajectory; no policy selection in ChallengeAssignment (§15) | — |
| C7-B | Topic scope changes | **APPROVED:** a scope change changes the applicable version and triggers the normal rebuild under it; current TopicState and TopicTrajectory recalculated; history stays traceable through transitions and report snapshots; the scope change is audited; no new TopicState key or duplicate topic (§15, §16) | — |

# 23. Conflicts and Gaps Found in Existing Documents

| # | Where | Problem (plain) | Smallest resolution | Blocks? |
|---|---|---|---|---|
| C1 | DM §12.2–12.3 (observation per submission feeds TopicState); Spec Kit Part 1 G3 default ("all tries count as observations") | Retries count as independent evidence, which violates approved principle P3 | Add the derived evidence-unit layer (§4). TopicState and trajectory both compute from units. **G3 is superseded by D1 (approved)** | Phase 5 |
| C2 | DM §11.6 composer applies hint penalty and retry weighting to total_score; DM §19 C11 gives Learning that summary | Learning would count hints and retries twice | EvaluationSummary exposes `performance_score` before grading adjustments, plus hints used and attempt number | Phase 4 contract |
| C3 | DM §8.2: difficulty label is Question metadata, not versioned | Editing a label later would silently rewrite history and break deterministic rebuilds | Pin difficulty in QuestionVersion. A change creates a new, evaluation-compatible version (like hint changes) | Phase 2 (Content) |
| C4 | DM §12.3 recomputes only on events; TopicState already uses a recency half-life | Results that depend on time go stale, and "rebuild equals live" is undefined without a date | Add `as_of` to projections and a daily aging sweep job; property tests fix the date | Phase 5 |
| C5 | DM §12.2 observation and §19 C11 contract | Missing fields needed to form units and windows (student challenge, item, question, difficulty, assignment kind, server submission time) | Extend the Learning intake: Assessment read contract for submission context; Content read contract for version metadata (read-only, mechanism A) | Phase 5 |
| C6 | DM §12.2 learning policy (misconception_repeat: 2 within 14 days) | Two retries of the same item would trigger "repeated misconception" | Count distinct evidence units on distinct questions (§9); window 28 days. **APPROVED and RECONCILED: DM rev. 1.2 §12.1, §12.2, §29** | — |
| C7 | DM §12.2 (LearningPolicyVersion per course or organization; TopicState keyed without course) | For organization-wide topics used in two courses with different policies, it is undefined which policy applies | Course-scoped topics use their course's ACTIVE policy; organization-wide topics use the organization's ACTIVE policy. **APPROVED and RECONCILED: DM rev. 1.3.** Remaining ambiguities **RESOLVED**: C7-A (course without its own version inherits the organization version) and C7-B (scope change → normal rebuild under the newly applicable version, same key, audited). DM rev. 1.4 §8.3, §8.5, §12.1–12.3, §19, §20, §29, §30 | — |
| C8 | DM §12.2 (`strong_threshold`, `needs_practice_threshold`, `recency_half_life_days` have no values) | Current state cannot be implemented or tested | **Resolved by D15 (approved)** | — |
| C9 | Spec Kit Part 1 J10 (progress defined per observation) | Wording predates evidence units | Update J10 when this section is approved | none |
| C10 | DM §12.1 lists LearningSignal kinds as NEEDS_PRACTICE, REPEATED_MISCONCEPTION, STRONG, INSUFFICIENT_EVIDENCE | Three of these are topic-state values, not signals; this conflicts with the approved D14 set of six signals | LearningSignal kinds = the six D14 signals; Strong, Needs practice and Insufficient evidence remain TopicState values only. **Reconciled: DM rev. 1.1 §12.1, §12.2** | — |
| C11 | DM §12.2 `reinforcement_item.signal_id` and DM §12.3 ("derive signals; create/cancel ReinforcementItems") | Implies reinforcement is created from a learning signal, which conflicts with D13/D14 (signals never trigger reinforcement) | ReinforcementItem basis references the TopicState (NEEDS_PRACTICE) and its evidence units and head revisions, not a signal; drop or repurpose `signal_id` as optional display context only. **Reconciled: DM rev. 1.1 §12.1–12.4, §25.8 (`signal_id` removed; basis = TopicState + policy version + evidence revisions)** | — |

**No ARCHITECTURE GAP.** Everything fits the existing Learning module, its projection and rebuild mechanism, the event flow from evaluation heads, and LearningPolicyVersion. No new module, service or infrastructure is needed.

**STOP — awaiting product-owner approval of this section (§22 decisions and §23 resolutions) before any further specification or implementation.**
