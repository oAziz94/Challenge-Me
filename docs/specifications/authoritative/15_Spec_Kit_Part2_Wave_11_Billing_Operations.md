# Challenge Me — V1 Spec Kit — Part 2, Wave 11: Billing & Operations

> Capability: plans, subscriptions, trials, entitlements, budget pools, usage reservations and the usage ledger, manual invoicing support, organization status driven by billing, feature flags and organization settings, and platform operations (observability, alerting, dead-letter handling, backup and restore, break-glass, platform operator actions) (SPEC-089 to 093, 098 to 100). Final capability wave.
>
> Status: APPROVED and CLOSED — final capability wave. W11-1 to W11-5 locked; W11-C1 to W11-C7 reconciled (W11-C2 mechanism only; duration per LG-11); one unresolved item recorded (W11-U1, what counts toward max_learners); LG-1 to LG-11 OPEN. Specification only; no implementation.
>
> Authoritative inputs: Waves 1–10 (closed), Learning Trajectory Model rev. 14 (closed), Spec Kit Part 1 (J4, J7, J8, gates 11–12), Domain Model rev. 1.5 (DM §6, §18, §21, §24 Usage Reservation, §27, §30, §31), ADR-001, ADR-012, ADR-013, ADR-021, ADR-023, ADR-024, X7, X11; FD-2, FD-4; legal gates LG-1 to LG-10 (all OPEN).

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. §13 records the Wave 11 decisions as locked at closure; the Wave 11 Closure lists what remains open. Product behavior and legal questions are kept apart: no product rule here settles a legal gate.

**Fixed V1 scope (EXISTING, ADR-021).** Billing is domain-only: Plan and PlanVersion, Subscription, Entitlement, Trial, budget pools with reservations, and an append-only usage ledger. Subscriptions are provisioned by platform operators and invoiced manually outside Challenge Me. There is **no payment gateway** in V1; self-service payment is V1.5. No payment provider is chosen here.

# 1. Capability Overview

**Plain language.** Each organization is on a plan. The plan says what the organization may use (its entitlements) and how much AI marking, AI content generation, messaging, code running and storage it includes each period (its budget pools). Challenge Me reserves an estimate before each costly action and records the actual cost afterwards in a ledger. When a pool runs out, the product degrades gracefully: learners never lose work, marking falls back to teachers, and staff see clear messages. Platform staff set up subscriptions, change plans and invoice by hand from usage statements. When a trial ends or a subscription lapses, the organization becomes read-only and, if nothing changes, is eventually closed and purged.

Operations covers how Challenge Me is watched and kept healthy: metrics and alerts, failed-job handling, backups and restores (with the deletion ledger replayed), and tightly controlled platform-staff access.

**Four separate kinds of state (never mixed):**

| Kind | What it answers | Owner | Examples | Changes by |
|---|---|---|---|---|
| **Billing state** | Is the organization paying or trialling, and on what plan? | Tenancy & Billing | Subscription status, plan version, period dates, trial end | platform operator actions; timers (§4.2) |
| **Entitlement state** | What may the organization use at all? | Tenancy & Billing | `max_learners`, `ai_evaluation`, `code_evaluation`, `whatsapp`, pool limits | plan version, operator overrides |
| **Usage state** | How much has been used this period? | Tenancy & Billing | budget pools, shards, reservations, usage ledger | every costly operation |
| **Operational state** | What is switched on right now? | Tenancy (organization status, settings); platform (flags) | organization status (access), organization settings (e.g. W7-3 AI switches), platform feature flags and kill switches | billing events, Owner/Admin choices, platform operators |

**Effective availability** of any capability = entitlement allows it **and** the organization's setting allows it **and** no platform flag disables it **and** (for costly steps) the pool has room **and** organization status permits it. Entitlements are the only billing authority; a feature flag can only restrict, never grant (EXISTING, DM §18).

**Binding carried rules:** learner work is never refused or lost for billing reasons (Waves 5–7); SUSPENDED is read-only for staff, with marking of submitted work continuing (FD-2); TERMINATED means purge at +90 days (Wave 1, W10-C2); jobs may run more than once and providers are not exactly-once (J-6); AI and code budgets as specified in Waves 6–7.

# 2. Actors

| Actor | Role here | Source |
|---|---|---|
| Platform operator (Challenge Me staff) | Provision subscriptions and plans, set entitlement overrides, record payment status, suspend, reactivate, terminate, replay dead letters, run restores, request break-glass | EXISTING (DM §18, Wave 1) |
| Second platform operator | Approves break-glass (FD-4) and, by default, organization termination | LOCKED (Wave 1) + PROPOSED DEFAULT |
| Owner | Sees plan, entitlements, usage and budget warnings; updates billing contacts even when SUSPENDED; exports organization data | LOCKED (FD-2, W10-5) + EXISTING |
| Admin | Sees usage; manages organization settings within entitlements | EXISTING (W7-3, Wave 1) |
| Teacher, Learner, Guardian | Experience degradation messages only; never see billing | PROPOSED DEFAULT |
| System | Reservation sweeper, usage reconciliation, period rollover, trial and grace timers, alerting | EXISTING (DM §21) |
| Providers (AI, code, messaging, storage) | Report usage used for reconciliation | EXISTING |

