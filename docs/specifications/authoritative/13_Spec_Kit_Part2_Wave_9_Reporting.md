# Challenge Me — V1 Spec Kit — Part 2, Wave 9: Reporting

> Capability: teacher, admin and owner dashboards and their read models, freshness and repair; guardian reports (content, schedule, snapshot, delivery, guardian home); correction of sent reports; staff exports; aggregate analytics boundary (SPEC-084 to 088).
>
> Status: APPROVED and CLOSED (revision 2). W9-1 to W9-5 locked; W9-C1 to W9-C4 reconciled; LG-1 to LG-9 carried forward and OPEN; Waves 1–8 decisions unchanged. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–8 (closed), Spec Kit Part 1 (J12, JV6), Domain Model rev. 1.5 (DM §17, §5.B, §4 retention), ADR-005, ADR-011, ADR-014, ADR-016, ADR-019, Learning Trajectory Model rev. 14 (LTM §17–18.1), approved D11, D12, D17, W2-4, W6-3, W6-4, W8-C1.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 9 decisions as locked at closure; the Wave 9 Closure at the end lists what remains open.

# 1. Capability Overview

**Plain language.** Reporting shows people what has happened, without ever becoming the source of truth. Teachers see who received, opened and finished each challenge, their grades, what needs reviewing and how the class is doing on each topic. Owners see the organization as a whole. Guardians receive a periodic report that says where the learner stands on each topic and, when clearly true, that they are improving. Every report sent is kept exactly as it was sent; if a result behind it later changes materially, a correction is included next time.

**Reporting owns:** dashboard read models, report definitions and schedules, report snapshots (what was sent), report recipients, pending corrections, staff exports.

**Reporting does not own:**

| Boundary | Reporting reads | The other module decides | Source |
|---|---|---|---|
| Reporting vs Evaluation | Heads, grades (W6-3, W6-4) | Results and grades | EXISTING (ADR-011) + LOCKED |
| Reporting vs Learning | Filtered projections (teacher view; learner and report projections with state and `show_improving_message` only) | Topic states, trajectory, signals | LOCKED (D11, D12, W8-C1) |
| Reporting vs Challenge, Assessment | Assignment, student challenge, delivery and submission status events | Assignments, engagement, timing | EXISTING |
| Reporting vs Communication | `DeliveryRequested` (purpose REPORT, CORRECTION) | Delivery | EXISTING (DM §19 C15) |
| Reporting vs Privacy & Consent | Consent state at generation and dispatch | Consent | EXISTING (ADR-019) |
| Reporting vs Roster | Pseudonym resolution for names | Learner identity | EXISTING (DM §5.B) |

Reporting never computes learning state or grades; it displays them (EXISTING, DM §17).

# 2. Actors

| Actor | Role here | Source |
|---|---|---|
| Teacher (organization, course, cohort) | Dashboards in scope; urgent correction flag; CSV export of assignment results in scope (recent auth, audited) | EXISTING + LOCKED (W9-3) |
| Owner, Admin | Organization dashboards; report definitions and schedule | EXISTING (DM §5.4) + PROPOSED DEFAULT |
| Guardian | Receives reports through links; sees sent reports in guardian home after a one-time code | LOCKED (D12, W2-4) |
| Learner | Own results and progress through Assessment and Learning views (Waves 5, 8); no periodic reports to learners in V1 | LOCKED (D11, W9-5) |
| System | Read-model projections, report generation, correction tracking, dispatch requests | EXISTING |

# 3. Core Lifecycle

