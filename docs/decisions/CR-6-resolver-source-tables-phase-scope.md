# CR-6: Phase scope of the resolver source tables

| Field | Value |
|---|---|
| ID | CR-6 |
| Title | Phase scope of the minimum Identity and Communication source tables required by the six X1 resolvers |
| Status | CLOSED (2026-10-04) — no new decision required. The engineering authority determined that the question is already answered by CR-3-F1 Decision 1; see "Resolution" below. No option from this record was selected as a new decision |
| Raised by | Claude Fable 5.1 (drafting agent), from finding R1 of the fresh Opus 5.5 review of the Foundation brief (2026-10-04), as relayed by the engineering authority |
| Date | 2026-10-04 |
| Rule label of affected text | CR-3-F1 Decision 1: engineering-authority decision (recorded in the CR-3 record and 16 §7); CR-4 rule 2: engineering-authority decision; Arch §35: V1.3 baseline input; DM §33: recommended implementation order; AI_WORKFLOW §11: process |
| Routing | Engineering authority |
| Decision | None made under this record. Governing decision: CR-3-F1 Decision 1 (engineering authority, 2026-10-04), unchanged |

This record was raised to document an apparent conflict. It is closed without a new decision: see "Resolution". The sections from "Affected documents" to "Decision options" are the record as originally raised and are preserved unchanged; where they describe a circular dependency or open options, the "Resolution" section governs.

## Affected documents

- `docs/decisions/CR-3-resolver-ownership.md` — CR-3-F1 Decision 1
- `docs/decisions/CR-4-foundation-prerequisite-briefs.md` — rule 2
- `docs/specifications/authoritative/17_Implementation_Architecture_V1.3.md` — §35
- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §33; §6.4 "Resolver contracts, privileges, schema and audit boundary [CR-3-F1]"; §29 Tenancy row
- `docs/specifications/authoritative/16_Reconciliation_Report_rev3.md` — §6.6 item 4; §7 row CR-3-F1
- `docs/engineering/AI_WORKFLOW.md` — §11, §11.1
- `docs/architecture/modules/foundation.md` — §16 row 4, §20 task 4a and its readiness row, §21

## Exact source references

1. **CR-3-F1 Decision 1** (CR-3 record): "The six X1 resolver functions remain Phase 1/Foundation capabilities. Their required source contracts/schemas must be available for Phase 1 implementation and testing, while the consuming domain features may remain in their later phases." And: "These remain owned and created by their owning modules (Identity & Access or Communication) under those modules' own approved briefs; this limited source-schema work counts as Phase 1 scope solely to satisfy the Phase 1 resolver capability and does not move the consuming domain features into Phase 1. Foundation creates nothing in those schemas." And, under "Reconciliation": "it is not a change to the phase plan for the consuming domain features (Arch §35 as modified by DM §33)."
2. **16 §7, row CR-3-F1, item (1)**: "the minimum source tables and columns they need, and `identity.resolver_audit`, are created by their owning modules under those modules' own approved briefs; Foundation creates nothing in those schemas (clarification; no contract text changed)". The sentence "counts as Phase 1 scope" is not carried into 16 §7 or DM §6.4.
3. **CR-4 rule 2**: "Parallel implementation under this rule is limited to each module's Phase 1 scope as defined by Architecture §35 and DM §33; it does not authorize later production-module work or bypass the Foundation/Phase 1b sequencing requirements in the governance documents."
4. **Arch §35**: "3 Challenge, Assessment & Access | … capability sessions, OTP, consent model and acquisition"; "7 Communication | ChannelAccount, templates, WhatsApp adapter, webhooks, throughput control". **DM §33 item 4**: "Phase 3: capability sessions, OTP, consent, reveal policy, late-submission hold (X10)."
5. **AI_WORKFLOW §11**: "Neither Phase 2 nor any later production module work begins until the applicable Foundation / Walking Skeleton approval state is recorded."
6. **DM §33 item 1**: "Phase 1 (Foundation): add `cm_resolver` and resolver functions (X1) …". **16 §6.6 item 4**: "Table-category registry, resolver functions (X1) and platform organization (X7) in Phase 1." **DM §29 Tenancy row**: "resolver functions return ids only | Phase 1 CI".
7. **Foundation brief §20 task 4a**: all six functions with their tests; "Depends on the minimum Identity and Communication source tables/columns and on `identity.resolver_audit`, which their owning modules create for Phase 1 under their own approved briefs". **§16 row 4** requires the closed-set, ids-only and audit tests for Foundation Phase 1 approval.