# 3. Core Lifecycle

```
Provisioning
  operator: create Subscription(TRIAL, plan version, trial_ends_at) -> entitlements from plan
  -> organization status TRIAL -> pools for the period from plan included_usage

Costly operation (AI, message, code run, storage write by staff)
  Reserve(pool, estimate) -> EXHAUSTED? degrade per pool (§4.5)
  -> execute (provider call outside transactions) -> Settle(actual) -> ledger entry
     or Release (not executed) ; stale HELD -> ReservationSweep -> EXPIRED
  -> daily UsageReconciliation against provider usage (late charges recorded)

Period rollover (subscription anchor): new pools from plan + overrides; no carry-over

Billing transitions (§4.2)
  TRIAL -> ACTIVE (operator converts) | trial ends -> EXPIRED -> org SUSPENDED 30 days -> TERMINATED (W11-1)
  ACTIVE -> PAST_DUE (operator) -> operator suspends from worklist (W11-2) -> SUSPENDED -> ACTIVE | ...
  ACTIVE -> CANCELLED (at period end) -> org SUSPENDED 30 days -> TERMINATED (W11-1)
  -> TERMINATED -> purge at +90 days (W10-C2)

Operations: metrics/alerts -> on-call; DEAD_LETTER -> operator replay (audited);
  restore -> ledger replay (X11) -> reopen
```

# 4. Behavioral Rules

## 4.1 Plans and entitlements

| # | Rule | Label |
|---|---|---|
| PE-1 | Plans are platform reference data with immutable versions: entitlements, included usage per pool, informational price reference. | EXISTING (DM §18) |
| PE-2 | An organization's entitlements come from its plan version plus operator overrides with effective dates; the entitlement table is the only billing authority for what an organization can use. | EXISTING (DM §18) |
| PE-3 | V1 entitlement keys: `max_learners`, `ai_evaluation`, `ai_generation`, `code_evaluation`, `whatsapp`, and a monthly limit per pool (STUDENT_EVALUATION, TEACHER_GENERATION, MESSAGING, CODE_EXECUTION, STORAGE). | EXISTING (DM §18) + PROPOSED DEFAULT (`ai_generation` key split to match W7-3) |
| PE-4 | Organization settings (e.g. W7-3 AI switches) can only narrow entitlements; a setting cannot turn on something the plan does not include. | LOCKED (W7-3: "subject to plan entitlements") |
| PE-5 | Platform feature flags are operational: rollout and kill switches. They can only restrict and are never checked for billing authorization. | EXISTING (DM §18) |
| PE-6 | `ai_evaluation` not entitled → AI marking unavailable → teacher review (as W7-3 off). `ai_generation` not entitled → generation unavailable with a visible message. `whatsapp` not entitled → email and web only. | PROPOSED DEFAULT (follows W7-3 fallbacks) |
| PE-7 | `code_evaluation` not entitled → code questions cannot be published or assigned; code submissions already made are marked through teacher review; practice runs unavailable. | PROPOSED DEFAULT |
| PE-8 | Exceeding `max_learners`: soft limit up to 10% above the entitlement, shown to Owners and operators and reported as overage on the usage statement; beyond 110%, learners cannot be added or reactivated. Existing learners and their work are never affected. **Which learners count toward `max_learners` is not defined in any approved artifact: unresolved item W11-U1.** | LOCKED (W11-3) + UNRESOLVED (W11-U1) |
| PE-9 | A plan change takes effect at the operator-chosen effective date; a downgrade below current usage never deletes or deactivates anything; it only blocks further additions until usage is within the new entitlement. | PROPOSED DEFAULT |

## 4.2 Subscriptions, trials and organization status

