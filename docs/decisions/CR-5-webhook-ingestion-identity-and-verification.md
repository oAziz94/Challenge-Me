# CR-5: Webhook ingestion identity and verification

| Field | Value |
|---|---|
| ID | CR-5 |
| Title | Webhook ingestion identity and verification (provider account reference; verification credentials) |
| Status | RESOLVED (2026-10-04) — architectural decision DECIDED by the engineering authority and reconciled in documents 01 (rev. 1.8.3), 02 (V1.4.5), 16 (rev. 3.5); data classification of `comms.webhook_inbox.provider_account_ref` OPEN; persisted-column implementation BLOCKED pending Privacy classification |
| Raised by | Claude Fable 5.1 (drafting agent); gap found during the CR-3-F1 Decision 2b reconciliation |
| Date | 2026-10-04 |
| Rule label of affected text | DM §14.1, §14.3, §14.4: domain model contract; ADR-012 "Webhooks", ADR-024 "Webhooks" and "Secrets": Accepted ADR text; Wave 1 T-2: EXISTING (ADR-012, DM §6) |
| Routing | Engineering authority (architecture); Privacy for the open classification |
| Decision | Made by the engineering authority on 2026-10-04 — see "Engineering-authority decision" below |

This record documents a missing contract and the engineering authority's decision on it. The models compared were analysed by the drafting agent at the authority's request; the decision is the engineering authority's, recorded as given.

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §14.1 (`comms.webhook_inbox`), §14.3, §14.4; related, unchanged: §3 X1, §6.3, §21, §22, §23
- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-004 (inbound tenant resolution), ADR-012 "Webhooks", ADR-013 (webhook normalization), ADR-024 "Webhooks", "Secrets"
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — T-2, §9 (closed wave; not edited)
- `docs/specifications/authoritative/16_Reconciliation_Report_rev3.md` — §2.2, §6.5 row 1, §6.7, §7

## Exact source references

1. **DM §14.1**: `comms.webhook_inbox` — "id, provider, provider_event_id text, received_at, signature_valid bool, payload_ref text (object, encrypted), status (RECEIVED, PROCESSED, IGNORED, FAILED), tenant_id NULL (resolved), processed_at; UNIQUE (provider, provider_event_id)". No account-reference column.
2. **DM §14.3**: handler "verify signature; reject timestamp older than 5 min where provided; INSERT webhook_inbox …; enqueue ProcessWebhookEvent(inbox_id)"; worker "tenant := resolve_delivery_by_provider_message(...) for status events or resolve_inbound_channel(provider, account_ref) + contact match for inbound".
3. **DM §21**: job `ProcessWebhookEvent`, payload `inbox_id`.
4. **DM §3 X1** as amended by CR-3-F1 Decision 2b: both webhook resolvers take `provider_account_ref`.
5. **DM §14.4**: provider boundary defined only as `ChannelProvider.send(message) → {provider_message_id} | failure(class)`.
6. **ADR-004**: "Inbound tenant resolution uses only trusted data: the provider account identifier plus the sender ContactPoint … Payload fields never set the tenant."
7. **ADR-012 "Webhooks"**: "The tenant is resolved from trusted mappings (ChannelAccount and provider identifiers, ADR-004), never from payload fields."
8. **Wave 1 T-2**: "The organization comes from the authenticated actor or the job, never from request bodies, URL parameters the actor cannot hold, or webhook payload fields."
9. **ADR-024**: "Webhooks: provider signature verification …"; "Secrets: platform secrets in a managed secret store. Per-tenant provider credentials (for example organization WhatsApp tokens) are envelope-encrypted with a managed KMS key, decrypted only in the worker at use …".
10. **DM §14.1**: `credential_secret_ref` on `comms.channel_account` (TENANT) and `comms.shared_channel_account` (PLATFORM).
11. **ADR-013**: Communication owns "webhook normalization"; provider SDKs only in adapters.
12. **16 §6.5 row 1** (gate 1, WhatsApp account model): "Build ChannelAccount plus shared-account assignment (X7) for both models".

## Gap description

- Both webhook resolvers need `provider_account_ref`, but the ingestion flow never establishes or carries it: the inbox row holds only `provider`, the job carries only `inbox_id`, and no authoritative path leads from `inbox_id` to the account reference.
- The contract calls the provider account identifier "trusted data" and forbids "payload fields", without defining which webhook-supplied values are which.
- The contract requires signature verification in the HTTP handler but does not say which credential verifies a webhook or what scope it has. A per-tenant credential cannot be reached in the handler (forced RLS on `comms.channel_account`; ADR-024 worker-only decryption).

Classification: missing contract. No two statements conflict.

## Models considered

Account reference: (A) establish at HTTP ingestion and persist on `webhook_inbox`; (B) extract in the worker from the stored payload; (C) normalize into another existing Communication record — no existing pre-tenant record fits.

Verification credentials: (1) platform-level, one per provider; (2) account-specific and tenant-owned; (3) platform-held with provider-neutral granularity.

## Engineering-authority decision (2026-10-04)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-04; the authority's name is not recorded in the repository).

