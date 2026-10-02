# Challenge Me — V1 Spec Kit — Part 2, Wave 10: Privacy Lifecycle

> Capability: consent withdrawal effects across modules, deletion requests (learner, guardian, contact point, organization) and their fan-out, retention classes and expiry, provider-side deletion, organization termination and purge, staff anonymization, backups and the deletion ledger, subject access (SPEC-080 to 083).
>
> Status: APPROVED and CLOSED. W10-1 to W10-5 locked as product behavior; W10-C1 to W10-C3 reconciled; LG-10 and LG-1 to LG-9 remain OPEN. No retention period, deletion deadline, anonymized-result retention, backup persistence, subject-access deadline or deletion exemption in this document is legally approved. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–9 (closed), Domain Model rev. 1.5 (DM §4 classification and retention, §7 Privacy & Consent, §24, §27, §31, X11), ADR-005, ADR-006, ADR-018, ADR-019, ADR-023, ADR-024, legal gates LG-1 to LG-9 (all OPEN), Learning Trajectory Model rev. 14.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 10 decisions as locked product behavior at closure; the Wave 10 Closure at the end lists what remains open, including every legal gate.

**Product behavior vs legal gates.** This wave specifies what the product does. Whether that behavior is sufficient in a given market (periods, deadlines, who may exercise which right, adequacy of anonymization) is a legal question and is marked **LEGAL / COMPLIANCE GATE**. A product rule labelled LOCKED or PROPOSED DEFAULT never resolves a legal gate; counsel may require a different value per market, which the product supports through the configuration named in each rule.

# 1. Capability Overview

**Plain language.** People can change their minds and ask to be forgotten, and data should not be kept longer than it is useful. Withdrawing a permission stops future use of it at once. Asking for deletion removes the person's details and their answers everywhere Challenge Me keeps them, including at outside providers where they support it, and a tamper-proof record makes sure a later backup restore cannot bring the data back. Every kind of stored data has a retention period after which it is removed automatically. When an organization leaves, its data is purged after a short grace period.

**Privacy & Consent owns:** consent state and history, consent policy versions, deletion requests and tasks, the classification register, retention overrides, the subprocessor register and the external deletion ledger.

**Privacy & Consent does not own:** the data itself. Every module purges its own stores through its registered purge handler (EXISTING, DM §7.4, §27).

# 2. Actors

| Actor | Role here | Source |
|---|---|---|
| Owner | Approves deletion requests (recent auth); may cancel during the 7-day hold; exports a person's data or the whole organization | LOCKED (FD-1, W10-3, W10-5) |
| Admin | Records consent changes on request; requests deletions; exports a learner's or guardian's data | LOCKED (FD-1, W10-5) |
| Teacher | No privacy actions | LOCKED (FD-1) |
| Learner, Guardian | Withdraw consent they may withdraw (policy, LG-3); submit a deletion request for their own data from learner home or guardian home (one-time code), which the Owner approves | EXISTING (Wave 2) + LOCKED (W10-1) |
| System (purge jobs, retention sweeper, ledger writer) | Executes purges and expiry | EXISTING (DM §21, §27) |
| Platform operator | Runs restores and ledger replay; organization purge after termination | EXISTING (X11, Wave 1) |
| Subprocessors | Receive deletion calls where supported | EXISTING (DM §7.2 subprocessor register) |

# 3. Core Lifecycle

```
Withdrawal: WithdrawConsent -> state row + ConsentEvent + ConsentChanged (one TX)
  -> consumers cancel queued work; in-flight provider calls complete, outputs discarded,
     payloads purged; nothing already produced is undone (C-9)

Deletion: RequestDeletion (subject; source STAFF, LEARNER_SELF or GUARDIAN_SELF, W10-1)
  -> Owner approval (recent auth) -> 7-day hold, Owner may cancel (W10-3)
  -> EXECUTING: one DeletionTask per applicable register entry
  -> PurgeStoreRequested per store -> module purge handler -> ReportPurgeResult
  -> subprocessor deletion calls where supported
  -> all DONE / NOT_APPLICABLE -> COMPLETED -> DeletionCompleted written to DB and
     appended to the external write-once ledger (X11)

Retention: daily sweeper per class (R1–R10) -> purge handlers for expired rows / objects

Termination: organization TERMINATED -> access stops -> purge at +90 days (R1),
  audit events per LG-1

Restore: platform restore -> replay ledger entries newer than the restore point
```