| # | Rule | Label |
|---|---|---|
| SB-1 | Subscription states: TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED, EXPIRED; one current subscription per organization. | EXISTING (DM §18) |
| SB-2 | Billing state drives access state through the fixed §5.2 mapping; organization status is never set independently except by operator security suspension and termination. | LOCKED (W11-C1) |
| SB-3 | Subscriptions are provisioned and changed by platform operators only; every change is audited in the platform audit and visible in the organization's audit log. | EXISTING (DM §18) + PROPOSED DEFAULT (org visibility, as FD-4) |
| SB-4 | Trial: a TRIAL subscription has `trial_ends_at` (default 30 days) and a trial plan version with its own entitlements and pools; conversion to ACTIVE switches plan version from the chosen date. | PROPOSED DEFAULT |
| SB-5 | Owners see trial end and period dates 14 and 3 days ahead in the product. | PROPOSED DEFAULT |
| SB-6 | When paid access ends (trial not converted at `trial_ends_at`, cancellation effective at period end, or expiry), the organization becomes SUSPENDED (FD-2 read-only) for **30 days**, then TERMINATED automatically (purge at +90 days, W10-C2 with the W11-C2 FINANCIAL exception); Owners are warned before each step; conversion or reactivation during the 30 days restores access. | LOCKED (W11-1) |
| SB-7 | PAST_DUE never suspends automatically in V1: platform operators move PAST_DUE to SUSPENDED manually from a worklist that shows past-due age. | LOCKED (W11-2) |
| SB-8 | SUSPENDED behavior is FD-2: staff read-only (Owners and Admins can update billing contacts); open challenges read-only for learners; no new scheduling or deliveries; marking of submitted work continues. | LOCKED (FD-2) |
| SB-9 | TERMINATED: no access; only purge and deletion jobs; purge at +90 days; Owner organization export during the 90 days. | LOCKED (Wave 1, W10-C2, W10-5) |
| SB-10 | Termination requires a second platform operator's approval and recent authentication. | PROPOSED DEFAULT |
| SB-11 | Reactivation from SUSPENDED restores full access; nothing missed while suspended is replayed (missed occurrences follow Wave 4 S-5; no backfill). | EXISTING (Wave 4 S-5, CD-5) |

## 4.3 Budget pools and periods

| # | Rule | Label |
|---|---|---|
| BP-1 | Pools: STUDENT_EVALUATION, TEACHER_GENERATION, MESSAGING, CODE_EXECUTION, STORAGE; generalized so future compute pools are added as new pool keys without model change. | EXISTING (ADR-021) |
| BP-2 | Pool limit per period = plan included usage + active overrides; `overrun_pct` default 0%. Unused amounts do not carry over. | EXISTING + PROPOSED DEFAULT (0%, no carry-over) |
| BP-3 | Periods follow the subscription anchor date, computed in UTC. | PROPOSED DEFAULT |
| BP-4 | Operators may raise a pool mid-period (override, audited); it takes effect immediately, and held work may proceed (BR-4). | PROPOSED DEFAULT |
| BP-5 | While SUSPENDED, STUDENT_EVALUATION and CODE_EXECUTION stay usable for marking already-submitted work, including across a period boundary, at the last active limits; no other pool is used. | LOCKED (W11-C6, FD-2) |
| BP-6 | Budget warnings: in-product banners for Owners and Admins at 80% and 100% of each pool, plus one email per threshold per pool per period to Owners. Operational message only; not a learning alert or digest (D17, W9-4 unaffected). | LOCKED (W11-5) |

## 4.4 Reservations and the usage ledger

| # | Rule | Label |
|---|---|---|
| UL-1 | Reserve → execute → settle; release if not executed; one reservation per (organization, operation kind, operation ref). | EXISTING (DM §18) |
| UL-2 | Reservation reads are approximate (sum of shards); a small overshoot within the reservation window is accepted. | EXISTING (ADR-021) |
| UL-3 | ReservationSweep (every 5 minutes) expires HELD reservations past `expires_at` and frees their amount. | EXISTING (DM §21) |
| UL-4 | An operation that completes after its reservation expired still settles: the ledger records the actual usage; the reservation moves EXPIRED → SETTLED_LATE. Usage is never lost from the ledger. | LOCKED (W11-C3) |
| UL-5 | The ledger is append-only; each entry records pool, kind, quantity, cost, provider, provider reference, operation reference and whether it is reconciled. | EXISTING (DM §18) |
| UL-6 | Daily reconciliation compares ledger entries with provider usage reports; unmatched provider charges (for example a timed-out call that was billed, or a J-6 duplicate) are added as reconciliation entries; differences above threshold alert operators. | EXISTING (DM §21, Wave 7 ID-3) + LOCKED (J-6) |
| UL-7 | Usage is metered for costs Challenge Me incurs; learners and guardians are never shown usage. | PROPOSED DEFAULT |

## 4.5 Exhaustion behavior per pool

