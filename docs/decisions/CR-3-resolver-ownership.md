# CR-3: Resolver ownership

| Field | Value |
|---|---|
| ID | CR-3 |
| Title | Resolver ownership (cm_resolver, resolver functions, resolver audit, staff IdP adapter) |
| Status | RESOLVED (2026-10-03) — decided by the engineering authority and reconciled in documents 01 (rev. 1.8.1), 02 (V1.4.3), 16 (rev. 3.3) and the Foundation brief; follow-up item CR-3-F1 RESOLVED (2026-10-04): Decisions 1, 2a, 2b, 3 and 4 by the engineering authority; Decision 2b reconciled in documents 01 (rev. 1.8.2), 02 (V1.4.4), 16 (rev. 3.4); Decisions 1, 2a, 3 and 4 reconciled in documents 01 (rev. 1.8.4), 02 (V1.4.6), 16 (rev. 3.6) and the Foundation brief |
| Raised by | Claude Fable 5.1 (drafting agent); conflict reported by the independent Opus review as relayed by the engineering authority |
| Date | 2026-10-03 |
| Rule label of affected text | DM X1: P1 correction applied to ADR-012 (EXISTING ARCHITECTURAL RULE); DM §6.4; W1 T-6: EXISTING; Arch §35: V1.3 baseline input |
| Routing | Engineering authority (architecture) |
| Decision | Made by the engineering authority on 2026-10-03 — see "Engineering-authority decision" below |

This record documents a conflict and, below, the engineering authority's decision on it. The drafting agent proposed no solution; the decision is the engineering authority's, recorded as given. The original conflict description and evidence are preserved unchanged. (Reference 19–21 below quote the Foundation brief as it stood before this decision.)

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §3 X1, §4, §5 (purpose; §5.5 `ResolveStaffLogin`, "Provider boundary"), §6.4, §14 (tables; webhook flow), §22, §29, §33
- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-002; ADR-012 "V1.4 reconciliation amendments"; ADR-013 "Modules and ownership", "Enforcement"
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — §3, §4.1 T-6, §7, §12
- `docs/specifications/authoritative/17_Implementation_Architecture_V1.3.md` — §29, §35
- `docs/architecture/modules/foundation.md` — §3 item 3, §4, §7, §11, §14, §16, §17, §20

## Exact source references

**What DM §33, W1 and Arch §35 say**

1. **DM §33 item 1** (doc 01): "**Phase 1 (Foundation):** add `cm_resolver` and resolver functions (X1), table-category registry and CI test (§6.3), platform organization (X7), audit schema, processed_event convention, deletion ledger storage (X11)."
2. **Arch §35**, row "1 Foundation" (doc 17): "repository, CI/CD, module schemas, architecture tests, DB roles, TenantTransaction, forced RLS, ActorContext incl. SystemActor, staff IdP adapter, audit, queue with leases/admission control, security gates in CI".
3. **W1 T-6** (doc 05): "Pre-tenant lookups (staff login, capability token, webhook routing) use only the closed set of audited resolver functions, which return identifiers only." — EXISTING (DM X1, §6.4).
4. **W1 §7 Data Ownership** (doc 05), row "Resolver audit": owner "Identity & Access"; "operational table (hashed)"; append-only; R6.
5. **W1 §3.1 "Staff sign-in and organization selection"** (doc 05): "Challenge Me lists the person's active memberships through the audited login resolver (DM X1) …".

**Role and functions**

6. **DM §3 X1 "Correction"** (doc 01): "Add role `cm_resolver` (NOLOGIN, BYPASSRLS) that owns a closed set of SECURITY DEFINER resolver functions …: `resolve_staff_memberships(user_id)`, `resolve_capability_token(token_hash)`, `resolve_capability_session(session_hash)`, `resolve_invitation(token_hash)`, `resolve_inbound_channel(provider, provider_account_ref)`, `resolve_delivery_by_provider_message(provider, provider_message_id)`. Every call is audited." ADR amendment: ADR-012.
7. **DM §6.4 "Roles and resolver functions"** (doc 01; located in §6 "Tenancy"): role row "cm_resolver | NOLOGIN | BYPASSRLS; owns resolver functions; SELECT on the few columns they read (X1)"; "cm_app … EXECUTE on resolver functions"; "Each resolver returns identifiers only, validates input shape, is rate-limited by its caller, and writes an audit record via a SECURITY DEFINER insert into `identity.resolver_audit` (OPERATIONAL, hashed inputs)."
8. **ADR-012 V1.4 amendment** (doc 02): "`cm_resolver` (NOLOGIN, BYPASSRLS) owns a closed, audited set of SECURITY DEFINER resolver functions returning identifiers only (staff memberships, capability token and session, invitation, inbound channel, delivery by provider message)."
9. **DM §22** (doc 01): row "identity.resolver_audit | OPERATIONAL | S1 (hashed) | R6 | append-only".
10. **DM §29 Tenancy row** (doc 01): "… resolver functions return ids only | Phase 1 CI".

**Module ownership statements**

