# Challenge Me — V1 Spec Kit — Part 2, Wave 1: Foundations

> Capability: tenant context and isolation, staff sign-in and organization selection, roles and scope, audit, background jobs and retries (SPEC-096, 001, 003, 097, 094, 095).
>
> Status: APPROVED and CLOSED (FD-1 to FD-5 locked; LG-1 and LG-2 remain legal gates; proposed defaults accepted for V1). Revision 2: job idempotency wording corrected (J-6, §9, AC 24–24b). Specification only; no implementation.
>
> Sources: Implementation Architecture V1.3 (Arch), ADR set V1.3 (ADR-nnn), Domain Model rev. 1.4 (DM §n, X-corrections), Spec Kit Part 1 (J-stages), Learning Trajectory Model rev. 13 (LTM), approved decisions C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17.

# How to read this section

Every rule carries one label:

| Label | Meaning |
|---|---|
| LOCKED DECISION | Approved by the product owner in an earlier step. |
| EXISTING ARCHITECTURAL RULE | Already fixed by the Architecture, an ADR or the Domain Model. Restated here as behavior, not reopened. |
| PROPOSED DEFAULT | Recommended behavior. Engineering can build it; the product owner can change it without a model change. Not approved until confirmed. |
| OPEN PRODUCT DECISION | Needs the product owner. Options and a recommendation are given in §13. |
| LEGAL / COMPLIANCE GATE | Needs legal confirmation, usually per market. |
| IMPLEMENTATION DETAIL | Engineering choice with no visible product effect. |

This wave is mostly EXISTING ARCHITECTURAL RULES, because ADR-001, ADR-002, ADR-012, ADR-024 and DM §5–6 already fixed the mechanisms. What this section adds is the behavior people experience, the failure behavior, and the few genuinely open questions.

# 1. Capability Overview

**Plain language.** Foundations is everything that makes Challenge Me safe to share between many organizations:

- **Tenant isolation.** Every piece of data belongs to exactly one organization. One organization can never see another's data, even if a request is tampered with or a background task goes wrong.
- **Staff sign-in and organization selection.** Staff sign in with an external identity provider. Challenge Me, not the provider, decides which organizations they belong to and what they may do there. A person working for two tutoring centers chooses which one they are working in.
- **Roles and scope.** A staff member's power is a role (Owner, Admin, Teacher, Safeguarding lead) in a scope (the whole organization, one course, or one cohort).
- **Audit.** Consequential actions are recorded permanently: who did what, to what, when and why.
- **Background jobs.** Work that happens later (AI marking, sending messages, recalculating progress) runs reliably, retries safely, never mixes organizations, and never loses student work.

**Boundaries.** Learner and guardian access (capability links, sessions, OTP), invitations, roster and consent belong to Wave 2. Billing states and entitlements belong to Wave 11. This section only defines how those depend on Foundations.

# 2. Actors

| Actor | Authority | Source |
|---|---|---|
| Staff member (Owner, Admin, Teacher, Safeguarding lead) | Acts inside exactly one active organization per request, limited by role × scope | ADR-002, DM §5.3–5.4 |
| Learner / Guardian | Acts only inside a capability-session scope (Wave 2). Never holds a staff role | ADR-016, DM §5.3 |
| System actor | Scheduler, webhook handler, worker, projection, regrade, identity, purge. Always bound to one organization and a declared purpose | ADR-012, DM §5.3 |
| Platform operator (Challenge Me staff) | No standing access to customer data. Read-only break-glass access with second-person approval and time limit; data repair only through reviewed per-tenant scripts | ADR-012, ADR-024, DM §5.2 |
| External identity provider (IdP) | Authenticates staff and reports verified identity, email, authentication time and MFA. Has no say in organizations or roles | ADR-002 |

# 3. Core Lifecycle

## 3.1 Staff sign-in and organization selection

1. The staff member opens Challenge Me and is sent to the IdP to sign in.
2. The IdP returns a verified identity. Challenge Me finds or creates the matching **User** (by provider + subject), and requires a verified email.
3. Challenge Me lists the person's **active memberships** through the audited login resolver (DM X1), skipping organizations that are TERMINATED.
4. The person lands on the organization picker; with exactly one membership they go straight in. With none, they see "You don't have access to any organization yet" (plus invitation acceptance, Wave 2).
5. They choose an organization. From now on **every request names that organization**. The server rebuilds the ActorContext for every request from Challenge Me's own data: membership active, organization status allows access, roles and scopes. Nothing the browser says about roles is trusted.
6. Switching organization is just choosing another one. Each browser tab keeps the organization it named, so two tabs for two organizations never mix.

## 3.2 Every authorized action

```
Request -> verify staff session (IdP token) -> ActorContext (one organization, roles x scopes, auth_time, MFA)
        -> owning module supplies the resource's scope (organization, course, cohort)
        -> authorize(actor, permission, resource scope)       deny -> FORBIDDEN / NOT_FOUND
        -> TenantTransaction (transaction-local tenant, actor, correlation id)
        -> domain change + audit event + follow-up jobs, all committed together
```

## 3.3 Background work

```
Domain transaction enqueues job {payload_version, tenant_id, ids, correlation_id, idempotency_key}
  -> worker claims job (lease) -> opens a TenantTransaction for that tenant
  -> loads its entity (invisible if wrong tenant -> POISON + security alert)
  -> any provider call happens OUTSIDE a transaction
  -> result written in a new transaction with a unique result key -> job complete
  failures: retry by class -> dead letter after caps -> operator replay (audited)
```