```
Dashboards
  domain events (EvaluationHeadChanged, ChallengeCompleted, delivery and status events,
  topic-state changes) -> read-model projections (idempotent, rebuildable)
  -> dashboards read models; detail pages read owning modules on demand

Guardian report
  schedule (organization time zone) -> for each learner with an ACTIVE guardian link
  (receives_reports) and GUARDIAN_REPORTING consent:
    build content from filtered projections as of generation -> ReportSnapshot (immutable,
    basis = submissions + head revisions, policy version, as_of)
  -> per recipient: REPORTS channel consent? -> DeliveryRequested (REPORT, link only)
  -> guardian opens link (REPORT_SNAPSHOT grant) or guardian home (one-time code)

Correction
  EvaluationHeadChanged on a submission in a sent snapshot's basis -> PendingCorrection
  -> material: included in the next scheduled snapshot, or now if a teacher flags it urgent
  -> non-material: recorded, not sent
```

# 4. Behavioral Rules

## 4.1 Dashboards and read models

| # | Rule | Label |
|---|---|---|
| DB-1 | Read models are projections of events, idempotent and rebuildable; they never hold the only copy of any fact. | EXISTING (DM §17) |
| DB-2 | Freshness target: 95% of updates visible within 30 seconds; a lagging view shows "Last updated [time]". | EXISTING (J12) as PROPOSED DEFAULT |
| DB-3 | **Assignment view:** prepared, delivered, opened, started, completed, expired and cancelled counts; per learner: delivery status, engagement, challenge grade per W6-4 (all items as denominator, "Not attempted" count, never "0" for unanswered), provisional and review markers, "after due" marker, late-work items. | EXISTING (J12) + LOCKED (W4-2, W6-4, W9-C2) |
| DB-4 | **Item grades** shown are the best weighted attempt (W6-3); learning views never show item grades. | LOCKED (W6-3) |
| DB-5 | **Cohort topic map:** counts per state and per direction per topic, filters, and the fixed "needs attention" ordering (LTM §17). No alerts. | LOCKED (LTM §17, D17, W9-C3) |
| DB-6 | **Learner detail:** answers and marking (Wave 6), learning view (Wave 8) with out-of-authorization evidence units restricted (W8-C1), reinforcement item status. | LOCKED (W8-C1) |
| DB-7 | **Review queue statistics:** open, overdue and escalated tasks per scope; restricted safeguarding tasks are never counted in general views. | EXISTING (DM §13) + LOCKED (W7-5) |
| DB-8 | **Organization overview (Owner, Admin):** active learners, assignments, completion rates, marking mix, review backlog, budget usage by pool; no individual learner content. | PROPOSED DEFAULT |
| DB-9 | Teachers see only cohorts and learners in scope; former-cohort teachers see only the submissions covered by W6-6; transferred learners' former-cohort history follows W2-5. | LOCKED (FD-1, W2-5, W6-6) |
| DB-10 | Learning-policy transitions (POLICY_CHANGE) do not appear in "recent changes". | LOCKED (LTM §15) |

## 4.2 Guardian reports