# 4. Behavioral Rules

## 4.1 Consent withdrawal (Wave 2, applied across modules)

| # | Rule | Label |
|---|---|---|
| CW-1 | Channel consent withdrawal cancels queued deliveries for that contact point and purpose; STOP replies withdraw the matching channel consent and, on a shared account, suppress the number for every organization on it. | LOCKED (Wave 2 C-6, C-11) |
| CW-2 | AI_PROCESSING withdrawal cancels queued AI operations; a running call completes and its output is discarded and payload purged; open evaluations are re-planned to teacher review; AI marking and feedback stop for that learner. | LOCKED (Wave 2 C-7, W7-C1, Wave 6 PL-3) |
| CW-3 | GUARDIAN_REPORTING withdrawal stops future guardian reports; sent reports stay as sent. | LOCKED (Wave 2 C-8, D12) |
| CW-4 | Withdrawal is not retroactive: results, feedback and learning evidence already produced remain unless a deletion request is made. | PROPOSED DEFAULT (Wave 2 C-9) + **LEGAL GATE LG-5** |
| CW-5 | Who may withdraw a guardian-granted consent for a minor, and what happens at adulthood or when a guardian link ends, stay with **LG-3**; the product records every change as a ConsentEvent and never erases history (R6). | EXISTING + **LEGAL GATE LG-3** |
| CW-6 | Consent is checked at enqueue and again before every provider call; the J-6 limitation for in-flight calls applies. | LOCKED (ADR-019, J-6) |

## 4.2 Deletion requests

| # | Rule | Label |
|---|---|---|
| DR-1 | Subjects: LEARNER, GUARDIAN, CONTACT_POINT, ORGANIZATION. At most one open request per subject. | EXISTING (DM §7.2, §28) |
| DR-2 | Admins and Owners record requests; only the Owner approves, with recent authentication; every step is audited. | LOCKED (FD-1, Wave 1 S-8) |
| DR-3 | Requests can be submitted by Admins and Owners on a person's behalf (source STAFF), or by the learner or guardian themselves through a "Request deletion of my data" action in learner home or guardian home after a one-time code (source LEARNER_SELF or GUARDIAN_SELF). A self-service request is REQUESTED and needs Owner approval like any other; it is never auto-approved. The Owner sees new self-service requests on the organization's privacy page. | LOCKED (W10-1) |
| DR-4 | After approval, execution waits **7 days**; during the hold the Owner can cancel (CANCELLED, audited); after the hold, execution starts automatically. The hold always ends within the request's due date. Not legally approved: subject to **LG-10**. | LOCKED (W10-3) + LG-10 |
| DR-5 | Execution creates one task per applicable classification-register entry; the request completes only when every task is DONE or NOT_APPLICABLE; a failed task is retried and the request shows PARTIALLY_FAILED until resolved. | EXISTING (DM §7.4) |
| DR-6 | A request is due within 30 days of receipt; overdue requests appear to the Owner and to platform operators. Not legally approved: subject to **LG-10**. | PROPOSED DEFAULT + **LEGAL GATE LG-10** |
| DR-7 | Rejection requires a reason category and is audited; the product does not decide whether a legal exemption applies; exemptions are not legally approved (LG-10). | PROPOSED DEFAULT + LG-10 |

## 4.3 What learner deletion does

