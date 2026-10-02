# Challenge Me — V1 Spec Kit — Part 2, Wave 2: Roster, Access & Consent

> Capability: staff invitation (SPEC-002), organization settings relevant to roster, access and consent (SPEC-004), learners, guardians, contact points, courses, cohorts, enrollment, roster import, learner merge (SPEC-005 to 011), capability links, sessions and OTP (SPEC-030 to 032), channel and processing consent (SPEC-078, 079).
>
> Status: APPROVED and CLOSED (W2-1 to W2-6 locked; W2-C1 to W2-C4 approved; LG-3, LG-4, LG-5 remain legal gates). Specification only; no implementation.
>
> Authoritative inputs: Wave 1 Foundations rev. 2 (closed; FD-1 to FD-5, J-6), Domain Model rev. 1.4 (DM), ADR set V1.3, Architecture V1.3, Spec Kit Part 1 (J-stages, SC1–SC4), Learning Trajectory Model rev. 13 (LTM) and approved decisions C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17.

# How to read this section

Labels are the same as Wave 1: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. Open product decisions are collected in §13 and summarized at the end. Nothing marked PROPOSED DEFAULT or OPEN is treated as approved.

# 1. Capability Overview

**Plain language.** This wave describes the people Challenge Me works with and the permission it needs from them.