| # | Rule | Label |
|---|---|---|
| GR-1 | A guardian report is produced for a learner only if the guardian link is ACTIVE with `receives_reports` and the learner has GUARDIAN_REPORTING consent; it is delivered to a guardian contact point only with REPORTS channel consent, otherwise the recipient is SKIPPED_NO_CONSENT. | EXISTING (DM §17, W2 G-4) |
| GR-2 | Trajectory content follows D12 exactly: topic state per topic with evidence; the improving message only when IMPROVING with strength ≥ MODERATE at generation; nothing else from the trajectory. | LOCKED (D12) |
| GR-3 | Guardian report content = D12 learning content (GR-2) **plus** challenge activity for the period (assigned, completed, not completed counts) **plus** the challenge grade (W6-4) for each challenge **closed** in the period, labelled "Provisional" where applicable, with "Not attempted" counts, never "0". **No per-question results.** | LOCKED (W9-2) |
| GR-4 | Schedule: the organization chooses **weekly, every two weeks or monthly**; default **monthly**. Periods are in the organization's time zone; generation happens after the period ends and messages follow quiet hours. | LOCKED (W9-1) + PROPOSED DEFAULT (timing) |
| GR-5 | No report is generated for a learner with no assigned challenge in the period. | PROPOSED DEFAULT |
| GR-6 | The ReportSnapshot is frozen at generation: exact content, basis (submissions and head revisions), policy version, `as_of`. Later changes never modify it. | LOCKED (D12) + EXISTING (DM §17) |
| GR-7 | The message carries a greeting, the learner's first name, the period and a link; no topic states, grades or results in the message body; no token in stored bodies. | EXISTING (SC2) + PROPOSED DEFAULT (no results in message) |
| GR-8 | The link opens only that snapshot (REPORT_SNAPSHOT grant); the grant is valid 30 days; guardian home (one-time code) lists all reports sent to that guardian for learners they are still linked to. | EXISTING (W2 A-2, G-6) + PROPOSED DEFAULT (30 days) |
| GR-9 | When a guardian link ends, that guardian's report grants and sessions for that learner are revoked, and guardian home no longer lists that learner or their reports; the stored snapshots are unchanged. | LOCKED (W2-C4, W4-C7, W9-C4) |
| GR-10 | Withdrawal of GUARDIAN_REPORTING stops future reports; sent reports stay as sent. | LOCKED (Wave 2 C-8) |
| GR-11 | Reports are in the organization's default locale (Arabic or English); the guardian-facing wording of the improving message is template copy (LTM §18.1 note). | PROPOSED DEFAULT |
| GR-12 | Report pages are printable; no PDF attachment is sent in V1. | PROPOSED DEFAULT |
| GR-13 | Several guardians of one learner: one snapshot, one recipient row each, each gated by its own link and channel consent. | EXISTING (DM §17) |

## 4.3 Corrections

| # | Rule | Label |
|---|---|---|
| CR-1 | When a head changes for a submission in a sent snapshot's basis, a PendingCorrection is recorded with old and new revision and the delta. | EXISTING (DM §17) |
| CR-2 | **Material** = an item's correctness flips, or a challenge grade shown in the report changes by at least 10% of its maximum (same threshold as Wave 6 RG-6). There is no pass/fail concept in V1. | LOCKED (W9-C1) |
| CR-3 | Material corrections are included as a correction section in the next scheduled report; an in-scope teacher may flag one urgent, generating a correction snapshot now (revision + 1). Non-material corrections are recorded and not sent. | EXISTING (DM §17) |
| CR-4 | Topic-state or trajectory changes alone never create a correction or a separate guardian message; correction snapshots apply the D12 display rule. | LOCKED (D12) |
| CR-5 | Sent snapshots are never modified; after 24 months (R8) the body is replaced by a tombstone. | EXISTING (DM §4, §17) |

## 4.4 Exports and aggregates

| # | Rule | Label |
|---|---|---|
| EX-1 | In-scope Teachers, Admins and Owners can export **assignment results** as CSV (learner name, statuses, challenge and item grades, timing markers), within their scope only, with recent authentication and audit, subject to all existing export restrictions (EX-2, EX-3). | LOCKED (W9-3) + LOCKED (Wave 1 S-8) |
| EX-2 | Exports never contain answer content, AI details, integrity facts, safeguarding data or learning signals. | PROPOSED DEFAULT |
| EX-3 | Audit-log export stays Owner-only (FD-3). | LOCKED (FD-3) |
| EX-4 | Cross-organization analytics use only de-identified aggregates with k ≥ 10; this is platform analytics, not an organization feature; its legal basis is sign-off gate 7. | EXISTING (ADR-005, Wave 1 T-11) + gate 7 |

## 4.5 Staff and learner periodic reports

| # | Rule | Label |
|---|---|---|
| SR-1 | No scheduled staff digests (teacher cohort or owner overview) in V1; dashboards only. | LOCKED (W9-4) |
| SR-2 | No periodic reports to learners in V1. | LOCKED (W9-5) |
| SR-3 | No alert or notification is generated from learning data for anyone in V1. | LOCKED (D17) |

# 5. State Models

## 5.1 Report snapshot

GENERATED (immutable) → REDACTED (tombstone after R8, or learner deletion). A correction is a new snapshot (revision + 1, `corrects_snapshot_id`).

