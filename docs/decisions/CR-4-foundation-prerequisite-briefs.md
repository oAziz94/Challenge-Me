# CR-4: Foundation prerequisite briefs

| Field | Value |
|---|---|
| ID | CR-4 |
| Title | Foundation prerequisite briefs (Identity, Tenancy, Privacy) |
| Status | RESOLVED (2026-10-03) — decided by the engineering authority; no amendment to documents 00–18; reconciliation of the Foundation brief is pending as a separate step |
| Raised by | Claude Fable 5.1 (drafting agent); question raised by the independent Opus review as relayed by the engineering authority |
| Date | 2026-10-03 |
| Rule label of affected text | The prerequisite statement is a brief-level statement (no contract label). Related contract text: DM §33 (recommended order), Arch §35 (V1.3 baseline input), 16 §6.6 (non-blocking implementation tasks) |
| Routing | Engineering authority (process and architecture) |
| Decision | Made by the engineering authority on 2026-10-03 — see "Engineering-authority decision" below |

This record documents an unsupported requirement and the question it raises and, below, the engineering authority's decision on it. The drafting agent proposed no solution; the decision is the engineering authority's, recorded as given. The original question, source references and conflict description are preserved unchanged.

## Affected documents

- `docs/architecture/modules/foundation.md` — header "Prerequisites", §5 row 4, §16 rows 6, 9, 12, §17, §19, §20 ("Prerequisite work"), §21, §22 (FND-003, FND-012)
- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §1 (implementation readiness), §4, §6.1, §7.2, §33, §34
- `docs/specifications/authoritative/17_Implementation_Architecture_V1.3.md` — §35
- `docs/specifications/authoritative/16_Reconciliation_Report_rev3.md` — §6.6, §6.8
- `docs/specifications/authoritative/18_Remediation_Report_V1.3.md` — §1
- `CLAUDE.md` §4; `AGENTS.md` §4, §5; `docs/engineering/AI_WORKFLOW.md` §9, §11, §11.1 (process documents, not contract)

## Exact source references

Notes added when the decision was recorded (2026-10-03); the references themselves are unchanged:

- Items 1–3 quote the Foundation brief as it stood when CR-4 was raised.
- Item 14 ("ownership open, see CR-3") predates the resolution of CR-3; resolver and IdP adapter ownership has since been decided by CR-3.

**The Foundation statement**

1. `foundation.md` §20: "**Prerequisite work:** approved Identity, Tenancy and Privacy Phase 1 briefs must exist before Foundation approval. Their implementation may proceed as parallel Phase 1 work; Foundation does not absorb their domain ownership."
2. `foundation.md` §17: "Identity, Tenancy and Privacy Phase 1 prerequisite briefs | `REQUIRED — separate approved briefs` | engineering authority".
3. `foundation.md` §22: "FND-003 | **RESOLVED** — Identity/Tenancy/Privacy are explicit Phase 1 prerequisites; Foundation does not own their behavior."
4. `foundation.md` §21: implementation does not start until "the §17 scoping decision on Phase 1 slices is recorded".

**Search of the authoritative documents for the basis**

5. **Search result**: documents 00–18 contain no requirement that any implementation brief exist or be approved before another. The word "brief" in documents 00–18 refers only to the original product task brief (e.g. DM §3 X14 "Module list in the task brief differs from V1.3"). Implementation briefs are a construct of `CLAUDE.md` §4 and `AI_WORKFLOW.md`, which are process documents and "never override the contract" (`CLAUDE.md` §2 item 6).
6. **DM §33 item 1** (doc 01): "**Phase 1 (Foundation):** add `cm_resolver` and resolver functions (X1), table-category registry and CI test (§6.3), platform organization (X7), audit schema, processed_event convention, deletion ledger storage (X11)." — a single Phase 1 list; no sub-ordering.
7. **Arch §35**, row "1 Foundation" (doc 17): single list including "ActorContext incl. SystemActor, staff IdP adapter, audit, queue …"; row "1 (parallel, operational)" lists provider verification and inventory items. No ordering among Identity, Tenancy, Privacy and platform items inside Phase 1.
8. **DM §1** (doc 01): "Phases 1–3 can start immediately after X1 is accepted. … implementation starts only after the contract freeze checklist in the Reconciliation Report …".
9. **DM §4** (doc 01): "Dependency direction (no cycles): Identity, Tenancy → Roster → Privacy → Content → …" — a module dependency direction, not a brief-approval order; Foundation is not a module in this list.
10. **16 §6.6** (doc 16): titled "Non-blocking implementation tasks".

**Contract dependencies the Foundation brief itself identifies** (the factual basis it cites for the three prerequisites)