- **Staff** join an organization by invitation and sign in with the external identity provider (Wave 1).
- **Learners** and **guardians** are records the organization keeps. They never sign in with a password or become identity-provider users. They reach Challenge Me through **private links** that open one specific thing (a challenge, a report, a consent form) and, for more, a **one-time code** sent to a phone or email linked to them.
- A **contact point** is a phone number or email address. It is never a person. One family phone can belong to a mother and two children, and Challenge Me keeps them apart.
- **Courses** and **cohorts** organize learners; **enrollment** puts a learner in a cohort.
- **Consent** comes in two kinds that are never mixed: **channel consent** (may we message this phone or email, for this purpose?) and **processing consent** (may we process this learner's data for this purpose, such as AI marking or guardian reports?). A **consent policy** per market decides who may grant consent, especially for minors.

**Boundaries.** Challenge delivery, reminders and report delivery are Waves 4 and 9; deletion execution and retention are Wave 10; billing is Wave 11. This wave defines the roster, access and consent behavior those waves depend on.

## 1.1 Concept boundaries (never merged)

| Concept | What it is | What it is not |
|---|---|---|
| User (staff identity) | A global identity verified by the IdP | Not a learner or guardian record; carries no organization data by itself |
| Membership | A User's belonging to one organization, with scoped roles | Not a learner enrollment |
| Learner | An organization's record of a student | Not a User; never signs in with the IdP; does not own a phone |
| Guardian | An organization's record of a responsible adult | Not a User; not a learner |
| GuardianLink | The relationship between a guardian and a learner | Not consent by itself |
| ContactPoint | A phone number or email in one organization | Not a person; not proof of identity; holds no consent |
| ContactPointLink | Which learner or guardian a contact point reaches | Not a verification |
| CapabilityGrant | A private link's permission to open one thing | Not a session; not a login |
| CapabilitySession | A browser session created from a grant | Not a staff session; never grants staff permissions |
| OtpChallenge | A one-time code proving possession of a contact point | Not identity proof; not consent |
| Course / Cohort | Academic structure | Not a permission by itself |
| Enrollment | A learner's membership in a cohort | Not a staff scope |
| ChannelConsent | Permission to message a contact point on a channel for a purpose | Not permission to process learner data |
| ProcessingConsent | Permission to process a learner's data for a purpose, with its grantor | Not permission to message anyone |
| ConsentPolicy(Version) | The market and organization rules for who may grant which consent | Not a consent record |

# 2. Actors

| Actor | Authority in this wave | Source |
|---|---|---|
| OWNER / ADMIN | Invite staff; manage roster, courses, cohorts, enrollments, imports, merges; manage consent requests and consent settings; approve or request deletion (Owner approves) | FD-1 (DM §5.4 matrix) |
| TEACHER (scoped) | View roster within scope; no roster changes (FD-1: roster.manage is Owner/Admin); may copy or print challenge links for learners in scope when the organization enables it (W2-2) | FD-1; W2-2 |
| SAFEGUARDING_LEAD | No roster authority beyond viewing learners linked to safeguarding items | FD-1 |
| Learner | Opens their own links; answers challenges; after a one-time code, sees their own progress; grants or withdraws consent where the consent policy lets them | ADR-016, ADR-019 |
| Guardian | Opens links sent to them (reports, consent requests); after a one-time code, sees their linked learners' reports; grants or withdraws consent where the policy lets them | ADR-016, ADR-019, D12 |
| Invitee | A person with a staff invitation; becomes a staff member on acceptance | DM §5 |
| System actor | Imports, consent request dispatch, grant revocation, expiry sweeps | ADR-012 |
| Messaging provider | Delivers links and codes; reports opt-outs | ADR-004 |

# 3. Core Lifecycles

## 3.1 Staff invitation (SPEC-002)

1. An Owner or Admin enters an email address and the roles and scopes to grant.
2. Challenge Me creates a **StaffInvitation** with a private token and sends it by email.
3. The invitee opens the link, signs in with the identity provider, and must present an IdP-verified email equal to the invited email.
4. On acceptance, Challenge Me activates the person's **Membership** in one transaction: it creates the Membership if this User has never belonged to the organization, or **reactivates the existing Membership** if a previous one was revoked (W2-C1). Roles and scopes are set from the invitation. The invitation becomes ACCEPTED. Before acceptance, the invitation is the only record; no Membership exists for an unaccepted invitation (W2-C2).
5. Invitations expire (PROPOSED DEFAULT: 7 days) or can be revoked; resending creates a new invitation and revokes the old one.

## 3.2 Setting up the roster (SPEC-005 to 009)

1. An Owner or Admin creates **courses** and **cohorts**.
2. Learners and guardians are added one by one or by **import**.
3. Each learner and guardian gets zero or more **contact points** through **contact point links**. A family phone is one contact point linked several times.
4. Guardians are connected to learners with **guardian links** (relationship, receives reports, may grant consent).
5. Learners are **enrolled** in cohorts. Enrollment starts or ends as learners join, leave or move.

## 3.3 Roster import (SPEC-010)

Upload → validation job → preview with row errors and possible duplicates → commit in chunks → created and updated records, enrollments and a result report. Re-importing the same file is harmless; re-importing a new file updates learners by external reference.

## 3.4 Consent acquisition (SPEC-078, 079; ADR-018)

1. An Owner or Admin sends **consent requests** (usually in batches, per cohort).
2. Each request is a private link (scope CONSENT_REQUEST) to the right person: the guardian for minors or the learner for adults, as the consent policy says.
3. The consent page shows each purpose separately (WhatsApp messages, reminders, reports, AI marking, guardian reports).
4. Each choice is recorded as a **ChannelConsent** (per contact point) or **ProcessingConsent** (per learner, with grantor). Consent history is append-only.
5. The organization sees consent coverage per cohort and purpose.
6. Anyone who granted consent can withdraw it later, from a link or by replying STOP to a message; staff can record a withdrawal on request.

## 3.5 Learner and guardian access (SPEC-030 to 032)

```
Message with private link (grant) -> GET: inert page, "Start" button (no data, no state change)
  -> POST exchange -> session (one challenge, or one report, or one consent request)
  -> optional: "See my progress" -> one-time code to a contact point linked to the learner
     -> session elevated to learner home (or guardian home) for a limited time
```

# 4. Behavioral Rules

## 4.1 Staff invitation and membership (SPEC-002)

| # | Rule | Label |
|---|---|---|
| I-1 | Only Owners and Admins invite; Admins cannot invite Owners (R-5). | LOCKED (FD-1) / Wave 1 R-5 |
| I-2 | The invitation carries email, roles and scopes; scopes are validated against Roster at creation and again at acceptance. | EXISTING (DM §5.2, Wave 1 R-3) |
| I-3 | Acceptance requires IdP sign-in with a verified email equal (case-insensitive) to the invited email. A different email cannot accept. | EXISTING (DM §5.5) |
| I-4 | The invitation token is stored only as a hash and is single-use; the invitation link follows the same "GET is inert, POST acts" rule as learner links. | EXISTING (ADR-016 pattern) / PROPOSED DEFAULT for invitations |
| I-5 | Invitation expiry 7 days; resending revokes the previous invitation for the same email. | PROPOSED DEFAULT |
| I-6 | There is one Membership per User × organization. A person whose Membership was REVOKED can be invited again; accepting the new invitation **reactivates the existing Membership** (REVOKED → ACTIVE) and replaces its role assignments with those in the invitation, subject to current authorization rules. Previous role assignments are ended, not deleted, and the membership's full history and audit remain. | **LOCKED (W2-C1)** |
| I-7 | Invitation, acceptance, expiry and revocation are audited. | Wave 1 §4.6 |

## 4.2 Learners (SPEC-005)

| # | Rule | Label |
|---|---|---|
| L-1 | A learner belongs to exactly one organization. The same child at two tutoring centers is two unrelated learner records; nothing links them. | EXISTING (ADR-003, DM §5.B) |
| L-2 | Required: display name. Optional: external reference (unique per organization), preferred language, minor status (MINOR, ADULT, UNKNOWN; default UNKNOWN). | EXISTING (DM §5.B) |
| L-3 | UNKNOWN minor status is treated as MINOR for every consent and delivery rule. | EXISTING (DM §7.3) |
| L-4 | Challenge Me does not store learners' dates of birth in V1; minor status is set by staff or import. | PROPOSED DEFAULT (data minimization) |
| L-5 | Only Owners and Admins may set or change a learner's minor status, including through import. Every change is audited and emits `LearnerMinorStatusChanged`. | **LOCKED (W2-6)** |
| L-6 | A learner has no password, no IdP account and no staff role. The optional `linked_user_id` (ADR-003) is not used by any V1 flow. | EXISTING (ADR-002, ADR-016) + PROPOSED DEFAULT (no V1 flow) |
| L-7 | Learner states: ACTIVE, INACTIVE, MERGED, DELETED (§5). INACTIVE pauses the learner: no new materializations or deliveries, existing links revoked, all data kept, reactivation allowed. | EXISTING states (DM §5.B); INACTIVE meaning PROPOSED DEFAULT |
| L-8 | Learning data is keyed by learner pseudonym and topic (TopicState, TopicTrajectory, evidence units); roster changes never create a new learning identity except merge, which re-points pseudonyms. | EXISTING (DM §12, LTM, C7-B) |

## 4.3 Guardians and guardian links (SPEC-006)

| # | Rule | Label |
|---|---|---|
| G-1 | A guardian is an organization record; one guardian may be linked to several learners and one learner to several guardians. | EXISTING (DM §5.B) |
| G-2 | A guardian link records relationship, `receives_reports` and `may_grant_consent`. Only one active link per guardian–learner pair. | EXISTING (DM §5.B) |
| G-3 | A guardian can grant processing consent for a learner only through an ACTIVE link with `may_grant_consent = true`, and only where the consent policy allows (§4.7). | EXISTING (DM §7) |
| G-4 | A guardian receives guardian reports only if: the link is ACTIVE with `receives_reports`, the learner has GUARDIAN_REPORTING processing consent, and the guardian's contact point has REPORTS channel consent. Report content follows D12. | LOCKED (D12) + EXISTING (DM §17) |
| G-5 | Ending a guardian link emits `GuardianLinkEnded`: the guardian's capability grants and sessions concerning that learner are revoked, and future guardian reports to that guardian for that learner stop. Historical consent events are never erased. Whether processing consent previously granted by that guardian stays valid is governed by **LG-3** (not decided by product). | **LOCKED (W2-C4)** + **LEGAL GATE LG-3** |
| G-6 | Guardian home (after a one-time code) shows the guardian's linked learners and the guardian reports already sent to that guardian. There is no live guardian TopicState or progress view in V1. | **LOCKED (W2-4)**; consistent with D12 |

## 4.4 Contact points (SPEC-007)

| # | Rule | Label |
|---|---|---|
| CP-1 | A contact point is a phone (E.164) or email (lower-cased), unique per organization and type. The same number in two organizations is two contact points. | EXISTING (ADR-003, DM §5.B) |
| CP-2 | A contact point is linked to learners and guardians through contact point links; each link targets exactly one learner or one guardian. | EXISTING |
| CP-3 | A contact point holds verification state only (UNVERIFIED, VERIFIED, INVALID). It never holds consent; channel consent is a separate record keyed by the contact point. | EXISTING (ADR-003, ADR-019) |
| CP-4 | **Verification** proves possession only: a one-time code may be sent to any ACTIVE contact point linked to the learner or guardian, whether UNVERIFIED or VERIFIED; entering the correct code changes that contact point to VERIFIED. Opening a capability link never verifies a contact point. Verification is not identity proof and not consent. | **LOCKED (W2-C3)** |
| CP-5 | A contact point becomes INVALID when the provider reports it undeliverable or staff mark it so; INVALID contact points are skipped for delivery until corrected. | EXISTING (DM §14) + PROPOSED DEFAULT (staff marking) |
| CP-6 | Changing a contact point's value is not an edit: the old contact point is retired and a new one is created and linked, because consent and verification belong to the old value. | PROPOSED DEFAULT |
| CP-7 | Unlinking a contact point from a learner revokes every active grant that was delivered to that contact point for that learner, and cancels queued deliveries to it for that learner. | EXISTING (DM §5.5) made precise |
| CP-8 | **Shared contact points.** Every delivery addresses a (contact point, learner) pair; messages name the learner; each link opens only that learner's item. Channel consent applies to the contact point; processing consent is per learner. | EXISTING (ADR-003, ADR-019) |
| CP-9 | Retired contact points keep their consent history; they are deleted by the retention and deletion rules (Wave 10). | PROPOSED DEFAULT + Wave 10 |

## 4.5 Courses, cohorts and enrollment (SPEC-008, 009)

| # | Rule | Label |
|---|---|---|
| E-1 | A cohort belongs to one course. Courses and cohorts are ACTIVE or ARCHIVED; archived ones accept no new enrollments or assignments and remain readable. | EXISTING (DM §5.B) + Wave 1 R-8 |
| E-2 | A learner can have at most one ACTIVE enrollment per cohort, and may be in several cohorts at once. | EXISTING |
| E-3 | Enrollment start: open assignments targeting the cohort materialize for the learner if not yet closed (late joiner). | EXISTING (DM §9.3, J3) |
| E-4 | Enrollment end: the learner's unfinished student challenges for that cohort become CANCELLED (ENROLLMENT_ENDED) unless still targeted another way; their links are revoked; submitted work and results stay. | EXISTING (DM §9.3, J3) |
| E-5 | Moving a learner between cohorts = end one enrollment and start another, in one transaction. | PROPOSED DEFAULT |
| E-6 | A learner's TopicState and TopicTrajectory are per learner and topic; they carry across cohorts and courses. The applicable learning rules follow the topic's scope (C7, C7-A, C7-B), never the learner's cohort. | LOCKED (C7, C7-A, C7-B) |
| E-7 | Staff visibility follows the resource's scope (Wave 1 R-9). The cohort-scope authorization boundary is unchanged: a teacher sees a submission's content only if the submission's cohort is in their scope. A teacher of the former cohort keeps seeing that cohort's assignments and results but no longer sees the learner's current learner-level data. | EXISTING (Wave 1 R-9); preserved by **W2-5** |
| E-8 | **Continuity after a cohort move.** The new cohort's teacher sees the learner's current learner-level learning data (TopicState, TopicTrajectory, teacher-facing signals) and a historical submission summary for former-cohort submissions: date, assignment title, score and result status only. They do **not** see raw answers, code, essays, AI feedback or rubric evidence from former-cohort submissions they did not teach. In the trajectory evidence strip, former-cohort units appear with date, score and difficulty and without a link to the answer. Authorization is not widened to "current learner scope OR submission cohort scope". | **LOCKED (W2-5)** |
| E-9 | Archiving a cohort does not end its enrollments; ending enrollments is a separate, explicit action. | PROPOSED DEFAULT |

## 4.6 Roster import (SPEC-010)

| # | Rule | Label |
|---|---|---|
| RI-1 | Files: CSV or XLSX with a published template (learner, guardian, contact points, relationship, cohort code, external references, minor status). | EXISTING (ADR-018) |
| RI-2 | Idempotent by (organization, file hash) while an import is active; re-importing a committed file is a no-op. | EXISTING (DM §5.B) |
| RI-3 | Validation produces a preview: rows valid, invalid (with reasons), and **possible duplicates** (same normalized name and a shared contact point, or same external reference in a different row). Nothing is created at preview. | EXISTING (ADR-018) + PROPOSED DEFAULT (duplicate heuristic) |
| RI-4 | Commit upserts learners and guardians by external reference; without one, a new record is created. Possible duplicates are created as separate records and listed for merge review; they are never merged automatically. | EXISTING (ADR-018) + PROPOSED DEFAULT |
| RI-5 | Import never grants consent. A column claiming consent is ignored unless the consent policy allows organization attestation and the importer confirms the attestation (then recorded as ORGANIZATION_ATTESTED with the import as evidence). | EXISTING (ADR-019) + **LEGAL GATE LG-4** |
| RI-6 | Import never deletes records or ends enrollments that are absent from the file. | PROPOSED DEFAULT |
| RI-7 | Commit runs in chunks; each chunk is its own transaction and idempotent; a failed chunk can be retried without duplicates. | EXISTING (DM §21) |
| RI-8 | Import files and rows are kept 30 days (R9), then purged. | EXISTING (DM §4) |

## 4.7 Consent (SPEC-078, 079)

| # | Rule | Label |
|---|---|---|
| C-1 | **ChannelConsent** is keyed by (contact point, channel, purpose). Purposes: CHALLENGE_DELIVERY, REMINDERS, REPORTS, CONSENT_REQUESTS. | EXISTING (ADR-019, DM §7) |
| C-2 | **ProcessingConsent** is keyed by (learner, purpose), with grantor type (LEARNER, GUARDIAN, ORGANIZATION_ATTESTED) and grantor id. Purposes: AI_PROCESSING, GUARDIAN_REPORTING. | EXISTING |
| C-3 | **ConsentPolicyVersion** (one ACTIVE per organization, per market) decides: whether minors need a guardian grant, whether organization attestation is allowed, which purposes are enabled, and its legal basis reference. | EXISTING; contents **LEGAL GATES LG-3, LG-4** |
| C-4 | No consent record means not granted. | EXISTING |
| C-5 | Consent is enforced when work is queued and again immediately before the provider call. Withdrawal between the two cancels the work. | EXISTING (ADR-019, DM §25.7) |
| C-6 | Channel consent withdrawal cancels queued deliveries to that contact point for that purpose. | EXISTING |
| C-7 | AI_PROCESSING withdrawal cancels queued AI operations for the learner; a provider call already running completes, its result is discarded and its payload purged; open evaluations are re-planned to teacher review. | EXISTING (DM §25.7) |
| C-8 | GUARDIAN_REPORTING withdrawal stops future guardian reports for that learner; reports already sent stay as sent (D12). | LOCKED (D12) + EXISTING |
| C-9 | Withdrawal is not retroactive: results already produced (including AI-marked results and learning evidence) remain unless a deletion request is made (Wave 10). | PROPOSED DEFAULT + **LEGAL GATE LG-5** |
| C-10 | Without AI_PROCESSING consent a learner still takes challenges: rule-based marking and teacher review apply. Without channel consent the learner can still use a staff-issued link where the organization enables them (W2-2). | EXISTING (ADR-018, J8 JV3) |
| C-11 | A STOP reply withdraws the matching channel consent for that contact point; on a platform-shared WhatsApp account it also suppresses the number for every organization on that account. | EXISTING (ADR-004, DM §14) |
| C-12 | Every consent change appends a ConsentEvent (who, when, source, evidence, policy version). Consent history is never edited. | EXISTING |
| C-13 | Minors: when the active policy requires it, only a guardian with `may_grant_consent` can grant processing consent for a MINOR or UNKNOWN learner. Whether the minor can withdraw it themselves is **LG-3**. | EXISTING + **LEGAL GATE LG-3** |
| C-14 | `LearnerMinorStatusChanged` lets Privacy & Consent re-evaluate which consent rules apply (for example, who may grant future consent). The event itself never grants or revokes consent. What happens to existing guardian-granted consent when a learner becomes an adult is governed by **LG-3**. | **LOCKED (W2-C4, W2-6)** + **LEGAL GATE LG-3** |
| C-15 | Consent does not expire in V1 unless a new policy version explicitly requires renewal, in which case affected consents become EXPIRED and new requests are needed. | PROPOSED DEFAULT |
| C-16 | Consent requests: sent by a channel the market allows for first contact (ADR-018); the request link has scope CONSENT_REQUEST; expiry 14 days (PROPOSED DEFAULT); completing it records all choices in one transaction. | EXISTING + **LEGAL GATE LG-4** + PROPOSED DEFAULT (expiry) |

## 4.8 Capability links, sessions and one-time codes (SPEC-030 to 032)

| # | Rule | Label |
|---|---|---|
| A-1 | Links carry opaque random tokens stored only as hashes. GET shows an inert page (no data, no state change, no caching, no referrer); POST exchanges the token for a session and redirects to a token-free address. | EXISTING (ADR-016, DM §25.9) |
| A-2 | Grant scopes: one STUDENT_CHALLENGE, one REPORT_SNAPSHOT, or one CONSENT_REQUEST. A session inherits that single scope. | EXISTING (DM §5.2) |
| A-3 | Each message gets its own grant; issuing a new grant does **not** revoke earlier active grants for the same learner and scope; all expire with their object. | EXISTING (Part 1 SC1) |
| A-4 | The device limit (3) counts all of a learner's grants for the same scope together; a fourth device needs a one-time code. | EXISTING (Part 1 SC1, DM §5.2) |
| A-5 | Tokens are never stored inside saved message bodies. | EXISTING (Part 1 SC2) |
| A-6 | Session lifetime for a challenge: up to 12 hours (the student challenge's expiry if earlier). Report and consent sessions: PROPOSED DEFAULT 2 hours. | EXISTING value under gate 3 + PROPOSED DEFAULT |
| A-7 | One-time code: 6 digits, valid 5 minutes, 5 tries, 3 sends per 15 minutes per contact point, stored hashed. | EXISTING (ADR-016) under sign-off gate 3 |
| A-8 | **Step-up.** From a learner session, "See my progress" sends a code to an ACTIVE contact point linked to **that learner**, whether UNVERIFIED or VERIFIED (the learner chooses which if several, shown masked). A correct code elevates the session to LEARNER_HOME for that learner only, for 30 minutes (PROPOSED DEFAULT), and marks the contact point VERIFIED. Guardian step-up works the same way to GUARDIAN_HOME. | EXISTING (ADR-016) as corrected by **W2-C3** + PROPOSED DEFAULT (duration, masking) |
| A-9 | A code from a shared phone never unlocks siblings: elevation is bound to the learner (or guardian) of the current session. | PROPOSED DEFAULT (follows ADR-003) |
| A-10 | LEARNER_HOME shows the learner's own challenges, results per reveal policy and topic states with the approved improving message only (D11). GUARDIAN_HOME shows linked learners and reports already sent to that guardian (W2-4). | **LOCKED (D11, W2-4)** |
| A-11 | There is no standalone learner phone or email entry page in V1. Learner access always begins with a capability grant. | **LOCKED (W2-3)** |
| A-12 | Revocation triggers: learner INACTIVE, MERGED or DELETED; enrollment end (challenge grants of that cohort); student challenge cancelled; contact point unlinked (CP-7); guardian link ended (G-5); staff "reset link"; security event. | EXISTING (DM §5.5) + PROPOSED DEFAULT (INACTIVE) |
| A-13 | Unknown, revoked and expired tokens all show the same page: "This link is no longer valid. Ask your teacher for a new one." | EXISTING (J5) |
| A-14 | Learner and guardian sessions never reach staff data (stability, evidence strength, signals, transitions, other learners). | LOCKED (D11, D12, Wave 1 R-10) |
| A-15 | **Link recipients (organization setting).** Default: MINOR → guardian only; UNKNOWN → guardian only; ADULT → the learner. Consent requests follow the same recipient rule. | **LOCKED (W2-1)** |
| A-16 | **Staff-issued links.** When the organization turns this on (off by default), Owners, Admins and teachers whose scope includes the learner may copy or print that learner's challenge link. Each issuance is audited. The generated grant follows the normal expiry, device-limit and revocation rules. | **LOCKED (W2-2)** |

## 4.9 Organization settings used by this wave (SPEC-004)

| Setting | Default | Who changes | Label |
|---|---|---|---|
| Market and data region | set at organization creation | platform (Wave 11) | EXISTING |
| Active consent policy version | market default copied at creation | Owner/Admin, within market limits | EXISTING (DM §7) + LG-3/LG-4 |
| Default time zone, locale, weekend, quiet hours | organization creation | Owner/Admin | EXISTING (DM §6.1) |
| Link recipient rule by minor status | MINOR → guardian; UNKNOWN → guardian; ADULT → learner | Owner/Admin | **LOCKED (W2-1)** |
| Staff-issued links allowed | off | Owner/Admin | **LOCKED (W2-2)** |
| Direct publishing | off | Owner/Admin | LOCKED (FD-1) |

Every settings change is audited with before and after values (Wave 1).

## 4.10 Learner merge (SPEC-011)

| # | Rule | Label |
|---|---|---|
| M-1 | Merge is within one organization only, between two ACTIVE learners, by Owner/Admin with recent authentication, after a preview. | EXISTING (DM §25.11, FD-1) |
| M-2 | The duplicate becomes MERGED and points to the survivor; its pseudonym is re-pointed; contact point and guardian links move (duplicates collapsed); enrollments move; open student challenges are re-pointed or cancelled if the survivor already has one for the same assignment; duplicate's grants are revoked. | EXISTING |
| M-3 | Learning events and evaluations are never rewritten; the survivor's projections are rebuilt (TopicState, TopicTrajectory, evidence units; repeat exposure by question identity across both histories, D9). | EXISTING + LOCKED (D9) |
| M-4 | Processing consents do not transfer automatically. The preview lists both learners' consents; after merge the survivor keeps its own; if the survivor lacks a consent the duplicate had, the merge prompts a new consent request. | EXISTING (DM §5.B) + PROPOSED DEFAULT (prompt) |
| M-5 | Merge cannot be undone in-product; a mistaken merge is handled as a support repair (Wave 1 style, audited). | PROPOSED DEFAULT |

# 5. State Models

## 5.1 Staff invitation

| From | To | Actor | Guard | Audit |
|---|---|---|---|---|
| — | PENDING | Owner/Admin | valid email, roles within grantor authority | yes |
| PENDING | ACCEPTED | invitee | not expired; verified email matches; scopes still valid; creates or reactivates the Membership (W2-C1, W2-C2) | yes |
| PENDING | EXPIRED | system | 7 days (PROPOSED DEFAULT) | yes |
| PENDING | REVOKED | Owner/Admin, or resend | — | yes |
| ACCEPTED / EXPIRED / REVOKED | any | — | terminal | — |

## 5.1a Membership (as amended by W2-C1 and W2-C2)

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | ACTIVE | invitation acceptance (first time for this User × organization) | invitation valid | roles from invitation | yes |
| ACTIVE | SUSPENDED | Owner/Admin | not the last active Owner (Wave 1) | review assignments released | yes |
| SUSPENDED | ACTIVE | Owner/Admin | — | roles effective again | yes |
| ACTIVE / SUSPENDED | REVOKED | Owner/Admin; self (leave) | not the last active Owner | roles ended | yes |
| REVOKED | ACTIVE | acceptance of a new invitation | invitation valid | same Membership reactivated; previous role assignments ended; roles from the new invitation | yes |

One Membership per User × organization. The pending state before acceptance is the StaffInvitation, not a Membership. This supersedes the INVITED rows and the "REVOKED is terminal" wording of Wave 1 §5.2 (carried forward, not reopened).

## 5.2 Learner

| From | To | Actor | Side effects | Audit |
|---|---|---|---|---|
| — | ACTIVE | Owner/Admin, import | — | yes (import: one event per import) |
| ACTIVE | INACTIVE | Owner/Admin | links revoked; no new materialization or delivery | yes |
| INACTIVE | ACTIVE | Owner/Admin | — | yes |
| ACTIVE | MERGED | merge commit | see M-2 | yes |
| ACTIVE / INACTIVE | DELETED | deletion execution (Wave 10) | anonymized; pseudonym removed | yes |
| MERGED / DELETED | any | — | terminal | — |

## 5.3 Guardian

ACTIVE ↔ INACTIVE (Owner/Admin; INACTIVE revokes the guardian's grants and stops reports); ACTIVE/INACTIVE → DELETED (Wave 10). Guardian merge is not in V1 (PROPOSED DEFAULT: duplicates are handled by ending the duplicate's links and deactivating it).

## 5.4 Links (GuardianLink, ContactPointLink, Enrollment)

ACTIVE → ENDED only; re-linking or re-enrolling creates a new ACTIVE row. Each end is audited with actor and reason.

## 5.5 Contact point

| Dimension | States | Transitions |
|---|---|---|
| Verification | UNVERIFIED → VERIFIED (correct one-time code); any → INVALID (provider undeliverable or staff); INVALID → UNVERIFIED (staff correction) | audited |
| Lifecycle | ACTIVE → RETIRED (value change CP-6, unlinked everywhere, or deletion) | audited |

## 5.6 Course and cohort

ACTIVE → ARCHIVED; ARCHIVED → ACTIVE (Owner/Admin, PROPOSED DEFAULT). Audited.

## 5.7 Roster import

UPLOADED → VALIDATING → PREVIEW_READY → COMMITTING → COMMITTED; any non-terminal → FAILED (with report) or CANCELLED (by importer). COMMITTED, FAILED and CANCELLED are terminal.

## 5.8 Learner merge

PREVIEWED → COMMITTED (Owner/Admin, recent auth) or CANCELLED. A preview older than 24 hours must be regenerated (PROPOSED DEFAULT).

## 5.9 Capability grant, session and one-time code

| Object | States | Notes |
|---|---|---|
| CapabilityGrant | ACTIVE → REVOKED / EXPIRED | Terminal once revoked or expired (DM §24) |
| CapabilitySession | active → expired / revoked; may be elevated (LEARNER_HOME or GUARDIAN_HOME) until `elevated_until` | Revoked with its grant |
| OtpChallenge | PENDING → VERIFIED / EXPIRED / LOCKED | LOCKED after 5 wrong tries |

## 5.10 Consent

| Record | States | Transitions |
|---|---|---|
| ChannelConsent / ProcessingConsent | (none) = not granted; GRANTED; WITHDRAWN; EXPIRED | none → GRANTED; GRANTED → WITHDRAWN / EXPIRED; WITHDRAWN / EXPIRED → GRANTED. Each transition appends a ConsentEvent. Invalid: GRANTED by a grantor the policy does not allow. |
| ConsentPolicyVersion | DRAFT → ACTIVE → RETIRED | One ACTIVE per organization; immutable once ACTIVE |
| ConsentRequest | CREATED → SENT → OPENED → COMPLETED; CREATED/SENT/OPENED → EXPIRED | OPENED = link exchanged (not message "read") |

# 6. Permissions and Tenant Boundaries

| Action | Who (FD-1) | Scope | Extra |
|---|---|---|---|
| Invite staff, manage memberships | Owner, Admin (Admin not Owners) | organization | recent auth for Admin/Owner grants |
| Create / edit / deactivate learners and guardians; manage links and contact points | Owner, Admin | organization | audited |
| View roster | Owner, Admin (all); Teacher (learners in scope) | organization / cohort | contact values masked for Teachers (PROPOSED DEFAULT) |
| Courses, cohorts, enrollments | Owner, Admin | organization | audited |
| Roster import (upload, commit, cancel) | Owner, Admin | organization | audited |
| Merge learners | Owner, Admin | organization | recent auth; audited |
| Send consent requests, view consent coverage | Owner, Admin | organization | audited |
| Record consent withdrawal on someone's behalf | Owner, Admin | organization | reason and evidence required |
| Record organization attestation | Owner, Admin | organization | only if policy allows (LG-4) |
| Change consent policy version | Owner | organization | within market limits; audited |
| Staff-issued learner link | Owner, Admin, Teacher (learner in scope) when enabled (W2-2) | cohort in scope | audited |
| Learner actions | the learner's session | session scope | — |
| Guardian actions | the guardian's session | session scope; linked learners only | — |

**Tenant boundaries.** Every record in this wave is tenant-owned. Token and session lookups go through the audited resolver (Wave 1 T-6). A learner in two organizations is two records; nothing in one organization reveals the other. Teachers see contact points masked (last digits only) unless they are Owner or Admin (PROPOSED DEFAULT).

# 7. Data Ownership

| Data | Owner module | Decision owner | Source of truth | Versioned | Deletion (Wave 10) | Rebuild |
|---|---|---|---|---|---|---|
| StaffInvitation | Identity & Access | Owner/Admin | identity tables | no | R7 | not derived |
| Learner, Guardian, links, ContactPoint, Course, Cohort, Enrollment | Roster | Owner/Admin | roster tables | history via audit | anonymize / delete per Wave 10 | not derived |
| Learner pseudonym | Roster | — | roster table | re-pointed on merge | removed on deletion | not derived |
| RosterImport and rows | Roster | Owner/Admin | roster tables | no | R9 (30 days) | not derived |
| LearnerMerge | Roster | Owner/Admin | roster table | no | R1 | not derived |
| CapabilityGrant, Session, OtpChallenge | Identity & Access | system (issue), staff (reset) | identity tables | no | R7 | not derived |
| ChannelConsent, ProcessingConsent, ConsentEvent | Privacy & Consent | grantor | privacy tables | append-only history | R1 state; R6 events | state derivable from events |
| ConsentPolicyVersion | Privacy & Consent | Owner within market rules | privacy tables | yes | R1 | not derived |
| ConsentRequest (+ batch) | Privacy & Consent | Owner/Admin | privacy tables | no | R1 | not derived |
| Consent coverage view | Reporting | — | read model | — | follows sources | rebuilt from consent state |

# 8. Cross-Module Contracts

All from DM §19–20 unless marked new.

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Identity → Roster | A | scope checks; `GetLearner`, `GetGuardiansForLearner` | invitations, grants, step-up |
| Communication → Roster | A | `ResolveContactsForLearner(learner, purpose)` | delivery (applies W2-1 rule) |
| Communication → Identity | A | `IssueCapabilityGrant` | link at dispatch |
| Identity → Communication | A | `SendOtp(contact point)` | step-up |
| Communication / Privacy → Privacy | A | `ConsentGate.check`, `RecordChannelOptOut` | enqueue and dispatch checks; STOP |
| Privacy → Communication | B | `DeliveryRequested` (CONSENT_REQUEST) | consent requests |
| Privacy → consumers | B | `ConsentChanged` | cancel or allow work (C-5 to C-8) |
| Roster → Challenge, Identity, Learning, Reporting, Privacy | B | `EnrollmentStarted`, `EnrollmentEnded`, `LearnerMerged`, `ContactPointUnlinked`, `LearnerDeactivated` | materialization, revocation, rebuilds |
| Roster → Identity, Reporting | B | `GuardianLinkEnded` (**approved new event, W2-C4**) | revoke that guardian's grants and sessions for that learner; stop future guardian reports; consent history untouched |
| Roster → Privacy | B | `LearnerMinorStatusChanged` (**approved new event, W2-C4**) | re-evaluate applicable consent rules; never grants or revokes consent |
| Learning, Reporting, Challenge → Roster | A (restricted) | `ResolvePseudonym` / `ResolveLearners` | learning identity (Challenge added by Part 1 SC3) |

Two new events are approved (W2-C4) because no existing event carries these facts: `GuardianLinkEnded` and `LearnerMinorStatusChanged`. `LearnerDeactivated` (existing) is also emitted for INACTIVE.

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| Invitation email bounces | Invitation stays PENDING; the inviter sees "delivery failed" and can resend. |
| Invitee signs in with a different verified email | Acceptance refused with a clear message; invitation unchanged. |
| Import validation job crashes | Lease expiry reruns it; preview is rebuilt; nothing was created. |
| Import commit chunk fails | Chunk retried; unique keys prevent duplicates; the import report shows per-row results. |
| Two admins edit the same learner | Optimistic version check; the second receives CONFLICT. |
| Concurrent merge and materialization | Materialization checks learner ACTIVE in its transaction; the merge cancels conflicts (DM §26). |
| One-time code provider down | "We couldn't send a code right now"; no send counted against the limit. |
| One-time code over WhatsApp not allowed without opt-in | Falls back to a channel with existing consent or email (DM §7.4, provider verification). |
| Consent withdrawn while a delivery is being sent | Dispatch check cancels it; if the provider call already happened, the message may still arrive (J-6: no exactly-once external claim). |
| Consent withdrawn while AI marking runs | Result discarded, payload purged, teacher review (C-7). |
| STOP reply arrives before the delivery status webhook | Opt-out applied; later status updates still recorded (monotonic). |
| Consent request link opened twice | Same request; the second completion is rejected as already completed. |
| Duplicate consent submission (double tap) | Idempotency key returns the first result. |

# 10. Privacy / Consent

- **Personal data in this wave:** names, contact values, relationships, minor status, consent records. Classified S2 (personal) or S1 (metadata); tokens and codes S4 (DM §4).
- **No learner content** (answers, essays, code) is created or processed by this wave.
- **Providers receiving data:** the IdP (staff email, identity) for invitations; the messaging and email providers (contact value, learner or guardian first name, link) for consent requests, codes and links. Never learner content.
- **Contact values** never enter logs, traces or audit events; audit refers to contact point ids (Wave 1 A-4).
- **Minors:** UNKNOWN treated as MINOR; guardian grant where policy requires; no date of birth stored (L-4).
- **Deletion:** learner deletion (Wave 10) anonymizes the learner, removes the pseudonym (learning rows purged by pseudonym), revokes grants, and deletes contact points not linked to anyone else. Consent history retention follows R6 and LG-5.

# 11. Audit / Observability

**Audited (organization audit log):** invitation create, resend, accept, expire, revoke; learner and guardian create, edit, deactivate, reactivate; minor status change; guardian link and contact point link create and end; contact point verify, invalidate, retire; course and cohort create, archive; enrollment start and end; import commit (one event with counts, plus row-level results in the import report); merge commit; consent request batch sent; consent recorded by staff on someone's behalf; organization attestation; consent policy version change; staff "reset link"; staff-issued links (if W2-2). Consent changes by learners and guardians are recorded in consent history (ConsentEvent), referenced from audit.

**Metrics:** invitations sent and accepted; import rows by outcome; possible-duplicate rate; consent coverage per purpose; consent request completion rate; link exchanges per grant; device-limit triggers; one-time code sends, verifies, lockouts; revocations by reason.

**Never in telemetry:** names, contact values, tokens, codes, relationship details, consent evidence content.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Siblings on one family phone | One contact point, two links; separate messages naming each learner; separate grants; code never unlocks the sibling | EXISTING / A-9 |
| Parent is also a staff member | Staff access (IdP) and guardian access (links) are separate; neither grants the other | EXISTING (Wave 1) |
| Learner is also a staff member (e.g. teaching assistant) | Separate learner record and staff membership; no link between them in V1 | PROPOSED DEFAULT |
| Same person imported twice | Possible duplicate flagged; merge by Owner/Admin | RI-3, RI-4 |
| Two learners with the same name | Not a duplicate unless they share a contact point or reference; both kept | RI-3 |
| Phone number recycled to a stranger | Staff mark INVALID or retire; STOP from the new owner withdraws channel consent; existing grants for that contact revoked on unlink | CP-5, CP-7 |
| Learner leaves the organization entirely | End all enrollments; set INACTIVE; data kept until deletion or retention | L-7, E-4 |
| Learner changes cohort mid-challenge | E-4 for the old cohort; E-3 for the new one | EXISTING |
| Learner in two cohorts of different courses | One TopicState per topic; policy by topic scope (C7) | LOCKED |
| Teacher's scope changes | Visibility re-evaluated per request (Wave 1 R-9) | EXISTING |
| Minor turns 18 | Staff set ADULT; C-14 | PROPOSED DEFAULT + LG-3 |
| Guardian relationship ends (custody change) | G-5: grants revoked, reports stop, consent history kept; consent validity per LG-3 | LOCKED (W2-C4) + LG-3 |
| Two guardians disagree (one grants, one withdraws) | The latest valid event wins; both are recorded in consent history | PROPOSED DEFAULT + LG-3 |
| Learner withdraws a consent their guardian granted | Allowed only if the policy permits minors to withdraw (LG-3) | LEGAL GATE |
| Link forwarded to a class group | Device limit (3) then one-time code | EXISTING |
| Code requested repeatedly | 3 sends per 15 minutes per contact point; lockout after 5 wrong tries | EXISTING |
| Consent request sent to a guardian with no contact point | Request cannot be created; listed as "no reachable contact" | PROPOSED DEFAULT |
| Import claims consent | Ignored unless attestation is allowed and confirmed (RI-5) | LG-4 |
| Merge where both learners have open challenges for the same assignment | Duplicate's copy cancelled (LEARNER_MERGED); submitted work kept on its record | EXISTING (DM §25.11) |
| Deleted learner's old link opened | "This link is no longer valid" | EXISTING |

# 13. Open Decisions

## Product decisions (resolved at closure)

### W2-1 — Who receives challenge links for minors? (Part 1 G9) — LOCKED: option D (defaults MINOR and UNKNOWN → guardian only; ADULT → learner; consent requests follow the same rule)

- **Why it matters:** Decides whether children receive messages directly, and whose phone gets the link.
- **Options:** (A) guardian contact only; (B) learner's own contact only if one exists with consent, else guardian; (C) both; (D) organization setting choosing A, B or C.
- **Recommended:** D with default A (guardian only) for MINOR and UNKNOWN learners; adults always receive their own.
- **Consequences:** One organization setting; `ResolveContactsForLearner` applies it; consent requests follow the same recipient rule.

### W2-2 — Staff-issued links for learners without channel consent (Part 1 G2) — LOCKED: option B, off by default

- **Why it matters:** Without it, learners with no WhatsApp/email consent cannot take challenges until consent exists.
- **Options:** (A) no staff-issued links; (B) Owner/Admin and teachers in scope can copy or print a learner's challenge link from the assignment page, audited; (C) as B but Owner/Admin only.
- **Recommended:** B, off by default per organization.
- **Consequences:** An audited "issue link" action using the same grant rules; printed links follow the same expiry and device limits.

### W2-3 — Standalone learner entry without a link — LOCKED: option A (none in V1)

- **Why it matters:** Learners who lose their messages cannot reach their challenges.
- **Options:** (A) none in V1: learners use the latest link, or ask the teacher (W2-2); (B) a public page where the learner enters a phone or email, receives a code, and picks their name from the learners linked to that contact.
- **Recommended:** A for V1. B exposes which learners share a contact point to anyone holding the phone, and adds an enumeration surface.
- **Consequences:** A keeps all entry through grants; B needs rate limiting, masking and a learner picker.

### W2-4 — What guardians see after a one-time code (guardian home) — LOCKED: option A

- **Options:** (A) list of linked learners and their sent guardian reports only; (B) A plus live topic states with the D12 improving message; (C) nothing beyond single report links.
- **Recommended:** A. It matches D12 (reports are frozen, what was sent) and adds no new live guardian view.
- **Consequences:** B would need a guardian live view; not in V1 under A.

### W2-5 — Past answers of a learner who moved cohorts — LOCKED: option B (not the recommended A); cohort-scope boundary preserved

- **Why it matters:** Teaching continuity versus strict scope.
- **Options:** (A) the new cohort's teacher sees the learner's topic states, trajectory and evidence strip, including evidence from former cohorts, and can open those past answers; (B) same, but past answers from other cohorts show score and date only, not the answer.
- **Recommended:** A (continuity within one organization; TopicState is already learner-level under C7).
- **Consequences:** The authorization rule for submissions becomes "the learner is in your scope now, or the submission's cohort is in your scope".

### W2-6 — Who can set or change a learner's minor status — LOCKED: option A

- **Options:** (A) Owner/Admin only, including by import; (B) also the learner or guardian through the consent page.
- **Recommended:** A. Minor status drives consent rules, so it stays a staff-controlled fact.
- **Consequences:** Changes audited and emit `LearnerMinorStatusChanged`.

## Legal / compliance gates (counsel per market) — remain OPEN

| ID | Question | Proposed behavior |
|---|---|---|
| LG-3 | Minors: age threshold per market; who may grant and withdraw each consent for a minor; whether a minor may withdraw a guardian's grant; what happens to guardian-granted consent when a guardian link ends or the learner becomes an adult | Guardian grants for minors where required; consents persist until withdrawn; learner takes over at adulthood (C-13, C-14, G-5) |
| LG-4 | Consent acquisition: permitted first-contact channel and legal basis; whether organization attestation is acceptable, and with what evidence | Consent requests via the organization's permitted channel; attestation only where policy allows, with import or staff evidence (C-16, RI-5) |
| LG-5 | Withdrawal effects and consent-history retention | Not retroactive; history kept 24 months (C-9, R6) |

Existing sign-off gates 3 (session and code values), 5 and 6 (consent legal basis, minors) remain; LG-3 and LG-4 are their Wave 2 detail.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| Concept boundaries §1.1 | ADR-002, ADR-003, ADR-016, ADR-019, DM §5, §5.B, §7 | EXISTING |
| I-1 … I-3, I-7 | FD-1, Wave 1, DM §5 | LOCKED / EXISTING |
| I-4, I-5 | ADR-016 pattern; new | PROPOSED DEFAULT |
| I-6 | Wave 1 §5.2 + W2-C1 | LOCKED |
| L-1 … L-3, L-8 | ADR-003, DM §5.B, §7.3, §12, LTM | EXISTING |
| L-4, L-6 (no V1 flow), L-7 (INACTIVE meaning) | new | PROPOSED DEFAULT |
| G-1 … G-4 | DM §5.B, §7, §17, D12 | EXISTING / LOCKED |
| CP-1 … CP-3, CP-8 | ADR-003, ADR-019 | EXISTING |
| CP-4 | ADR-016 as corrected by W2-C3 | LOCKED |
| CP-6, CP-9 | new | PROPOSED DEFAULT |
| E-1 … E-4, E-7 | DM §5.B, §9.3, J3, Wave 1 R-9 | EXISTING |
| E-6 | C7, C7-A, C7-B | LOCKED |
| RI-1, RI-2, RI-7, RI-8 | ADR-018, DM §5.B, §21, §4 | EXISTING |
| RI-3, RI-4 (heuristic), RI-6 | new | PROPOSED DEFAULT |
| C-1 … C-8, C-10 … C-12 | ADR-004, ADR-018, ADR-019, DM §7, §14, §25.7, D12 | EXISTING / LOCKED |
| C-9, C-14, C-15, C-16 (expiry) | new | PROPOSED DEFAULT + LG |
| A-1 … A-5, A-7, A-12 (base), A-13, A-14 | ADR-016, DM §5, §25.9, Part 1 SC1, SC2, J5, D11, D12, Wave 1 R-10 | EXISTING / LOCKED |
| A-6 (report/consent sessions), A-8 (duration, masking), A-9 | new | PROPOSED DEFAULT |
| M-1 … M-3 | DM §5.B, §25.11, D9 | EXISTING / LOCKED |
| M-4 (prompt), M-5 | new | PROPOSED DEFAULT |
| New events `GuardianLinkEnded`, `LearnerMinorStatusChanged` | W2-C4 | LOCKED |
| L-5, E-8, G-6, A-10, A-11, A-15, A-16 | W2-1 … W2-6 | LOCKED |

# 15. Acceptance Criteria

**Invitations and membership**
1. An invitation can be accepted only by an IdP-verified email equal to the invited one; any other email is refused and the invitation stays pending.
2. An expired or revoked invitation cannot be accepted; resending revokes the previous one.
3. A person whose membership was revoked can be invited again; accepting reactivates the same Membership (no second Membership for that User × organization), sets roles from the new invitation, and keeps the earlier history.
3a. An unaccepted invitation creates no Membership.

**Learners, guardians, contact points**
4. Adding a learner never creates an IdP user, password or staff role.
5. The same phone number added for two siblings is one contact point with two links; each sibling receives separate messages that name them.
6. A learner with UNKNOWN minor status is treated as a minor by every consent and delivery rule.
7. Changing a contact point's value retires the old contact point and creates a new one; consent and verification do not move to the new value.
8. Unlinking a contact point from a learner revokes every active link grant delivered to it for that learner.
9. A contact point becomes VERIFIED only after a correct one-time code, never by opening a link.
10. Teachers see contact values masked; Owners and Admins see them in full.

**Courses, cohorts, enrollment**
11. Ending an enrollment cancels the learner's unfinished challenges for that cohort with reason ENROLLMENT_ENDED and revokes their links; submitted work and results remain.
12. Starting an enrollment materializes open assignments targeting the cohort for that learner.
13. Moving a learner between cohorts keeps one TopicState per topic, calculated under the topic's applicable learning rules (C7, C7-A).
14. A teacher of the former cohort keeps seeing that cohort's assignments and results but not the learner's current topic states.

**Import and merge**
15. Re-importing the same file creates nothing new.
16. An import never deletes learners or ends enrollments absent from the file.
17. An import column claiming consent records nothing unless attestation is allowed and confirmed.
18. Possible duplicates are listed and never merged automatically.
19. A merge re-points the duplicate's pseudonym, rebuilds the survivor's learning projections, and never rewrites learning events or evaluations.
20. After a merge, the survivor does not silently receive the duplicate's processing consents.

**Consent**
21. No message is sent to a contact point without the matching channel consent at queue time and at send time.
22. For a minor, when the policy requires a guardian grant, a processing consent granted by the learner is rejected.
23. A STOP reply withdraws the matching channel consent; on a platform-shared WhatsApp account the number is suppressed for all organizations on that account.
24. Withdrawing AI_PROCESSING cancels queued AI work for the learner, discards in-flight results, purges their payloads and re-plans marking to teacher review; results already produced remain.
25. Withdrawing GUARDIAN_REPORTING stops future guardian reports; reports already sent remain as sent.
26. Every consent change appends a consent history event; no consent history event is ever edited.
27. Completing a consent request records all choices in one transaction; a second completion of the same request is rejected.

**Links, sessions and codes**
28. Opening a link with GET changes nothing and shows no learner data.
29. A session from a challenge link can reach only that student challenge.
30. Issuing a reminder link does not invalidate the earlier link for the same challenge.
31. A fourth device on the same learner and challenge requires a one-time code.
32. A one-time code sent to a shared family phone elevates only the learner (or guardian) of the current session.
33. After 5 wrong codes the code is locked; after 3 sends in 15 minutes further sends are refused.
34. Unknown, revoked and expired links show the same "no longer valid" page.
35. Learner and guardian sessions never return stability, evidence strength, signals, transitions or other learners' data.
36. Link tokens never appear in saved message bodies, logs or URLs after the exchange.

**Wave 2 decisions**
37. With default settings, challenge links and consent requests for MINOR and UNKNOWN learners go only to guardian contact points; for ADULT learners they go to the learner (W2-1).
38. Staff-issued links are unavailable until the organization turns them on; when on, only Owners, Admins and teachers with the learner in scope can issue them; each issuance is audited; the grant follows normal expiry, device-limit and revocation rules (W2-2).
39. No page lets a learner start a session with a phone number or email alone (W2-3).
40. Guardian home lists linked learners and reports already sent to that guardian, and shows no live topic state or progress (W2-4).
41. After a cohort move, the new cohort's teacher sees the learner's topic states, trajectory and a score/date summary of former-cohort submissions, and receives NOT_FOUND when trying to open the raw content of a former-cohort submission (W2-5).
42. A Teacher cannot change a learner's minor status; an Owner or Admin change is audited and emits `LearnerMinorStatusChanged`, which by itself changes no consent record (W2-6, W2-C4).
43. A one-time code can be sent to an UNVERIFIED linked contact point and, when entered correctly, verifies it (W2-C3).
44. Ending a guardian link revokes that guardian's grants and sessions for the learner and stops future reports to that guardian, and leaves consent history unchanged (W2-C4).

---

# Wave 2 Closure

**Status: APPROVED and CLOSED.**

## 1. Final locked product decisions

| ID | Decision |
|---|---|
| W2-1 | Organization setting controls link recipients. Defaults: MINOR → guardian only; UNKNOWN → guardian only; ADULT → learner. Consent requests follow the same rule. |
| W2-2 | Owners, Admins and teachers with the learner in scope may copy or print a learner's challenge link; off by default per organization; every issuance audited; normal expiry, device-limit and revocation rules apply. |
| W2-3 | No standalone learner phone or email entry page in V1; learner access always begins with a capability grant. |
| W2-4 | Guardian home shows linked learners and reports already sent to that guardian; no live guardian progress view in V1. |
| W2-5 | After a cohort move, the new teacher gets learner-level learning data and a score/date summary of former-cohort submissions, not their raw content. The cohort-scope authorization boundary is unchanged. |
| W2-6 | Only Owners and Admins set or change minor status (including import); audited; emits `LearnerMinorStatusChanged`. |
| W2-C1 | One Membership per User × organization; a revoked member can be re-invited; acceptance reactivates the existing Membership and sets roles from the new invitation; history and audit preserved. |
| W2-C2 | The StaffInvitation is the pending record; a Membership exists only once an invitation is accepted. |
| W2-C3 | One-time codes may be sent to any active linked contact point, verified or not; a correct code verifies it; opening a link never verifies; verification proves possession, not identity or consent. |
| W2-C4 | New events `GuardianLinkEnded` (revokes that guardian's grants and sessions for the learner, stops future reports, keeps consent history; consent validity per LG-3) and `LearnerMinorStatusChanged` (re-evaluates applicable consent rules, never grants or revokes consent, audited). |

Unchanged and preserved: Wave 1 (FD-1 to FD-5, J-6), the Core Journey (including SC1–SC4), and all Learning Trajectory decisions (C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17).

## 2. Legal gates still requiring counsel (per market)

| ID | Question | Proposed behavior (not product-approved) |
|---|---|---|
| LG-3 | Minors: age threshold; who may grant and withdraw each consent; whether a minor may withdraw a guardian's grant; validity of guardian-granted consent after a guardian link ends or the learner becomes an adult | Guardian grants where policy requires; consents persist until withdrawn; learner takes over at adulthood |
| LG-4 | Consent acquisition: permitted first-contact channel, legal basis, acceptability and evidence of organization attestation | Organization's permitted channel; attestation only where policy allows, with evidence |
| LG-5 | Withdrawal effects and consent-history retention | Not retroactive; history kept 24 months |

Existing sign-off gates 3 (session and code values), 5 and 6 (consent legal basis, minors) remain open alongside them.

## 3. Remaining non-blocking defaults and sign-off items

**Proposed defaults recorded in this wave (not yet individually confirmed):** invitation expiry 7 days, resend revokes the previous invitation (I-5); no learner dates of birth (L-4); `linked_user_id` unused in V1 (L-6); INACTIVE learner meaning (L-7); contact value change retires the contact point (CP-6); staff can mark contact points INVALID (CP-5); retired contact points keep consent history (CP-9); cohort move in one transaction (E-5); archiving a cohort does not end enrollments (E-9); possible-duplicate heuristic and no automatic merge (RI-3, RI-4); imports never delete or end enrollments (RI-6); consent does not expire unless a policy requires renewal (C-15); consent request expiry 14 days (C-16); report and consent sessions 2 hours (A-6); learner-home and guardian-home elevation 30 minutes with masked contact choice (A-8); codes never unlock siblings (A-9); guardian deactivation instead of guardian merge (§5.3); merge prompts a consent request for missing consents (M-4); merges not undoable in-product (M-5); teachers see masked contact values (§6); learner and staff roles of the same person not linked (§12); latest valid guardian consent event wins (depends on LG-3).

**Sign-off and verification items:** security lead confirmation of session, elevation and one-time-code values (gate 3); provider verification of whether one-time codes over WhatsApp need prior opt-in (DM §7.4); counsel on LG-3 to LG-5.

## 4. Domain Model and ADR wording to carry forward

| Document | Section | Change |
|---|---|---|
| DM | §5.2 `identity.membership` | One Membership per User × organization; uniqueness kept on (tenant_id, user_id); status REVOKED → ACTIVE allowed through invitation acceptance (W2-C1). Remove INVITED as a membership state, or mark it unused in V1 (W2-C2). |
| DM | §5.1 aggregates and §5.5 commands | `AcceptInvitation` creates or reactivates the Membership; role assignments from the new invitation replace ended ones (W2-C1, W2-C2). |
| Wave 1 | §5.2 membership state table | Superseded by Wave 2 §5.1a (INVITED rows removed; REVOKED → ACTIVE through re-invitation). Recorded here; Wave 1 is not reopened. |
| ADR-016 | step-up wording | Replace "OTP to a verified ContactPoint linked to the learner" with "OTP to an ACTIVE ContactPoint linked to the learner or guardian, verified or not; a correct code verifies it" (W2-C3). |
| DM | §5.B contact_point | Verification only through a correct one-time code; opening a link never verifies (W2-C3). |
| DM | §19 contracts and §20 events | Add `GuardianLinkEnded` (Roster → Identity, Reporting) and `LearnerMinorStatusChanged` (Roster → Privacy) with the W2-C4 semantics. |
| DM | §5.B roster, §7 privacy | Link recipient rule setting (W2-1) used by `ResolveContactsForLearner` and consent requests; staff-issued link setting and audited `IssueCapabilityGrant` by staff (W2-2). |
| DM | §5.4 authorization / §10 assessment queries | Former-cohort submissions: summary (date, assignment, score, status) visible to the learner's current-cohort teacher; raw content only within the submission's cohort scope (W2-5). |
| LTM | §17 evidence strip (display note, not a model change) | Former-cohort evidence units shown without an answer link for teachers outside that cohort's scope (W2-5). The Learning Trajectory Model is not reopened. |
| DM | §5.2 learner | Minor status changed only by Owner/Admin (W2-6). |

**STOP — Wave 2 closed. Wave 3 (Content) not started.**
