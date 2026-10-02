---
name: review
description: Review playbook for the reviewer and security-reviewer agents — fixed 11-step sequence starting with secret exposure, finding classes BLOCKER / REQUIRED CHANGE / NON-BLOCKING CONCERN / INFORMATIONAL, result BLOCKED or ELIGIBLE FOR CODEX REVIEW, never APPROVED. Codex remains the independent cross-model reviewer; a human remains the acceptor.
---

# Review playbook

Operational playbook for the `reviewer` (`AI_WORKFLOW.md` §6.1) and `security-reviewer` agents. It is **not** a source of authority. Precedence: authoritative specifications → approved ADRs and V1.4 amendments → `CLAUDE.md` / `AGENTS.md` / `AI_WORKFLOW.md` → explicit human architectural decisions → the approved brief → this skill → agent judgment → existing implementation convenience. Judge the change against the contract first, the brief second; a brief that differs from the contract is itself a finding.

## Purpose

Produce a ranked, evidence-based list of findings that a different agent instance can fix and verify, and a result that says whether the change may proceed to the independent Codex review. Reviews never approve.

## Inputs / preconditions

- The diff (or file set), the brief (`State: APPROVED`), the sections it cites, the implementation log, the verbatim test output.
- **Independence check first:** you did not author the change; this context is not a continuation or child of the author's context; you can name the author instance. If any fails → `REFUSED — not independent` and stop (`AGENTS.md` §6).
- Load nothing beyond the inputs unless a finding needs it.

## Review sequence (fixed order; do not skip ahead)

1. **Secret exposure** — credentials, API keys, signing keys, envelope material in diff, config, fixtures, migrations, scripts, logs, prompts, payloads, tables (`AGENTS.md` §9). Report location and type only.
2. **Tenant isolation / security** — `ActorContext` / `TenantTransaction` only; transaction-local `set_config`; no session `SET`; forced fail-closed RLS + registry entry per table; `NOT_FOUND` for cross-tenant ids; job tenant context; capability-token rules (ADR-012, DM §6, §14).
3. **Architectural boundaries** — one schema per module; mechanism A/B only; direct *and indirect* cross-module access (raw SQL, shared repositories, helpers, query builders, views, joins, FKs — judged by what the call reads); provider SDKs only in `adapters/`; no transaction across network I/O; no in-memory post-commit events; sole-owner rules X4, X13, D13, W7-C3 (ADR-013, Cross-ADR Rules, `AGENTS.md` §4).
4. **Functional correctness** — each implemented tag matches the contract text and label; nothing the contract lacks (state, enum, event, permission, period, threshold); PROPOSED DEFAULTs as configuration; open gates specified-or-unresolved, never inferred.
5. **Concurrency / idempotency** — head compare-and-set; one head per evaluable submission; `human_locked`; processed-event dedupe; J-6 re-execution safety (ADR-011, X3, X8, ADR-001).
6. **Persistence / data integrity** — learner work persisted before evaluation (DM §25.1); results immutable after PENDING; S-class, retention, purge handler, immutability rules (DM §22–§23).
7. **API / DTO boundaries** — student DTOs only from `StudentQuestionView` / `StudentRevealView`; allow-lists; no reveal before `closes_at` (ADR-020, W4-C1, DM §10.5).
8. **Failure / retry behavior** — failure classes, dead-letter, retries never reject, lose or alter learner work (ADR-001, W11-C7).
9. **Observability** — telemetry / log / audit allow-lists; no learner content, names, contact values, tokens, prompts, AI payloads or keys; AI-request payload minimization (ADR-006, DM §30).
10. **Tests** — the brief's DM §29 rows, wave §15 criteria, property tests and Arch §32 gates exist, ran, and prove the criterion; nothing weakened, skipped or deleted.
11. **Maintainability** — only after 1–10 are clean, and never as a blocker on its own.