11. Platform organization row — `tenancy.organization.is_platform` with partial unique index (DM §6.1, X7); platform-level audit events are recorded under it (DM §30, W1 F-1). Tenancy-owned table (DM §4 row 3).
12. `privacy.classification_register` (DM §7.2; DM §22 "REFERENCE … versioned by migration") — read by the purge-handler registration gate (DM §34: "Classification register rows for every S2–S4 column and payload prefix, each with a purge handler"; DM §29 Privacy row). Privacy-owned (ADR-013 "classification register").
13. ActorContext construction for staff, learner and guardian — "Owns ActorContext construction" (DM §5 purpose); `GetActorContext` (DM §5.5; W1 §8). Identity-owned.
14. Resolver functions and staff IdP adapter — ownership open, see CR-3.

**Process rules that bear on the question**

15. `AGENTS.md` §4: "A task touches one module. A change that needs two modules is two tasks under one brief, each inside its schema, joined only by DM §19 contracts."
16. `AI_WORKFLOW.md` §11: "Phase 1 Foundation and the Phase 1b Walking Skeleton are treated as modules under this lifecycle, with their own briefs …"; "Neither Phase 2 nor any later production module work begins until the applicable Foundation / Walking Skeleton approval state is recorded."
17. `AI_WORKFLOW.md` §11.1: the Foundation approval checklist includes "Platform organization", "`ActorContext` / `SystemActor`", "External deletion ledger (purge-handler registration gate; every S2–S4 column has a handler)" as items Foundation approval must prove.
18. `CLAUDE.md` §4 item 2: a brief states "Phase fit … with prerequisites listed and their CI gates green".

## Conflict description

- The Foundation brief states that **approved** Identity, Tenancy and Privacy Phase 1 briefs **must exist before Foundation approval**. No authoritative document (00–18) contains that requirement, and no process document (`CLAUDE.md`, `AGENTS.md`, `AI_WORKFLOW.md`) states it either. Its origin is the disposition of Codex finding FND-003 inside the brief.
- The contract does establish *data and contract dependencies* between Foundation-phase items and three modules (items 11–13), and the process documents establish that Foundation approval must prove checklist items that depend on those modules (item 17).
- The process documents also say that Phase 1 Foundation is treated as one module-like unit with its own brief (item 16) while a task touches one module (item 15). They do not say whether module-owned Phase 1 work is carried as tasks under the Foundation brief or as separate briefs, nor in which order briefs are approved.
- As written, the statement creates a possible ordering problem that no source resolves: Foundation approval waits on three briefs, while `AI_WORKFLOW.md` §11 says no later production module work begins until Foundation approval is recorded.

## Why the conflict matters

- A prerequisite that is not grounded in the contract or the governance files is an invented workflow rule (`AGENTS.md` §3.1, §3.5; `CLAUDE.md` §3 "Open gates" list includes "workflow").
- If the requirement stands, three additional briefs (with discovery, independent review and human approval each) are on the critical path before any Foundation code; if it does not, the Foundation brief must state exactly which contracts/dependencies it needs and from whom.
- The answer determines how the §11.1 checklist items "Platform organization", "ActorContext / SystemActor" and "purge-handler registration" are proven and by which brief.
- It interacts with CR-3 (resolver and IdP adapter ownership).

## Required engineering-authority decision

**Are those three prerequisite briefs actually required before Foundation approval, or should Foundation approval depend only on explicit contracts/dependencies?**

## Downstream documents likely requiring amendment

- `docs/architecture/modules/foundation.md` header "Prerequisites", §5 row 4, §16, §17, §19, §20, §21, §22.
- `docs/engineering/AI_WORKFLOW.md` §11 / §11.1 and `AGENTS.md` §5, if the engineering authority chooses to state a brief-ordering rule for Phase 1 (governance change, not a contract change).
- Future Identity, Tenancy and Privacy briefs (scope and timing).
- No amendment to documents 00–18 is implied by this record; if the decision changes phase content, 16 §6.7 change control applies.

Position after the decision of 2026-10-03 (the list above is the original estimate, preserved):

- **CR-4 itself:** amended now — the decision and its reconciliation are recorded in this file.
- **Foundation brief** (`docs/architecture/modules/foundation.md`): downstream amendment required; not yet made (see "Reconciliation").
- **Governance files** (`CLAUDE.md`, `AGENTS.md`, `docs/engineering/AI_WORKFLOW.md`): no amendment required by this decision.
- **Documents 00–18:** no amendment required by this decision.
- **Future Identity, Tenancy and Privacy briefs:** written under rules 1, 2 and 4 of the decision when those briefs are drafted.

## Implementation impact if unresolved

