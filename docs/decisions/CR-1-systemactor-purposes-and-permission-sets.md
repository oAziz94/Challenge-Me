# CR-1: SystemActor purposes and permission sets

| Field | Value |
|---|---|
| ID | CR-1 |
| Title | SystemActor purposes and permission sets |
| Status | RESOLVED (2026-10-03) — purpose set decided and reconciled; follow-up item CR-1-F1 (permission matrix) remains OPEN |
| Raised by | Claude Fable 5.1 (drafting agent) on behalf of the Foundation brief review; conflict reported by the independent Opus review as relayed by the engineering authority |
| Date | 2026-10-03 |
| Rule label of affected text | ADR-012: Accepted ADR (EXISTING ARCHITECTURAL RULE); DM §5.3: reconciled implementation contract; W1 §2: closed wave glossary |
| Routing | Engineering authority (architecture). Product owner only if the decision changes behavior. |
| Decision | Made by the engineering authority on 2026-10-03 — see "Engineering-authority decision" below |

This record documents a conflict and, below, the engineering authority's decision on it. The drafting agent proposed no solution; the decision text is the engineering authority's, recorded as given.

## Affected documents

- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-012 "Tenant context"; ADR-012 "V1.4 reconciliation amendments"
- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §5.3, §5.4, §5.5, §6.5, §14.3, §25.2, §25.5, §25.9
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — §2 "Actors"
- `docs/specifications/authoritative/16_Reconciliation_Report_rev3.md` — §6.4 (errata register; no entry for this item)
- `docs/architecture/modules/foundation.md` — §3 item 5, §7, §16 row 6, §18, §20 task 4, §22 (FND-001)

## Exact source references

1. **ADR-012 "Tenant context"** (doc 02): "ActorContext kinds: StaffActor (user, organization, scoped roles), LearnerActor (learner, session scope), GuardianActor, and **SystemActor(tenant, purpose)** with purpose SCHEDULER, WEBHOOK, WORKER, PROJECTION or REGRADE and an explicit permission set per purpose."
2. **ADR-012 "V1.4 reconciliation amendments"** (doc 02): three bullets — resolver role (DM X1), platform organization (DM X7), platform audit / break-glass / rejected elevated access (W1 F-1, FD-4, F-5). None mentions SystemActor purposes or permission sets.
3. **DM §5.3 "ActorContext (value object)"** (doc 01), row `purpose`, System column: "SCHEDULER, WEBHOOK, WORKER, PROJECTION, REGRADE, IDENTITY, PURGE".
4. **W1 §2 "Actors"** (doc 05), row "System actor": "Scheduler, webhook handler, worker, projection, regrade, identity, purge. Always bound to one organization and a declared purpose" — source column "ADR-012, DM §5.3".
5. **Uses of the two additional purposes in the DM** (doc 01): §5.5 command table, `ResolveStaffLogin` — "IdP callback (SystemActor IDENTITY)"; §25.9 `ExchangeCapabilityToken` — "TX (SystemActor IDENTITY, tenant)". Other uses found: "SystemActor WEBHOOK" (§14.3 webhook processing), "SystemActor WORKER" (§25.2), "SystemActor SCHEDULER" (§25.5), and §6.5 "open TenantTransaction(cm_app, tenant_id, SYSTEM, purpose)". No transaction listing naming `SystemActor PURGE` was located by search.
6. **DM §5.4 "Authorization"** (doc 01): `authorize(actor, permission, resourceScope{…})` with a PROPOSED DEFAULT permission matrix whose columns are OWNER, ADMIN, TEACHER (scoped), SAFEGUARDING_LEAD. No column or row for system actors or purposes.
7. **Search result**: the phrases "permission set" / "explicit permission" occur once in documents 00–18 — the ADR-012 sentence quoted in item 1. No table, list or section defining the permissions of any SystemActor purpose was located.
8. **Document 00 precedence**: documents 01 and 02 are both part of the authoritative contract (item 1); no rule ranks one above the other. **16 §6.4** contains no erratum for this passage.

## Conflict description

- **Purpose list.** ADR-012 base text enumerates five purposes. DM §5.3 and W1 §2 enumerate seven (the same five plus IDENTITY and PURGE). The ADR-012 V1.4 amendments do not add the two purposes, and the errata register does not record the ADR-012 sentence as superseded.
- **Permission sets.** ADR-012 requires "an explicit permission set per purpose". No document in the authoritative set defines such a permission set for any purpose (five or seven). The only permission matrix (DM §5.4) covers staff roles only.

## Why the conflict matters

- `SystemActor` and `TenantTransaction` are Phase 1 Foundation items (Arch §35 row "1 Foundation"; AI_WORKFLOW §11.1). The shared type must enumerate a closed set of purposes.
- Authorization of system-initiated work (jobs, webhooks, scheduler, projection, regrade, login resolution, purge) depends on what each purpose is permitted to do. Without a contract, an implementer would have to invent permissions — prohibited by `AGENTS.md` §3.1 and §3.5.
- The Foundation brief currently treats the seven-purpose list as "closed by existing reconciliation" (FND-001). The reconciliation source for that statement has not been cited; this record exists so the engineering authority can confirm or correct it.
- ADR-012 implementation requires independent human-engineer review before Phase 1 exits (Remediation §1); an unresolved definition of the actor model blocks that review.

