# CR-9: Resolver-audit hashed-input representation

| Field | Value |
|---|---|
| ID | CR-9 |
| Title | Representation of hashed resolver inputs in `identity.resolver_audit` |
| Status | OPEN — contract-readiness prerequisite, awaiting decision. No algorithm, key or format is selected in this record |
| Raised by | Claude Fable 5.1 (drafting agent), from finding R4 of the fresh Opus 5.5 review of the Foundation brief (2026-10-04), as relayed by the engineering authority |
| Date | 2026-10-04 |
| Rule label of affected text | DM §6.4 and §22: domain model contract (X1); DM §6.4 [CR-3-F1] "Audit": engineering-authority decision |
| Routing | Engineering authority; Identity & Access (owner of `identity.resolver_audit`), through the Identity brief. Privacy if a classification question arises. Stack/provider ADR if a keyed hash needs the secret store / KMS |
| Decision | None yet |

This record documents a missing contract that Identity must define before Foundation task 4a can append audit records. The drafting agent proposes nothing.

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §6.3, §6.4, §22
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — §7 "Resolver audit"
- `docs/decisions/CR-3-resolver-ownership.md` — CR-3-F1 Decision 4
- `docs/architecture/modules/foundation.md` — §18, §20 task 4a and its readiness row
- The future Identity & Access brief (does not exist yet)

## Exact source references

1. **DM §6.4**: each resolver "writes an audit record via a SECURITY DEFINER insert into `identity.resolver_audit` (OPERATIONAL, hashed inputs)."
2. **DM §22**: "identity.resolver_audit | OPERATIONAL | S1 (hashed) | R6 | append-only".
3. **DM §6.3**: OPERATIONAL — "no personal data except hashed keys"; CI test "OPERATIONAL tables contain no column classified S2–S4 except hashes".
4. **DM §6.4 [CR-3-F1], "Audit"**: "`identity.resolver_audit` remains owned by Identity & Access, and its column definition remains an Identity concern that is not finalized here. The resolver passes only the information the audit contract requires, including the resolver identity and the hashed resolver inputs."
5. **CR-3-F1 Decision 4, item 4**: "No additional audit column, hash algorithm, retention change or rollback semantics (beyond PostgreSQL transaction semantics) is decided."
6. No column definition for `identity.resolver_audit` exists in documents 00–18.

## Gap description

The contract requires hashed inputs but does not say how they are produced. The resolver inputs are: `user_id`; `token_hash` (three functions) and `session_hash`, which are already hashes; `provider`; `provider_account_ref`; `provider_message_id`. `user_id`, `provider_account_ref` and `provider_message_id` are not hashes when the resolver receives them.

## What Identity's resolver-audit contract must specify

1. Which resolver inputs are hashed, per function.
2. The canonicalization / serialization of the inputs before hashing.
3. The hash algorithm.
4. Whether the hash is keyed or unkeyed.
5. If keyed: the key source and the rotation expectations (ADR-024; the secret store / KMS is not yet chosen).
6. The representation stored in `identity.resolver_audit`.

None of these is proposed here. Noted without deciding: the classification of `provider_account_ref` on `comms.webhook_inbox` is separately open (CR-5-F1).

## Why it matters

- Task 4a's audit append and the "every call audited" test (DM §29 Tenancy row; W1 T-6) cannot be written without this contract.
- A keyed hash would make task 4a depend on the secret-store / KMS decision.

## Not changed by this record

- CR-3-F1 remains RESOLVED. `identity.resolver_audit` stays Identity-owned.
- No authoritative document is edited. No Identity brief is created or designed here.
