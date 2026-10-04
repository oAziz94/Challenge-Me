# CR-10: Job envelope for jobs without a tenant

| Field | Value |
|---|---|
| ID | CR-10 |
| Title | Job-envelope treatment of jobs that have no tenant when enqueued or that are platform-level |
| Status | OPEN — awaiting engineering-authority decision. No option is selected in this record |
| Raised by | Claude Fable 5.1 (drafting agent), from finding R8 of the fresh Opus 5.5 review of the Foundation brief (2026-10-04), as relayed by the engineering authority |
| Date | 2026-10-04 |
| Rule label of affected text | ADR-001 "Payload contract": Accepted ADR; DM §21, §6.5: domain model contract; Wave 1 J-2, J-3: EXISTING |
| Routing | Engineering authority |
| Decision | None yet |

This record documents an unresolved contract question. The drafting agent selects no mechanism.

## Affected documents

- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-001 "Payload contract", "Leases and dead letters"
- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §21 (header; rows `ProcessWebhookEvent`, `GateRun`, `LeaseSweep`); §6.5; §14.3
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — J-2, J-3, J-10; AC 3, AC 28
- `docs/architecture/modules/foundation.md` — §8 (job API), §10, §12, §20 task 7

## Exact job-envelope language affected

1. **ADR-001 "Payload contract"**: "Every job carries `payload_version`, `tenant_id`, entity IDs, `correlation_id` and an idempotency key."
2. **DM §21 header**: "Every job payload: `{payload_version, tenant_id, correlation_id, ids…}`, no learner content."
3. **Wave 1 J-2**: "Job payloads contain only: payload version, organization id, entity ids, correlation id, idempotency key and small metadata."
4. **Wave 1 J-3**: "A worker runs each job for exactly the organization in its payload and re-checks that the entity belongs to it. Mismatch → POISON, dead letter immediately, security alert."
5. **DM §6.5**: "dequeue (cm_queue pool) -> job {tenant_id, entity ids, payload_version}; open TenantTransaction(cm_app, tenant_id, SYSTEM, purpose)".
6. **Wave 1 J-10**: replay "re-validates organization and payload version".

## Jobs concerned (DM §21 rows)

| Job | Row text | Why the envelope is unclear |
|---|---|---|
| `ProcessWebhookEvent` | "Communication \| inbox insert \| P1 \| inbox_id \| resolver → tenant tx" | Enqueued before the tenant is resolved; `comms.webhook_inbox.tenant_id` is "NULL (resolved)" (DM §14.1, §14.3) |
| `GateRun` | "AI Platform \| route change / snapshot deprecation \| P4 \| gate_run_id \| platform org" | Platform-level; the row names "platform org" in the transaction-boundary column and no payload rule |
| `LeaseSweep` | "queue \| every 30 s \| — \| job_id \| cm_queue" | Queue-internal; runs as `cm_queue`, with no tenant transaction |

## Gap description

The envelope texts say every job carries `tenant_id`, and J-3 and DM §6.5 make the worker open the tenant transaction from it. The contract does not say what the envelope carries for a job that has no tenant at enqueue time or is platform-level: whether the field is nullable, optional, omitted, set to the platform organization, or handled by another mechanism; nor how J-3's check and J-10's replay re-validation apply to such jobs.

## Why it matters

- The Foundation job API and the tenant-mismatch protection (task 7) fix the envelope shape for every module. An implementer must not invent it (AGENTS §3.5).
- A wrong choice weakens the J-3 POISON rule, which is a tenant-isolation control (ADR-012).

## Required engineering-authority decision

The envelope rule for jobs without a tenant, covering at least the three jobs above, and how J-3 and J-10 apply to them. No option is proposed.

## Not changed by this record

- No authoritative document is edited. CR-5 (which keeps the `ProcessWebhookEvent` payload as `inbox_id`) is untouched.