**Security review (security-reviewer) additionally** inspects every applicable control from the authoritative architecture that the change touches: authentication and privileged actions (ADR-002, ADR-024, FD-1, FD-4); webhooks (ADR-024); capability tokens, OTP, replay/expiry/pre-fetch/forwarding (DM §14, W1); prompt injection, answer-leak controls and AI data minimization, consent, data region, provider eligibility (ADR-016/017/021, W9, W11); retention/purge and deletion ledger (ADR-019, DM §23); signed URLs, storage and malware scanning (ADR-024); sandbox isolation, resource exhaustion, SSRF and network access (Arch §3, ADR-022); credential and provider boundaries. No provider-specific control is assumed unless a provider/stack ADR in `docs/architecture/adr/` authorizes it.

## Every finding must have

- severity/category (class below + sequence step)
- concrete evidence (what the code does, under which input/state)
- affected code/path (file, line)
- authoritative source (document § and origin tag) — or the explicit words "no authoritative rule — proposal"
- impact (failure scenario: preconditions → action → consequence)
- required action (fix, test to add, or decision needed and from whom)

## Finding classes

- **BLOCKER** — violates a LOCKED / EXISTING / DECIDED rule, exposes a secret or tenant data, or weakens a required test. Blocks merge until fixed or a human overrides in writing with a change record.
- **REQUIRED CHANGE** — deviation from contract or brief without immediate exposure; must be fixed before Codex review.
- **NON-BLOCKING CONCERN** — risk, ambiguity or gap; recorded; may proceed.
- **INFORMATIONAL** — observation; no action required.

Ranked most severe first. A fix is confirmed only by a different agent instance or a test run (`AI_WORKFLOW.md` §6.4).

## Prohibited

- Treating a personal design preference as a defect — a finding without a violated rule or a concrete failure scenario is INFORMATIONAL at most.
- Redesigning the system or proposing architectural change in a finding without authority; a conflict goes to a change record (`AI_WORKFLOW.md` §8).
- Approval by implication — "looks good", "ready to merge", "no issues" are not results; use the two result values below.
- Treating green tests as proof that the architecture is correct — tests prove what they assert; the review checks what the contract requires.
- Resolving a gate or supplying a default; flag "unresolved — human decision".
- Quoting secret values or learner-sensitive content.

## Result (exactly one)

- `BLOCKED` — any BLOCKER or unfixed REQUIRED CHANGE.
- `ELIGIBLE FOR CODEX REVIEW` — no BLOCKER, no open REQUIRED CHANGE.

Never `APPROVED`. Codex remains the independent cross-model reviewer (`AI_WORKFLOW.md` §6.2); the human engineering authority remains the only acceptor (§6.5). A review result does not merge, deploy, release, accept or close a gate.

## Stop conditions

Stop the review of an item and report (approved decision · observed conflict · impact · alternatives · recommendation · code changed: none) when the contract contradicts itself, when the brief contradicts the contract, or when a rule cannot be satisfied as built. Stop the whole review when independence cannot be established.

## Required outputs

Report block: `Status (COMPLETE | PARTIAL — STOPPED | REFUSED — not independent) / Scope (diff ref, brief state, author instance) / Authoritative sources / Findings (ranked) / Changes made: none / Tests / Open decisions / Blocked by / Next action / Result (BLOCKED | ELIGIBLE FOR CODEX REVIEW)` plus the review record for high-risk work: `author | author model | reviewer instance | reviewer model | result | timestamp | findings/fixes` (`AGENTS.md` §6).

## Cross-skill rules

No secret value in any output; `AGENTS.md` §9 applies. Tenant isolation, module ownership and the ban on indirect cross-module access are checked by what the code actually reads and writes. Facts cite a tag; everything else is labeled proposal / assumption / unresolved question. Never invent a missing decision. Human acceptance remains the final gate.

## Authority references

DM `01` §6, §10.5, §14, §19–§23, §25, §29–§30; ADR-001, -002, -006, -011, -012, -013, -016, -017, -019, -020, -021, -022, -024, Cross-ADR Rules (`02`); Arch `17` §3, §29, §32; `CLAUDE.md` §3, §6; `AGENTS.md` §3–§4, §6–§7, §9; `AI_WORKFLOW.md` §6–§7.