| # | Pool | Behavior when exhausted | Label |
|---|---|---|---|
| EX-1 | STUDENT_EVALUATION | AI steps held; Evaluation re-checks the pool every 5 minutes until the step deadline. A **new** AI operation may be requested for a held step **only if no provider operation has previously been started for that step**; if one was started, its outcome follows the existing idempotency and reconciliation rules (X6, J-6, UL-6) and no second operation is created. Past the deadline: NEEDS_REVIEW (BUDGET_HOLD_EXPIRED). Submissions never refused. | EXISTING (W6 PL-9) + LOCKED (W11-C4) |
| EX-2 | CODE_EXECUTION | Marking steps held then review; practice runs refused; suite validation fails visibly. Submissions never refused. | EXISTING (W5-1, W6, W7) |
| EX-3 | TEACHER_GENERATION | New generation requests fail visibly; drafts already created stay. | EXISTING (Wave 3 AI-10, W7-3) |
| EX-4 | MESSAGING | One-time codes and consent requests are always sent and recorded as overage; challenge messages and reminders wait until the pool has room and expire when their challenge closes (Wave 4 DL-6); guardian reports wait for the next period. Links already sent keep working; staff-issued links (W2-2) remain available where enabled. | LOCKED (W11-4, resolves W11-C5) |
| EX-5 | STORAGE | May block staff and other non-essential uploads (source documents, imports, media) with a visible message; must **never reject or lose authoritative learner work** (submissions, drafts, queued offline submissions) or system writes needed for correctness. | LOCKED (W11-C7) |
| EX-6 | Any | Exhaustion never deletes, hides or rejects learner work and never changes a result. | LOCKED (Waves 5–7) |

## 4.6 Invoicing support (manual)

| # | Rule | Label |
|---|---|---|
| IN-1 | For each organization and period, a usage statement is generated: pools, included amounts, used amounts, overrides, overage if any, learner count against `max_learners`. | PROPOSED DEFAULT |
| IN-2 | Platform operators produce invoices outside Challenge Me from the statement; Challenge Me records payment status only as the subscription's state change (ACTIVE / PAST_DUE). No card or bank data is stored. | EXISTING (DM §18 invoice_mode MANUAL) + PROPOSED DEFAULT |
| IN-3 | Owners can view and download their organization's usage statements. | PROPOSED DEFAULT |
| IN-4 | A minimal billing record set (subscription history, usage statements, usage ledger summaries; organization name and billing contact only; no learner data) is kept under a **FINANCIAL** retention class and survives organization purge as a narrow exception to W10-C2. The **duration** is governed by **LG-11** and is not set here. | LOCKED (W11-C2 mechanism) + LEGAL GATE LG-11 (duration) |

## 4.7 Operations: observability and alerting

| # | Rule | Label |
|---|---|---|
| OB-1 | Telemetry uses allow-listed attributes only (ids, enums, counts, durations); never learner content, names, tokens, prompts or payloads. | EXISTING (DM §27, §30) |
| OB-2 | Metrics and SLOs per DM §30 (evaluation latency, deadline exceedance < 1%, queue lag, dead letters, AI rates, code errors, delivery success, reservation expiries, resolver anomalies), plus billing: pool utilization, exhaustion events, reconciliation differences. | EXISTING (DM §30) + PROPOSED DEFAULT (billing metrics) |
| OB-3 | Any DEAD_LETTER at priority P0 or P1 pages on-call. | EXISTING (DM §21, §30) |
| OB-4 | Dead-letter replay is an audited operator action; replay re-runs the job under the normal idempotency rules. | EXISTING (Wave 1 J-states) |

## 4.8 Operations: backup, restore and platform access

| # | Rule | Label |
|---|---|---|
| OP-1 | Backups and point-in-time recovery follow ADR-023; recovery and service targets are **sign-off gate 11**. Backup retention 35 days (Wave 10 BK-3, subject to LG-10). | EXISTING + gate 11 |
| OP-2 | After any restore, the external deletion ledger is replayed before the system reopens; the restore is recorded as a platform audit event. | EXISTING (X11, Wave 1) |
| OP-3 | After a restore, work recorded after the restore point is lost; jobs that ran after it may run again, so an outside effect (a message, an AI call) can repeat (J-6). Affected organizations are told about the restore window. | LOCKED (J-6) + PROPOSED DEFAULT (notice) |
| OP-4 | Usage ledger entries lost by a restore are recovered by the next reconciliation against provider reports. | PROPOSED DEFAULT |
| OP-5 | Break-glass: read-only, second-person approval, at most 4 hours, recent authentication, every statement audited and visible in the organization's audit log. | LOCKED (Wave 1, FD-4) |
| OP-6 | Platform operators have no standing access to customer data; data repair only through reviewed per-organization scripts. | EXISTING (Wave 1) |
| OP-7 | Queue library choice is **sign-off gate 12**; it does not change any behavior in this document. | EXISTING |

# 5. State Models

## 5.1 Subscription (billing state)

| From | To | Actor | Guard | Audit |
|---|---|---|---|---|
| — | TRIAL | operator | plan version, trial end | yes |
| — | ACTIVE | operator | plan version, period | yes |
| TRIAL | ACTIVE | operator (conversion) | — | yes |
| TRIAL | EXPIRED | timer at `trial_ends_at` | not converted | yes |
| ACTIVE | PAST_DUE | operator (payment not received) | — | yes |
| PAST_DUE | ACTIVE | operator (payment received) | — | yes |
| PAST_DUE | SUSPENDED | operator, from the past-due worklist (W11-2) | — | yes |
| SUSPENDED | ACTIVE | operator | — | yes |
| ACTIVE / PAST_DUE | CANCELLED | operator (customer cancels) | effective at period end | yes |
| EXPIRED / CANCELLED | (organization TERMINATED) | timer 30 days after access ended (W11-1) | not converted or reactivated | yes |
| SUSPENDED | (organization TERMINATED) | operator | second operator (SB-10) | yes |

