# CR-7: Resolver schema and ownership privileges

| Field | Value |
|---|---|
| ID | CR-7 |
| Title | Privileges needed to expose, own and deploy the six X1 resolver functions in schema `foundation` |
| Status | OPEN — awaiting engineering-authority decision. No grant is selected in this record |
| Raised by | Claude Fable 5.1 (drafting agent), from finding R2 of the fresh Opus 5.5 review of the Foundation brief (2026-10-04), as relayed by the engineering authority |
| Date | 2026-10-04 |
| Rule label of affected text | DM §6.4 role table: domain model contract (X1); DM §6.4 [CR-3-F1] and ADR-012 / ADR-013 amendments [CR-3-F1]: engineering-authority decision |
| Routing | Engineering authority; the stack/provider ADR for managed-PostgreSQL constraints |
| Decision | None yet |

This record documents a missing contract. The drafting agent proposes no grant.

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §6.4 role table; §6.4 "Resolver contracts, privileges, schema and audit boundary [CR-3-F1]"
- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-012 amendment "Resolver privileges, schema and audit boundary [CR-3-F1]"; ADR-013 amendment "Foundation schema [CR-3-F1]"; ADR-023 "Migrations"
- `docs/decisions/CR-3-resolver-ownership.md` — CR-3-F1 Decisions 1 and 4
- `docs/architecture/modules/foundation.md` — §9, §14, §16 row 4, §20 task 3 (creation of the `cm_resolver` role; item 5) and task 4a

## Exact existing language

1. **DM §6.4 [CR-3-F1], "Privileges"**: "`cm_resolver` holds USAGE on the `identity` and `comms` schemas solely to support these six functions, and no CREATE privilege on either; column-level SELECT only on the columns listed above; and INSERT only on `identity.resolver_audit`, with no UPDATE and no DELETE. Only `cm_app` holds EXECUTE on the six functions; PUBLIC and all other roles do not. `cm_app` has no INSERT privilege on `identity.resolver_audit`. No other role receives any privilege by virtue of the X1 resolver functions; the rights in the role table are otherwise unchanged."
2. **DM §6.4 [CR-3-F1]**: "The six X1 resolver functions are SECURITY DEFINER PostgreSQL functions owned by `cm_resolver` and held in the schema `foundation`".
3. **DM §6.4 role table**: "cm_migrator | pipeline only | owner of all schemas"; "cm_resolver | NOLOGIN | BYPASSRLS; owns resolver functions; SELECT on the few columns they read (X1)".
4. **DM §6.4 [CR-3-F1], "Audit"**: "Each function appends its audit record within the resolver call, through the Identity-defined audit append boundary."
5. **CR-3-F1 Decision 1**: "Foundation creates nothing in those schemas."
6. **ADR-023 "Migrations"**: migrations run as `cm_migrator` in the pipeline before deployment.

## Gap description

The texts above settle what `cm_resolver` and `cm_app` hold on `identity`, `comms`, `identity.resolver_audit` and the six functions. They do not state the following.

| # | Not stated | Roles | Objects |
|---|---|---|---|
| 1 | Whether, and to which roles, USAGE on the schema `foundation` is granted. PostgreSQL requires USAGE on a function's schema to call it by name | `cm_app`, `cm_resolver`, others | schema `foundation` |
| 2 | Which role owns the schema `foundation` ("owner of all schemas" predates this schema) | `cm_migrator` | schema `foundation` |
| 3 | How the functions come to be owned by `cm_resolver`: creation under that role or an ownership transfer. Without superuser rights, PostgreSQL requires the owning role to hold CREATE on the function's schema for either path; the contract is silent on CREATE in `foundation` (it denies CREATE only in `identity` and `comms`) | `cm_resolver`, `cm_migrator` | schema `foundation`; the six functions |
| 4 | Whether `cm_migrator` may act as `cm_resolver` (role membership / `SET ROLE`), given that `cm_resolver` is NOLOGIN with BYPASSRLS, and what limits apply | `cm_migrator`, `cm_resolver` | role membership |
| 5 | Whether the chosen managed PostgreSQL service allows a non-superuser pipeline role to create a BYPASSRLS role and to assign function ownership to it | `cm_migrator`, `cm_resolver` | role attributes; depends on the stack/provider ADR |
| 6 | Which migration issues the column-level SELECT grants and the `identity.resolver_audit` INSERT grant on tables owned by Identity and Communication: the owning module's migration or Foundation's (Decision 1: "Foundation creates nothing in those schemas") | `cm_migrator`, `cm_resolver` | the X1 source tables; `identity.resolver_audit` |
| 7 | If the Identity-defined audit append boundary is a function, whether `cm_resolver` needs EXECUTE on it and whether the direct INSERT grant is still exercised (related: CR-9) | `cm_resolver` | Identity audit append boundary |

## Why it matters

- Task 4a cannot be implemented safely: an implementer would have to choose grants, which AGENTS §3.5 and §3.19 forbid.
- Item 5 also bears on Foundation task 3, not only task 4a: the `cm_resolver` role itself (NOLOGIN, BYPASSRLS) is created with the other database roles in task 3, so creating it depends on item 5 and on the managed-PostgreSQL / stack ADR. (Dependency note added 2026-10-04 from the second Opus review, correction RC-3; nothing is decided by it.)
- The privilege tests required for Foundation approval (brief §14, §16 row 4) need expected values for these points.
- Items 3–5 touch the only BYPASSRLS role besides break-glass (ADR-012; human-engineer review before Phase 1 exits).

## Required engineering-authority decision

The explicit privilege contract for items 1–7. No value is proposed here.

## Not changed by this record

- CR-3-F1 remains RESOLVED; its decided privileges are not altered.
- No authoritative document, ADR or governance file is edited. No grant is implemented.