# 4. Behavioral Rules

## 4.1 Tenant isolation (SPEC-096)

| # | Rule | Label |
|---|---|---|
| T-1 | Every tenant-owned record carries its organization id, and every read or write happens inside a TenantTransaction for exactly one organization. | EXISTING ARCHITECTURAL RULE (ADR-012) |
| T-2 | The organization comes from the authenticated actor or the job, never from request bodies, URL parameters the actor cannot hold, or webhook payload fields. | EXISTING (ADR-012, DM §6) |
| T-3 | If tenant context is missing, the database returns nothing ("fail closed"). | EXISTING (ADR-012, DM §6.2) |
| T-4 | Row-level security is defense in depth. Application authorization runs first and must deny on its own. | EXISTING (ADR-012) |
| T-5 | A request for another organization's record behaves exactly like a request for a record that does not exist: `NOT_FOUND`, never `FORBIDDEN`, so identifiers cannot be probed. | EXISTING (DM §28) |
| T-6 | Pre-tenant lookups (staff login, capability token, webhook routing) use only the closed set of audited resolver functions, which return identifiers only. | EXISTING (DM X1, §6.4) |
| T-7 | Object storage keys start with the organization id; download links are issued only after authorization and live at most 5 minutes (uploads 15). | EXISTING (ADR-012, DM §6) |
| T-8 | Caches are keyed by organization and version; only immutable data (e.g. published question versions) is cached in-process. | EXISTING (ADR-012) |
| T-9 | Provider calls never combine organizations (no cross-tenant AI batching); each provider request is attributable to one organization. | EXISTING (ADR-012, ADR-017) |
| T-10 | Platform-owned data (model registry, shared channel accounts, suppression list, elevated-access grants) lives in platform tables with no tenant data; platform AI operations run under the reserved platform organization. | EXISTING (DM X7, §6.3) |
| T-11 | Cross-tenant platform analytics use only de-identified aggregates (k ≥ 10). | EXISTING (ADR-005) |

## 4.2 Staff sign-in and organization selection (SPEC-001)

| # | Rule | Label |
|---|---|---|
| S-1 | Staff authenticate only through the IdP. Challenge Me stores no staff passwords. | EXISTING (ADR-002) |
| S-2 | A staff identity is matched by (IdP provider, IdP subject). An email address alone never links accounts. | EXISTING (DM §5.2) |
| S-3 | Sign-in requires an IdP-verified email. Unverified email → sign-in refused with a clear message. | PROPOSED DEFAULT |
| S-4 | The primary email shown in Challenge Me is refreshed from the IdP at each sign-in when verified. If the new email already belongs to another User, sign-in continues with the old email and the conflict is flagged for support. | PROPOSED DEFAULT |
| S-5 | Exactly one active organization per request; the organization is re-verified on every request against an ACTIVE membership. | EXISTING (ADR-002) |
| S-6 | Organization selection is remembered per browser for convenience only; it is never an authorization input. | IMPLEMENTATION DETAIL |
| S-7 | Owner and Admin roles require MFA. If the IdP token does not show MFA, the person can still enter organizations where they are only a Teacher or Safeguarding lead, but entering an organization where they hold Owner or Admin requires re-authentication with MFA. | EXISTING (ADR-002); UX PROPOSED DEFAULT |
| S-8 | Sensitive actions (elevated access, regrade approval, learner merge, data export, deletion approval, role changes involving Owner) require authentication within the last 15 minutes; otherwise the request fails with `REAUTH_REQUIRED` and the IdP re-authenticates. | EXISTING (ADR-002); 15-minute window PROPOSED DEFAULT |
| S-9 | Staff sessions: maximum 12 hours, idle timeout 60 minutes, whichever comes first; the IdP may impose stricter limits. | PROPOSED DEFAULT (owner: security lead) |
| S-10 | Membership or role changes take effect on the next request. Open pages that act after a revocation get `FORBIDDEN` / `NOT_FOUND`. | EXISTING (ADR-002) |
| S-11 | A User with memberships in several organizations sees each organization's data only while that organization is active. V1 has no cross-organization view for staff. | PROPOSED DEFAULT |

## 4.3 Roles and scope (SPEC-003)

| # | Rule | Label |
|---|---|---|
| R-1 | Roles: OWNER, ADMIN, TEACHER, SAFEGUARDING_LEAD. Scopes: ORGANIZATION, COURSE, COHORT. A membership may hold several role assignments; effective permission is the union. | EXISTING (DM §5.2) |
| R-2 | A COURSE scope covers every cohort of that course, including cohorts created later. | EXISTING (DM §5.4) |
| R-3 | Scope validity is checked with Roster: the course or cohort must exist in the same organization. | EXISTING (DM §5.B contracts) |
| R-4 | OWNER and ADMIN are organization-scoped only. SAFEGUARDING_LEAD is organization-scoped only. TEACHER may be organization-, course- or cohort-scoped. | PROPOSED DEFAULT |
| R-5 | No one can grant a role above their own: ADMIN cannot grant or revoke OWNER; TEACHER cannot manage roles. | PROPOSED DEFAULT |
| R-6 | The last active OWNER cannot be revoked, suspended or demoted; another OWNER must exist first. | EXISTING (DM §5.1) |
| R-7 | The permission matrix in DM §5.4 is the V1 baseline, with two changes: a teacher may approve their own content only when the organization has direct publishing enabled; a teacher may never approve their own regrade. | **LOCKED DECISION FD-1** |
| R-8 | Archiving a course or cohort keeps role assignments; staff keep read access to its history; write actions follow the owning module's rules for archived scopes. | PROPOSED DEFAULT |
| R-9 | Every data access by staff is checked against the resource's scope, including learning data: TopicState, TopicTrajectory and learning signals are visible to staff only for learners in cohorts inside their scope. | EXISTING (DM §5.4); consistent with LTM §17 |
| R-10 | Learner- and guardian-facing projections are separate filtered views (D11, D12). A staff role never makes those views show more, and a learner or guardian actor can never reach staff views. | LOCKED DECISION (D11, D12) |