## 5.2 Report recipient

PENDING → REQUESTED → DELIVERED / FAILED; PENDING → SKIPPED_NO_CONSENT; PENDING / REQUESTED → CANCELLED (guardian link ended, consent withdrawn before dispatch).

## 5.3 Pending correction

PENDING → INCLUDED (next or urgent snapshot) / DISMISSED (non-material, or superseded by a newer revision before inclusion).

# 6. Permissions and Tenant Boundaries

| Action | Owner | Admin | Teacher (in scope) | Learner | Guardian |
|---|---|---|---|---|---|
| Assignment view, cohort topic map, learner detail | ✓ | ✓ | ✓ (W6-6, W8-C1 limits) | ✗ | ✗ |
| Organization overview | ✓ | ✓ | ✗ | ✗ | ✗ |
| Configure guardian report schedule and template | ✓ | ✓ | ✗ | ✗ | ✗ |
| Flag a correction urgent | ✓ | ✓ | ✓ | ✗ | ✗ |
| Export assignment results as CSV (recent auth, audited) | ✓ | ✓ | ✓ in scope | ✗ | ✗ |
| Export audit log | ✓ | ✗ | ✗ | ✗ | ✗ |
| Open a report link | — | — | — | ✗ (no learner reports, W9-5) | ✓ own link |
| Guardian home report list | — | — | — | — | ✓ one-time code |

All read models are tenant-owned; names are resolved per request through Roster; teachers never receive rows outside scope from any endpoint (EXISTING, FD-1).

# 7. Data Ownership

| Data | Owner | Stored / derived | Retention |
|---|---|---|---|
| Read models | Reporting | derived, rebuildable | while source exists |
| Report definitions | Reporting | stored | R1 |
| Report snapshots | Reporting | stored, immutable | R8 (24 months, then tombstone) |
| Report recipients | Reporting | stored | R1 |
| Pending corrections | Reporting | stored | R1 |
| Exports | Reporting | generated files, short-lived | 7 days, then deleted (PROPOSED DEFAULT) |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Evaluation → Reporting | B | `EvaluationHeadChanged`, `DisputeOpened / Resolved`, `RegradeCompleted` | grades, corrections |
| Challenge, Assessment → Reporting | B | status events | assignment view |
| Communication → Reporting | B | delivery status | recipient status |
| Learning → Reporting | A (read) | `GetTopicStates`, teacher learning view, report projection | topic map, reports |
| Evaluation → Reporting | A (read) | `GetItemGrade`, `GetChallengeGrade` | grades |
| Reporting → Roster | A | pseudonym and name resolution | display |
| Reporting → Privacy & Consent | A | consent checks at generation and dispatch | GR-1 |
| Reporting → Communication | B | `DeliveryRequested` (REPORT, CORRECTION) | delivery |
| Reporting → Identity | A | `IssueCapabilityGrant(REPORT_SNAPSHOT)` at dispatch | links |
| Roster → Reporting | B | `GuardianLinkEnded` | GR-9 |

No new module. New items: materiality rule (W9-C1); grade fields per W6-3/W6-4 (W9-C2); direction counts (W9-C3); guardian-home listing on link end (W9-C4).

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Duplicate or out-of-order events | Projections keep the latest by revision or sequence |
| Read model corrupted or lagging | "Last updated" shown; rebuild from events and owning modules |
| Report generation job crashes | Re-run; one snapshot per (definition, learner, period, revision) (unique key) |
| Consent withdrawn between generation and dispatch | Recipient CANCELLED or SKIPPED_NO_CONSENT; snapshot kept |
| Delivery fails | Communication retries; the report remains in guardian home |
| Head changes while a report is being generated | The snapshot uses the revisions read; the later change becomes a PendingCorrection |
| Learner deleted | Snapshots redacted to tombstone; read models purge the learner |
| Organization suspended | Dashboards read-only; no new reports generated (FD-2) |

# 10. Privacy / Consent