11. **DM §4 Domain Map** (doc 01), row 1 "Identity & Access | identity": aggregate roots User, Membership, CapabilityGrant, CapabilitySession, OtpChallenge, ElevatedAccessGrant. Resolver functions and `cm_resolver` are not listed in any module row.
12. **ADR-013 "Modules and ownership"** (doc 02): Identity & Access owns "User, Membership, RoleAssignment (role × scope), staff sessions, CapabilityGrant, OTP challenges"; Communication owns "ChannelAccount, Template, Message, Delivery, webhook normalization, OtpSender". Resolver functions are not listed for any module.
13. **ADR-013 "Enforcement"** (doc 02): "One PostgreSQL schema per module; each module's data access touches only its schema …".

**Cross-module data read by the two webhook resolvers**

14. **DM §14.1** (doc 01): `comms.channel_account` — "UNIQUE (provider, provider_account_ref) -- resolver lookup (X1)"; `comms.shared_channel_account` (PLATFORM, X7) with `provider_account_ref UNIQUE`; `comms.delivery` (TENANT). All in schema `comms` (Communication).
15. **DM §14.3 "Webhook processing"** (doc 01): "Worker ProcessWebhookEvent (SystemActor WEBHOOK): tenant := resolve_delivery_by_provider_message(...) for status events or resolve_inbound_channel(provider, account_ref) + contact match for inbound".

**Staff IdP adapter**

16. **DM §5 "Purpose"** (doc 01): Identity & Access — "Map verified staff identities to memberships and scoped roles; … Owns ActorContext construction."
17. **DM §5.5** (doc 01): command `ResolveStaffLogin` — "IdP callback (SystemActor IDENTITY) | upsert User/ExternalIdentity; list memberships via resolver; client chooses active org"; "**Provider boundary.** `AuthProvider.verify(token) → {provider, subject, email, email_verified, auth_time, amr}`. No IdP organization or role concept is read."
18. **Arch §29** (doc 17): lists `AuthProvider` among provider ports; adapters translate provider types; SDK types never reach domain code.

**What the current Foundation brief says**

19. `foundation.md` §7: "Resolver functions, `cm_resolver`-owned SECURITY DEFINER functions, `identity.resolver_audit` | Identity (DM X1, §6.4, §22) | Creates the `cm_resolver` **role** only (DM §6.4) | `[AR]`; functions → Phase 1 Identity slice `[UQ §17]`".
20. `foundation.md` §7: "Staff IdP adapter (`AuthProvider.verify`) | Identity (DM §5.5 "Provider boundary"; ADR-002) | Not Foundation; Arch §35 lists it in Phase 1 → Identity slice | `[AR]` / `[UQ §17]`".
21. `foundation.md` §4 (Non-goals): "no Identity tables, resolver functions, IdP adapter …"; §14: "resolver functions return ids only — Identity slice test, harness in Phase 1".

## Conflict description

1. **Phase assignment vs module assignment.** DM §33 item 1 and Arch §35 place `cm_resolver`, the resolver functions and the staff IdP adapter in "Phase 1 (Foundation)". These are phase statements. The Foundation brief assigns the functions, the audit table and the adapter to the Identity module and keeps only the role. Neither DM §33 nor Arch §35 names a module owner.
2. **No module-ownership statement exists for the functions.** DM X1, DM §6.4 and the ADR-012 amendment state that the *database role* `cm_resolver` "owns" the functions. A database role is not one of the 14 modules. DM §4 and ADR-013 list the resolver functions under no module. DM §6.4 sits inside §6 "Tenancy", not §5 "Identity & Access".
3. **Partial indications point in different directions.** `identity.resolver_audit` is in schema `identity` (DM §22) and W1 §7 names Identity & Access as owner of the resolver *audit*. Four functions read Identity data (memberships, capability token, capability session, invitation). Two functions — `resolve_inbound_channel` and `resolve_delivery_by_provider_message` — read Communication tables (`comms.channel_account` / `comms.shared_channel_account`, `comms.delivery`) and are called from Communication's webhook worker.
4. **Staff IdP adapter.** Arch §35 lists it in Phase 1 Foundation; DM §5.5 defines the provider boundary inside Identity & Access; Arch §29 lists `AuthProvider` as a provider port. No source states which module owns the adapter code or whether Foundation delivers it.

## Why the existing evidence does not establish module ownership