| # | Module / data | Effect | Label |
|---|---|---|---|
| LD-1 | Roster | Learner row anonymized, state DELETED, pseudonym mapping deleted; guardian links ended; contact points deleted unless linked to another person | EXISTING (DM §27, Wave 2) |
| LD-2 | Identity | All grants and sessions for the learner revoked | EXISTING |
| LD-3 | Challenge | Non-terminal student challenges CANCELLED (LEARNER_DELETED); pending reminders and reinforcement cancelled | EXISTING (Wave 4) |
| LD-4 | Assessment | Submission content, drafts and practice output purged; metadata kept (R1) | EXISTING (DM §27) |
| LD-5 | Evaluation | Feedback text and code observations purged; criterion evidence resolves to "[redacted]"; dispute text redacted, decision records kept; open review tasks and disputes cancelled | EXISTING (DM §27) |
| LD-6 | Learning | All learning rows for the pseudonym are deleted; open reinforcement items cancelled; the RETRACTED observation status is not produced in V1 | EXISTING (DM §27) + LOCKED (W10-C3) |
| LD-7 | Reporting | Report snapshots replaced by tombstones; the deleted learner is **removed from every per-learner list** (assignment views, learner detail, exports, topic-map drill-downs) and **remains only inside aggregates** (counts, averages, completion rates), with no name, row or content. Keeping these de-identified numbers is not legally approved: subject to **LG-10** | EXISTING + LOCKED (W10-2) + LG-10 |
| LD-8 | AI Platform | AI payloads purged; provider deletion per DPA; no golden items exist from customer data in V1 (register entry NOT_APPLICABLE) | EXISTING + LOCKED (W7-2) |
| LD-9 | Communication | Message bodies and inbound messages purged; provider deletion where supported | EXISTING |
| LD-10 | Integrity facts | Deleted with the learner's submission metadata link; content hashes of purged content are deleted | PROPOSED DEFAULT + LG-7 |
| LD-11 | Audit | Events kept for R6; the learner appears as "Deleted learner" (names resolved at view time) | EXISTING (Wave 1 A-6) |

## 4.4 Guardian, contact point and staff deletion

| # | Rule | Label |
|---|---|---|
| GD-1 | Guardian deletion: guardian anonymized; all guardian links ended (`GuardianLinkEnded` per learner, W4-C7, W9-C4); contact points deleted unless linked to another person; consent history kept (R6); the status of consents that guardian granted is **LG-3**. | EXISTING + LG-3 |
| GD-2 | Contact-point deletion: the value is removed, channel consents ended, queued deliveries cancelled; on shared accounts, suppression by HMAC is kept so a STOP stays effective. | EXISTING (DM §7.3, X7) |
| GD-3 | Staff deletion: anonymized ("Former staff member"), internal id kept for audit and decision records. | EXISTING (Wave 1) + **LEGAL GATE LG-2** |

## 4.5 Retention

| # | Rule | Label |
|---|---|---|
| RT-1 | Every store is registered with a class and a purge handler; a store without a register entry fails the release check. | EXISTING (DM §7.2, §34) |
| RT-2 | Classes: R1 core (while organization active; purged 90 days after termination); R2 learner payload (until deletion or 24 months after last activity); R3 AI payload 90 days; R4 code output 30 days; R5 message body 30 days after terminal delivery state; R6 audit 24 months; R7 security 30 days after expiry; R8 report snapshot 24 months then tombstone; R9 import staging 30 days; R10 webhook raw 14 days; exports 7 days (Wave 9). Periods are not legally approved. | EXISTING (DM §4) as PROPOSED DEFAULT periods + **LEGAL GATE LG-10** |
| RT-3 | "Last activity" for R2 = the latest of the learner's last submission, last challenge open and last enrollment change. | PROPOSED DEFAULT |
| RT-4 | Owners may **shorten** R2 (learner payload), R4 (code output), R5 (message body) and R8 (report snapshot), never below platform minimums; no class can be lengthened; other classes cannot be changed. Changes are audited and apply to data by age from the next sweep. | LOCKED (W10-4) + LG-10 (minimums and maximums) |
| RT-5 | Expiry never removes a learner record itself; it removes payloads. Learners are removed only by deletion requests or organization purge. | PROPOSED DEFAULT |
| RT-6 | A regrade skips submissions whose content has been purged, with reason CONTENT_PURGED; the existing result stays. | LOCKED (W10-C1) |

## 4.6 Provider-side deletion

| # | Rule | Label |
|---|---|---|
| PD-1 | Each subprocessor is recorded with data classes, purpose, geography, retention and deletion mechanism. | EXISTING (DM §7.2) |
| PD-2 | Deletion calls are made where the provider supports them; where it does not, the provider's retention (zero where offered, W7-4) is recorded and disclosed. Calls may run more than once; a provider's own duplicate handling is relied on (J-6). | EXISTING + LOCKED (W7-4, J-6) |
| PD-3 | A deletion task for a provider is DONE when the call succeeds, NOT_APPLICABLE when the provider retained nothing or offers no mechanism (recorded with the reason). | PROPOSED DEFAULT |
| PD-4 | Provider terms per market remain **LG-6** (teaching material, extraction and AI) and **LG-9** (learner content, code execution). | LEGAL GATES |