- Guardian reports need GUARDIAN_REPORTING processing consent and REPORTS channel consent (GR-1).
- Reports for learners who are ADULT follow the consent policy for who may grant GUARDIAN_REPORTING (LG-3); without valid consent no report is produced.
- Messages carry no results (GR-7); reports open only through a scoped link or guardian home.
- Exports exclude answer content and sensitive derived data (EX-2).
- Aggregate cross-organization analytics: k ≥ 10, de-identified (gate 7).
- Telemetry: no names, grades per learner, topic states per learner, or report bodies.

# 11. Audit / Observability

**Audited:** report schedule and template changes; urgent correction flags; exports (who, what scope); guardian-home report views (who opened which snapshot); read-model rebuild requests.

**Metrics:** projection lag (p95 against the 30-second target); rebuild durations; reports generated, delivered, skipped by reason, failed; correction counts (material, non-material, urgent); link opens; export counts.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Result overridden after a report was sent, grade drops 20% | Material; correction section next report (or now if urgent) | EXISTING + W9-C1 |
| Result changes by 3% | Recorded, not sent | EXISTING |
| Learner stops IMPROVING after a report said so | No message; next report simply omits it | LOCKED (D12) |
| Two guardians, one without channel consent | One DELIVERED, one SKIPPED_NO_CONSENT | EXISTING |
| Guardian link ends | Future reports stop; guardian home stops listing that learner (W9-C4) | LOCKED + correction |
| Unanswered questions in a reported challenge | Shown as "Not attempted", never "0" (W6-4) | LOCKED |
| Provisional grade in a report | Labelled "Provisional" (W6-5, W9-2) | LOCKED |
| Challenge still open at period end | Counted in activity; its grade appears in the report for the period in which it closes | LOCKED (W9-2) |
| Teacher asks for per-question results in the guardian report | Not available in V1 | LOCKED (W9-2) |
| Cohort teacher exports another cohort's assignment | Refused | LOCKED (W9-3) |
| No challenges in the period | No report (GR-5) | PROPOSED DEFAULT |
| Policy change rebuild before a report | Report shows current values under the new version; the snapshot records the version | LOCKED (LTM §15) |
| Teacher in two cohort scopes | Sees both; nothing else | EXISTING |

# 13. Decisions (locked at closure)

No Wave 9 product decision remains open.

| ID | Locked decision | Applied in |
|---|---|---|
| W9-1 | Guardian report schedule chosen by the organization: weekly, every two weeks or monthly; default monthly. | GR-4 |
| W9-2 | Guardian report content: D12 learning content + assigned / completed / not-completed challenge counts + challenge grades for challenges closed in the period, labelled "Provisional" where applicable; no per-question results. | GR-3 |
| W9-3 | In-scope Teachers, Admins and Owners export assignment results as CSV, with recent authentication and audit, subject to all existing export restrictions. | EX-1, §6 |
| W9-4 | No scheduled staff digests in V1; dashboards only. | SR-1 |
| W9-5 | No periodic reports to learners in V1. | SR-2 |

## Legal / compliance gates

No new LG. LG-1 to LG-9 are carried forward and remain OPEN; none is resolved or reopened here. LG-3 applies to guardian reports for learners who become adults; sign-off gate 7 governs aggregate data use.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| DB-1, DB-2 | DM §17, J12 | EXISTING / PROPOSED |
| DB-3, DB-4 | J12, W4-2, W6-3, W6-4, W9-C2 | LOCKED |
| DB-5, DB-10 | LTM §15, §17, D17, W9-C3 | LOCKED |
| DB-6, DB-7, DB-9 | W8-C1, W7-5, FD-1, W2-5, W6-6 | LOCKED |
| DB-8 | new | PROPOSED DEFAULT |
| GR-1, GR-6, GR-10, GR-13 | DM §17, Wave 2, D12 | EXISTING / LOCKED |
| GR-2 | D12 | LOCKED |
| GR-3 | W9-2 | LOCKED |
| GR-4 | W9-1 | LOCKED |
| GR-5, GR-7, GR-8, GR-11, GR-12 | SC2, Wave 2 | PROPOSED DEFAULT |
| GR-9 | W2-C4, W4-C7, W9-C4 | LOCKED |
| CR-1, CR-3, CR-5 | DM §17 | EXISTING |
| CR-2 | DM §17, W6 RG-6, W9-C1 | LOCKED |
| CR-4 | D12 | LOCKED |
| EX-1 | S-8, W9-3 | LOCKED |
| EX-2 | new | PROPOSED DEFAULT |
| EX-3, EX-4 | FD-3, ADR-005, T-11, gate 7 | LOCKED / EXISTING |
| SR-1, SR-2 | W9-4, W9-5 | LOCKED |
| SR-3 | D17 | LOCKED |

