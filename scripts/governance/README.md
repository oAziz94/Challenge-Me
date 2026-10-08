# Governance checks (Foundation Task 1, local part)

Dependency-free Node ES modules (`.mjs`); verified on Node 24 (the STACK-ADR-001 Phase-1 runtime baseline). Source: STACK-ADR-002 §6.3, §6.8, §6.9.
These are protection-mechanism files: a change here is a self-modifying change (STACK-ADR-002 §6.3), so the
authoritative review signal for it is the human reading of the actual diff, not CI output.

| Check | Command | Meaning |
|---|---|---|
| Commit identity | `node scripts/governance/check-commit-identity.mjs <base>..<head>` | Every non-exempt commit in the range has author name `oAziz94`, author and committer email `30234485+oAziz94@users.noreply.github.com`, no AI/bot `Co-Authored-By` trailer or attribution footer. The four historical commits are exempt by full hash. Commits are listed with `git rev-list` and each is read as its own object (`git cat-file commit`); no commit-message byte is used as framing. |
| Authoritative path | `node scripts/governance/check-authoritative-path.mjs <base-ref> <head-ref>` | A diff touching `docs/specifications/authoritative/**` passes only with governance evidence at the head, fresh since the merge base (see below). Pathnames are read from NUL-delimited Git output relative to the repository root. Also prints notices for governance and self-modifying paths. No bypass exists. |
| Tests | `node --test "scripts/governance/test/*.test.mjs"` | Unit tests with synthetic fixtures, adversarial regression tests, and CLI tests against throwaway Git repositories. |
| Scanner gate | `node scripts/governance/scanner-gate.mjs <gitleaks> [<repo>]` | Pre-publication F-09 gate: scanner canary, then current tree, history and refs/codex scans, each cross-checked (see below). |

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

## Secret scanner and the pre-publication gate (F-09)

Scanner: gitleaks (MIT licence), version 8.30.1, offline, no account, service or telemetry. A version string proves nothing, so the pin is
trusted only through the gate below.

Upstream assessment, checked 2026-10-07 against the project's own release page and issue tracker:

- Release status: 8.30.1 (published 2026-03-21) is the latest official release. No newer release exists to move to, and no older release
  is shown to be safer, so the version is not changed.
- gitleaks/gitleaks#2164 (Windows x64 8.30.1 archive "checksum does not validate"): closed. The maintainer verified three independent sources
  that agree (the published checksums file, a local hash of the archive, GitHub's stored asset digest) and the reporter retracted it as an
  in-flight modification on their side. Re-verified here: the archive hashes to the value in the checksums file and to GitHub's asset digest.
- gitleaks/gitleaks#2129 (open; its fix PR #2169 was closed unmerged): `gitleaks git` can print "0 commits scanned / no leaks found" and
  exit 0 when `git log` writes to stderr, a silent false negative that affects the released 8.30.1. Related open reports: #2246 (a failed
  diff parse can silently truncate a scan), #2223 and #2196 (rule-specific false negatives). They are why every clean result is
  cross-checked and why a canary is mandatory.

Gate (run it immediately before the first public push; a clean manual scan without it is not a publication result):

```
node scripts/governance/scanner-gate.mjs <path-to-gitleaks> [<repository-root>]      # canary, then all real scans
node scripts/governance/scanner-gate.mjs <path-to-gitleaks> --canary-only            # canary only
```