## 4.7 Organization termination and purge

| # | Rule | Label |
|---|---|---|
| OT-1 | On TERMINATED, all access stops; only purge and deletion jobs run. | LOCKED (Wave 1 §4.5) |
| OT-2 | At termination + 90 days, all tenant-owned data is purged, including report snapshots and learning rows, regardless of their own longer class periods; audit events follow LG-1 (proposed: kept 24 months with free-text references and payloads purged). | EXISTING (R1) + LOCKED (W10-C2) + **LG-1** |
| OT-3 | During the 90 days after termination, the Owner can generate an organization data export (W10-5). | LOCKED (W10-5) |
| OT-4 | Organization purge is recorded in the deletion ledger like any deletion. | EXISTING (X11) |

## 4.8 Backups and the deletion ledger

| # | Rule | Label |
|---|---|---|
| BK-1 | Every completed deletion is written to the database and to an external write-once ledger. | EXISTING (X11) |
| BK-2 | After any restore, the ledger entries newer than the restore point are replayed before the system reopens. | EXISTING (X11, ADR-023) |
| BK-3 | Deleted data can remain in backups until those backups expire (35 days); backups are never read for anything except restore. Not legally approved: subject to **LG-10**. | PROPOSED DEFAULT + LG-10 |

## 4.9 Subject access

| # | Rule | Label |
|---|---|---|
| SA-1 | Owners and Admins can generate a complete export of one learner's or guardian's data (profile, consents and consent history, submissions with content, results, feedback, reports sent), with recent authentication, audit and the 7-day file rule; the Owner alone can generate the organization export (including during the 90 days after termination). Exports follow all existing export restrictions for other people's data: a person's export never contains another learner's data. | LOCKED (W10-5) |
| SA-2 | Subject-access response deadlines and scope per market are **LG-10**; nothing in this document is a legally approved deadline. | LEGAL GATE |

# 5. State Models

## 5.1 Deletion request

| From | To | Actor | Guard | Audit |
|---|---|---|---|---|
| — | REQUESTED | Admin, Owner (STAFF); learner or guardian self-service (LEARNER_SELF, GUARDIAN_SELF) | no open request for the subject | yes |
| REQUESTED | APPROVED | Owner | recent authentication | yes |
| REQUESTED | REJECTED | Owner | reason category | yes |
| APPROVED | EXECUTING | system | 7-day hold elapsed (W10-3) | yes |
| APPROVED | CANCELLED | Owner | during the 7-day hold only (W10-3) | yes |
| EXECUTING | COMPLETED | system | all tasks DONE / NOT_APPLICABLE; ledger written | yes |
| EXECUTING | PARTIALLY_FAILED | system | a task failed after retries | yes |
| PARTIALLY_FAILED | COMPLETED | system | retried tasks succeed | yes |
| COMPLETED / REJECTED / CANCELLED | any | — | **invalid** | — |

## 5.2 Deletion task

PENDING → DONE / FAILED / NOT_APPLICABLE; FAILED → PENDING (retry).

## 5.3 Consent

(none) → GRANTED → WITHDRAWN / EXPIRED → GRANTED; each change appends a ConsentEvent (EXISTING, Wave 2).

# 6. Permissions and Tenant Boundaries

| Action | Owner | Admin | Teacher | Learner | Guardian |
|---|---|---|---|---|---|
| Record consent withdrawal on request | ✓ | ✓ | ✗ | — | — |
| Withdraw own consent (policy permitting) | — | — | — | ✓ | ✓ |
| Request deletion | ✓ | ✓ | ✗ | ✓ own data (learner home) | ✓ own data (guardian home) |
| Approve or reject deletion | ✓ (recent auth) | ✗ | ✗ | ✗ | ✗ |
| Shorten R2, R4, R5, R8 within platform minimums | ✓ | ✗ | ✗ | ✗ | ✗ |
| Cancel an approved deletion during the hold | ✓ | ✗ | ✗ | ✗ | ✗ |
| Export one learner's or guardian's data | ✓ | ✓ | ✗ | ✗ | ✗ |
| Organization export before purge | ✓ | ✗ | ✗ | ✗ | ✗ |
| Restore and ledger replay | platform operator only | | | | |