# 15. Behavioral Acceptance Criteria

**Dashboards**
1. A teacher's dashboard never returns a learner or cohort outside scope, from any endpoint.
2. After events are processed, every dashboard grade equals the grade Evaluation returns (W6-3, W6-4).
3. Unanswered items are shown as "Not attempted" and counted beside the grade; never as "0".
4. Provisional and awaiting-review grades are visibly marked.
5. A lagging view shows "Last updated"; a rebuild produces the same values as the live projection.
6. The cohort topic map shows counts per state and per direction and never triggers a notification.
7. Restricted safeguarding tasks never appear in general review statistics.
8. Out-of-authorization evidence units in learner detail carry no question text, answer content or link.
9. Policy-change transitions do not appear in "recent changes".

**Guardian reports**
10. No report is generated without an ACTIVE `receives_reports` guardian link and GUARDIAN_REPORTING consent.
11. No report message is sent to a contact point without REPORTS channel consent; that recipient is SKIPPED_NO_CONSENT.
12. A report shows topic states and the improving message only where IMPROVING with strength ≥ MODERATE at generation; it never shows declining, inconsistent, stability, strength, signals or the policy version.
13. A sent snapshot is never modified; its basis, policy version and `as_of` are stored.
14. The report message body contains no topic state, grade or result, and the stored body contains no token.
15. A report link opens only its snapshot.
16. After a guardian link ends, the guardian's report links for that learner stop working and guardian home no longer lists that learner.
17. Withdrawing GUARDIAN_REPORTING stops future reports; past reports remain as sent to guardians still linked.
18. No report is generated for a period in which the learner had no assigned challenge.

**Corrections**
19. A head change on a submission in a sent report's basis records exactly one PendingCorrection per new revision.
20. A correctness flip or a grade change of at least 10% of the maximum is material; smaller changes are recorded and not sent.
21. An urgent flag creates a correction snapshot with revision + 1 and `corrects_snapshot_id`.
22. A topic-state or trajectory change alone never creates a correction or a message.
23. After 24 months a snapshot body is replaced by a tombstone.

**Exports and privacy**
24. Every export requires recent authentication and is audited.
25. No export contains answer content, AI details, integrity facts, safeguarding data or learning signals.
26. Only Owners export the audit log.
27. Export files are deleted after 7 days.
28. Telemetry contains no names, per-learner grades, per-learner topic states or report bodies.
29. No alert or notification is generated from learning data.

**Wave 9 decisions**
30. An Owner or Admin can set the guardian report schedule to weekly, every two weeks or monthly; a new organization is monthly (W9-1).
31. A guardian report contains topic states, D12 improving messages, assigned / completed / not-completed counts and the grade of each challenge closed in the period; it contains no per-question result (W9-2).
32. A provisional challenge grade in a guardian report is labelled "Provisional"; unanswered questions show as "Not attempted" (W9-2, W6-4, W6-5).
33. A challenge still open at the end of the period contributes to activity counts but not a grade until the period in which it closes (W9-2).
34. A cohort-scoped teacher can export results only for assignments in scope; every export needs recent authentication and is audited (W9-3).
35. No scheduled email or message digest is sent to any staff member (W9-4).
36. No periodic report is sent to a learner (W9-5).
37. The student-challenge read model's grade equals Evaluation's challenge grade and its completion comes from engagement status (W9-C2).
38. The cohort topic map carries counts per direction and "needs attention" counts (W9-C3).