0. Gate-owned scanner settings on EVERY invocation (canary and real): `--config <temporary file containing only [extend] useDefault = true>`,
   `--gitleaks-ignore-path <empty temporary directory>` and `--ignore-gitleaks-allow`. The repository `.gitleaks.toml`, inline `gitleaks:allow`
   comments and `GITLEAKS_CONFIG` therefore cannot suppress a finding (the CLI also removes `GITLEAKS_*` from the scanner's environment, in a
   copy). Gitleaks still reads a `.gitleaksignore` at the scanned repository root whatever `--gitleaks-ignore-path` says, so the gate fails if a
   `.gitleaksignore` exists in the working tree or anywhere in the tracked files. If the gate-owned settings cannot be created, the gate fails.
   Every temporary location (config, ignore directory, reports, canaries, materialized blobs) must resolve outside the repository and is deleted.
   Every Git command and every scanner process the gate starts runs with a gate-built environment (a copy; the process environment is never
   modified): all `GIT_*` variables (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
   `GIT_REPLACE_REF_BASE`, `GIT_CONFIG*` ...) and all `GITLEAKS_*` variables are removed, and `GIT_NO_REPLACE_OBJECTS=1` plus a gate-owned config entry (`GIT_CONFIG_COUNT=1`, `core.useReplaceRefs=false`) are set. Git replacement
   objects (`git replace`) would otherwise make the gate read other content than the original object a normal push publishes. Every Git
   command is rooted explicitly with `-C <repository>`, the gate proves Git resolves the requested path as its own work tree root, and it
   refuses (fails; deletes and rewrites nothing) a repository that has any `refs/replace/**` ref. `GIT_REPLACE_REF_BASE` can hide replacements
   from that listing, and `GIT_NO_REPLACE_OBJECTS=1` alone is overridden by `core.useReplaceRefs=true` in repository, user or system config
   (seen on Git 2.37.1). Three controls therefore stand together: the environment variable, the gate-owned `core.useReplaceRefs=false`
   (command scope, outranks every config file), and the `refs/replace/**` refusal. The scan never depends on the refusal alone.
1. Canary: random synthetic, non-live tokens (GitHub PAT, AWS access key id, Anthropic API key, RSA private key block) are written to a
   temporary directory OUTSIDE the repository, once as a directory and once as a throwaway two-commit Git repository. The scanner must report
   every one, exit 1, never print or write a canary value (`--redact`), scan every commit it was given, and exit 0 for a clean control.
   The temporary files are deleted afterwards. A scanner that returns CLEAN for the canary fails the gate and no real result is trusted.
2. Current working tree: exit 0, "no leaks found", and a non-zero number of bytes scanned.
3. Full commit history (`gitleaks git --log-opts=--all`): exit 0, "no leaks found", and the scanner's single anchored "N commits scanned" line
   EQUALS the expected count derived from Git alone: the number of non-merge commits whose `git log --numstat` (the scanner's own `git log -p`
   defaults) shows at least one added text line. Equality with `git rev-list --all --count` cannot hold for legitimate history: gitleaks 8.30.1
   (pinned) reports exactly the non-merge commits that add a line, so empty, deletion-only, mode-only, pure-rename, binary-only and merge
   commits are never counted (characterized against the real scanner for empty, deletion-only, clean-merge and conflict-resolved-merge
   history, each followed by an ordinary commit). Any other count, higher or lower, a missing or ambiguous summary, or an unparseable Git
   answer fails; the total commit count (`rev-list --all --count`) is only a sanity condition (greater than 0, not below the expected count).
   This check is separate from the repository-identity and invocation controls and does not by itself prove which repository was scanned.
   The canary repository keeps exact equality with its commit count (two plain content commits). A change of the pinned version requires
   re-characterizing the rule. This still proves nothing about content: `git log -p` based scans skip `-diff` and binary files, which the
   blob stage covers.
4. Complete blob coverage: every blob is enumerated from Git object data, with SHA-1 object ids only (anything unparseable or of another id shape
   fails closed): `git rev-list --all --objects` (all history), `refs/codex/**` tips (`for-each-ref`, `ls-tree -r -z`) and unreachable blobs
   (`git fsck --unreachable --no-reflogs`). Object types are verified with `cat-file --batch-check`; the union is deduplicated, with per-source
   counts reported, and every blob is materialized once by object id (`cat-file --batch`) into a temporary directory, which is scanned in
   directory mode. Coverage must be complete (no blob omitted or extra), and the scanner's reported bytes must EQUAL the sum of the blob sizes
   taken from Git object metadata, computed independently of the scanner. Any Git command failure fails the gate.
5. Summary lines are parsed only as whole anchored lines; zero or conflicting values fail. Output names checks and counts only. Never reproduce a
   detected value.

The first public push is limited to `refs/heads/main`; never push with `--all` or `--mirror`.

Windows x64 release archive `gitleaks_8.30.1_windows_x64.zip`, SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`
(equals the project's published `gitleaks_8.30.1_checksums.txt` entry and GitHub's asset digest). The binary is not stored in this repository.
`scripts/governance/test/scanner-gate.test.mjs` tests the gate with fake scanners; set `GITLEAKS_BIN` to run it against the real binary.