## Required engineering-authority decision

**Which SystemActor purposes are authoritative, and what permission set applies to each?**

## Downstream documents likely requiring amendment

- ADR-012 (V1.4 amendment section) and/or DM §5.3–§5.4, depending on the decision; revision bump and regenerated reconciliation matrix per 16 §6.7.
- 16 §6.4 errata register (if a passage is declared superseded).
- `docs/architecture/modules/foundation.md` §3, §7, §16 row 6, §18, §22.
- Future Identity, Privacy/Tenancy (purge), Evaluation (regrade), Learning (projection), Communication (webhook) briefs.
- DM §29 test catalogue, if permission-set tests are required.

## Implementation impact if unresolved

- The `ActorContext` / `SystemActor` shared type cannot be finalized (Foundation sequencing task 4).
- No authorization rule for system actors can be implemented or tested; `authorize(...)` behavior for `kind = SYSTEM` is undefined.
- The Foundation brief cannot have its §5 row 1/row 12 and §16 row 6 validated as contract-conformant, and cannot be approved on this point.
- Every later module that runs jobs, webhooks, projections, regrades or purges inherits the gap.

## Proposed solution

None. This record intentionally proposes no resolution.

---

## Engineering-authority decision (2026-10-03)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-03; the authority's name is not recorded in the repository — see `foundation.md` §17 "Named human authorities").

### Decision — SystemActor purposes

The authoritative SystemActor purpose set is:

`SCHEDULER`, `WEBHOOK`, `WORKER`, `PROJECTION`, `REGRADE`, `IDENTITY`, `PURGE`

The five-purpose wording in ADR-012 is superseded by this decision.

Rationale (as given):
- DM §5.3 and W1 §2 explicitly define the seven-purpose model.
- The DM contains concrete IDENTITY usage in `ResolveStaffLogin` and `ExchangeCapabilityToken`.
- PURGE is retained as the dedicated system purpose for purge operations.
- The seven-purpose model is therefore the intended implementation contract, but the existing ADR-012 wording must be formally reconciled rather than silently treated as already reconciled.

### Decision — SystemActor permissions

- SystemActor authorization is purpose-specific and least-privilege.
- Each SystemActor purpose must have an explicit permission set.
- SystemActor permission sets are separate from the staff-role permission matrix in DM §5.4.
- A SystemActor may exercise only permissions registered for its declared purpose and applicable tenant scope.
- The exact permission names and permission matrix are **not** decided here and must not be invented. The exact SystemActor permission matrix must be added as an explicit authoritative authorization contract before SystemActor authorization is implemented.

## Reconciliation recorded (16 §6.7 change control)

| Artifact | Revision | Section | Change |
|---|---|---|---|
| `02_Architecture_Decision_Records_V1.4.md` | V1.4 → V1.4.1 (header note) | ADR-012 "V1.4 reconciliation amendments" | New bullet "**SystemActor purposes [CR-1]**": seven purposes; "Tenant context" five-purpose wording superseded; purpose-specific least-privilege permission sets separate from DM §5.4; permission matrix outstanding (CR-1-F1) |
| same | same | Amendment index table, row ADR-012 | Added "CR-1 (V1.4.1)" |
| `16_Reconciliation_Report_rev3.md` | rev. 3 → rev. 3.1 (header note) | New §7 "Change-Control Register (post-freeze)" | Entry CR-1: date, decider, decision, affected tags, artifacts and revisions, matrix/errata pointers, open follow-up |
| same | same | §2.2 matrix | New row `CR-1` |
| same | same | §6.4 errata register | New row: ADR set V1.4, ADR-012 "Tenant context" five purposes → superseded by CR-1; governing text DM §5.3 and the ADR-012 amendment |
| `01_Domain_Model_…rev1.8.md` | unchanged | — | No edit necessary: §5.3 already lists the seven purposes |
| `05_Spec_Kit_Part2_Wave_1_Foundations.md` | unchanged | — | Closed wave, never edited; §2 already lists the seven purposes |

The ADR-012 base sentence was not rewritten (V1.3 text is left unchanged and superseded by tagged amendment, as with every other reconciled item).

## Follow-up architecture item — CR-1-F1 (OPEN)

**SystemActor permission matrix.** No artifact defines the permission names or the permission set for any of the seven purposes. Required before any SystemActor authorization is implemented:

- an explicit authoritative authorization contract listing, per purpose, the permissions that purpose may exercise and its tenant-scope rule;
- added through change control (new change record, origin tag, artifact revision, matrix row);
- owner: engineering authority (product owner if any permission changes behavior).

Until CR-1-F1 is closed: the `SystemActor` shared type may enumerate the seven purposes, but `authorize(...)` behavior for `kind = SYSTEM` must not be implemented, and no agent may define, assume or default any permission for any purpose.

Not yet reconciled outside this record (noted, not changed here): `docs/architecture/modules/foundation.md` still describes the seven-purpose list as "closed by existing reconciliation" (FND-001) and does not reference CR-1 or CR-1-F1; document `00_README_Index.md`, `CLAUDE.md` §2 and 16 §6.8 still name the freeze revisions "V1.4" and "rev. 3".
