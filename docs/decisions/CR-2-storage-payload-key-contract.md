# CR-2: Storage payload key contract

| Field | Value |
|---|---|
| ID | CR-2 |
| Title | Storage payload key contract |
| Status | RESOLVED (2026-10-03) — decided by the engineering authority and reconciled in documents 02 (V1.4.2) and 16 (rev. 3.2) |
| Raised by | Claude Fable 5.1 (drafting agent); originates from Codex finding FND-014 on the Foundation brief and the independent Opus review as relayed by the engineering authority |
| Date | 2026-10-03 |
| Rule label of affected text | DM §22: reconciled implementation contract; ADR-012: Accepted ADR (EXISTING ARCHITECTURAL RULE); W1 T-7: EXISTING |
| Routing | Engineering authority (architecture) |
| Decision | Made by the engineering authority on 2026-10-03 — see "Engineering-authority decision" below |

This record documents a conflict and, below, the engineering authority's decision on it. The drafting agent proposed no solution; the decision is the engineering authority's, recorded as given.

## Affected documents

- `docs/specifications/authoritative/01_Domain_Model_and_Implementation_Contract_rev1.8.md` — §22 "Payload store (object storage)"
- `docs/specifications/authoritative/02_Architecture_Decision_Records_V1.4.md` — ADR-012 "Caches and storage"; ADR-012 "V1.4 reconciliation amendments"
- `docs/specifications/authoritative/05_Spec_Kit_Part2_Wave_1_Foundations.md` — §4.1 T-7
- `docs/specifications/authoritative/16_Reconciliation_Report_rev3.md` — §2.1, §6.4 (no entry for this item)
- `docs/architecture/modules/foundation.md` — §3 item 11, §5 row 12, §5.1, §8, §18 item 5, §20 task 8, §22 (FND-002, FND-014)

## Exact source references

1. **DM §22** (doc 01), paragraph "Payload store (object storage)": "Keys `{tenant_id}/{store}/{entity_id}/{uuid}`: submission content files, drafts over 64 KB, AI payloads, feedback text, … test case large inputs/outputs. Every store key prefix is in the classification register."
2. **ADR-012 "Caches and storage"** (doc 02): "Object keys: `{tenant_id}/{entity_type}/{random_uuid}`. Signed URLs are issued only after authorization; lifetime at most 5 minutes for downloads and 15 minutes for uploads. Uploads are validated (size, content sniffing, allowed types) before an entity may reference them. No public buckets."
3. **ADR-012 "V1.4 reconciliation amendments"** (doc 02): bullets for DM X1, DM X7, W1 F-1 / FD-4 / F-5 only. No bullet concerns object keys.
4. **W1 T-7** (doc 05): "Object storage keys start with the organization id; download links are issued only after authorization …" — requires only the tenant prefix; does not specify the remaining segments.
5. **16 §6.4 errata register** (doc 16): eight rows; none concerns storage keys. **16 §2.1** (Wave 1 carried items) lists F-1, F-2, F-5; none concerns storage keys.
6. **Document 00 precedence**: documents 01 and 02 are both in the authoritative contract (item 1). Item 4 ranks DM rev. 1.8 and ADR V1.4 above documents 17 and 18 only; it does not rank 01 against 02.
7. **Search result**: the two passages in items 1 and 2 are the only places in documents 00–18 where an object-key shape is written. No reconciliation, amendment, erratum or LOCKED decision selecting one over the other was located.

## Conflict description

Two level-1 contract documents specify different object-key shapes:

| Source | Segments after `{tenant_id}/` |
|---|---|
| DM §22 | `{store}/{entity_id}/{uuid}` (three segments; includes the entity id) |
| ADR-012 | `{entity_type}/{random_uuid}` (two segments; no entity id) |

Both are tenant-prefixed, so both satisfy W1 T-7 and the tenant-isolation rule. They differ in segment count, in whether the entity id appears in the key, and in the name/meaning of the second segment (`store` vs `entity_type`). No authoritative reconciliation or amendment was located.