All purges run under the organization's context; the ledger is per organization; platform-shared suppression is keyed by HMAC and never holds raw contact values (EXISTING, X7).

# 7. Data Ownership

| Data | Owner | Retention |
|---|---|---|
| Consent state | Privacy & Consent | R1 |
| Consent events | Privacy & Consent | R6, append-only |
| Deletion requests and tasks | Privacy & Consent | R6 |
| Classification register, subprocessor register | Privacy & Consent (reference / platform) | versioned |
| Retention overrides | Privacy & Consent | R1 |
| External deletion ledger | Privacy & Consent | write-once; kept beyond backup retention |
| Every stored data class | its owning module (DM §27) | its class |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Privacy → all consumers | B | `ConsentChanged` | cancel queued work |
| All → Privacy | A | `ConsentGate.check` at enqueue and dispatch | ADR-019 |
| Privacy → owning modules | B | `PurgeStoreRequested{request, store, subject}` | deletion fan-out |
| Owning modules → Privacy | A | `ReportPurgeResult` | task completion |
| Privacy → Reporting | B | `DeletionCompleted` | read-model purge |
| Roster → all | B | `LearnerDeleted`, `GuardianDeleted`, `GuardianLinkEnded` | cancellations, revocations |
| Tenancy → all | B | `OrganizationTerminated` | stop work; schedule purge |
| Privacy → subprocessors | adapter | provider deletion calls | PD-2 |

No new module. New or changed items: regrade skip reason for purged content (W10-C1); organization purge precedence (W10-C2); learning deletion semantics (W10-C3); retention override scope (W10-4); deletion hold (W10-3).

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Purge job fails | Retried; request PARTIALLY_FAILED; Owner and platform see it |
| Provider deletion call fails or times out | Retried; if unsupported, NOT_APPLICABLE with reason |
| Duplicate purge request | Idempotent per (request, store) |
| New data arrives for a subject during deletion (e.g. a queued submission) | Refused once the learner is DELETED; late events for the subject complete as stale no-ops (Wave 1 J-7) |
| Restore to before a deletion | Ledger replay re-applies the deletion before reopening |
| Consent withdrawn during an AI call | Output discarded, payload purged (CW-2) |
| Retention sweeper misses a day | Next run catches up; purges are by age, not by day |

# 10. Privacy / Consent

This wave is itself the privacy capability. Cross-cutting rules: minimization in every outbound request (Waves 4, 7, 9); consent at enqueue and dispatch; no learner content in telemetry; pseudonyms in Learning; sensitive-logging canary test in CI (DM §29).

# 11. Audit / Observability

**Audited:** consent changes (as ConsentEvents); deletion request, approval, rejection, cancellation, completion; retention override changes; subject-access and organization exports; restores and ledger replays.

**Metrics:** open deletion requests and age against the due date; tasks by status per store; provider deletion failures; retention sweeper runs and volumes per class; ledger write failures (alerting); consent withdrawals by purpose; canary-test results.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Learner deleted with a dispute open | Dispute cancelled; decision record kept, text redacted | EXISTING |
| Learner deleted during a regrade | Regrade item skipped | EXISTING |
| Submission content expired (R2), later regrade | Skipped (CONTENT_PURGED); result unchanged | LOCKED (W10-C1) |
| Two learners share a phone; one is deleted | Contact point kept for the other learner | EXISTING |
| STOP on a shared account, then contact point deleted | Suppression kept by HMAC | EXISTING |
| Guardian deleted; they granted AI consent for a minor | Consent status per LG-3; history kept | LG-3 |
| Organization terminated with report snapshots 3 months old | Purged at +90 days | LOCKED (W10-C2) |
| Guardian submits a self-service deletion request | REQUESTED; Owner approves or rejects; 7-day hold after approval | LOCKED (W10-1, W10-3) |
| Owner approves by mistake | Cancels within 7 days; nothing deleted | LOCKED (W10-3) |
| Deleted learner in a cohort average | Included in the average; absent from the learner list and exports | LOCKED (W10-2) + LG-10 |
| Owner tries to lengthen R2 | Refused | LOCKED (W10-4) |
| Restore after a deletion | Ledger replay re-deletes | EXISTING |
| Former staff member asks for deletion | Anonymized; id kept (LG-2) | EXISTING + LG-2 |
| Deletion of a merged learner's survivor | Survivor deleted; merge history keeps only ids | PROPOSED DEFAULT |