## 4.4 Membership lifecycle effects

| Change | Effect | Label |
|---|---|---|
| Membership SUSPENDED | No access to that organization; roles kept for reactivation; open review-task assignments released (`MembershipRevoked` handling applies). | EXISTING (DM §5.1, §13) + PROPOSED DEFAULT (release on suspend) |
| Membership REVOKED | Final. Role assignments revoked. Review assignments released. Authored content, decisions and audit records remain the organization's and keep the staff member's id. | EXISTING (DM §5, §8.1 content ownership) |
| User has no remaining memberships | Can still sign in and sees "no organization". | PROPOSED DEFAULT |
| Staff personal-data deletion request | User anonymized (name → "Former staff member", email replaced by a non-reversible marker). Audit and domain records keep the User id. | **LEGAL / COMPLIANCE GATE LG-2**; behavior PROPOSED DEFAULT |

## 4.5 Organization status effects on access

| Organization status | Staff | Learners / guardians (Wave 2) | Background work |
|---|---|---|---|
| TRIAL, ACTIVE | full, per role | per capability rules | all |
| SUSPENDED | read-only; Owners and Admins may still update billing contacts (**LOCKED FD-2**) | existing open challenges read-only (DM §6.1, PROPOSED DEFAULT) | scheduling and new deliveries stop (EXISTING DM §6.1); marking of already-submitted work continues so student work is not stranded (**LOCKED FD-2**) |
| TERMINATED | no access | no access | only purge and deletion jobs; data purged after 90 days (EXISTING DM §4 R1, legal gate LG-1 for audit) |

Trial and subscription transitions themselves belong to Wave 11 (Billing).

## 4.6 Audit (SPEC-097)

| # | Rule | Label |
|---|---|---|
| A-1 | Consequential actions write an audit event **in the same transaction** as the action. If the audit write fails, the action fails. | EXISTING (DM §30) made explicit; PROPOSED DEFAULT for same-transaction rule |
| A-2 | Audit events are append-only. The application can insert; nothing can update or delete them except the retention purge. | EXISTING (ADR-024, DM §30) |
| A-3 | Each event records: organization; time (server); actor kind and id; elevated-access grant id if applicable; action; target type and id; reason code and optional note reference; resulting decision or before/after values (identifiers, states and numbers only); correlation id; idempotency key where relevant; hashed network origin. | PROPOSED DEFAULT (field list) |
| A-4 | Audit events never contain learner answers, AI prompts or outputs, answer keys, tokens or contact values. Free-text reasons are stored by reference in the classified payload store. | EXISTING (ADR-006) |
| A-5 | Audit is separate from telemetry and from domain history (for example, consent history and trajectory transitions stay in their own modules; the audit event references them). | EXISTING (ADR-024) |
| A-6 | Actor names are resolved when the log is viewed, not copied into events, so an anonymized staff member shows as "Former staff member". | PROPOSED DEFAULT |
| A-7 | Retention: 24 months (R6). | EXISTING (DM §4) as PROPOSED DEFAULT period; **LEGAL / COMPLIANCE GATE LG-1** for termination interaction |
| A-8 | Owner and Admin can view the organization audit log; only Owner can export it; export is audited and requires recent authentication. | **LOCKED DECISION FD-3** |
| A-9 | Platform break-glass access to an organization's data is visible in that organization's audit log, with the reason category and ticket reference. The platform audit remains the authoritative platform-level record. | **LOCKED DECISION FD-4** |

**Audited actions (V1 minimum).** From DM §30, plus the Foundations actions: membership invitation, acceptance, suspension, reactivation, revocation; role grant and revocation; organization status changes; organization settings changes; entering an organization with elevated access; every break-glass statement; resolver calls (in the separate hashed resolver audit, DM X1); job dead-letter replays; policy version publications (including learning rules, C7-B); topic scope changes (C7-B); plus the domain actions already listed in DM §30 (overrides, confirmations, disputes, regrades, approvals, consent, deletion, merges, imports, channel accounts, secret rotations).

## 4.7 Background jobs (SPEC-094, SPEC-095)

