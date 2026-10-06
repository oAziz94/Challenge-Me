# Governance checks (Foundation Task 1, local part)

Dependency-free Node ES modules (`.mjs`); verified on Node 24 (the STACK-ADR-001 Phase-1 runtime baseline). Source: STACK-ADR-002 §6.3, §6.8, §6.9.
These are protection-mechanism files: a change here is a self-modifying change (STACK-ADR-002 §6.3), so the
authoritative review signal for it is the human reading of the actual diff, not CI output.

| Check | Command | Meaning |
|---|---|---|
| Commit identity | `node scripts/governance/check-commit-identity.mjs <base>..<head>` | Every non-exempt commit in the range has author name `oAziz94`, author and committer email `30234485+oAziz94@users.noreply.github.com`, no AI/bot `Co-Authored-By` trailer or attribution footer. The four historical commits are exempt by full hash. Commits are listed with `git rev-list` and each is read as its own object (`git cat-file commit`); no commit-message byte is used as framing. |
| Authoritative path | `node scripts/governance/check-authoritative-path.mjs <base-ref> <head-ref>` | A diff touching `docs/specifications/authoritative/**` passes only with governance evidence at the head, fresh since the merge base (see below). Pathnames are read from NUL-delimited Git output relative to the repository root. Also prints notices for governance and self-modifying paths. No bypass exists. |
| Tests | `node --test "scripts/governance/test/*.test.mjs"` | Unit tests with synthetic fixtures, adversarial regression tests, and CLI tests against throwaway Git repositories. |

## Authoritative-path evidence (per changed authoritative file)

The file must be added or modified (a deleted, renamed, copied or type-changed authoritative file always fails) and must be one of four
EXACT supported files, matched case-sensitively as a path relative to `docs/specifications/authoritative/` (no nesting, no shadow copy, no case variant):
`01_Domain_Model_and_Implementation_Contract_rev1.8.md` (Domain Model), `02_Architecture_Decision_Records_V1.4.md` (ADR set),
`03_Spec_Kit_Part1_Core_Journey_reconciled.md` (Spec Kit Part 1), `16_Reconciliation_Report_rev3.md` (Reconciliation Report).
Any other path under the directory, including a case variant of the directory itself, fails closed. In its head header block:

1. A revision note is ADDED (not present in the base header), carries a revision token not already in the base header, and cites at least one `CR-n`. A note only in the body does not count.
2. The authorizing set is the cited CRs whose Reconciliation Report section 7 "Artifacts changed (revision)" cell has a segment that binds ALL THREE: the changed artifact (segment starts at that artifact's name), the new revision token (first version token after the last arrow, digit/dot bounded, never a section reference) and the CR (the row). An "unchanged" segment does not bind; another artifact's token is never borrowed. Other cited CRs are descriptive only (for example "CR-1-F1 remains OPEN"). No bound CR: fail.
3. Freshness, judged between the merge base B and the head H: the section 7 binding must not already exist at B (an existing row may be extended with a new artifact segment), and the matching section 2.2 row must be new or textually changed since B. Doc 16 unreadable at B fails closed. The change record itself may predate the change.
4. Each authorizing CR has a record in `docs/decisions/` (a parent id resolves only its own file, never a `CR-n-Fm-*` file) in state `ACCEPTED` or `RESOLVED`. A follow-up `CR-n-Fm` without its own file takes its OWN state from the parent's Status: the fragment after its id up to `;` or the next CR id, exactly one state word, and no negated, conditional or future wording anywhere in the fragment (not, if, unless, subject to, pending, will, awaiting ...). The fragment stops at the next CR id. All other, ambiguous or unparseable states fail.
5. Its section 7 "Decided by" cell names a governance role (engineering authority, product owner, counsel, gate owner) and no agent, model or bot; a bare personal name fails.
6. Section 7 "Matrix / errata" must explicitly say "no errata" (then no 6.4 "Superseded by" row may cite the CR) or cite 6.4 (then one must). A cell doing both, or neither, fails. Every GFM table in 6.4 is read (pipe-less rows and rows indented up to 3 spaces count; a row indented 4 or more spaces is not a table row); a row in a table region that mentions the CR but cannot be parsed into the table structure fails; malformed rows for other CRs are ignored; escaped pipes are honoured. Decision text is never searched for "superseded"; whether a change truly supersedes text is the human diff review.
7. Header-note corroboration only (the section 7 cell stays the determinant), over the added note(s): the clause from the last "Recorded in the Reconciliation Report" to the next sentence end is read for 6.4; a bare 6.4 or section-sign 6.4 elsewhere is ignored. The note claims errata if it says "errata" (without a no-errata statement) or its recording clause cites 6.4; it claims no errata if it says "no errata" or "no passage (is) superseded". A positive claim needs an authorizing CR with a positive section 7 cell and a 6.4 row; a negative claim forbids any such row; both together fail; neither imposes nothing.

Tables are read by column name. The check validates evidence; it cannot prove who wrote it or that the check itself was not weakened by the change under review.

## Secret scanner

Selected: gitleaks (MIT licence), version 8.30.1. Offline; no account, service or telemetry; `--redact` keeps values out of output.
Run from the repository root; reports must not be committed:

```
gitleaks git --log-opts="--all" --redact=100 --no-banner --report-format json --report-path <out>.json .
gitleaks dir --redact=100 --no-banner --report-format json --report-path <out>.json .
```

`gitleaks git` scans commit history (it walks commits). The local `refs/codex/**` refs point at trees, not commits, so this scan does
NOT cover them; they require a separate tree-object inspection before the first public push. The first public push is limited to
`refs/heads/main`; never push with `--all` or `--mirror`.

Windows x64 release archive `gitleaks_8.30.1_windows_x64.zip`, SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`
(matches the project's published `gitleaks_8.30.1_checksums.txt`). The binary is not stored in this repository.