## Why the conflict matters

- DM §22 ties purge to key prefixes: "Every store key prefix is in the classification register." The purge-handler registration gate (DM §34; DM §29 Privacy row) operates on prefixes, so the prefix structure is part of a tested contract.
- The `StorageProvider` port, its contract test and the deletion-ledger write-once primitive are Phase 1 Foundation items; the key shape is part of the port contract.
- Whether an entity id appears in an object key affects what a key reveals in logs, signed URLs and provider-side metadata (ADR-006 telemetry rules; DM §30).
- The Foundation brief previously described the DM §22 shape as "reconciled" without a source; that wording was withdrawn under FND-014 and the item is recorded as open (brief §18 item 5).

## Required engineering-authority decision

**Which storage payload key format is authoritative?**

## Downstream documents likely requiring amendment

- ADR-012 (V1.4 amendment section) or DM §22, depending on the decision; revision bump and regenerated matrix per 16 §6.7.
- 16 §6.4 errata register (if a passage is declared superseded).
- `docs/architecture/modules/foundation.md` §3 item 11, §5 row 12 and §5.1, §8, §18 item 5, §20 task 8, §22.
- Privacy brief (classification register prefixes, purge handlers); Content, Assessment, Evaluation, AI Platform, Communication, Reporting briefs (each writes to the payload store per DM §22).
- Provider-selection ADR for object storage (key constraints become adapter requirements).

## Implementation impact if unresolved

- The `StorageProvider` port contract and its contract test cannot be finalized.
- Classification-register prefix rows and purge handlers cannot be defined consistently across modules.
- Source-trace row 12 of the Foundation brief remains PARTIAL and the brief cannot be approved on this point.
- Any object written before the decision risks a key migration afterwards.

## Proposed solution

None. This record intentionally proposes no resolution.

---

## Engineering-authority decision (2026-10-03)