| # | Rule | Label |
|---|---|---|
| J-1 | Jobs are created inside the transaction that caused them; if the change rolls back, the job never exists. | EXISTING (ADR-001, ADR-013) |
| J-2 | Job payloads contain only: payload version, organization id, entity ids, correlation id, idempotency key and small metadata. Never learner content. | EXISTING (ADR-001) |
| J-3 | A worker runs each job for exactly the organization in its payload and re-checks that the entity belongs to it. Mismatch → POISON, dead letter immediately, security alert. | EXISTING (ADR-012, DM §6.5) |
| J-4 | No database transaction stays open during a provider call. | EXISTING (ADR-001) |
| J-5 | Failure classes: INFRASTRUCTURE (retry with backoff, up to 8), RATE_LIMITED (honor retry-after, up to 20), DOMAIN (recorded as a result, never retried), POISON (dead letter immediately). | EXISTING (ADR-001, DM §21) |
| J-6 | Leases: 5 minutes with heartbeat for long jobs; an expired lease returns the job to the queue. **Worker retry after lease expiry may execute the handler more than once.** (a) *Challenge Me domain effects:* the handler must be idempotent (unique result keys, compare-and-set, state guards), so duplicate execution produces at most one effective domain result. (b) *External provider side effects:* calls use the provider's idempotency key where the provider supports one; where it does not, Challenge Me relies on the provider's reconciliation or de-duplication mechanism where available (for example provider message ids and delivery webhooks, or daily AI usage reconciliation, ADR-017). (c) The system does **not** claim universal exactly-once external delivery: a rare duplicate external side effect (for example a second message, or a second billed AI call) is possible when a provider call succeeds and the worker stops before recording the result. | EXISTING (ADR-001, ADR-017) + corrected wording (Wave 1 rev. 2) |
| J-7 | **Stale jobs.** A handler whose entity has moved on (for example, an auto-confirm for an evaluation head revision that is no longer current, or a reinforcement item already cancelled) completes as a no-op and records "stale" in job metadata. Stale is never an error and never retried. | EXISTING in specific specs (DM §21, §26); generalized here as PROPOSED DEFAULT |
| J-8 | Weighted priority P0–P4 with minimum shares (50/25/15/7/3) and admission control per organization × work class and per provider account, so one large organization cannot starve others. | EXISTING (ADR-001) |
| J-9 | Dead letters are visible only to platform operators. Customers see the domain consequence through the owning module (for example "delivery failed", "your teacher will review this"), never a job error. | PROPOSED DEFAULT |
| J-10 | Replaying a dead letter is a platform-operator action: it re-validates organization and payload version, and is audited. | EXISTING (ADR-001) + audit PROPOSED DEFAULT |
| J-11 | Alerting: any P0 or P1 dead letter pages the on-call engineer. | EXISTING (DM §30); see contradiction F-2 |
| J-12 | Handlers accept payload versions N and N−1; deploy consumers before producers. | EXISTING (ADR-023) |
| J-13 | Idempotency keys for commands are kept at least 24 hours; a repeat within that window returns the original result. | PROPOSED DEFAULT |
| J-14 | Job execution under organization status: see §4.5. | PROPOSED DEFAULT / FD-2 |

# 5. State Model

## 5.1 User (global identity)

| From | To | Actor | Notes | Audit |
|---|---|---|---|---|
| — | ACTIVE | first sign-in (SystemActor IDENTITY) | from verified IdP identity | yes |
| ACTIVE | SUSPENDED | platform operator | platform-wide block (e.g. compromise) | yes (platform) |
| SUSPENDED | ACTIVE | platform operator | — | yes (platform) |
| ACTIVE / SUSPENDED | DELETED | personal-data deletion (LG-2) | anonymized; id kept | yes |
| DELETED | any | — | terminal | — |

## 5.2 Membership

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | INVITED | OWNER/ADMIN (Wave 2 invitation) | — | invitation sent | yes |
| INVITED | ACTIVE | invitee acceptance | IdP-verified email matches | — | yes |
| INVITED | REVOKED | OWNER/ADMIN or invitation expiry | — | — | yes |
| ACTIVE | SUSPENDED | OWNER/ADMIN | not the last active OWNER | review assignments released | yes |
| SUSPENDED | ACTIVE | OWNER/ADMIN | — | roles effective again | yes |
| ACTIVE / SUSPENDED | REVOKED | OWNER/ADMIN; self (leave) | not the last active OWNER | roles revoked; `MembershipRevoked` | yes |
| REVOKED | any | — | terminal; re-joining needs a new invitation and a new membership | — | — |

## 5.3 Role assignment

Active (revoked_at empty) → Revoked (revoked_at set). A change of role or scope is a revoke plus a new grant, both in one transaction, one audit event with before and after. Invalid: granting a role or scope the grantor may not grant (R-5), removing the last OWNER (R-6), scope outside the organization (R-3).

## 5.4 Organization (access effects only)

TRIAL → ACTIVE → SUSPENDED ↔ ACTIVE; any → TERMINATED (terminal). Transitions are owned by Tenancy & Billing (Wave 11); Foundations defines their access effects (§4.5).

## 5.5 Elevated access grant (platform)

| From | To | Actor | Guard | Audit |
|---|---|---|---|---|
| — | REQUESTED | platform operator | reason, ticket, organizations, duration ≤ 4 h | yes |
| REQUESTED | APPROVED | a different platform operator | approver ≠ requester; recent auth | yes |
| REQUESTED | REVOKED (reason REJECTED) | approver | — | yes |
| APPROVED | ACTIVE | requester starts the session | before expiry | yes |
| APPROVED / ACTIVE | EXPIRED | time | — | yes |
| APPROVED / ACTIVE | REVOKED | requester, approver or security | — | yes |

Reusing REVOKED with reason REJECTED avoids a new state (see F-5).

## 5.6 Background job (behavioral)

| State | Meaning |
|---|---|
| QUEUED | waiting; may have a not-before time (delayed retry or scheduled work) |
| RUNNING | claimed under a lease |
| COMPLETED | handler finished (including DOMAIN outcomes and stale no-ops) |
| DEAD_LETTER | caps reached or POISON; needs an operator |
| CANCELLED | cancelled by its owner before running (e.g. consent withdrawn) |