---

# Wave 9 Closure

**Status: APPROVED and CLOSED (revision 2).** Waves 1–8 decisions and all legal gates are unchanged.

## Binding rules for later waves

1. Reporting displays; it never computes grades, topic states or trajectory.
2. Every report sent is frozen in its snapshot; later changes reach guardians only through material corrections.
3. Guardian learning content follows D12 exactly; no negative trajectory content and no learning alerts for anyone (D17).
4. Report messages carry no results; reports open only through a scoped link or guardian home.
5. Exports are scope-limited, recently authenticated, audited and exclude sensitive and content data.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W9-1 | Organization chooses weekly, every two weeks or monthly; default monthly. |
| W9-2 | D12 learning content + assigned / completed / not-completed counts + grades of challenges closed in the period ("Provisional" where applicable); no per-question results. |
| W9-3 | In-scope Teachers, Admins and Owners export assignment results as CSV; recent authentication; audited; all existing export restrictions apply. |
| W9-4 | No scheduled staff digests in V1; dashboards only. |
| W9-5 | No periodic reports to learners in V1. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W9-C1 | Material correction = an item's correctness flips or a reported challenge grade changes by ≥ 10% of its maximum (same as Wave 6 RG-6); no pass/fail concept. |
| W9-C2 | Student-challenge read model carries the challenge grade (earned / all-items maximum), not-attempted count, provisional and review counts; completion comes from engagement status. |
| W9-C3 | Cohort topic map carries direction counts and PERSISTENT_DIFFICULTY / repeated-misconception counts for the "needs attention" ordering. |
| W9-C4 | After `GuardianLinkEnded`, guardian home no longer lists that learner or their reports; snapshots are unchanged. |

## 3. Legal / compliance gates

No new gate. LG-1 to LG-9 carried forward and OPEN. LG-3 applies to guardian reports for learners who become adults; sign-off gate 7 governs aggregate data use (k ≥ 10).

## 4. Remaining non-blocking proposed defaults

30-second freshness target (DB-2); organization overview contents (DB-8); no report without assigned challenges (GR-5); no results in report messages (GR-7); report link valid 30 days (GR-8); organization default locale (GR-11); printable pages, no PDF attachment (GR-12); export content exclusions (EX-2); export files deleted after 7 days; report generation after period end, respecting quiet hours (GR-4 timing).

## 5. Domain Model and ADR reconciliation items (recorded, not yet applied)

| Document | Section | Change |
|---|---|---|
| DM | §17 correction semantics | Materiality per W9-C1; `material_threshold` default 0.10 of maximum. |
| DM | §17 `rm_student_challenge_status` | Challenge grade (W6-4), not-attempted count, provisional and review counts; completion from engagement (W9-C2). |
| DM | §17 `rm_cohort_topic` | Direction counts and "needs attention" counts (W9-C3). |
| DM | §17 `report_definition` | `cadence` (WEEKLY, FORTNIGHTLY, MONTHLY; default MONTHLY) (W9-1); content sections: learning (D12), activity counts, closed-challenge grades; no per-question section (W9-2). |
| DM | §17 `report_recipient` | CANCELLED status (link ended or consent withdrawn before dispatch). |
| DM | §5.2 / guardian home | Listing excludes learners whose guardian link ended (W9-C4). |
| DM | §5.4 | `report.export` for Owner, Admin and in-scope Teacher (W9-3). |
| DM | §4 retention | Export files 7 days. |
| Spec Kit Part 1 | J12 | Grades per W6-3 / W6-4; topic map directions (W9-C3). |
| Carried forward (unchanged) | Wave 2 to 7 reconciliation items | Not reopened; not applied. |

**STOP — Wave 9 closed. Wave 10 not started.**