- The Foundation brief cannot leave `DRAFT`: its approval precondition is undefined.
- Phase 1 work cannot be partitioned into tasks; `AI_WORKFLOW.md` §11.1 checklist ownership per item stays ambiguous.
- Risk of circular waiting between Foundation approval and module briefs.
- Agents cannot determine which brief authorizes Phase 1 work in `identity`, `tenancy` or `privacy` schemas.

## Proposed solution

None. This record intentionally proposes no resolution.

## Engineering-authority decision

**Status: RESOLVED — 2026-10-03**

Identity, Tenancy and Privacy Phase 1 implementation briefs are **not mandatory prerequisites for approval of the Foundation brief**.

The following rules apply:

1. **Separate ownership briefs**
   Identity, Tenancy and Privacy remain separate implementation briefs for their respective module-owned Phase 1 work. Foundation does not absorb their domain ownership.

2. **Parallel Phase 1 implementation**
   Identity, Tenancy and Privacy Phase 1 implementation may proceed in parallel with Foundation implementation, provided each module's implementation is governed by its own approved brief and satisfies its applicable prerequisites and gates.

   Parallel implementation under this rule is limited to each module's Phase 1 scope as defined by Architecture §35 and DM §33; it does not authorize later production-module work or bypass the Foundation/Phase 1b sequencing requirements in the governance documents.

3. **Foundation brief approval**
   Approval of the Foundation brief does not require the Identity, Tenancy and Privacy briefs to already be approved solely by virtue of their cross-module dependencies.

4. **Foundation implementation dependencies**
   Foundation implementation must still respect explicit cross-module dependencies. Where a Foundation task consumes Identity-, Tenancy-, Privacy-, or Communication-owned contracts, tables, or capabilities, that dependency must be represented by an explicit contract/readiness gate. Parallel implementation does not waive the dependency.

   For this decision, an “explicit contract/readiness gate” means a per-task dependency precondition recorded in the applicable implementation brief, identifying the required cross-module contract or capability and the evidence required to confirm that it is available before the dependent task proceeds.

5. **Foundation Phase 1 approval**
   Foundation Phase 1 approval remains conditional on all Foundation acceptance criteria being actually implemented, tested, and evidenced, including required cross-module capabilities owned by Identity, Tenancy, Privacy, or other modules.

6. **No broad module-ordering rule**
   "Identity/Tenancy/Privacy are prerequisites for Foundation" must not be interpreted as a general requirement that those modules or their briefs be approved before Foundation approval. The dependency is on the specific contracts/capabilities required by Foundation's acceptance criteria.

7. **Ownership remains unchanged**
   Foundation consuming another module's capability does not transfer ownership of that capability.

8. **CR-3-F1 remains separate**
   This decision does not resolve CR-3-F1. The resolver delivery order, exact resolver column lists, and related implementation details remain governed by CR-3-F1.

### Rationale

The authoritative Phase 1 and architecture documents do not establish an approval-order dependency requiring Identity, Tenancy, or Privacy briefs to be approved before the Foundation brief. The governance documents require an approved brief before implementation of the applicable module, but do not establish that those briefs must precede Foundation brief approval.

Foundation does, however, have concrete implementation and verification dependencies on capabilities owned by other modules. Those dependencies must therefore be enforced at the task/readiness and Foundation Phase 1 acceptance level rather than by imposing a blanket prerequisite on Foundation brief approval.

This preserves module ownership, permits controlled parallel Phase 1 work, and prevents Foundation Phase 1 from being declared complete without evidence for its actual cross-module dependencies.

## Reconciliation

| Document | Result | Note |
|---|---|---|
| This record (CR-4) | RESOLVED (2026-10-03) | Decision recorded above |
| Documents 00–18 | unchanged | No document requires amendment solely from this decision; no contract text is superseded |
| `02_Architecture_Decision_Records_V1.4.md` | unchanged | No ADR amendment is required |
| `16_Reconciliation_Report_rev3.md` | unchanged | No row is required in §2.2, §6.4 or §7 |
| `CLAUDE.md`, `AGENTS.md`, `docs/engineering/AI_WORKFLOW.md` | unchanged | No governance amendment is required by this decision |
| `docs/architecture/modules/foundation.md` | pending | The Foundation brief will be reconciled separately using this resolved decision; until then its prerequisite wording is read subject to rule 6 |

## Not changed by this decision (noted)

- CR-3-F1 (resolver delivery order and column lists) remains OPEN (rule 8).
- CR-1-F1 (SystemActor permission matrix) remains OPEN.
- The stack/tooling ADR and the provider ADRs remain outstanding.
- CR-1, CR-2 and CR-3 are untouched.