Decided by: engineering authority (as communicated to the drafting agent in the working session of 2026-10-03; the authority's name is not recorded in the repository).

> CR-2 approved: adopt DM §22 `{tenant_id}/{store}/{entity_id}/{uuid}` as the authoritative payload-store key contract and formally supersede ADR-012's conflicting object-key wording.

Scope of the decision as recorded: only the object-key shape in ADR-012 "Caches and storage" is superseded. The other rules in that paragraph — signed URLs only after authorization, at most 5 minutes for downloads and 15 minutes for uploads, upload validation before an entity may reference an object, no public buckets — are not part of the conflict and remain in force. W1 T-7 (tenant-prefixed keys) is satisfied by the adopted key.

## Reconciliation required by 16 §6.7 — APPLIED 2026-10-03

History: the edits below were first attempted on 2026-10-03 and refused by `.claude/settings.json` (`deny Edit/Write docs/specifications/authoritative/**`); they were not applied by any other route. The engineering authority then temporarily lifted the two deny rules specifically for this reconciliation, and items A1–A3 and B4–B7 were applied by the drafting agent on the same day. Verified after application: `git diff --check` clean for both documents; CR-2 referenced in document 02 (3 places) and document 16 (5 places); DM §22 and Wave 1 unmodified; the ADR-012 "Caches and storage" base paragraph byte-identical to the baseline commit (signed-URL limits, upload validation and no-public-buckets unchanged). In the applied rows the key shapes are set in code formatting; wording is as below. The deny rules must be restored by the engineering authority.

**A. `02_Architecture_Decision_Records_V1.4.md`**

1. Header status block — add after the V1.4.1 note:

   > Change-control revision V1.4.2 (2026-10-03): CR-2 applied by engineering-authority decision — ADR-012 amendment "Payload-store object keys [CR-2]" (Domain Model §22 key `{tenant_id}/{store}/{entity_id}/{uuid}` authoritative; ADR-012 "Caches and storage" object-key wording superseded; rest of that paragraph unchanged). No other text changed. Recorded in the Reconciliation Report §7 and §6.4.

2. Amendment index table, row ADR-012 — change to:

   `| ADR-012 | DM X1, X7; W1 F-1, F-5; FD-4; CR-1 (V1.4.1); CR-2 (V1.4.2) |`

3. ADR-012 "V1.4 reconciliation amendments" — add a bullet after the `[CR-1]` bullet:

   - **Payload-store object keys [CR-2]:** the authoritative payload-store key contract is `{tenant_id}/{store}/{entity_id}/{uuid}` (Domain Model §22). The object-key wording `{tenant_id}/{entity_type}/{random_uuid}` in "Caches and storage" above is superseded. The remainder of that paragraph is unchanged and in force: signed URLs only after authorization, at most 5 minutes for downloads and 15 minutes for uploads; uploads validated before an entity may reference them; no public buckets.

**B. `16_Reconciliation_Report_rev3.md`**

4. Header — add above the "Revision 3.1" note:

   > Revision 3.2 (post-freeze change control, 2026-10-03): CR-2 recorded — change-control register entry (Section 7); matrix row CR-2 (2.2); errata row (6.4). All other content unchanged.

5. §2.2 matrix — add a row after `CR-1`:

   `| CR-2 | Post-freeze change control: payload-store object key contract is {tenant_id}/{store}/{entity_id}/{uuid}; ADR-012 object-key wording {tenant_id}/{entity_type}/{random_uuid} superseded | §22 "Payload store (object storage)" (unchanged; already this key) | — | ADR-012 | ADR amendment recorded (V1.4.2); see §7 |`

6. §6.4 errata register — add a row after the CR-1 row:

   `| ADR set V1.4 | ADR-012 "Caches and storage": "Object keys: {tenant_id}/{entity_type}/{random_uuid}" (key shape only; signed-URL, upload-validation and no-public-bucket rules in the same paragraph remain in force) | CR-2 (engineering-authority decision, 2026-10-03; post-freeze change control, §7) | DM §22 "Payload store (object storage)"; ADR-012 amendment "Payload-store object keys [CR-2]" (V1.4.2) |`

7. §7 change-control register — add a row after CR-1 and extend the "Source record" line to list this file:

   `| CR-2 | 2026-10-03 | Engineering authority | Domain Model §22 {tenant_id}/{store}/{entity_id}/{uuid} is adopted as the authoritative payload-store key contract; ADR-012's conflicting object-key wording {tenant_id}/{entity_type}/{random_uuid} is formally superseded. | ADR-012 (base text "Caches and storage", object-key sentence); DM §22 payload store; Wave 1 T-7 (tenant prefix — still satisfied) | ADR set V1.4.1 → V1.4.2 (ADR-012 amendment; amendment index row). Reconciliation Report rev. 3.1 → rev. 3.2 (register; 2.2 row; 6.4 row). Domain Model rev. 1.8 and Wave 1: unchanged — DM §22 already states the adopted key; W1 T-7 requires only the tenant prefix. | Matrix row CR-2 in 2.2; errata row in 6.4 | None. |`

**C. No edit needed:** `01_Domain_Model_…rev1.8.md` (§22 already states the adopted key); `05_Spec_Kit_Part2_Wave_1_Foundations.md` (closed wave; T-7 satisfied).

Revision labels follow the CR-1 precedent (V1.4.1 → V1.4.2; rev. 3.1 → rev. 3.2); file names are not changed.

## Follow-up after reconciliation

- Status set to RESOLVED on 2026-10-03 (done).
- Not yet done, by instruction: `docs/architecture/modules/foundation.md` §5 row 12 / §5.1, §8, §18 item 5 and §22 (FND-002, FND-014) can then cite the ADR-012 `[CR-2]` amendment and 16 §7 as the authority (not changed by this record).
