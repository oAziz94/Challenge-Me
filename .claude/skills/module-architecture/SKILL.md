---
name: module-architecture
description: Architecture discovery and implementation-brief preparation for one Challenge Me module or phase (Foundation / Walking Skeleton). Builds the mandatory source-trace matrix from the authoritative specifications, marks unresolved items, and hands the brief to independent review and human approval. Never implements, never approves.
---

# Module architecture playbook

Operational playbook for the `architect` agent (or a human doing the same work). It is **not** a source of authority. Precedence: authoritative specifications → approved ADRs and V1.4 amendments → `CLAUDE.md` / `AGENTS.md` / `docs/engineering/AI_WORKFLOW.md` → explicit human architectural decisions → the approved brief → this skill → agent judgment → existing implementation convenience. Where this skill and anything above it differ, the higher source wins.

## Purpose

Produce `docs/architecture/modules/<module>.md` (brief template: `AI_WORKFLOW.md` §9) whose every claim is traced to an authoritative document, section and origin tag, so that implementation can be checked against the contract rather than against the brief.

## Inputs / preconditions

- Module name (one of the 14 schemas in DM §4) or phase (`foundation`, `walking-skeleton`), or a named conflict to analyze.
- Phase eligibility per Arch §35 as modified by DM §33; prerequisite briefs and CI gates known.
- No prior brief for the module in state `APPROVED` (otherwise this is an amendment: §11.6 of `AI_WORKFLOW.md`).

## Workflow

1. **Establish the requested module/task.** Write the DM §4 ownership row, the owning wave(s), the phase, and the exact scope asked for. Anything outside it is out of scope — say so.
2. **Identify authoritative source documents.** From `00_README_Index.md` precedence: DM sections for the module; the owning wave(s) §4–§8 and §15; relevant ADRs **with their V1.4 amendments**; `16` §6.4 errata and §6.5 gate register; LTM (`04`) for Learning; Arch `17` §35 and Remediation `18` §1, §5–§6 as baseline inputs only. Search by origin tag or section number; read by citation, not whole artifacts.
3. **Build the source-trace matrix first** (brief item 0). Twelve rows, each `item | document | section | origin tag(s) | validated by`: module ownership; owned aggregates/tables; public contracts; consumed contracts; jobs; events; wave acceptance criteria; ADRs + amendments; 16 §6.4 errata; open/sign-off/legal gates; required DM §29 test rows; security/privacy requirements. A row with no citation is a gap, not a guess.
4. **Identify, with tags:** module ownership (DM §4, ADR-013); aggregates and state machines; tables with category, S-class, retention class, purge handler, RLS policy, registry entry, immutability, indexes (DM §22–§23); contracts offered (DM §19) with mechanism A/B; contracts consumed; events produced/consumed (DM §20); jobs owned (DM §21) with priority class; ADRs and amendments; errata that touch the module; wave §15 acceptance criteria; required tests (DM §29 rows, LTM §20, Arch §32 gates, property tests, architecture tests); legal/sign-off gates touched (16 §6.5).
5. **Inspect existing implementation only to understand constraints** — never to copy its behavior as a requirement. Record constraints as `implementation detail` or `assumption`, with file references.
6. **Identify conflicts.** Contract vs contract, contract vs library/database/provider, contract vs existing code. For each: STOP that part, draft `docs/decisions/CR-<n>-<slug>.md` (`AI_WORKFLOW.md` §8 template), reference it in brief item 8.
7. **Identify unresolved decisions.** Every OPEN / sign-off / LEGAL gate, PROPOSED DEFAULT, missing stack/provider ADR, and ambiguity that affects behavior.
8. **Never convert an unresolved requirement into an invented default.** A gate yields a configuration surface only when the contract explicitly specifies both the surface and the designed-in default; otherwise write `UNRESOLVED — contract specifies no surface/default; nothing built` (brief item 3). Never infer a legal, product, threshold, default, schema, workflow, permission, retention or provider decision.
9. **Produce the brief** per the §9 template: items 0–12, citations beside every paraphrase, PROPOSED DEFAULTs as configuration keys with owner, no restated domain model. For Foundation / Walking Skeleton, map every `AI_WORKFLOW.md` §11.1 / §11.2 checklist item to its planned proof; the Phase 1b capability-link delivery question stays `UNRESOLVED` — do not invent a delivery mechanism or bypass X13.
10. **Mark the outcome.** The brief's `State:` line uses the `AI_WORKFLOW.md` §10 values (`DRAFT → IN_REVIEW → APPROVED | RETURNED`). Beneath it add `Skill outcome:` with one of:
    - `DRAFT` — matrix or sections incomplete; keep working.
    - `BLOCKED` — a change record, missing ADR or unresolved blocking decision prevents a complete brief; name it.
    - `READY FOR HUMAN APPROVAL` — matrix complete and validated by the independent reviewer(s) (`AI_WORKFLOW.md` §3.3: Codex, then a separate Opus instance where the brief touches ADR-011/012/013/014/016/017/020/021), no open blockers.

    Only a human changes `State:` to `APPROVED` and records approver and date.

## Verification before implementation (mandatory)

No implementation starts from this brief until: every source-trace row has been validated by a reviewer instance other than the author against the authoritative document itself (not the discovery note); `State: APPROVED` with approver and date is recorded; phase prerequisites are green; the stack/provider ADRs the brief relies on exist and are `ACCEPTED`.

## Stop conditions

Stop and report (approved decision · observed conflict · impact · alternatives · recommendation · code changed: none) when: two authoritative rules contradict; a rule cannot be expressed by the chosen database/library/provider; the module would need a state, event, table, permission, period or threshold the contract lacks; a gate has no specified surface/default and the module cannot be described without one; a required stack/provider ADR is missing; existing code contradicts a LOCKED/EXISTING rule.

## Required outputs

- The brief file (`DRAFT`, with `Skill outcome:`), or a change record, or both.
- Report block: `Status / Scope / Authoritative sources / Findings / Changes made / Tests / Open decisions / Blocked by / Next action`.
- Everything labeled: authoritative requirement · approved decision · implementation detail · proposal · assumption · unresolved question.

## Cross-skill rules

No secret value in any output; `AGENTS.md` §9 applies. No learner-sensitive content in notes or briefs. Tenant isolation (ADR-012), module ownership (DM §4, ADR-013), DM §19 contracts and the ban on direct and indirect cross-module access (`AGENTS.md` §4) are design constraints, not options. Facts carry a tag; everything else is a proposal. Human acceptance remains the final gate.

## Authority references

`00_README_Index.md` (precedence); DM `01` §4, §19–§23, §25, §29, §33–§34; ADR set `02` incl. Cross-ADR Rules; `04` LTM; waves `05`–`15` §15; `16` §6.4–§6.7; `17` §35; `18` §1, §5–§6; `CLAUDE.md` §2–§5; `AGENTS.md` §3–§5, §8–§9; `AI_WORKFLOW.md` §3, §8–§11.