# 13. Decisions (locked at closure)

No Wave 10 product decision remains open. These are product behaviors; none of them is a legal approval (LG-10 and LG-1 to LG-9 remain OPEN).

| ID | Locked decision | Applied in |
|---|---|---|
| W10-1 | Staff record deletion requests; learners and guardians can also submit a request for their own data from learner home or guardian home; every request needs Owner approval. | DR-3 |
| W10-2 | A deleted learner is removed from every per-learner list and remains only inside aggregates, with no name, row or content. | LD-7 |
| W10-3 | 7-day hold after approval; the Owner can cancel during it; execution then starts automatically, within the due date. | DR-4 |
| W10-4 | Owners may shorten R2, R4, R5 and R8 within platform minimums; no class can be lengthened. | RT-4 |
| W10-5 | Owners and Admins export one learner's or guardian's data; the Owner alone exports the organization (including after termination); recent auth, audit, 7-day files. | SA-1, OT-3 |

## Legal / compliance gates

### LG-10 — Retention periods, deletion deadlines, anonymization and subject access (new)

Formalizes the existing Domain Model §31-D sign-off ("retention maximums per class"). Counsel per market: retention periods for R1–R10 and exports; deletion response deadline (product default 30 days); whether keeping de-identified numeric results after deletion is acceptable (W10-2); backup persistence of deleted data (35 days); subject-access response deadline and scope; lawful grounds for rejecting a deletion. **OPEN.** The locked product behaviors of this wave (W10-1 to W10-5) and its proposed defaults do **not** make any of the following legally approved: retention periods, the 30-day deletion due date, retention of anonymized results in aggregates, 35-day backup persistence, subject-access deadlines, or deletion exemptions.