## 5.2 Organization status (access state) derived from billing

| Subscription | Organization status | Access |
|---|---|---|
| TRIAL | TRIAL | full |
| ACTIVE, PAST_DUE | ACTIVE | full (PAST_DUE visible to Owners) |
| SUSPENDED, EXPIRED, CANCELLED (after effective date) | SUSPENDED | FD-2 |
| — (terminated) | TERMINATED | none; purge at +90 days |

Operator security suspension (e.g. compromise) sets organization SUSPENDED regardless of subscription and is reversed only by an operator. (Correction W11-C1.)

## 5.3 Reservation (usage state)

HELD → SETTLED (actual cost); HELD → RELEASED (not executed); HELD → EXPIRED (sweeper); EXPIRED → SETTLED_LATE (operation completed after expiry, UL-4). SETTLED, RELEASED and SETTLED_LATE are terminal.

## 5.4 Budget pool period

OPEN (current) → CLOSED at period end (no carry-over); overrides may raise an OPEN pool; a CLOSED pool accepts late settlements and reconciliation entries only.

# 6. Permissions and Tenant Boundaries

| Action | Platform operator | Owner | Admin | Teacher | Learner / Guardian |
|---|---|---|---|---|---|
| Create or change subscription, plan, trial | ✓ (audited) | ✗ | ✗ | ✗ | ✗ |
| Entitlement and pool overrides | ✓ (audited) | ✗ | ✗ | ✗ | ✗ |
| Record PAST_DUE / payment received | ✓ | ✗ | ✗ | ✗ | ✗ |
| Suspend, reactivate | ✓ | ✗ | ✗ | ✗ | ✗ |
| Terminate | ✓ + second operator | ✗ | ✗ | ✗ | ✗ |
| View plan, entitlements, usage, statements | ✓ | ✓ | usage only | ✗ | ✗ |
| Update billing contacts (also when SUSPENDED) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Organization AI switches (within entitlements) | ✗ | ✓ | ✓ | ✗ | ✗ |
| Platform feature flags | ✓ | ✗ | ✗ | ✗ | ✗ |
| Dead-letter replay, restore | ✓ (audited) | ✗ | ✗ | ✗ | ✗ |
| Break-glass read | ✓ + second operator, ≤ 4 h | ✗ | ✗ | ✗ | ✗ |

Billing tables are tenant-owned with forced RLS; plans are reference data; platform operators act through the platform operations API, never through tenant sessions (EXISTING, ADR-012, X7).

# 7. Data Ownership

| Data | Owner | Kind of state | Retention |
|---|---|---|---|
| Plan, plan version | Tenancy & Billing (reference) | billing / entitlement | versioned |
| Subscription | Tenancy & Billing | billing | R1 (see W11-C2, LG-11) |
| Entitlement, overrides | Tenancy & Billing | entitlement | R1 |
| Budget pools, shards, reservations | Tenancy & Billing | usage | R1 |
| Usage ledger | Tenancy & Billing | usage | R6 (see W11-C2, LG-11) |
| Usage statements | Tenancy & Billing | usage | see W11-C2, LG-11 |
| Organization status, settings | Tenancy | operational | R1 |
| Feature flags | Platform | operational | versioned |
| Audit events | shared audit | — | R6 (LG-1) |

# 8. Cross-Module Contracts

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| All costly callers → Tenancy | A | `Reserve`, `Settle`, `Release` | budgets |
| All → Tenancy | A (read) | `GetEffectiveEntitlements`, organization settings, status | availability checks |
| Tenancy → all schedulers | B | `OrganizationSuspended / Reactivated / Terminated` | stop and resume work |
| Tenancy → Owners (in-product) | read model | plan, usage, warnings, statements | visibility |
| Tenancy → Communication | B | budget warning email to Owners (W11-5) | warnings |
| Providers → Tenancy | batch | usage reports | reconciliation |
| Tenancy → Privacy | B | `OrganizationTerminated` | purge scheduling |

No new module. New or changed items: subscription-to-organization mapping (W11-C1); SETTLED_LATE (W11-C3); budget hold re-check (W11-C4); suspension pool rule (W11-C6); storage exhaustion scope (W11-C7); `ai_generation` entitlement key; usage statement.

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Reservation never settled (worker crash) | Sweeper expires it; a later completion settles late (UL-4) |
| Provider bills a timed-out or duplicated call | Reconciliation adds the entry and alerts above threshold |
| Period rollover while operations are HELD | Held reservations settle into the period they were reserved in |
| Shard contention under burst | Sharded counters; approximate reads (UL-2) |
| Trial ends while learners are mid-challenge | Organization SUSPENDED: open challenges read-only; submitted work marked (FD-2) |
| Suspension during a regrade | Regrade continues (marking of stored submissions); new regrade approvals blocked (Wave 6) |
| Reconciliation provider report late | Retried next day; ledger marked unreconciled until matched |
| Restore | Ledger replay; audit restore event; possible repeated outside effects (OP-3) |
| Dead letter P0/P1 | Page; operator replay |