Transitions: QUEUED → RUNNING → COMPLETED; RUNNING → QUEUED (retryable failure or lease expiry); RUNNING/QUEUED → DEAD_LETTER; QUEUED → CANCELLED; DEAD_LETTER → QUEUED (operator replay, audited). Exact representation depends on the queue library selected by benchmark (sign-off gate 12): IMPLEMENTATION DETAIL.

# 6. Permissions and Tenant Boundaries

| Action | Who | Scope | Extra requirement |
|---|---|---|---|
| Enter an organization | any ACTIVE membership | organization | MFA if holding OWNER/ADMIN there (S-7) |
| View members and roles | OWNER, ADMIN; TEACHER sees colleagues in shared scopes (PROPOSED DEFAULT) | organization | — |
| Grant / revoke TEACHER | OWNER, ADMIN | organization | — |
| Grant / revoke ADMIN, SAFEGUARDING_LEAD | OWNER, ADMIN (ADMIN cannot revoke OWNER) | organization | recent auth |
| Grant / revoke OWNER | OWNER | organization | recent auth; last-owner rule |
| Suspend / revoke membership | OWNER, ADMIN (not an OWNER unless OWNER) | organization | last-owner rule |
| Leave organization | self | organization | last-owner rule |
| Change organization settings | OWNER, ADMIN | organization | audited |
| View audit log | OWNER, ADMIN (FD-3) | organization | — |
| Export audit log | OWNER (FD-3) | organization | recent auth; audited |
| Break-glass read | platform operators | selected organizations, ≤ 4 h | second-person approval, recent auth |
| Replay dead letter | platform operators | per job | audited |

All learning, content, challenge, evaluation and reporting permissions follow the DM §5.4 matrix (FD-1) and are always evaluated against the resource's own organization, course and cohort.

# 7. Data Ownership

| Data | Owner module | Decision owner | Source of truth | Versioned? | Tenant-scoped? | Deletion | Rebuild |
|---|---|---|---|---|---|---|---|
| User, external identity | Identity & Access | IdP (authentication); Challenge Me (account state) | Identity tables | no | global identity (row-visibility policy) | anonymize (LG-2) | not derived |
| Membership, role assignment | Identity & Access | OWNER / ADMIN | Identity tables | history via audit | yes | kept with organization; purged at organization purge | not derived |
| Organization, settings, status | Tenancy & Billing | OWNER/ADMIN (settings); billing/platform (status) | Tenancy tables | settings changes audited | yes (tenant = organization) | organization purge (R1) | not derived |
| ActorContext | Identity & Access | — | computed per request | — | — | never stored | recomputed per request |
| Audit event | shared `audit` schema, written by each owning module | the acting module | audit tables | append-only | yes (platform events under the platform organization, F-1) | retention purge (R6, LG-1) | not derived |
| Resolver audit | Identity & Access | — | operational table (hashed) | append-only | operational | R6 | not derived |
| Elevated access grant | Identity & Access (platform) | platform operators | platform table | state history | platform | R6 | not derived |
| Jobs | queue (owned by each producing module) | producing module | queue tables | payload_version | carries tenant id; queue tables are operational | completed jobs pruned after 14 days (PROPOSED DEFAULT); dead letters kept until resolved | re-enqueued by owning module's repair tools |

# 8. Cross-Module Contracts

All exist in DM §19–20 unless marked new. Mechanism A = synchronous public call; B = event enqueued in the producer's transaction.

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| any module → Identity | A | `GetActorContext`, `authorize(actor, permission, resourceScope)` | every authorized action |
| Identity → Roster | A | `GetCohortCourse`, scope existence checks | course/cohort scope resolution |
| Identity → Review | B | `MembershipRevoked` | release review assignments (also used on suspension, PROPOSED DEFAULT) |
| Identity → Reporting | B | `MembershipRevoked` | teacher lists and dashboards |
| any module → audit | in-transaction write | `RecordAuditEvent(...)` shared library, not a module call | same-transaction audit (A-1) |
| Tenancy → all schedulers | B | `OrganizationSuspended / Reactivated / Terminated` | stop and resume work (§4.5) |
| queue → handlers | job | envelope {payload_version, tenant_id, ids, correlation_id, idempotency_key} | background work |

No new module, event type or table is introduced by this section. `MembershipSuspended` is not added: suspension reuses the `MembershipRevoked` handling for review assignments, with the membership status telling consumers it is reversible (PROPOSED DEFAULT, avoids a new event).

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| IdP unavailable | Staff cannot sign in; existing sessions continue until they expire. Learners (capability sessions) are unaffected. |
| Login resolver error | Sign-in fails with a retryable error; nothing is created except the User record if already verified. |
| Double submission of a staff command | Idempotency key returns the original result (J-13). |
| Two admins change the same role at once | Optimistic version check: the second gets `CONFLICT` and sees the current state. |
| Role revoked while a page is open | Next action fails with `FORBIDDEN` / `NOT_FOUND`; nothing partial is saved. |
| Worker crashes mid-job | Lease expires; the job may rerun. Idempotent handlers ensure at most one effective Challenge Me domain result. If the crash happened after a successful provider call, the provider may be called again: its idempotency key or reconciliation applies where supported, and a duplicate external side effect remains possible where neither exists (J-6). |
| Provider down | INFRASTRUCTURE retries with backoff; the owning module's hold-and-review rules apply after caps (e.g. evaluation → teacher review). |
| Job for a suspended organization | Deferred or completed per §4.5; not dead-lettered. |
| Job whose entity was deleted or merged | Completes as stale no-op (J-7). |
| Job with tenant/entity mismatch | POISON, dead letter, security alert (J-3). |
| Deploy with new job payload version | N and N−1 accepted (J-12). |
| Audit write fails | The whole action fails and is retried by the caller (A-1). |
| Database restore | Deletion ledger replayed (DM X11); audit events after the restore point are lost with the restore and the restore itself is recorded as a platform audit event (PROPOSED DEFAULT). |