LG-1 (audit after termination), LG-2 (staff anonymization), LG-3 (minors' consent), LG-4 (consent acquisition), LG-5 (withdrawal effects), LG-6, LG-7, LG-8, LG-9 carried forward and OPEN; LG-1, LG-2, LG-3, LG-5, LG-6, LG-7 and LG-9 are directly touched by this wave.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| CW-1 … CW-3, CW-6 | Wave 2 C-6, C-7, C-8, C-11, ADR-019, W7-C1, J-6 | LOCKED |
| CW-4, CW-5 | Wave 2 C-9, C-13 | PROPOSED / EXISTING; LG-5, LG-3 |
| DR-1, DR-2, DR-5 | DM §7, FD-1, S-8 | EXISTING / LOCKED |
| DR-3 | W10-1 | LOCKED |
| DR-4 | W10-3 | LOCKED; LG-10 |
| DR-6, DR-7 | new | PROPOSED DEFAULT; LG-10 |
| LD-1 … LD-11 | DM §27, Waves 1, 2, 4, 7, W10-2, W10-C3 | EXISTING / LOCKED; LD-10 PROPOSED; LD-7 LG-10 |
| GD-1 … GD-3 | DM §7, §27, Waves 1, 2, W4-C7, W9-C4 | EXISTING; LG-2, LG-3 |
| RT-1, RT-2 | DM §4, §7, §34 | EXISTING; LG-10 |
| RT-3, RT-5 | new | PROPOSED DEFAULT |
| RT-4 | DM §7.2 retention_override, W10-4 | LOCKED; LG-10 |
| RT-6 | Wave 6 RG, W10-C1 | LOCKED |
| PD-1 … PD-4 | DM §7.2, §27, W7-4, J-6 | EXISTING / LOCKED; LG-6, LG-9 |
| OT-1 … OT-4 | Wave 1, DM R1, X11, W10-C2, W10-5 | LOCKED / EXISTING; LG-1 |
| BK-1, BK-2 | X11, ADR-023 | EXISTING |
| BK-3 | new | PROPOSED DEFAULT; LG-10 |
| SA-1, SA-2 | W10-5 | LOCKED; LG-10 |

# 15. Behavioral Acceptance Criteria

**Withdrawal**
1. Withdrawing a channel consent cancels queued deliveries for that contact point and purpose; nothing is sent after the withdrawal is committed.
2. Withdrawing AI_PROCESSING cancels queued AI operations; an in-flight result is discarded and its payload purged; open evaluations move to teacher review.
3. Withdrawal never deletes results, feedback or learning evidence already produced.
4. Every consent change produces a ConsentEvent; history is never erased within R6.

**Deletion**
5. Only the Owner can approve a deletion, and only with recent authentication.
6. A second open request for the same subject is refused.
7. A learner deletion completes only when every applicable register entry is DONE or NOT_APPLICABLE.
8. After learner deletion, no submission content, draft, practice output, feedback text, AI payload, message body or learning row for that learner exists; criterion evidence displays "[redacted]".
9. After learner deletion, the learner's grants and sessions no longer work and no new message is sent to them or about them.
10. Contact points shared with another person survive a learner or guardian deletion.
11. Deleting a guardian ends all their links and stops their reports.
12. A completed deletion is present in the external ledger.
13. After a restore to before a deletion, the deletion is re-applied before the system reopens.
14. Audit events show a deleted learner or former staff member without their name.

**Retention**
15. Every S2–S4 store has a register entry and purge handler; a missing entry fails the release check.
16. Each class is purged by the sweeper at its period; a missed day is caught up.
17. Expiry never deletes a learner record.
18. A regrade skips submissions whose content was purged, with a recorded reason.
19. Export files are deleted after 7 days.

**Organization**
20. A terminated organization has no access; at +90 days all its tenant-owned data, including report snapshots and learning rows, is purged; audit events follow LG-1.
21. Organization purge is recorded in the ledger.

**Providers**
22. For each deletion, provider deletion is attempted where supported and otherwise recorded as NOT_APPLICABLE with the reason.
23. No customer-derived golden items exist to delete in V1 (W7-2).

**Telemetry**
24. The sensitive-logging canary test finds no learner text in logs or traces.

**Wave 10 decisions**
25. A learner or guardian can submit a deletion request for their own data only after a one-time code; it is created as REQUESTED with source LEARNER_SELF or GUARDIAN_SELF and never executes without Owner approval (W10-1).
26. After learner deletion, the learner appears in no per-learner list, learner detail, export or drill-down; cohort counts and averages still include their de-identified results (W10-2).
27. An approved deletion does not start for 7 days; an Owner cancellation in that window leaves all data intact and is audited (W10-3).
28. Execution after the hold starts automatically and never later than the request's due date (W10-3).
29. An Owner can shorten R2, R4, R5 or R8 but not below the platform minimum; any attempt to lengthen a class is refused; the change is audited (W10-4).
30. A learner data export contains that learner's profile, consents, submissions with content, results, feedback and reports sent, and nothing about any other learner; it requires recent authentication, is audited and is deleted after 7 days (W10-5).
31. Only the Owner can generate the organization export, including during the 90 days after termination (W10-5).
32. A regrade item for purged content is SKIPPED_CONTENT_PURGED and the result is unchanged (W10-C1).
33. At termination + 90 days no tenant-owned row or object remains except audit events handled under LG-1 (W10-C2).
34. After learner deletion, no learning row exists for the pseudonym and no observation is ever marked RETRACTED (W10-C3).

---

# Wave 10 Closure

**Status: APPROVED and CLOSED.** Product behavior is locked; every legal question stays open. Waves 1–9 decisions are unchanged.

## Binding rules for later waves

1. Withdrawal stops future use immediately and is never retroactive by itself; deletion is the only path to remove produced results.
2. Every store has a register entry and a purge handler; a deletion completes only when every entry is DONE or NOT_APPLICABLE and is written to the external ledger.
3. Every restore replays the deletion ledger before the system reopens.
4. Only the Owner approves deletions; nothing deletes a learner record except an approved deletion or organization purge.
5. Product values for periods and deadlines are proposed defaults, never legal approvals (LG-10).

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W10-1 | Staff record requests; learners and guardians can also submit a request for their own data from learner home or guardian home; Owner approval always required. |
| W10-2 | Deleted learners are removed from per-learner lists and remain only in aggregates, de-identified. |
| W10-3 | 7-day hold after approval; Owner can cancel; execution then starts automatically within the due date. |
| W10-4 | Owners may shorten R2, R4, R5, R8 within platform minimums; nothing can be lengthened. |
| W10-5 | Owners and Admins export one learner's or guardian's data; the Owner alone exports the organization (also during the 90 days after termination); recent auth, audit, 7-day files. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W10-C1 | Regrade items for purged content are skipped with reason CONTENT_PURGED; the existing result stays. |
| W10-C2 | Organization purge at +90 days removes all tenant-owned data regardless of class; only audit events follow LG-1. |
| W10-C3 | Learner deletion deletes all learning rows for the pseudonym; RETRACTED is not produced in V1. |

## 3. Legal / compliance gates (all OPEN)

| Gate | Subject | Status |
|---|---|---|
| **LG-10** | **Retention periods (R1–R10, exports); deletion due date (product default 30 days); retention of anonymized results in aggregates (W10-2); backup persistence (35 days); subject-access deadlines and scope; lawful grounds for rejecting deletion** | **OPEN (new). None of these is legally approved.** |
| LG-1 | Audit retention vs organization termination | OPEN |
| LG-2 | Staff personal-data deletion | OPEN |
| LG-3 | Minors: consent grant, withdrawal, guardian link end, adulthood | OPEN |
| LG-4 | Consent acquisition and attestation | OPEN |
| LG-5 | Withdrawal effects and consent-history retention | OPEN |
| LG-6 | Teaching material rights; extraction and AI providers | OPEN |
| LG-7 | Learner integrity facts | OPEN |
| LG-8 | Automated marking and confirmation; human review | OPEN |
| LG-9 | AI and code-execution providers processing learner content | OPEN |

Sign-off items outside the LG list: gate 7 (aggregate analytics, k ≥ 10), gate 9 (AI quality thresholds), gate 10 (safeguarding routing).

## 4. Remaining non-blocking proposed defaults (none legally approved)

30-day deletion due date with overdue visibility (DR-6); rejection reason categories (DR-7); "last activity" definition (RT-3); expiry never deletes learner records (RT-5); provider NOT_APPLICABLE rule (PD-3); backup retention 35 days (BK-3); integrity facts deleted with the learner (LD-10); merged-survivor deletion; retention periods R1–R10.

## 5. Domain Model and ADR reconciliation items (recorded, not yet applied)

| Document | Section | Change |
|---|---|---|
| DM | §7.2 `deletion_request` | `source` (STAFF, LEARNER_SELF, GUARDIAN_SELF) (W10-1); `execute_after` = approval + 7 days and CANCELLED status (W10-3); rejection reason categories. |
| DM | §5.4, §28 | Self-service `RequestOwnDeletion` for LEARNER_HOME and GUARDIAN_HOME sessions (W10-1); `CancelDeletion` (Owner, during hold) (W10-3). |
| DM | §7.2 `retention_override` | Allowed classes R2, R4, R5, R8; shorten only; within platform minimums (W10-4). |
| DM | §11.2 `regrade_item.status` | SKIPPED_CONTENT_PURGED (W10-C1). |
| DM | §4 R1 / §27 | Organization purge precedence over class periods; audit per LG-1 (W10-C2). |
| DM | §12.2, §27 | Learning deletion deletes rows; RETRACTED unused in V1 (W10-C3). |
| DM | §17 / Reporting | Deleted learners excluded from per-learner lists and exports, included only in aggregates (W10-2). |
| DM | §27 register | Customer-derived golden items NOT_APPLICABLE in V1 (W7-2); integrity-facts entry; exports 7 days. |
| DM | §28 | `ExportSubjectData` (Owner, Admin) and `ExportOrganizationData` (Owner, including during termination grace) (W10-5). |
| DM | §31-D | Retention sign-off becomes LG-10 (OPEN). |
| ADR-006, ADR-023 | ledger, restore | Unchanged (X11); backup retention 35 days as implementation default, subject to LG-10. |
| Carried forward (unchanged) | Wave 2 to 7 and 9 reconciliation items | Not reopened; not applied. |

**STOP — Wave 10 closed. Wave 11 not started.**