# 10. Privacy / Consent

- Billing data contains organization data and staff billing contacts (S2), never learner content or card data.
- Usage ledger and statements contain counts and costs only.
- Operational telemetry follows the allow-list (OB-1).
- Billing records after organization termination: W11-C2 and **LG-11**.
- Break-glass is visible to the organization (FD-4).

# 11. Audit / Observability

**Audited:** every subscription, plan, entitlement and pool change; PAST_DUE and payment-received records; suspension, reactivation, termination (with approver); feature flag changes (platform audit); organization AI switch changes; dead-letter replays; restores; break-glass statements.

**Metrics:** DM §30 set plus: pool utilization by pool and organization; exhaustion events and duration; held-step counts and BUDGET_HOLD_EXPIRED rate; reservation expiries and late settlements; reconciliation differences; organizations by billing and access state; trial conversions and expiries.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Pool exhausted during a class-wide essay assignment | AI steps held then teacher review; all submissions kept | EXISTING |
| Operator raises the pool during a hold | Held steps proceed if still before their deadline | PROPOSED DEFAULT (BP-4, W11-C4) |
| MESSAGING exhausted when a challenge opens | Challenge message waits for room; expires if the challenge closes first; link from learner home or staff-issued link still works | LOCKED (W11-4) |
| OTP needed while MESSAGING exhausted | Sent; recorded as overage | LOCKED (W11-4) |
| Organization 8% over `max_learners` | Additions allowed; overage shown and on the statement | LOCKED (W11-3) |
| Organization at 110% of `max_learners` | New learners and reactivations refused; existing learners unaffected | LOCKED (W11-3) |
| Held AI step whose provider call already started | No second operation; outcome via idempotency and reconciliation | LOCKED (W11-C4) |
| Storage exhausted while a learner submits code | Submission accepted and stored | LOCKED (W11-C7) |
| Plan downgraded below current learners | No learner deactivated; additions blocked until within limit | PROPOSED DEFAULT |
| `code_evaluation` removed with code assignments open | Submissions accepted; marked by teacher review; no new code assignments | PROPOSED DEFAULT |
| Trial ends on a weekend | Timer fires at `trial_ends_at` UTC; Owners warned 14 and 3 days before | PROPOSED DEFAULT |
| Payment received after suspension | Operator sets ACTIVE; full access; no backfill | EXISTING |
| Late provider charge after period close | Recorded in the closed period by reconciliation | PROPOSED DEFAULT |
| Feature flag disables AI marking platform-wide | Same fallback as W7-3 off: teacher review; entitlements unchanged | PROPOSED DEFAULT |
| Termination requested for a paying organization | Second operator approval required | PROPOSED DEFAULT |

# 13. Decisions (locked at closure)

No Wave 11 product decision remains open. One item is unresolved because no approved artifact defines it (W11-U1).

| ID | Locked decision | Applied in |
|---|---|---|
| W11-1 | Paid access ends → SUSPENDED (read-only) for 30 days → TERMINATED automatically → purge at +90 days. | SB-6, §5.1 |
| W11-2 | PAST_DUE is suspended manually by platform operators from a worklist; no automatic suspension in V1. | SB-7, §5.1 |
| W11-3 | Learner entitlement: soft up to 10% over (overage on the statement), then hard; existing learners unaffected. | PE-8 |
| W11-4 | Messaging exhaustion: one-time codes and consent requests always sent (overage); challenge messages and reminders deferred and expire with their challenge; reports wait for the next period. | EX-4 |
| W11-5 | Budget warnings: in-product banners at 80% and 100% for Owners and Admins; one email per threshold per pool per period to Owners. | BP-6 |

**Unresolved item W11-U1 — what counts toward `max_learners`.** The Domain Model names the entitlement key only; no wave, Part 1 or ADR says whether INACTIVE, MERGED, DELETED or unenrolled learners count, or whether the count is current or peak in the period. No rule is invented here. Minimum decision required: which learner states (ACTIVE only, or ACTIVE and INACTIVE) count, and whether the count is current or the period peak.

## Legal / compliance gates

### LG-11 — Financial records, invoicing and commercial terms (OPEN)

Per market: retention of billing records (subscriptions, usage statements, ledger) for accounting and tax, possibly longer than R6 and beyond organization purge; e-invoicing or tax-document obligations when invoicing manually; required notice before suspension or termination for non-payment; consumer or business-contract rules on trials and cancellation. **OPEN.** W11-C2 approves only the FINANCIAL retention mechanism; the retention duration and every other item here remain with counsel.