# 10. Privacy / Consent

- **Staff personal data** (name, email, IdP subject) is personal data (S2), used for access control and attribution. The IdP is a subprocessor for staff data only; no learner data is sent to it. (ADR-002, ADR-006)
- **Learner data** is never an authorization input and never appears in audit events, job payloads, logs or traces (ADR-006, A-4, J-2).
- **Consent** is Wave 2. Foundations guarantees only that the consent gate is enforced inside tenant context at enqueue and dispatch (ADR-019).
- **Break-glass** exposes customer data to platform staff; therefore it is read-only by default, time-limited, second-person approved and fully audited (ADR-012). Its visibility to the customer is FD-4.
- **Deletion.** Organization purge after termination (R1, 90 days) and staff anonymization (LG-2). Audit retention against termination is LG-1.

# 11. Audit / Observability

**Audited:** see §4.6.

**Metrics (Foundations):** sign-ins per organization; authorization denials by permission (counts only); cross-tenant `NOT_FOUND` responses on well-formed identifiers (a probing signal); resolver calls by function; queue lag per priority; dead letters per job type; POISON count (alert on any); stale no-op rate per job type; lease expiries; admission-token wait time.

**Never in telemetry, logs or traces:** learner names, answers, code, essays, contact values, capability tokens or session ids, OTP codes, answer keys, hidden tests, prompts or AI outputs, free-text reasons, IdP tokens. Only allow-listed identifiers, enums, counts and durations (ADR-006, DM §30).

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Same person works for two organizations | Two memberships; picker; each request bound to one; no cross-view | EXISTING / S-11 |
| Two tabs, two organizations | Each tab's requests carry their own organization; no mixing | EXISTING (S-5) |
| Staff member is also a parent of a learner in the same organization | Their staff access and any guardian access are separate: guardian access is a capability session (Wave 2), staff access is IdP-based; neither grants the other | EXISTING (ADR-002, ADR-016) |
| Teacher moved from cohort A to cohort B | Revoke A-scoped role, grant B-scoped role in one transaction; A's history no longer visible to them; their past decisions on A stay attributed to them | EXISTING rules applied |
| Last Owner leaves the company without handing over | Cannot be removed in-product; support-assisted recovery (verified request, second platform approver, audited per-tenant repair) | LOCKED (FD-5) |
| Staff email changes at the IdP | Same subject → same User; email refreshed (S-4) | PROPOSED DEFAULT |
| Two IdP identities for one person | Two Users unless linked by support (V1 has no self-service linking) | PROPOSED DEFAULT |
| IdP account deleted | Cannot sign in; membership remains until an Owner/Admin revokes it | EXISTING (authorization is Challenge Me's) |
| Revoked staff had open review tasks | Released to the queue (DM §13) | EXISTING |
| Revoked staff had pending regrade approval requests | Requests remain; another approver must act | PROPOSED DEFAULT |
| Organization suspended while jobs are queued | §4.5 | FD-2 / PROPOSED DEFAULT |
| Job fails because the organization was terminated | Completes as stale no-op except purge jobs | PROPOSED DEFAULT |
| Crafted request with another organization's ids | `NOT_FOUND`; counted in the probing metric | EXISTING |
| Webhook for an unknown account | Stored, ignored at platform level; no tenant touched | EXISTING (DM §14.3) |
| Resolver called with malformed input | Rejected; audited; rate-limited | EXISTING (DM X1) |
| Learning data viewed by a teacher whose scope changed | Access re-evaluated per request; TopicState/TopicTrajectory/signals of learners outside the new scope are no longer visible | EXISTING (R-9) |

# 13. Open Decisions (resolved at closure)

FD-1 to FD-5 are now LOCKED as recorded under each heading. LG-1 and LG-2 remain legal gates.

### FD-1 — Approve the V1 staff permission matrix (DM §5.4) — LOCKED: option B

- **Question:** Adopt the DM §5.4 matrix as the V1 baseline?
- **Why it matters:** It decides who can publish content, override marks, approve regrades and see safeguarding items. Engineering needs it before the first protected endpoint.
- **Options:** (A) adopt as written; (B) adopt with two changes: teachers may approve their own content only when the organization enables direct publishing (ties to the Part 1 J1 question), and a teacher may not approve their own regrade even when no other approver exists; (C) define a new matrix.
- **Recommended:** B. It keeps teacher speed where the organization wants it and guarantees a second person for mass grade changes.
- **Consequences:** B needs one organization setting (already proposed as `allow_direct_publish` in DM §8.4) and blocks single-teacher organizations from approving their own regrades until an Owner or Admin approves.

### FD-2 — Staff access while an organization is SUSPENDED — LOCKED: option A

- **Question:** What can staff do when an organization is suspended (for example, unpaid subscription)?
- **Why it matters:** Suspension must stop new activity without destroying customer trust or blocking data access.
- **Options:** (A) read-only access to everything, including exports; (B) no access except Owners; (C) full access with only scheduling and delivery stopped.
- **Recommended:** A. Owners and Admins can also change billing contacts.
- **Consequences:** Every write command checks organization status; the UI shows a suspension banner.

### FD-3 — Who can view and export the organization audit log — LOCKED: option B

- **Options:** (A) OWNER only; (B) OWNER and ADMIN can view, OWNER can export; (C) OWNER and ADMIN view and export.
- **Recommended:** B.
- **Consequences:** Export is itself an audited, recent-auth action.

### FD-4 — Customer visibility of platform break-glass access — LOCKED: option A

- **Options:** (A) every break-glass session touching an organization appears in that organization's audit log with the reason category and ticket reference; (B) recorded only in the platform audit, available on request.
- **Recommended:** A. It is a trust signal and matches the "no standing access" principle.
- **Consequences:** Platform audit events are mirrored into the tenant log (see F-1).

### FD-5 — Owner recovery — LOCKED: option A

- **Question:** How is an organization recovered when no active Owner can act?
- **Options:** (A) a documented, support-assisted procedure: verified request from the contract signatory, second platform approver, executed as an audited per-tenant repair script that grants OWNER to a named member; (B) no recovery.
- **Recommended:** A.
- **Consequences:** Needs a support runbook; no product UI.

### LG-1 — Audit retention versus organization termination (legal gate) — proposed behavior accepted; counsel confirmation required

- **Question:** When a terminated organization's data is purged after 90 days, is its audit log also purged, or kept for the 24-month audit retention?
- **Options:** (A) purge with the organization; (B) keep audit events for the retention period, with free-text references purged; (C) keep for a market-specific period.
- **Recommended:** B, subject to counsel per market.

### LG-2 — Staff personal-data deletion — proposed behavior accepted; counsel confirmation required

- **Question:** Is anonymizing a former staff member while keeping their User id in audit and decision records acceptable under each market's rules?
- **Recommended:** Yes (A-6, §4.4), subject to counsel.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| T-1 … T-11 | ADR-012, ADR-005, ADR-017, DM §6, X1, X7, DM §28 | EXISTING |
| S-1, S-2, S-5, S-7, S-8, S-10 | ADR-002, DM §5 | EXISTING |
| S-3, S-4, S-9, S-11; 15-minute recent-auth window | new | PROPOSED DEFAULT |
| R-1, R-2, R-3, R-6, R-9 | DM §5.1–5.4 | EXISTING |
| R-4, R-5, R-8 | new | PROPOSED DEFAULT |
| R-7 permission matrix | DM §5.4 + FD-1 | LOCKED |
| R-10 | D11, D12 | LOCKED |
| Membership effects §4.4 | DM §5, §13; new (release on suspend, no-organization sign-in) | EXISTING / PROPOSED DEFAULT |
| Organization status effects §4.5 | DM §6.1; FD-2 | EXISTING / LOCKED |
| A-2, A-4, A-5 | ADR-024, ADR-006, DM §30 | EXISTING |
| A-1, A-3, A-6 | new | PROPOSED DEFAULT |
| A-7 | DM §4 (R6) | PROPOSED period + LG-1 |
| A-8, A-9 | FD-3, FD-4 | LOCKED |
| J-1 … J-6, J-8, J-11, J-12 | ADR-001, ADR-013, ADR-023, DM §21, §30 | EXISTING |
| J-7, J-9, J-10 (audit), J-13 | DM §21/§26 (specific cases); new generalization | PROPOSED DEFAULT (accepted) |
| J-6 wording (domain vs external effects) | ADR-001, ADR-017; product-owner correction | EXISTING + corrected wording |
| Learning visibility in staff scope | LTM §17, D11, D12, C10, C11 | LOCKED / EXISTING |

# 15. Acceptance Criteria

**Tenant isolation**
1. For every staff and learner endpoint, calling it with a valid session for organization B and an identifier belonging to organization A returns `NOT_FOUND` and changes nothing.
2. A database query run without tenant context returns no tenant-owned rows.
3. A job whose payload names organization B but whose entity belongs to A is dead-lettered as POISON and raises a security alert; nothing is written.
4. Download links for one organization's files cannot be generated by another organization's session, and expire within 5 minutes.
5. No telemetry, log line or trace attribute contains learner content, contact values, tokens, answer keys or prompts (canary test).

**Staff sign-in and organization selection**
6. A person with one active membership enters that organization directly; with several, they see only organizations where their membership is ACTIVE and the organization is not TERMINATED.
7. A request naming an organization where the person has no ACTIVE membership fails, even if the person was a member a minute earlier.
8. A person holding OWNER or ADMIN in an organization cannot enter it without an MFA-authenticated session; the same person can enter an organization where they are only a Teacher.
9. A sensitive action with authentication older than the recent-auth window returns `REAUTH_REQUIRED` and succeeds after re-authentication.
10. Two tabs working in two organizations never show or change each other's data.

**Roles and scope**
11. A teacher scoped to cohort 10-B cannot see learners, results, topic states, trajectories or signals of cohort 10-C.
12. A course-scoped teacher automatically covers a cohort created in that course after the role was granted.
13. An ADMIN cannot grant or revoke OWNER; a TEACHER cannot change any role.
14. The last active OWNER cannot be revoked, suspended, demoted or leave.
15. A role change takes effect on the very next request, and produces one audit event with before and after values.
16. Learner and guardian sessions can never reach staff-only learning data (stability, evidence strength, signals, transitions); staff roles never change what learner- or guardian-facing views show (D11, D12).

**Membership lifecycle**
17. Suspending a membership removes access immediately and releases that person's review assignments; reactivating restores the same roles.
18. After revocation, the person's past decisions (overrides, approvals) still show them as the actor.

**Audit**
19. Every action in §4.6's list produces exactly one audit event in the same transaction; if the audit write is forced to fail, the action is not applied.
20. No audit event contains learner answers, prompts, tokens, contact values or free text inline.
21. Audit events cannot be modified or deleted by the application role.
22. Break-glass access produces a platform audit event per statement and, if FD-4 = A, a corresponding entry in each affected organization's audit log.

**Background jobs**
23. A job created in a transaction that rolls back never runs.
24. Killing a worker mid-job and letting the lease expire leads to at most one effective Challenge Me domain result (no duplicate records, state transitions, evaluation heads, observations or ledger entries), even though the handler may run more than once.
24a. When a provider supports idempotency keys, the retried call reuses the same key as the first attempt.
24b. When a provider call succeeded before the crash and the provider has no idempotency support, the retry's duplicate side effect is detected by the provider's reconciliation mechanism where one exists (for example, a matching provider message id or usage record) and is recorded once in Challenge Me; the specification does not require exactly-once external delivery.
25. A DOMAIN failure (for example, student code timing out) is recorded as a result and never retried; an INFRASTRUCTURE failure is retried with backoff up to the cap and then dead-lettered.
26. A stale job (entity revision no longer current) completes without effect and is not dead-lettered.
27. A burst from one organization does not delay P0 work of other organizations beyond their minimum share.
28. Replaying a dead letter requires a platform operator, re-validates organization and payload version, and is audited.
29. A deploy that introduces payload version N+1 processes queued version-N jobs correctly.
30. Repeating a staff command with the same idempotency key within 24 hours returns the original result without a second effect.

---

# Wave 1 Closure

**Status: APPROVED and CLOSED.**

## 1. Locked decisions

| ID | Decision |
|---|---|
| FD-1 | DM §5.4 permission matrix adopted as the V1 baseline. Teachers approve their own content only when direct publishing is enabled; a teacher never approves their own regrade. |
| FD-2 | Organization suspension: staff read-only; Owners/Admins can update billing contacts; already-submitted work continues through marking and evaluation. |
| FD-3 | Audit log: Owner and Admin can view; only Owner can export; export is audited and requires recent authentication. |
| FD-4 | Break-glass access is visible in the affected organization's audit log with reason category and ticket reference; the platform audit remains authoritative. |
| FD-5 | Owner recovery is support-assisted: verified request, second platform approver, audited per-tenant repair procedure, no product UI. |
| J-6 correction | Jobs may run more than once; at most one effective Challenge Me domain result; provider idempotency or reconciliation where supported; no claim of universal exactly-once external delivery. |

Architectural rules restated in this wave (ADR-001, ADR-002, ADR-006, ADR-012, ADR-013, ADR-017, ADR-023, ADR-024, DM §5–6, X1, X7) and the Learning Trajectory decisions (D11, D12, D14, C10, C11) are unchanged.

## 2. Legal / compliance gates still requiring counsel (per market)

| ID | Proposed behavior | Status |
|---|---|---|
| LG-1 | Audit events kept for the 24-month retention period after organization termination, with free-text references and payloads purged with the organization. | Proposed behavior accepted; **counsel confirmation required per market** |
| LG-2 | Former staff personal data anonymized while stable internal ids are kept for historical attribution and audit. | Proposed behavior accepted; **counsel confirmation required per market** |

## 3. Remaining non-blocking implementation and sign-off items

**Accepted V1 proposed defaults** (changeable later without a model change): verified IdP email required (S-3); IdP email refresh and conflict handling (S-4); 12-hour maximum staff session and 60-minute idle timeout (S-9); 15-minute recent-auth window (S-8); no cross-organization staff view (S-11); Owner, Admin and Safeguarding lead organization-scoped (R-4); no granting above one's own authority (R-5); archived scopes remain readable (R-8); membership suspension releases review assignments; same-transaction audit (A-1); fixed audit field list (A-3); actor names resolved at viewing time (A-6); stale jobs complete as no-op (J-7); dead letters platform-only (J-9); 24-hour command idempotency retention (J-13); completed jobs pruned after 14 days. No conflict with an authoritative ADR or Domain Model rule was found.

**Implementation and verification items:**
1. **Provider idempotency inventory (J-6).** For each provider (WhatsApp, email, OTP/SMS, AI, code execution, document extraction, malware scanning), record whether it supports idempotency keys and what reconciliation it offers. Record any case where a duplicate external side effect is possible, for example a second message to a learner, in the runbooks. This adds to the existing provider-verification track (Spec Kit Part 1, sign-off gates).
2. **Queue library selection** (sign-off gate 12) determines the exact job state representation (§5.6).
3. **Wording carried into the Domain Model** when it is next revised: the J-6 domain-vs-external distinction (DM §21 job catalogue header); platform audit events recorded under the platform organization (F-1); DM §30 paging threshold (P0 + P1) treated as authoritative over ADR-023's minimum (F-2); elevated-access rejection recorded as REVOKED with reason REJECTED (F-5).
4. **Support runbook** for FD-5 Owner recovery.
5. **Security lead confirmation** of staff session values (S-9), already accepted as V1 defaults.

**STOP — Wave 1 closed. Wave 2 (Roster / Access / Consent) not started.**
