# CR-8: Provider account reference present as both a dedicated and a shared account

| Field | Value |
|---|---|
| ID | CR-8 |
| Title | Behavior when one provider/account reference matches both `comms.channel_account` and `comms.shared_channel_account` |
| Status | OPEN — awaiting decision. No option is selected in this record |
| Raised by | Claude Fable 5.1 (drafting agent), from finding R3 of the fresh Opus 5.5 review of the Foundation brief (2026-10-04), as relayed by the engineering authority |
| Date | 2026-10-04 |
| Rule label of affected text | DM §14.1: domain model contract; DM §6.4 [CR-3-F1] and DM §3 X1 [CR-3-F1 2b]: engineering-authority decisions |
| Routing | Engineering authority; Communication (account model). Related: sign-off gate 1 (WhatsApp account model; product / commercial) |
| Decision | None yet |

This record documents a missing contract. The drafting agent selects no option.

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §14.1; §3 X1 "Delivery resolver signature [CR-3-F1 2b]"; §6.4 "Resolver contracts, privileges, schema and audit boundary [CR-3-F1]"; §23
- `docs/decisions/CR-3-resolver-ownership.md` — CR-3-F1 Decisions 2b and 3
- `docs/decisions/CR-5-webhook-ingestion-identity-and-verification.md` — deferred questions
- `docs/architecture/modules/foundation.md` — §18, §20 task 4a

## Exact source references

1. **DM §14.1**: `comms.channel_account` — "UNIQUE (provider, provider_account_ref) -- resolver lookup (X1)". `comms.shared_channel_account` — "id, provider, channel, provider_account_ref UNIQUE, …". No constraint spans the two tables.
2. **DM §14.1 [CR-3-F1]**: "`comms.delivery.channel_account_ref` references the account row used for the delivery, which may be either `comms.channel_account.id` or `comms.shared_channel_account.id`."
3. **DM §6.4 [CR-3-F1]**: `resolve_delivery_by_provider_message(provider, provider_account_ref, provider_message_id)` reads the account tables by `provider`, `provider_account_ref` and `comms.delivery` by `channel_account_ref`, `provider_message_id`, and returns "`tenant_id` or not found". `resolve_inbound_channel` returns the "candidate set of `tenant_id`: the tenant of a dedicated account, or the tenants assigned to a shared account".
4. **DM §23**: "comms.delivery | unique (channel_account_ref, provider_message_id) | webhook resolution".
5. **CR-3-F1 Decision 2b, item 3**: "No rule is invented for whether the same provider/account reference may simultaneously represent a dedicated and a shared account; that account-model/schema invariant is outside the scope of CR-3-F1."

## Gap description

If the same `(provider, provider_account_ref)` exists once in each account table, the account lookup yields two account ids. The delivery resolver may then find a delivery under each id, in different tenants, and its contract has only two outcomes: one `tenant_id` or not found. The inbound resolver's candidate set for that case is also unspecified. Nothing in the contract forbids the duplicate, and nothing defines the result.

## Why it matters

- The delivery resolver is a BYPASSRLS path that selects the tenant for a webhook status event. An undefined multi-match is a tenant-routing risk.
- Task 4a cannot define or test the function's behavior for this input without inventing it.

## Resolution paths (none selected)

**Path A.** A cross-table uniqueness or exclusion rule in Communication, so that a provider/account reference cannot exist as both a dedicated and a shared account.

**Path B.** An explicit ambiguous-result or error behavior for the Foundation resolver (and a stated candidate set for the inbound resolver) when both tables match.

Path A changes Communication's schema contract (DM §14.1, §23); Path B changes the resolver contract (DM §6.4 [CR-3-F1]). Either goes through 16 §6.7 change control.

## Not changed by this record

- CR-3-F1 remains RESOLVED. CR-5 and CR-5-F1 are untouched.
- No authoritative document is edited; Communication's schema contract is not changed.