LG-1 to LG-10 carried forward and OPEN. Sign-off gates 11 (recovery and service targets) and 12 (queue library) remain open (engineering).

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| PE-1, PE-2, PE-5 | DM §18, ADR-021 | EXISTING |
| PE-3 | DM §18, W7-3 | EXISTING + PROPOSED |
| PE-4 | W7-3 | LOCKED |
| PE-6, PE-7, PE-9 | new | PROPOSED DEFAULT |
| PE-8 | W11-3 | LOCKED; W11-U1 unresolved |
| SB-1, SB-3 | DM §18 | EXISTING |
| SB-2, §5.2 | DM §6.1, §18, W11-C1 | LOCKED |
| SB-4, SB-5, SB-10 | new | PROPOSED DEFAULT |
| SB-6 | W11-1 | LOCKED |
| SB-7 | W11-2 | LOCKED |
| SB-8, SB-9, SB-11 | FD-2, Wave 1, W10-C2, W10-5, Wave 4 | LOCKED / EXISTING |
| BP-1 … BP-4 | ADR-021, DM §18 | EXISTING / PROPOSED |
| BP-5 | FD-2, W11-C6 | LOCKED |
| BP-6 | W11-5 | LOCKED |
| UL-1 … UL-3, UL-5, UL-6 | DM §18, §21, ADR-021, J-6, W7 ID-3 | EXISTING / LOCKED |
| UL-4 | DM §24 Usage Reservation, W11-C3 | LOCKED |
| UL-7 | new | PROPOSED DEFAULT |
| EX-1 | W6 PL-9, W11-C4 | EXISTING / LOCKED |
| EX-2, EX-3, EX-6 | W3, W5-1, W6, W7 | EXISTING / LOCKED |
| EX-4 | DM §18, J4, DL-6, W11-4, W11-C5 | LOCKED |
| EX-5 | DM §18, W11-C7 | LOCKED |
| IN-1 … IN-3 | DM §18 | PROPOSED DEFAULT |
| IN-4 | W10-C2, W11-C2 | LOCKED (mechanism); LG-11 (duration) |
| OB-1 … OB-4 | DM §21, §27, §30, Wave 1 | EXISTING |
| OP-1 … OP-7 | ADR-023, X11, FD-4, Wave 1, J-6, gates 11, 12 | EXISTING / LOCKED / PROPOSED |

# 15. Behavioral Acceptance Criteria

**State separation**
1. No code path authorizes a capability from a feature flag; entitlements are the only billing authority.
2. An organization setting cannot enable a capability its entitlements exclude.
3. Organization status always equals the §5.2 mapping of its subscription, except an operator security suspension or termination.
4. A platform feature flag that disables AI marking produces teacher review, like W7-3 off, and leaves entitlements unchanged.

**Subscriptions and trials**
5. Only platform operators change subscriptions, plans and entitlements; each change is audited and visible in the organization's audit log.
6. At `trial_ends_at` without conversion, the subscription becomes EXPIRED and the organization SUSPENDED.
7. A SUSPENDED organization's staff can read but not change anything except billing contacts; open challenges are read-only; submitted work is still marked.
8. Reactivation restores full access and creates no backfilled occurrences.
9. Termination requires a second operator; purge follows at +90 days.

**Budgets and usage**
10. Every costly operation reserves before executing and settles or releases after.
11. A reservation not settled by `expires_at` is expired by the sweeper; a later completion is still recorded in the ledger (SETTLED_LATE).
12. Daily reconciliation records provider charges without a matching ledger entry and alerts above threshold.
13. Unused pool amounts do not carry into the next period.
14. Raising a pool mid-period lets held steps proceed if their deadline has not passed.
15. While SUSPENDED, marking of submitted work continues across a period boundary.

**Exhaustion and learner work**
16. No submission, draft or learner-generated write is ever refused because of any pool or entitlement.
17. STUDENT_EVALUATION exhaustion produces NEEDS_REVIEW (BUDGET_HOLD_EXPIRED) at the step deadline, never a lost answer.
18. CODE_EXECUTION exhaustion refuses practice runs and holds marking; submissions are accepted.
19. TEACHER_GENERATION exhaustion shows a visible error; drafts remain.
20. STORAGE exhaustion refuses only staff uploads.
21. Exhaustion never changes an existing result.

**Invoicing**
22. A usage statement exists for every organization and closed period and matches the ledger.
23. No card or bank data is stored anywhere in Challenge Me.
24. Owners can view and download their statements; learners and guardians never see billing or usage.

**Operations**
25. Telemetry contains no learner content, names, tokens, prompts or payloads.
26. Any P0 or P1 dead letter pages on-call; replay is audited.
27. After a restore, the deletion ledger is replayed before reopening and the restore is audited.
28. Break-glass is read-only, second-person approved, at most 4 hours and visible in the organization's audit log.