- "Owned by `cm_resolver`" is a PostgreSQL object-ownership statement, not a module assignment.
- A phase list (DM §33, Arch §35) says *when*, not *who*.
- The audit table's schema (`identity`) establishes the owner of that table only.
- The location of §6.4 under "Tenancy" and of the audit table under `identity` are inconsistent with each other as ownership signals.
- ADR-013 "Enforcement" (each module's data access touches only its schema) is not reconciled anywhere with functions that read `comms` tables if those functions were owned by a module other than Communication, nor with a single owner for functions spanning `identity` and `comms`.

## Relevant cross-module data dependencies

| Function | Tables read (per DM) | Schema | Called from |
|---|---|---|---|
| `resolve_staff_memberships(user_id)` | `identity.membership` (DM §5.2) | identity | Identity `ResolveStaffLogin` (DM §5.5) |
| `resolve_capability_token(token_hash)` | `identity.capability_grant` (DM §5.2) | identity | Identity `ExchangeCapabilityToken` (DM §25.9) |
| `resolve_capability_session(session_hash)` | `identity.capability_session` (DM §5.2) | identity | Identity |
| `resolve_invitation(token_hash)` | `identity.staff_invitation` (DM §5.2) | identity | Identity |
| `resolve_inbound_channel(provider, provider_account_ref)` | `comms.channel_account`, `comms.shared_channel_account` (DM §14.1, X7) | comms | Communication `ProcessWebhookEvent` (DM §14.3) |
| `resolve_delivery_by_provider_message(provider, provider_message_id)` | `comms.delivery` (DM §14.1) | comms | Communication `ProcessWebhookEvent` (DM §14.3) |

The table-to-function mapping above is inferred from function names, parameters and the X1 annotation "resolver lookup (X1)" on `comms.channel_account`; the contract does not list the tables each function reads beyond "SELECT on the few columns they read" (DM §6.4).
| all | INSERT into `identity.resolver_audit` (DM §6.4) | identity | every resolver |

Every resolver, including the two that read `comms`, writes to an `identity` table.

## Why the conflict matters

- `AGENTS.md` §4 and ADR-013 prohibit direct and indirect cross-module table access, including helper functions whose purpose is querying another module's schema. Ownership of BYPASSRLS functions spanning two schemas must be explicit for the architecture test to be written.
- Resolver functions are the only BYPASSRLS path besides break-glass; they are central to ADR-012, which requires human-engineer review before Phase 1 exits (Remediation §1).
- Phase 1 briefs cannot be scoped ("a task touches one module", `AGENTS.md` §4) until the owner of each function, the audit table and the IdP adapter is known.
- DM §29 requires "resolver functions return ids only" as a Phase 1 CI test; the owning brief must carry it.

## Required engineering-authority decision

**Which module owns `cm_resolver` and each resolver function, and what is the ownership/boundary of the staff IdP adapter?**

## Downstream documents likely requiring amendment

- DM §4 and/or ADR-013 "Modules and ownership" (ownership of resolver functions); DM §6.4; possibly DM §33 item 1 wording — with revision bump and regenerated matrix per 16 §6.7.
- `docs/architecture/modules/foundation.md` §3, §4, §7, §14, §16, §17, §20.
- Future Identity and Communication briefs; architecture-test definition (permitted exceptions to schema isolation, if any).
- Provider-selection ADR for the staff IdP.

## Implementation impact if unresolved

- The Foundation brief's boundary for Phase 1 cannot be validated; items 3 and 6 of the AI_WORKFLOW §11.1 checklist (roles; ActorContext) depend on it.
- No brief can lawfully include the two webhook resolvers without risking a module-boundary violation.
- Staff login (W1 §3, AC 6–10) and the Phase 1b walking skeleton (capability link → session) cannot be sequenced.
- The architecture test for cross-schema access cannot be specified without knowing whether resolver functions are a named exception.

## Proposed solution

None. This record intentionally proposes no resolution.

---

## Engineering-authority decision (2026-10-03)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-03; the authority's name is not recorded in the repository).

1. Foundation owns `cm_resolver` and the six resolver functions defined by DM X1: `resolve_staff_memberships`, `resolve_capability_token`, `resolve_capability_session`, `resolve_invitation`, `resolve_inbound_channel`, `resolve_delivery_by_provider_message`.
2. These six resolver functions constitute a closed, explicit exception to the normal module-schema isolation rule.
3. Foundation must not receive general access to Identity or Communication schemas. Only the six named X1 resolver functions may perform the contractually required cross-module reads.
4. `identity.resolver_audit` remains owned by Identity & Access.
5. The resolver functions may append their required audit records through the explicit X1 audit boundary described by DM §6.4. No additional Identity write permissions or table grants are invented.
6. Identity & Access owns: Identity-domain behavior; ActorContext construction; the `AuthProvider` provider port; the concrete staff IdP adapter.
7. The Arch §35 listing of the staff IdP adapter under Phase 1 is a delivery-phase assignment, not a module-ownership declaration.
8. Foundation owns the resolver infrastructure and the corresponding architecture/boundary tests.
9. No exact table permissions, grants or schema privileges are established beyond what the authoritative X1 / §6.4 text explicitly states.

The closed-X1 exception is preserved exactly as decided: six named functions, not generalized, not a mechanism for arbitrary cross-module queries.

## Reconciliation recorded (16 §6.7 change control)

| Artifact | Revision | Section | Change |
|---|---|---|---|
| `01_Domain_Model_and_Implementation_Contract_rev1.8.md` | rev. 1.8 → 1.8.1 (header note) | §6.4 | New paragraph "**Ownership and boundary [CR-3]**" stating decisions 1–9 |
| `02_Architecture_Decision_Records_V1.4.md` | V1.4.2 → V1.4.3 (header note) | ADR-012 "V1.4 reconciliation amendments" | New bullet "**Resolver ownership [CR-3]**" (decisions 1, 3, 4, 5, 8, 9) |
| same | same | ADR-013 "V1.4 reconciliation amendments" | New bullet "**Resolver exception and IdP adapter ownership [CR-3]**" (decisions 2, 6, 7; exception limited to the six functions) |
| same | same | Amendment index table | Rows ADR-012 and ADR-013 gain "CR-3 (V1.4.3)" |
| `16_Reconciliation_Report_rev3.md` | rev. 3.2 → 3.3 (header note) | §2.2 matrix | New row `CR-3` |
| same | same | §7 change-control register | New row CR-3 (decision 1–9, affected tags, artifacts and revisions); source-records line extended |
| same | — | §6.4 errata register | No row: CR-3 supersedes no passage (it assigns an owner the contract had not named and adds a named exception) |
| `docs/architecture/modules/foundation.md` | DRAFT (not approved) | §1, §3 item 3a, §4, §5 row 1 and §5.1, §7, §7 boundary statement, §11, §14, §16 row 4, §18, §20 task 4a, §22 | Resolver role and six functions listed as Foundation-owned Phase 1 platform capability; statement assigning the functions to the Identity slice removed; `identity.resolver_audit`, `AuthProvider` port and concrete staff IdP adapter kept Identity-owned; closed-set boundary tests added |
| `05_Spec_Kit_Part2_Wave_1_Foundations.md`, `17_Implementation_Architecture_V1.3.md` | unchanged | — | W1 is a closed wave (T-6 and §7 "Resolver audit" are consistent with the decision); Arch §35 is a baseline input whose listing is now read as a delivery-phase assignment per DM §6.4 [CR-3] |

Base text was not rewritten in any document; the decision is recorded by tagged paragraph/amendment.

## Follow-up item — CR-3-F1 (RESOLVED 2026-10-04)

**Resolver delivery order and column list.** The six Foundation-owned functions read columns of tables owned and created by Identity & Access and Communication (see the dependency table above) and append to Identity's `identity.resolver_audit`. The contract states only "SELECT on the few columns they read (X1)" (DM §6.4): it does not list the columns per function, and it does not state the order in which those tables and the functions are delivered inside Phase 1. Until decided, no column list, grant or delivery order is assumed. This interacts with CR-4 (prerequisite briefs) and is recorded in the Foundation brief §18 item 6. Owner: engineering authority.

The paragraph above is the follow-up as originally recorded and is preserved unchanged. Decisions on it are recorded below as they were made. All of its decision points are now decided and reconciled; see "CR-3-F1 — status" below. Statements inside Decisions 1, 2a and 2b that CR-3-F1 "remains OPEN" describe the position when each was recorded.

### CR-3-F1 Decision 1 — Resolver delivery and source-schema availability (engineering-authority decision, 2026-10-04)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository). The drafting agent proposed no solution; the decision is recorded as given.

The six X1 resolver functions remain Phase 1/Foundation capabilities. Their required source contracts/schemas must be available for Phase 1 implementation and testing, while the consuming domain features may remain in their later phases.

“Source contracts/schemas” means only the minimum tables and columns required by the six resolver functions to implement and test their already-authoritative Phase 1 contracts, plus the required `identity.resolver_audit` capability. These remain owned and created by their owning modules (Identity & Access or Communication) under those modules' own approved briefs; this limited source-schema work counts as Phase 1 scope solely to satisfy the Phase 1 resolver capability and does not move the consuming domain features into Phase 1. Foundation creates nothing in those schemas.

This decision does not determine:

- the exact returned-data contracts;
- the read-column lists;
- grants;
- resolver implementation mechanism;
- webhook lookup-key semantics.

Those remain separate CR-3-F1 decisions.

**Reconciliation.** Decision 1 is an interpretation/clarification of the existing Phase 1 resolver requirement (DM §33 item 1; DM §34; DM §3 X1); it is not a change to the phase plan for the consuming domain features (Arch §35 as modified by DM §33). No authoritative document (00–18), ADR or governance file was amended for it, and no entry was added to the Reconciliation Report. The Foundation brief has not been updated for this decision; that is a separate step. The Identity & Access and Communication briefs referred to above do not exist yet; nothing here states or implies that they exist or are approved.

### CR-3-F1 Decision 2a — Identity resolver returned-data contracts (engineering-authority decision, 2026-10-04)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository). The decision is recorded as given.

The four Identity-side resolver contracts return only the minimum identifiers required to establish tenant context and continue the authoritative workflow:

- `resolve_staff_memberships(user_id)` → set of `tenant_id` values for the user's active memberships.
- `resolve_capability_token(token_hash)` → `(tenant_id, grant_id)` or not found.
- `resolve_capability_session(session_hash)` → `tenant_id` or not found.
- `resolve_invitation(token_hash)` → `tenant_id` or not found.

No additional row identifiers are returned unless an authoritative consumer later requires them.

For staff memberships, the resolver returns only tenants where the user's membership is ACTIVE. Skipping TERMINATED organizations (W1 §3.1) is performed by the calling Identity workflow after resolution; the resolver performs no Tenancy read. An empty set means no active membership.

For capability tokens, capability sessions and invitations, the resolver locates the record and returns its tenant; status, expiry and revocation are validated by the tenant-scoped Identity workflow after resolution. For tokens this restates DM §25.9; for sessions and invitations it is decided here because the sources are silent. Not-found behavior and malformed-input handling remain as the contract already states them.

This decision does not determine:

- read-column lists;
- grants;
- resolver implementation mechanism;
- webhook resolver contracts or lookup-key semantics;
- any additional returned fields not required by the authoritative consumers.

**Source-derived and decided portions.**

| Portion | Basis |
|---|---|
| `resolve_capability_token` → `(tenant_id, grant_id)` or not found | Source-derived: restates DM §25.9 |
| Token status and expiry validated in the tenant transaction after resolution | Source-derived: DM §25.9 |
| Staff memberships: only ACTIVE memberships are listed | Source-derived: W1 §3.1 step 3; DM §23 index "(user_id) WHERE status = 'ACTIVE'" labelled "login resolver" |
| Staff memberships: the return is a set of `tenant_id` values and nothing more | Decided here; the sources say only "list memberships via resolver" (DM §5.5) and "identifiers only" (X1, §6.4) |
| TERMINATED organizations skipped by the calling Identity workflow, not by the resolver | Decided here; W1 §3.1 requires the skipping but does not say where it happens |
| `resolve_capability_session` → `tenant_id`; `resolve_invitation` → `tenant_id` | Decided here; the sources say only "identifiers only" |
| Session and invitation status, expiry and revocation validated after resolution | Decided here; the sources are silent on where these checks run |
| Not-found and malformed-input behavior | Unchanged; as the contract already states (DM §6.4, §25.9; W1 §12) |

**Reconciliation.** Decision 2a is recorded in this follow-up only. No authoritative document (00–18), ADR or governance file was amended for it, and the Foundation brief has not been updated. Downstream reconciliation will occur after CR-3-F1 is fully resolved.

### CR-3-F1 Decision 2b — Webhook resolver contracts (engineering-authority decision, 2026-10-04)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository). The decision approves, with the limits stated below, the proposal preserved under "Proposal as drafted".

1. **Inbound — Design B adopted.** The signature `resolve_inbound_channel(provider, provider_account_ref)` is kept. The resolver returns the candidate tenant set associated with the trusted provider/account identity: for a dedicated account, one candidate tenant; for a shared account, the candidate tenants assigned to that shared account. The Foundation resolver does not read Roster, does not perform ContactPoint matching, does not decide Communication matching policy, does not validate tenant lifecycle or business status, and does not perform consent, opt-out or suppression behavior. Actual sender/contact matching remains in the Communication-owned, tenant-scoped workflow.
2. **Delivery — D1 adopted.** The signature becomes `resolve_delivery_by_provider_message(provider, provider_account_ref, provider_message_id)`. The additional `provider_account_ref` aligns the resolver with the authoritative delivery uniqueness key `(channel_account_ref, provider_message_id)`. The resolver returns `tenant_id` or not found. The no-amendment alternative (D2) is not to be implemented.
3. **Ambiguity.** No business policy is invented for ambiguous shared-account contact matches; that remains a Communication workflow decision. No rule is invented for whether the same provider/account reference may simultaneously represent a dedicated and a shared account; that account-model/schema invariant is outside the scope of CR-3-F1. No existing authoritative source was found that decides it: DM §14.1 defines separate uniqueness constraints on `comms.channel_account` and `comms.shared_channel_account` and no constraint across the two.
4. **Scope.** The following stay outside CR-3-F1: the definition of "recent" outbound deliveries; the sender-matching policy; the multi-tenant sender-matching policy; STOP behavior when no tenant resolves; suppression behavior; the Roster contact-lookup contract; the HMAC-key arrangement.
5. **Status.** Decision 2b is decided. CR-3-F1 remains OPEN for: the exact read-column lists; grants; the resolver implementation mechanism; the `identity.resolver_audit` insert mechanism.

**Not decided by Decision 2b.** Two rows of the proposal's contract table are not adopted, because the decision rules that no ambiguity policy is invented and specifies only the returns above: the delivery resolver's behavior on more than one match ("fail closed"), and the treatment of a provider/account reference that is both dedicated and shared. The proposal's question whether tenant-scoped reads in candidate tenants satisfy W1 §9 "no tenant touched" was not ruled on.

**Reconciliation recorded (16 §6.7 change control).** Only the delivery signature changes contract text; the inbound decision supersedes nothing (the return shape was not previously specified) and is recorded here and in the Foundation brief only.

| Artifact | Revision | Section | Change |
|---|---|---|---|
| `01_Domain_Model_and_Implementation_Contract_rev1.8.md` | rev. 1.8.1 → 1.8.2 (header note) | §3 X1 | New paragraph "**Delivery resolver signature [CR-3-F1 2b]**"; the two-input signature in the X1 Correction is superseded; base text not rewritten |
| `02_Architecture_Decision_Records_V1.4.md` | V1.4.3 → V1.4.4 (header note) | ADR-012 "V1.4 reconciliation amendments"; amendment index | New bullet "**Delivery resolver signature [CR-3-F1 2b]**"; index row ADR-012 gains "CR-3-F1 2b (V1.4.4)" |
| `16_Reconciliation_Report_rev3.md` | rev. 3.3 → 3.4 (header note) | §2.2; §6.4; §7 | New matrix row; new errata row (DM §3 X1 two-input delivery signature); new register row |
| `docs/architecture/modules/foundation.md` | DRAFT (not approved) | §18 item 6, §20 task 4a, §22 | CR-3-F1 Decisions 1, 2a and 2b reflected; remaining open items listed |

#### Proposal as drafted (preserved; superseded by the decision above where they differ)

Drafted by Claude Fable 5.1 (drafting agent, the same session that drafted CR-3) and recorded on 2026-10-04 at the engineering authority's instruction, before the decision. It was not authoritative. Its text is kept as written; statements below that "no amendment has been made" describe the position before the decision.

**Contract problems the proposal addresses** (found in the source review; Documents 08 and 14 were read in full and resolve none of them):

1. `resolve_delivery_by_provider_message(provider, provider_message_id)` (DM §3 X1) omits the account, while delivery uniqueness is `UNIQUE (channel_account_ref, provider_message_id)` (DM §14.1, §23 "webhook resolution").
2. `resolve_inbound_channel(provider, provider_account_ref)` cannot yield one tenant for a shared account; ADR-004 and DM §14.3 require a sender contact match, the sender is not a resolver input, and CR-3's closed exception names Identity and Communication reads only, not Roster.
3. The sources do not say what happens on multiple matches.

**Designs considered for the inbound resolver.**

| Design | Summary | Main cost |
|---|---|---|
| A | Resolver takes a contact HMAC and reads Roster; returns one tenant | X1 signature change; CR-3 exception broadened to Roster; matching policy moves into Foundation |
| B | Resolver stays account-only and returns the candidate tenants; Communication performs the contact match inside each candidate tenant's own `TenantTransaction` | One short tenant-scoped transaction per candidate tenant on shared accounts |
| C | New Communication-owned platform routing table mapping (provider, account, contact HMAC) to tenant | New table: DM §14.1, §22, §23, §27 and the classification register |

**Proposed design: B for inbound; account reference added to the delivery resolver's inputs.** The resolvers identify tenants from trusted provider identifiers only; all matching and validation is tenant-scoped in Communication. The six-function closed set and CR-3's Identity-and-Communication exception are unchanged. Design B matches the wording of DM §14.3 ("resolve_inbound_channel(provider, account_ref) + contact match").

**Proposed contracts.**

| | `resolve_inbound_channel` | `resolve_delivery_by_provider_message` |
|---|---|---|
| Input | `(provider, provider_account_ref)` — unchanged | `(provider, provider_account_ref, provider_message_id)` — would amend DM §3 X1 |
| Return | Set of `tenant_id`: the owner of a dedicated account, or the tenants assigned to a shared account | `tenant_id` |
| Not found | Empty set; the workflow marks the event IGNORED at platform level (DM §14.3) | Not found; same handling |
| Ambiguous | None in the resolver; several tenants on a shared account is by design | More than one match returns not found (fail closed), audited |
| Account identifier returned | No | No |
| Row identifier returned | No (as Decision 2a) | No (as Decision 2a) |
| Resolver validates tenant or record status | No | No |
| Left to the tenant-scoped Communication workflow | Contact match; account status; organization status; opt-out and suppression writes | Loading the delivery under RLS; rank check; status update |

**Contract changes the proposal would require if adopted** (none has been made):

- Inbound: none; the return shape was not previously specified.
- Delivery: one amendment under 16 §6.7 — the DM §3 X1 signature of `resolve_delivery_by_provider_message` (tagged paragraph and header revision note); ADR-012 "V1.4 reconciliation amendments" (new tagged bullet and amendment-index row); Document 16 §2.2 matrix row, §6.4 errata row and §7 register entry.

**Alternative for the delivery resolver that needs no amendment** (not proposed): keep the two-input signature, return every tenant holding that message id on that provider, and require the tenant-scoped workflow to verify the account. Safety then depends on a check outside the resolver.

**Points the engineering authority would need to rule on when deciding 2b:**

- Whether to adopt Design B, and whether to amend the delivery signature or take the no-amendment alternative.
- The case where the same `(provider, provider_account_ref)` exists as both a dedicated and a shared account: under the proposed contracts, inbound returns the union and delivery fails closed.
- Whether an inbound message that fails the contact match — reads, but no writes, in the candidate tenants — satisfies W1 §9 "no tenant touched".

**Outside CR-3-F1 under the proposed design** (Communication workflow decisions; not proposed or decided here): the definition of "recent" outbound deliveries (ADR-004); the sender-matching policy, including a sender matching in more than one candidate tenant; STOP handling and platform suppression when no tenant matches on a shared account (W2 C-11 / W10 CW-1 against DM §14.3); which tenant's ChannelConsent a shared-account STOP withdraws; the Roster contract used for the contact match and the HMAC key arrangement.

**Not verified when the proposal was drafted:** whether DM §19 already names a Roster contract for contact lookup by HMAC, and whether the HMAC key is platform-wide or per tenant.

### CR-3-F1 Decision 3 — Read columns, delivery account reference, invitation source (engineering-authority decision, 2026-10-04)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository).

Two source-contract confirmations:

- `comms.delivery.channel_account_ref` references the account row used for the delivery, which may be either `comms.channel_account.id` or `comms.shared_channel_account.id`. (No authoritative text stated this before; DM §14.1 declares the column without a referenced table.)
- `resolve_invitation(token_hash)` reads `identity.staff_invitation` (`token_hash`, `tenant_id`). (No authoritative text named the table before.)

Read columns, recorded as authoritative:

| Resolver | Source | Reads | Predicate | Returns |
|---|---|---|---|---|
| `resolve_staff_memberships` | `identity.membership` | `user_id`, `status`, `tenant_id` | `user_id` = input; `status` = ACTIVE | `tenant_id` set |
| `resolve_capability_token` | `identity.capability_grant` | `token_hash`, `tenant_id`, `id` | `token_hash` = input | `tenant_id`, `grant_id` (= `id`) |
| `resolve_capability_session` | `identity.capability_session` | `session_hash`, `tenant_id` | `session_hash` = input | `tenant_id` |
| `resolve_invitation` | `identity.staff_invitation` | `token_hash`, `tenant_id` | `token_hash` = input | `tenant_id` |
| `resolve_inbound_channel` | dedicated: `comms.channel_account`; shared: `comms.shared_channel_account` and `comms.channel_account_assignment` | account: `provider`, `provider_account_ref`, `id`, `tenant_id`; shared account: `provider`, `provider_account_ref`, `id`; assignment: `shared_channel_account_id`, `tenant_id` | `provider`, `provider_account_ref` = inputs | candidate `tenant_id` set |
| `resolve_delivery_by_provider_message` | accounts (as above); `comms.delivery` | accounts: `provider`, `provider_account_ref`, `id`; delivery: `channel_account_ref`, `provider_message_id`, `tenant_id` | account by `provider`, `provider_account_ref`; delivery by `channel_account_ref`, `provider_message_id` | `tenant_id` or not found |

Status, expiry and revocation are not resolver predicates (except `identity.membership.status` = ACTIVE). `resolve_inbound_channel` does not read Roster, perform ContactPoint matching, decide Communication matching policy, validate tenant lifecycle or business status, or perform consent, opt-out or suppression behavior.

### CR-3-F1 Decision 4 — Grants, implementation mechanism, function schema, audit insert (engineering-authority decision, 2026-10-04)

Decided by: engineering authority (as above).

1. **Schema usage.** `cm_resolver` receives USAGE on the `identity` and `comms` schemas solely to support the authorized X1 resolver functions. It receives no CREATE privilege on either schema. This does not grant general Foundation access to those schemas; the only permitted cross-module reads remain the X1 resolver source reads defined by CR-3 / CR-3-F1.
2. **Execute privilege.** Only `cm_app` may EXECUTE the six X1 resolver functions. PUBLIC and all other roles must not retain EXECUTE privilege. The resolver functions remain a closed Foundation capability.
3. **Function schema.** Source check performed 2026-10-04: no Foundation-owned schema is defined in documents 00–18, the governance files or the Foundation brief (the contract names fourteen module schemas plus `audit`). The approved schema `foundation` therefore holds the six functions: `foundation.resolve_staff_memberships`, `foundation.resolve_capability_token`, `foundation.resolve_capability_session`, `foundation.resolve_invitation`, `foundation.resolve_inbound_channel`, `foundation.resolve_delivery_by_provider_message`. They are not moved into `identity` or `comms`, and `foundation` is not a general-purpose shared schema.
4. **Audit insert.** The six functions append their audit records within the resolver call through the Identity-defined audit append boundary. `cm_resolver` has INSERT privilege only on `identity.resolver_audit`, with no UPDATE and no DELETE. The audit table remains Identity-owned; its column definition remains an Identity concern and is not finalized by CR-3-F1. The resolver passes only the information the authoritative audit contract requires, including the resolver identity and the hashed resolver inputs. No additional audit column, hash algorithm, retention change or rollback semantics (beyond PostgreSQL transaction semantics) is decided.

**Implementation mechanism.** SECURITY DEFINER PostgreSQL functions owned by `cm_resolver` — already stated by DM §3 X1 and §6.4; confirmed, not newly decided.

**Database privilege model.**

- `cm_resolver`: NOLOGIN; BYPASSRLS; owns the closed X1 resolver functions; column-level SELECT only on the resolver columns of Decision 3; USAGE on `identity` and `comms`; no CREATE on either; INSERT only on `identity.resolver_audit`; no UPDATE; no DELETE.
- `cm_app`: EXECUTE on the six resolver functions; no BYPASSRLS.
- Other roles: do not receive X1 resolver EXECUTE, do not receive X1 source SELECT, do not receive `resolver_audit` INSERT.

*Drafting note on the last line — to be confirmed by the engineering authority.* DM §6.4's role table gives `cm_app` "DML on module tables; subject to RLS" and `cm_ops_readonly` "SELECT, BYPASSRLS", which include SELECT on the resolver source tables for those roles' own purposes. Read literally, "do not receive X1 source SELECT" conflicts with those rows. The reconciliation text prepared below therefore states it as: "No other role receives any privilege by virtue of the X1 resolver functions; the rights in the role table are otherwise unchanged", and states separately that `cm_app` has no INSERT on `identity.resolver_audit`. This wording is the drafting agent's, flagged here and not silently substituted.

*Confirmed by the engineering authority (2026-10-04).* The authoritative wording for the X1 privilege boundary is: "No other role receives any privilege by virtue of the X1 resolver functions; the rights in the role table are otherwise unchanged." Also recorded explicitly: "`cm_app` has no INSERT privilege on `identity.resolver_audit`." The X1 decision is not to be interpreted as revoking or restricting general privileges already granted to `cm_app`, `cm_ops_readonly` or any other role by the existing role table. This confirmed wording, not the "Other roles" line above, is what the authoritative documents carry.

**Module boundary (preserved).** Foundation may access only the listed X1 source columns required by the six functions. This does not authorize general Identity or Communication reads, cross-module ORM imports, shared repositories, cross-module query helpers, arbitrary raw SQL, cross-schema joins outside the resolver functions, or general Identity/Communication schema access. Identity continues to own `identity.resolver_audit`, ActorContext construction, AuthProvider, the staff IdP adapter and Identity domain behavior; Communication continues to own Communication domain data; Foundation continues to own `cm_resolver` and the six X1 resolver capabilities.

**CR-5 boundary.** CR-5-F1 is unchanged; the classification of `comms.webhook_inbox.provider_account_ref` remains a separate Privacy decision. The webhook resolvers continue to receive `provider` and `provider_account_ref` after webhook verification and replay validation.

### CR-3-F1 — status

**RESOLVED (2026-10-04).** All CR-3-F1 decision points are decided by the engineering authority and reconciled: (1) source/read columns; (2) the `comms.delivery.channel_account_ref` relationship; (3) the invitation source; (4) resolver database grants; (5) SECURITY DEFINER implementation; (6) the resolver function schema; (7) the resolver audit insertion boundary.

History: a first attempt to apply the reconciliation for Decisions 3 and 4 on 2026-10-04 was refused by the repository permission rules (`.claude/settings.json` deny rules on `docs/specifications/authoritative/**`), and CR-3-F1 was recorded as "decided — authoritative reconciliation pending". The engineering authority then removed those two rules and instructed the drafting agent to apply the prepared reconciliation, which was done the same day.

Outside CR-3-F1 (unchanged): the CR-5-F1 privacy classification; webhook matching policy; consent and suppression behavior; the provider credential model; the complete Identity audit-table column design; unrelated Foundation architecture. Not decided by CR-3-F1: any additional audit column, hash algorithm, retention change, or rollback semantics beyond PostgreSQL transaction semantics.

#### Reconciliation recorded for Decisions 1, 2a, 3 and 4 (16 §6.7 change control)

Tag `[CR-3-F1]`. Tagged additions only; no base text rewritten; no §6.4 errata row (nothing is superseded). Decision 2b has its own reconciliation above. This supersedes the statements under Decisions 1 and 2a that no authoritative document had been amended for them.

| Artifact | Revision | Section | Change |
|---|---|---|---|
| `01_Domain_Model_and_Implementation_Contract_rev1.8.md` | rev. 1.8.3 → 1.8.4 (header note) | §6.4, after "Ownership and boundary [CR-3]" | New paragraph "**Resolver contracts, privileges, schema and audit boundary [CR-3-F1]**": SECURITY DEFINER functions owned by `cm_resolver` in schema `foundation` (functions only; not a module schema; no tables; not a general shared schema); the table of sources, read columns, predicates and returns; privileges, using the confirmed wording; the audit append boundary; the unchanged closed exception |
| same | same | §14.1, after "Webhook inbox account reference [CR-5]" | New paragraph "**Delivery account reference [CR-3-F1]**" |
| `02_Architecture_Decision_Records_V1.4.md` | V1.4.5 → V1.4.6 (header note) | ADR-012 "V1.4 reconciliation amendments" | New bullet "**Resolver privileges, schema and audit boundary [CR-3-F1]**" |
| same | same | ADR-013 "V1.4 reconciliation amendments" | New bullet "**Foundation schema [CR-3-F1]**" |
| same | same | Change-log table | Rows ADR-012 and ADR-013 gain "CR-3-F1 (V1.4.6)" |
| `16_Reconciliation_Report_rev3.md` | rev. 3.5 → 3.6 (header note) | §2.2; §7 | New matrix row CR-3-F1; new register row CR-3-F1 (Decision 1 recorded there as a clarification that changes no contract text). No §6.4 errata row |
| `docs/architecture/modules/foundation.md` | DRAFT (not approved) | §2, §9, §18 item 6 and "Settled", §20 task 4a and its readiness row, §21, §22 | CR-3-F1 moved from open to resolved; `foundation` schema and resolver privileges added; other open items unchanged |

## Not changed by this reconciliation (noted)

- `AGENTS.md` §4 lists "helper services whose actual purpose is querying another module's schema" among forbidden indirect access and names no exception. The contract (DM §6.4 [CR-3], ADR-013 amendment [CR-3]) now defines one closed exception and governs over the process file; whether `AGENTS.md` should mention it is a governance decision, not made here.
- `00_README_Index.md`, 16 §6.8 and `CLAUDE.md` §2 still name the freeze revisions (rev. 1.8, V1.4, rev. 3).
- CR-1-F1 and CR-4 are untouched.