1. **Model 3 adopted.** Webhook-verification credentials are platform-held secrets, managed outside tenant-scoped domain data and accessible only through the Communication provider-adapter boundary. A provider may use one credential or multiple credentials at the integration/account granularity it requires; credential references and credential selection must remain platform-level and must not require tenant resolution.
2. **Binding rule.** When a provider uses account-specific verification credentials, the verified `provider_account_ref` must correspond to the account bound to the credential that successfully verified the webhook.
3. **Model A adopted.** verify signature → replay-window validation → establish `provider_account_ref` → persist on `webhook_inbox` → `ProcessWebhookEvent(inbox_id)` → resolver. `ProcessWebhookEvent` reads the account reference from the inbox row.
4. **Gate 1 remains independent** of this decision.
5. **CR-3-F1 is untouched.**
6. **No errata row** is required; no passage is superseded.
7. **Condition.** The architectural decision is approved, but the classification of the new `comms.webhook_inbox.provider_account_ref` column remains OPEN. No S1/S2/S3/S4 classification is invented, and DM §6.3 is not modified.

Status recorded by the engineering authority:

| Item | Status |
|---|---|
| CR-5 architectural decision | DECIDED |
| `provider_account_ref` data classification | OPEN |
| Persisted-column implementation | BLOCKED pending Privacy classification |

The shape of a webhook-verification provider port is not defined by this decision; it establishes only that verification and normalization occur behind the Communication provider-adapter boundary.

## Reconciliation recorded (16 §6.7 change control)

| Artifact | Revision | Section | Change |
|---|---|---|---|
| `02_Architecture_Decision_Records_V1.4.md` | V1.4.4 → V1.4.5 (header note) | ADR-024 "V1.4 reconciliation amendments" | New bullet "**Webhook-verification credentials [CR-5]**": the credential rule and the binding rule as decided; these credentials are platform secrets, so the worker-only decryption rule for per-tenant credentials does not apply to them |
| same | same | ADR-012 "V1.4 reconciliation amendments" | New bullet "**Trusted provider identifiers [CR-5]**": trusted only after signature verification; provider-side object; lookup key, never a tenant assertion |
| same | same | Change-log table | Rows ADR-012 and ADR-024 gain "CR-5 (V1.4.5)" |
| `01_Domain_Model_and_Implementation_Contract_rev1.8.md` | rev. 1.8.2 → 1.8.3 (header note) | §14.1 | New paragraph "**Webhook inbox account reference [CR-5]**": the inbox carries `provider_account_ref`; classification OPEN; implementation blocked until classified |
| same | same | §14.3 | New paragraph "**Account reference at ingestion [CR-5]**": order of work; worker reads the reference from the inbox row; `tenant_id` unset until resolution; job payload remains `inbox_id` |
| same | same | §14.4 | New sentence "**[CR-5]**": verification and normalization occur behind the Communication provider-adapter boundary |
| `16_Reconciliation_Report_rev3.md` | rev. 3.4 → 3.5 (header note) | §2.2; §7 | New matrix row CR-5; new register row CR-5; source-records line extended. No §6.4 errata row |

Base text was not rewritten in any document; every change is a tagged addition. Not changed: DM §6.3, §21, §22, §23; ADR-004; Wave 1 (closed); the X1 resolver contracts; `docs/decisions/CR-3-resolver-ownership.md`; `docs/architecture/modules/foundation.md`.

## Open item — CR-5-F1 (OPEN): classification of `comms.webhook_inbox.provider_account_ref`

`comms.webhook_inbox` is an OPERATIONAL table; DM §6.3 allows OPERATIONAL tables "no personal data except hashed keys", and the CI rule is "OPERATIONAL tables contain no column classified S2–S4 except hashes". Column classes are assigned through the Privacy-owned classification register (DM §7.2). No entry exists for this column and no source decides its class. Noted, without deciding: the same value is stored unhashed in `comms.channel_suppression` ("S1 (hash only)", where the hash refers to the contact) and in `comms.shared_channel_account` (listed S1 in DM §22).

Owner: Privacy (classification register), with the engineering authority. Until the classification is recorded, the persisted column must not be implemented. If the value is classified above S1, how it may be held on an OPERATIONAL table is a further decision; nothing is assumed here.

## Deferred questions (outside this decision)

- Each provider's credential granularity, and rotation of these credentials (provider-selection ADR; ADR-024).
- Whether one webhook request can carry events for several accounts, and how that maps to inbox rows.
- Whether the same provider account reference may be both a dedicated and a shared account.
- Communication matching policy: the definition of "recent" outbound deliveries; sender matching; multi-tenant sender matches; STOP and suppression behavior when no tenant resolves.
- The Roster contact-lookup contract and the HMAC-key arrangement.
- Sign-off gate 1 (WhatsApp account model) and provider selection.
- Nullability, type and indexing of the new column.
- The shape of the provider-adapter verification operation.

## Not changed by this record (noted)

- CR-3-F1 remains OPEN for: read-column lists; grants; resolver implementation mechanism; `identity.resolver_audit` insert mechanism. CR-5 affects none of them.
- CR-1-F1 remains OPEN.
- The Foundation brief was not updated for CR-5; it also does not yet cite the ADR-012 amendment [CR-3-F1 2b] in §5 row 8 (separate housekeeping).
- No Communication brief exists yet; nothing here states or implies otherwise.