**Wave 11 decisions**
29. Thirty days after a trial expires unconverted or a cancellation takes effect, the organization becomes TERMINATED automatically unless it was converted or reactivated (W11-1).
30. No organization is suspended automatically for being PAST_DUE; the operator worklist shows past-due age (W11-2).
31. Additions are allowed up to 110% of `max_learners` and appear as overage on the statement; beyond that, adding or reactivating a learner is refused; no existing learner is affected (W11-3).
32. With MESSAGING exhausted, one-time codes and consent requests are sent and recorded as overage; challenge messages and reminders wait and expire at challenge close; reports wait for the next period (W11-4).
33. Owners see banners and receive one email at 80% and at 100% of each pool per period; no learning alert is generated (W11-5).
34. Organization status always matches the subscription mapping, except operator security suspension and termination (W11-C1).
35. After organization purge, only the FINANCIAL record set remains, containing no learner data; its duration is configurable per LG-11 and has no approved default (W11-C2).
36. A reservation expired by the sweeper whose operation later completes is SETTLED_LATE and its usage is in the ledger (W11-C3).
37. A held AI step creates a new AI operation only when no provider operation was started for it; otherwise no second operation is created (W11-C4).
38. A suspension spanning a period boundary does not stop marking of submitted work (W11-C6).
39. Storage exhaustion never rejects or loses a submission, draft or queued offline submission (W11-C7).

---

# Wave 11 Closure

**Status: APPROVED and CLOSED — final capability specification wave.** Waves 1–10 decisions are unchanged except the narrow, explicitly approved W11-C2 exception to W10-C2 (FINANCIAL record set survives organization purge).

## Binding rules

1. Entitlements are the only billing authority; organization settings and feature flags can only restrict.
2. Billing, entitlement, usage and operational state are separate; organization access status is derived from billing state (W11-C1).
3. No budget, entitlement or storage condition ever rejects or loses authoritative learner work.
4. Every costly operation is reserved and settled; the ledger always records actual usage, including late settlement.
5. No payment gateway and no stored card or bank data in V1.

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W11-1 | Paid access ends → SUSPENDED 30 days → TERMINATED automatically → purge at +90 days. |
| W11-2 | PAST_DUE suspended manually by operators from a worklist. |
| W11-3 | `max_learners` soft up to 10% over (overage on statement), then hard; existing learners unaffected. |
| W11-4 | MESSAGING exhaustion: codes and consent requests always sent (overage); challenge messages and reminders deferred and expire at close; reports wait for next period. |
| W11-5 | Banners at 80% / 100% for Owners and Admins; one email per threshold per pool per period to Owners. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W11-C1 | Subscription = billing state; organization status = access state by the §5.2 mapping; only operator security suspension and termination set it directly. |
| W11-C2 | FINANCIAL retention mechanism approved: minimal billing record set, no learner data, survives organization purge as a narrow exception to W10-C2. **Duration governed by LG-11**; no default approved. |
| W11-C3 | EXPIRED → SETTLED_LATE; the ledger always records actual usage. |
| W11-C4 | Held step re-checks every 5 minutes; a new AI operation only if no provider operation was previously started for that step; otherwise existing idempotency and reconciliation rules apply. |
| W11-C5 | Resolved by W11-4. |
| W11-C6 | Marking pools keep last active limits while SUSPENDED, for already-submitted work only. |
| W11-C7 | Storage exhaustion may block staff and non-essential uploads; never rejects or loses authoritative learner work. |

## 3. Unresolved

**W11-U1 — what counts toward `max_learners`.** Not defined in any approved artifact. Minimum decision: which learner states count (ACTIVE only, or ACTIVE and INACTIVE) and whether the measure is the current count or the period peak.

## 4. Legal / compliance gates (all OPEN)

LG-1 to LG-10 carried forward; **LG-11** (financial record retention duration, e-invoicing and tax, notice before suspension or termination, trial and cancellation terms) OPEN. Sign-off gates 11 and 12 open.

## 5. Remaining proposed defaults

As listed in the end-of-wave summary of revision 1: `ai_generation` key; entitlement fallbacks; downgrade never deactivates; subscription changes visible in the organization audit log; 30-day trial plan; 14- and 3-day warnings; second-operator termination approval; `overrun_pct` 0%, no carry-over; UTC periods; immediate overrides; usage hidden from learners and guardians; usage statements and Owner download; no card or bank data; billing metrics; restore notice; ledger recovery by reconciliation; late charges recorded in the closed period; 5-minute hold re-check interval.

## 6. Reconciliation items

The Wave 11 reconciliation items (revision 1, §5 of the summary, with W11-C2 limited to the mechanism) are applied in the cross-wave reconciliation.

**STOP — Wave 11 closed. No further capability wave.**