## Conflict description

- Task 4a needs source tables for all six resolvers before Foundation Phase 1 approval: `identity.membership`, `identity.capability_grant`, `identity.capability_session`, `identity.staff_invitation`, `identity.resolver_audit`, `comms.channel_account`, `comms.shared_channel_account`, `comms.channel_account_assignment`, `comms.delivery` (DM §6.4 [CR-3-F1]).
- Arch §35 and DM §33 place Communication in Phase 7 and capability sessions in Phase 3.
- CR-4 rule 2 limits parallel module work to Phase 1 scope "as defined by Architecture §35 and DM §33", and AI_WORKFLOW §11 forbids later-phase production module work before the Foundation approval state is recorded.
- Read together, Foundation Phase 1 approval waits on task 4a, task 4a waits on Communication and later-phase Identity tables, and those wait on Foundation approval.

**Observation, stated without deciding.** CR-3-F1 Decision 1 (2026-10-04, after CR-4) already contains the sentence "this limited source-schema work counts as Phase 1 scope solely to satisfy the Phase 1 resolver capability". That sentence is recorded only in the CR-3 record. It is not reflected in CR-4 rule 2, in AI_WORKFLOW §11, in DM §6.4 or in 16 §7, and Decision 1 also says it "is not a change to the phase plan". Whether Decision 1 is itself the exception to CR-4 rule 2 and AI_WORKFLOW §11, and whether it permits a Communication brief and a pre-Foundation-approval migration in `comms`, is what the engineering authority is asked to state.

## Why implementation cannot proceed without a decision

- The implementer of task 4a cannot tell whether owner-created `comms.*` and `identity.capability_session` tables may exist before Foundation approval.
- The architect cannot scope Identity and Communication briefs for this work without knowing whether it is Phase 1 scope.
- AGENTS §3.2 forbids working around an approved rule; either reading taken silently would do that.

## Decision options (as originally recorded; superseded — see "Resolution")

**Option A.** Explicitly permit the minimum resolver-source tables and columns and the required audit append boundary as a narrowly scoped Phase 1 prerequisite, created by their owning modules under their own approved briefs, without starting the consuming module features.

**Option B.** Move or defer task 4a, in whole or for the affected resolvers, until the relevant module source contracts exist under their normal phase.

Either option may require reconciliation of CR-4 rule 2, AI_WORKFLOW §11 / §11.1, the Foundation brief (§16 row 4, §20) and possibly DM §33 / 16 §6.6 item 4; which documents change depends on the decision.

## Resolution (2026-10-04) — answered by CR-3-F1 Decision 1; no new decision

Determined by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository). The drafting agent made no decision; it checked the determination against the sources below.

**The existing decision.** CR-3-F1 Decision 1 already states, in the engineering authority's words:

- "The six X1 resolver functions remain Phase 1/Foundation capabilities. Their required source contracts/schemas must be available for Phase 1 implementation and testing, while the consuming domain features may remain in their later phases."
- "“Source contracts/schemas” means only the minimum tables and columns required by the six resolver functions to implement and test their already-authoritative Phase 1 contracts, plus the required `identity.resolver_audit` capability. These remain owned and created by their owning modules (Identity & Access or Communication) under those modules' own approved briefs; this limited source-schema work counts as Phase 1 scope solely to satisfy the Phase 1 resolver capability and does not move the consuming domain features into Phase 1. Foundation creates nothing in those schemas."

That is a specific statement that the limited source-schema work is Phase 1 scope. The Option A / Option B choice recorded above was therefore not open: the substance of Option A, in the narrower form Decision 1 gives it, was already decided. Option B is not adopted.

**Why the surrounding rules do not conflict with it.**

| Rule | Reading |
|---|---|
| DM §33 item 1; 16 §6.6 item 4; DM §29 Tenancy row | Place the resolver functions (X1) in Phase 1. Decision 1 describes itself as "an interpretation/clarification of the existing Phase 1 resolver requirement", not a change to the phase plan for the consuming features |
| CR-4 rule 2 | Speaks of Identity, Tenancy and Privacy Phase 1 implementation and limits it to Phase 1 scope. Under Decision 1 the limited source-schema work is Phase 1 scope, so rule 2 is not breached |
| CR-4 rule 8 | "The resolver delivery order, exact resolver column lists, and related implementation details remain governed by CR-3-F1." CR-4 itself defers this question to CR-3-F1 |
| CR-4 rule 4 | Requires an explicit per-task readiness gate where Foundation consumes Identity- or Communication-owned tables. That gate exists (Foundation brief §20, task 4a) and is unaffected |
| AI_WORKFLOW §11 | Forbids "Phase 2 [or] any later production module work" before the Foundation approval state. Work that Decision 1 classifies as Phase 1 scope is not Phase 2 or later production module work. AI_WORKFLOW is a process document and does not override an engineering-authority architecture decision (CLAUDE.md §2 item 6) |
| Arch §35 | A V1.3 baseline input listing Communication and capability sessions in later phases. Those listings continue to govern the consuming features, which Decision 1 leaves in their later phases |

No authoritative source was found that makes the Decision 1 exception impossible.

**Scope of the exception (preserved exactly; not broadened).**

- Covered: only the minimum tables and columns the six X1 resolver functions read (DM §6.4 "Resolver contracts, privileges, schema and audit boundary [CR-3-F1]") and the required `identity.resolver_audit` capability.
- Ownership: those tables remain owned and created by Identity & Access or Communication, under those modules' own approved briefs. Foundation creates nothing in those schemas.
- Not covered: general Identity, Communication, Tenancy or Privacy implementation before Foundation approval; production domain behavior; the consuming features (for example capability sessions, deliveries, webhooks, channel-account management), which remain in their later phases; any later-phase module functionality.
- Unchanged prerequisites: each owning module still needs its own approved brief for this limited work (AGENTS §3.4), and task 4a still waits on its readiness precondition.

**Reconciliation.**

| Document | Result |
|---|---|
| This record | Closed with no new decision |
| `docs/decisions/CR-3-resolver-ownership.md` | Unchanged. CR-3-F1 remains RESOLVED |
| `docs/decisions/CR-4-foundation-prerequisite-briefs.md` | Unchanged; rule 8 already defers to CR-3-F1 |
| `docs/engineering/AI_WORKFLOW.md`, `AGENTS.md`, `CLAUDE.md` | Unchanged; no amendment is needed for the reading above |
| Documents 00–18 | Unchanged. Noted: the 16 §7 register row CR-3-F1 summarises Decision 1 without the sentence "counts as Phase 1 scope"; it does not contradict it, and the CR-3 record is the named source record |
| `docs/architecture/modules/foundation.md` | Updated: CR-6 no longer listed as open; task 4a prerequisite wording made precise (header, §2, §5 rows 4 and 10, §5.1, §17, §18, §20, §21, §22) |

## Not changed by this record

- CR-3-F1 remains RESOLVED and its text is untouched.
- CR-4 remains RESOLVED.
- CR-7, CR-8, CR-9 and CR-10 remain OPEN and independent of this record.
- No authoritative document, ADR or governance file is edited.
