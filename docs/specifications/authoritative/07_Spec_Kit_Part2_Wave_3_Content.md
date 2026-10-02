# Challenge Me — V1 Spec Kit — Part 2, Wave 3: Content

> Capability: topics, objectives, questions and question versions, response specifications, rubrics, code test suites, hint sets, difficulty, tags and classification, provenance, question import, document ingestion, the AI-authored content workflow, review, approval, publication, retirement and archive (SPEC-012 to 022).
>
> Status: APPROVED and CLOSED (W3-1 to W3-4 locked; W3-C1 to W3-C4 reconciled; LG-6 remains a legal gate). Specification only; no implementation.
>
> Authoritative inputs: Wave 1 rev. 2 (closed), Wave 2 (closed), Spec Kit Part 1 (J1, J3, SC1–SC4), Domain Model rev. 1.4 (DM), ADR set V1.3, Architecture V1.3, Learning Trajectory Model rev. 13 (LTM), approved C6, C7-A, C7-B, C8, C10, C11, D1, D9, D11–D17. Wave 2 carry-forward items are reconciliation items only and are not reopened here.

# How to read this section

Labels: **LOCKED DECISION**, **EXISTING ARCHITECTURAL RULE**, **PROPOSED DEFAULT**, **OPEN PRODUCT DECISION**, **LEGAL / COMPLIANCE GATE**, **IMPLEMENTATION DETAIL**. Open decisions are in §13 and are not treated as approved. §4.12 answers the 23 questions in the Wave 3 brief one by one.

# 1. Capability Overview

**Plain language.** Content is the organization's question bank. Teachers write questions or ask AI to draft them, attach everything needed to mark them fairly (answer keys, rubrics, code tests, hints), tag them with topics and objectives, and send them through review. Once a question version is published it is frozen. Any change that could affect how a learner answers or how the answer is marked creates a new version, so every learner's answer can always be traced to the exact question and marking rules they were given.

**What Content owns:** what a question asks, what counts as a valid response, which marking configuration is attached, which topics and objectives it covers, how difficult it is, where it came from, and whether it is ready to be used.

**What Content does not own (critical boundaries):**

| Boundary | Content provides | The other module decides | Source |
|---|---|---|---|
| Content vs Evaluation | Response specification, answer key, rubric version, test suite version, hint set version, all pinned in the question version | Evaluation decides every result, confidence and authority; Content never scores | EXISTING (ADR-011, ADR-015, DM §8, §11) |
| Content vs Learning | Topics, topic weights, objectives, difficulty, topic mappings and topic scope | Learning computes evidence units, TopicState, TopicTrajectory and signals; Content never computes them | EXISTING (DM §12) + LOCKED (C7, C7-A, C7-B, D1, D9, D14–D15) |
| Content vs AI Platform | The business workflow: source → extraction → generation → validation → teacher review → approval → publication, and all question state | AI Platform runs capabilities behind the provider abstraction and records AI operations; it never owns question state | EXISTING (ADR-017, DM §8, §15) |
| Content vs Challenge | Published question versions and a selection query | Challenge selects and freezes question versions at materialization; it never changes them | EXISTING (ADR-008, DM §9, J3) |
| Content vs Code Execution | Test suites, reference solutions, known-wrong variants, runtime image and limits | Code Execution only runs code behind the sandbox boundary; comparison and scoring happen in Evaluation | EXISTING (ADR-009) |

Code is a **response type** and code execution is an **evaluation strategy**. There is no separate coding product (EXISTING, ADR-009).

Students see nothing from Content except published question versions inside their own materialized challenges, and approved hints and reveals under the reveal policy (EXISTING, ADR-007, ADR-020).

# 2. Actors

| Actor | Authority in this wave | Source |
|---|---|---|
| OWNER, ADMIN | Author, review, approve, publish, retire and archive content anywhere in the organization; manage topics and objectives; run imports; set direct publishing | LOCKED (FD-1) |
| TEACHER (organization-scoped) | Author, review, approve and publish organization-wide and course content; may approve their own content only when direct publishing is enabled | LOCKED (FD-1) |
| TEACHER (course-scoped) | Author, review, approve and publish content of their courses; same own-approval rule | LOCKED (FD-1) + DM §5.4 scope rule |
| TEACHER (cohort-scoped) | May create and edit drafts within their cohort's course; may not approve, publish, retire or archive | **LOCKED (W3-2)** |
| SAFEGUARDING_LEAD | No content authority | LOCKED (FD-1) |
| AI Platform | Executes GenerateQuestion, ImproveQuestion, ClassifyQuestion, GenerateExplanation, GenerateVariant, GenerateRubric, GenerateHintSet, GenerateTests; returns validated structured output | EXISTING (ADR-017, DM §15) |
| Document extractor, malware scanner | Scan and extract uploaded documents (providers) | EXISTING (DM §20, ADR-024) |
| Code Execution | Runs reference solutions and known-wrong variants during suite validation | EXISTING (ADR-009) |
| Learner | Sees only published, materialized content (never drafts, keys, rubrics, hidden tests, solutions or unreleased explanations) | EXISTING (ADR-020) |

# 3. Core Lifecycles

## 3.1 Manual authoring

1. A teacher creates a **Question** (logical identity: title, course or organization-wide, tags) and its first **QuestionVersion** in DRAFT.
2. The teacher fills in the version: student content, response specification, topics with weights, objectives, difficulty, and where needed a rubric version, test suite version (code) and hint set version.
3. The teacher submits it for review. The version's content is frozen for review.
4. A reviewer approves or rejects it. (With direct publishing enabled, the author may approve their own.)
5. Someone with publish permission publishes it. It is now immutable and selectable for challenges.
6. Any later material change creates version 2 as a new DRAFT; version 1 stays exactly as it was.

## 3.2 AI-assisted authoring

```
Source (typed prompt, topic, or uploaded document)
  -> document: upload -> malware scan -> extraction (OCR where needed) -> extraction artifact
  -> generation request (items) -> AI Platform operations
  -> automatic checks per item: schema, semantic validators, solve-check, ambiguity,
     duplicate, answer-leak (hints), injection flags, classification
  -> items that pass become DRAFT versions (provenance AI_GENERATED)
  -> teacher edits (provenance becomes AI_ASSISTED) -> review -> approve -> publish
```

## 3.3 Code questions

1. The version's response specification declares the language (from the approved list, gate 2).
2. The test suite version holds visible and hidden tests, a reference solution, at least one known-wrong variant, runtime image digest and limits.
3. Validation runs in the sandbox: the reference solution must pass every test and each known-wrong variant must fail at least one.
4. Only a validated test suite version can be pinned into a version that is published.

## 3.4 Correction

A fix to an answer key, rubric, test or hint creates new component versions and a new question version. Existing materialized challenges keep the old version. A teacher may then request a regrade (Wave 6), which is allowed only toward an evaluation-compatible version (EXISTING, ADR-008, ADR-011).

## 3.5 Retirement and archive

- **Retire a version**: it can no longer be selected for new materializations; everything already materialized keeps working.
- **Archive a question**: the whole question leaves the bank for new selections; its versions stay usable wherever already frozen.

# 4. Behavioral Rules

## 4.1 Question vs QuestionVersion

| # | Rule | Label |
|---|---|---|
| Q-1 | A **Question** is the logical identity: id, title, owning course (or organization-wide), tags, archive status, and a pointer to its current published version. It holds no assessment content. | EXISTING (DM §8.1) |
| Q-2 | A **QuestionVersion** is the immutable assessment bundle. It pins: student content (prompt, options, media, visible tests), response specification (including protected answer material), rubric version, test suite version, hint set version, topic weights, objectives, difficulty, explanation or model solution, and provenance. Not every question needs every component. | EXISTING (ADR-008) + difficulty per W3-C1 |
| Q-3 | Rubric, test suite and hint set have their own versions so they can be drafted and validated separately; the question version freezes the chosen versions together. No component is copied into the question version beyond its version reference. | EXISTING (DM §8.1) |
| Q-4 | Versions of one question are numbered 1, 2, 3 in creation order; each new version records its predecessor. | EXISTING (DM §8.3) |
| Q-5 | Only one version of a question is **current published** at a time. Publishing a new version automatically retires the previously published version with reason SUPERSEDED. Retired versions stay valid everywhere they are already used, for evaluation, history and permitted regrades. | **RECONCILED (W3-C2)** |

## 4.2 Material vs non-material changes

A change is **material** when it could change what the learner sees or answers, how the answer is marked, or what learning evidence the answer produces. Material changes always create a new QuestionVersion. The table extends DM §8.2 with difficulty (W3-C1).

| Change | New QuestionVersion? | Student-visible? | Evaluation changed? | Evaluation-compatible with predecessor? |
|---|---|---|---|---|
| Prompt text, stem, media, options, option order | yes | yes | maybe | **no** |
| Response input shape (type, fields, units shown, code language) | yes | yes | yes | **no** |
| Visible test cases (code) | yes | yes | yes | **no** |
| Answer key, accepted alternatives, numeric tolerance, explicit wrong answers, misconception tags | yes | no | yes | yes |
| Rubric version | yes | no | yes | yes |
| Hidden tests, comparison mode, harness configuration, limits | yes | no | yes | yes |
| Runtime image digest | yes | no | yes | yes |
| Hint set version | yes | yes (hints) | no | yes |
| Explanation or model solution (revealed later) | yes | yes (on reveal) | no | yes |
| Topic weights, objectives | yes | no | no (learning only) | yes |
| **Difficulty** | yes | no (PROPOSED DEFAULT: not shown to learners) | no (learning only) | yes |
| Title, tags, internal notes (Question level) | **no** | no | no | — |
| Owning course of the Question | **no** (Question level; see §4.5) | no | no | — |
| Topic rename, merge, split, scope change | **no** (TopicMapping / TopicScopeChanged, Content level) | no | no | — |

Rules:
- `student_visible_changed`, `evaluation_changed` and `compatible_with_previous` are computed from content hashes when the version is published, never entered by a person (EXISTING, DM §8.2–8.3).
- "Evaluation-compatible" means the learner-visible assessment content is unchanged, so a regrade may use the newer version for answers given to the older one (EXISTING, ADR-008).

## 4.3 Version lifecycle and immutability

| # | Rule | Label |
|---|---|---|
| V-1 | **DRAFT**: editable by authors in scope. | EXISTING |
| V-2 | **IN_REVIEW**: content is frozen. Editing requires withdrawing the version back to DRAFT, which cancels its review task. | PROPOSED DEFAULT |
| V-3 | **APPROVED**: the approval is bound to the exact content (content hashes and pinned component versions). Any change after approval is impossible without returning to DRAFT and a new approval. | PROPOSED DEFAULT |
| V-4 | **PUBLISHED**: immutable forever. No person, import, AI operation or repair tool edits a published version; a database guard rejects changes to immutable fields. | EXISTING (ADR-008, DM §4 conventions) |
| V-5 | **REJECTED**: returned to the author with the reviewer's reason; the author can reopen it as DRAFT. | EXISTING (DM §8.4) |
| V-6 | **RETIRED**: no longer selectable for new materializations; still valid for existing materializations, evaluation, regrade and history. Reasons: SUPERSEDED (automatic, W3-C2), MANUAL, QUESTION_ARCHIVED. | EXISTING + W3-C2 reasons |
| V-7 | A manually retired version may be reinstated (RETIRED → PUBLISHED) only when it is the latest version of its Question, the Question is ACTIVE, and the retirement reason is MANUAL. SUPERSEDED versions are never reinstated; QUESTION_ARCHIVED versions are not reinstated through this rule. Reinstatement changes only the version's status and the question's current-published pointer, never its content. | **LOCKED (W3-4)** |
| V-8 | A version is never deleted while any student challenge, submission, evaluation or regrade references it. Unreferenced DRAFT and REJECTED versions may be deleted by their author or an Admin. | PROPOSED DEFAULT |
| V-9 | Publishing requires: every pinned rubric, test suite and hint set version is published or validated; code suites VALIDATED; topic weights sum to 100%; response specification valid for its type; approval present unless direct publishing applies. | EXISTING (DM §8.4) |

## 4.4 Components

| Component | Version identity | Immutable from | New version when | Referenced by | Rule | Label |
|---|---|---|---|---|---|---|
| RubricVersion | (rubric, version_no) | PUBLISHED | any change to criteria, levels, weights, score components | QuestionVersion; EvaluationContext | Criteria weights sum to 1; each criterion maps to a score component | EXISTING |
| TestSuiteVersion | (test suite, version_no) | VALIDATED | any change to tests, reference solution, known-wrong variants, comparison, limits, runtime digest | QuestionVersion; EvaluationContext | Must pass validation (§4.7) | EXISTING |
| HintSetVersion | (hint set, version_no) | PUBLISHED | any change to hint steps or order | QuestionVersion (pinned transitively into student challenges, ADR-007) | Answer-leak check on generated hints; learners see steps in order only | EXISTING |
| Sharing | — | — | — | — | Rubrics, test suites and hint sets belong to one Question. Reusing a rubric from another question copies it into a new rubric owned by the target question; there is no live sharing in V1 | PROPOSED DEFAULT |

## 4.5 Topics, objectives, difficulty, tags

| # | Rule | Label |
|---|---|---|
| T-1 | Topics are organization-scoped or course-scoped, form a tree, and have stable identities. Renames keep the id. | EXISTING (ADR-008, DM §8) |
| T-2 | Merges and splits are recorded as TopicMappings and resolved by Learning at projection time; questions are never re-versioned because of a topic change. | EXISTING (ADR-008) |
| T-3 | Changing a topic's scope is audited and emits `TopicScopeChanged`; Learning rebuilds under the newly applicable policy; the topic keeps its identity. | LOCKED (C7-B) |
| T-4 | Retiring a topic removes it from new versions; existing versions keep their weights. | EXISTING (DM §8.3) |
| T-5 | Owners and Admins merge, split, change the scope of, and retire topics. Organization-scoped and course-scoped teachers may create and rename topics within their scope. Cohort-scoped teachers have no topic authority. All structural topic changes are audited; scope changes emit `TopicScopeChanged` and trigger the Learning rebuild (C7-B). | **LOCKED (W3-1)** |
| T-6 | Objectives are organization-level codes, optionally tied to a course; pinned into versions. | EXISTING (DM §8.3) |
| T-7 | Difficulty (EASY, MEDIUM, HARD) is pinned in the QuestionVersion and is optional; changing it creates a new evaluation-compatible version; evidence keeps the difficulty of the version actually answered; when absent, Learning treats it as unknown per its approved rules. | **RECONCILED (W3-C1)** + LTM §8 |
| T-8 | Tags are free-text labels on the Question for search and organization only; they are not material, not versioned and never used by Learning or Evaluation. | EXISTING (DM §8.2) |
| T-9 | AI classification (ClassifyQuestion) only suggests topics, objectives and difficulty; a person accepts them into a draft. | EXISTING (ADR-017) |
| T-10 | Moving a Question to another course or making it organization-wide is a Question-level change, audited, and does not change any version. | PROPOSED DEFAULT |

## 4.6 Provenance

| # | Rule | Label |
|---|---|---|
| P-1 | Every version records provenance: MANUAL, AI_GENERATED, AI_ASSISTED, IMPORTED or EXTRACTED; AI operation ids; source document id and extraction artifact id; import id; the id of the Question it is a variant of. | EXISTING (DM §8.3) + variant link PROPOSED DEFAULT |
| P-2 | AI_GENERATED becomes AI_ASSISTED as soon as a person edits the draft; the original AI output stays linked through the AI operation id. | PROPOSED DEFAULT |
| P-3 | A draft kept from a failed AI check carries `check_failed = true` and the preserved failure reasons in its provenance, together with the original AI operation ids; reviewers always see the flag and reasons. | **LOCKED (W3-3)** |
| P-4 | Provenance is part of the immutable version. Deleting a source document later leaves the provenance record in place, marked "source deleted", with the document id and content hash only. | PROPOSED DEFAULT |
| P-5 | A variant (GenerateVariant) is saved as a **new Question** with a provenance link to the original. For learning, it is a different question (D9 repeat exposure is by Question identity). | LOCKED (D9) + EXISTING (LTM §4.3) |

## 4.7 Code test suites and reference solutions

| # | Rule | Label |
|---|---|---|
| CS-1 | Content owns tests, reference solutions, known-wrong variants, comparison mode, scoring mode, limits and runtime image digest. | EXISTING (ADR-009) |
| CS-2 | Every executable code question has a teacher-reviewed reference solution; an AI-proposed reference solution is treated like any AI draft and needs review. | EXISTING (ADR-009) + PROPOSED DEFAULT (AI reference solutions allowed as drafts) |
| CS-3 | Validation runs the reference solution and every known-wrong variant in the sandbox (purpose SUITE_VALIDATION, no learner data). It passes only if the reference passes every test and each known-wrong variant fails at least one test. | EXISTING (ADR-009) |
| CS-4 | AI-generated tests propose inputs and expected outputs. Validation runs the reference solution on each input; any mismatch marks that test "disputed" (either the test or the reference is wrong). Disputed tests block validation until the teacher fixes or removes them. Expected outputs are never silently replaced by the reference output. | PROPOSED DEFAULT (makes ADR-009 precise) |
| CS-5 | At least one visible and one hidden test; at least one known-wrong variant. | EXISTING (Part 1 J1, PROPOSED DEFAULT) |
| CS-6 | Sandbox unavailable: validation waits and retries; the version cannot be published until validated. | EXISTING (J1) |
| CS-7 | Hidden tests, expected outputs, reference solutions and known-wrong variants never reach any learner view. | EXISTING (ADR-020) |
| CS-8 | Language list follows sign-off gate 2 (proposed Python 3). | EXISTING gate |

## 4.8 Document ingestion

| # | Rule | Label |
|---|---|---|
| D-1 | Supported inputs: digital PDF, DOCX, plain text and notes, and OCR for scanned material where the selected extractor meets Arabic quality requirements. | EXISTING (Arch §20) |
| D-2 | Uploads are validated (type, size) and malware-scanned before extraction; infected files are rejected and never extracted. | EXISTING (ADR-024) |
| D-3 | The same file uploaded twice in one organization is the same SourceDocument (content hash). | EXISTING (DM §8.3) |
| D-4 | Extraction output is an immutable ExtractionArtifact per (document, extractor, extractor version). Re-extraction with a newer extractor creates a new artifact; earlier artifacts and the versions that cite them are unchanged. | EXISTING (DM §8.3) |
| D-5 | Documents are untrusted input. Extracted text is scanned for prompt-injection and passed to AI only as delimited data; flagged content marks the generation items for reviewer attention. | EXISTING (ADR-017) |
| D-6 | Extraction failure: status FAILED with a reason (unreadable, unsupported, OCR quality too low, provider error). Provider errors retry automatically; content failures do not. No generation runs from a failed extraction. A partial extraction is allowed with a visible warning listing unreadable pages. | EXISTING (J-6 retries) + PROPOSED DEFAULT (partial) |
| D-7 | A changed or corrected source is a new upload (new content hash, new SourceDocument). Existing versions never change because their source changed. | EXISTING (ADR-008) |
| D-8 | Source documents and extraction artifacts are organization content (not learner-answer retention). Deleting a source document removes the file and its extraction outputs; immutable versions keep their provenance with a "source deleted" marker (P-4). | **RECONCILED (W3-C3)**; LG-6 open |
| D-9 | Uploaded teaching material may contain third-party copyright or personal data. | **LEGAL / COMPLIANCE GATE LG-6** |

## 4.9 AI-authored content workflow

| # | Rule | Label |
|---|---|---|
| AI-1 | Teacher-facing AI capabilities in V1: generate question, improve question, classify, generate explanation, generate variant, generate rubric, generate hint set, generate tests. | EXISTING (ADR-017) — not reduced |
| AI-2 | Each generation item is one AI operation with its own request id. Retrying reuses the request id (no second model call if a valid result exists); asking for another version is a new request id. | EXISTING (DM X6) |
| AI-3 | Automatic checks before a teacher sees an item: structured-output schema; semantic validators (key present and consistent, options unique, rubric weights sum to 1); **solve-check** (a second model answers the question; its answer must match the key) for question, variant and improvement outputs with a determinable answer; ambiguity check; duplicate check against the organization's bank; answer-leak check for hint sets (no final answer before the last step); injection flags from source documents. | EXISTING (ADR-017, DM §8.5, §15) |
| AI-4 | An item failing any check becomes REJECTED_BY_CHECK and is shown to the teacher with the reasons. The teacher may choose **Keep**: REJECTED_BY_CHECK → DRAFT with `check_failed = true` and the failure reasons preserved. Keeping it bypasses nothing: stale-artifact rules, check re-runs on submission, review, approval and all publication checks still apply, and a flagged draft can never reach a learner merely because it was kept. | **LOCKED (W3-3)** |
| AI-5 | Unsolvable or inconsistent questions (solve-check disagrees with the key, or no answer can be determined for a closed type) are rejected by check. | EXISTING |
| AI-6 | Every AI output that could reach learners (question, options, explanation, model solution, hints, visible tests) goes through teacher review and approval before publication. Nothing AI-generated reaches a learner unreviewed. | EXISTING (ADR-017, Arch §18) |
| AI-7 | Teachers may edit every field of an AI draft. Edits switch provenance to AI_ASSISTED. | PROPOSED DEFAULT |
| AI-8 | **Dependent artifacts.** When a teacher changes the prompt, options, key or response shape of a draft, artifacts generated from the old content (explanation, hints, rubric, tests, reference solution) are marked **stale**. A stale artifact must be regenerated, edited or explicitly confirmed by the teacher before the version can be submitted for review. | PROPOSED DEFAULT |
| AI-9 | Automatic checks re-run on submission for review for any version with AI in its provenance (schema, semantic validators, solve-check where applicable, answer-leak for hints). For purely manual questions, the solve-check is an optional button. | PROPOSED DEFAULT |
| AI-10 | AI generation uses the TEACHER_GENERATION budget pool; exhaustion shows a clear error and never affects student marking. | EXISTING (ADR-021) |
| AI-11 | AI operations record prompt version, dated model snapshot, route, parameters, validator results and cost; payloads are kept 90 days (R3). | EXISTING (ADR-017, DM §15) |
| AI-12 | No student-facing AI generation exists: learners receive only approved hint set versions; runtime adaptive hints are V1.5. | EXISTING (ADR-007) |
| AI-13 | Source documents and prompts must not contain learner personal data in V1; see LG-6. | **LEGAL / COMPLIANCE GATE LG-6** |

## 4.10 Question import

| # | Rule | Label |
|---|---|---|
| QI-1 | Structured CSV or XLSX template per response type; asynchronous validation with a preview; commit in idempotent chunks. | EXISTING (ADR-018) |
| QI-2 | File-level idempotency by (organization, file hash) while active. | EXISTING |
| QI-3 | Row with an external reference matching an existing Question: creates a **new DRAFT version** of that Question; never changes a published version. Without a match: a new Question with version 1 in DRAFT. | PROPOSED DEFAULT |
| QI-4 | Content duplicates (same normalized student content and key as an existing version in the organization) are flagged in the preview and skipped unless the importer chooses to import them. | PROPOSED DEFAULT |
| QI-5 | Imported items enter as DRAFT with provenance IMPORTED; they never bypass versioning. Publishing follows the normal rules, including FD-1. | EXISTING (ADR-018) + LOCKED (FD-1) |
| QI-6 | Code questions can be imported only with a reference solution and tests; they must pass validation before publication. | PROPOSED DEFAULT |
| QI-7 | Import files and rows kept 30 days (R9). | EXISTING |

## 4.11 Content and challenges

| # | Rule | Label |
|---|---|---|
| CC-1 | Challenges can select only current published versions of non-archived questions. | EXISTING (DM §8.5) + W3-C2 |
| CC-2 | A challenge definition's FIXED selection lists **questions**; the exact version is frozen for each learner at materialization. A version published after assignment creation but before materialization is the one frozen. | EXISTING (ADR-008, DM §9.3) |
| CC-3 | Once materialized, a student challenge's versions never change: later edits, retirements, archives, topic changes or source changes have no effect on it. | EXISTING (ADR-008) |
| CC-4 | If, at materialization, a FIXED question is archived or has no current published version, it is skipped and the teacher is informed; if nothing remains, the assignment does not open. | EXISTING (J3 proposed default extended) |
| CC-5 | Regrade may target only a version in the evaluation-compatible chain of the version the learner saw. | EXISTING (ADR-008, ADR-011) |

## 4.12 Answers to the 23 Wave 3 questions

| # | Question | Answer | Where |
|---|---|---|---|
| 1 | What makes a change material? | Anything that could change what the learner sees or answers, how it is marked, or what learning evidence it produces | §4.2 |
| 2 | Which fields can change without a new version? | Question-level title, tags, internal notes, owning course; topic-level renames, merges, splits, scope changes | §4.2, T-10 |
| 3 | When does a version become immutable? | Frozen for review at IN_REVIEW; bound by approval; immutable forever at PUBLISHED | V-2 to V-4 |
| 4 | Draft vs approved vs published? | Draft: editable. Approved: reviewed, content-bound, not yet usable. Published: immutable and selectable | §4.3 |
| 5 | Can a published version be unpublished? | It can be retired (not selectable for new use); it is never edited or removed while referenced. Reinstating: W3-4 | V-6, V-7 |
| 6 | Rubric corrected? | New rubric version → new question version (evaluation-compatible) → existing challenges keep the old one → optional regrade | §3.4 |
| 7 | Test suite corrected? | New test suite version, revalidated → new question version (compatible if visible tests unchanged) → optional regrade | §3.4, CS-3 |
| 8 | Hint set changed? | New hint set version → new question version (compatible); only new materializations get the new hints | §4.4 |
| 9 | Archived questions? | Leave the bank for new selections; remain usable where already frozen; restore allowed (§5.2) | §3.5 |
| 10 | Can an archived version still serve existing challenges? | Yes, always | CC-3 |
| 11 | Questions already selected by an assignment? | Versions are frozen per learner at materialization; unaffected afterwards | CC-2, CC-3 |
| 12 | Import deduplication? | File hash; external reference → new draft version; content duplicates flagged | QI-2 to QI-4 |
| 13 | Source provenance? | Document id, extraction artifact id, AI operation ids, import id, variant link; immutable in the version | §4.6 |
| 14 | Document versioning and deletion? | New upload = new document; extraction artifacts per extractor version; deletion removes files, keeps provenance marker | D-3, D-4, D-8 |
| 15 | OCR or extraction failure? | FAILED with reason; provider errors retried; no generation from failed extraction; partial with warning | D-6 |
| 16 | AI validation before teacher review? | Schema, semantic validators, solve-check, ambiguity, duplicate, answer-leak, injection flags | AI-3 |
| 17 | Invalid or unsolvable AI question? | REJECTED_BY_CHECK with reasons; keeping it is W3-3 | AI-4, AI-5 |
| 18 | Reference solution validation? | Passes every test; each known-wrong variant fails at least one; in the sandbox | CS-3 |
| 19 | AI tests vs reference solution? | Mismatches become disputed tests that block validation until resolved | CS-4 |
| 20 | What can teachers edit after AI generation? | Everything in the draft | AI-7 |
| 21 | What must be regenerated after teacher edits? | Dependent artifacts become stale and must be regenerated, edited or confirmed | AI-8 |
| 22 | Source material changes? | Existing versions never change; a corrected source is a new document | D-7 |
| 23 | What can students see before publication? | Nothing | §1, CC-1 |

# 5. State Models

## 5.1 QuestionVersion

| From | To | Actor | Guard | Side effects | Audit |
|---|---|---|---|---|---|
| — | DRAFT | author, AI generation acceptance, import | author permission in scope | — | yes |
| DRAFT | IN_REVIEW | author | spec valid; no stale artifacts (AI-8); AI checks re-run (AI-9) | ReviewTask CONTENT_APPROVAL | yes |
| IN_REVIEW | DRAFT | author (withdraw) | — | review task cancelled | yes |
| IN_REVIEW | APPROVED | reviewer with approve permission in scope | not the author unless direct publishing is enabled (FD-1) | task completed | yes |
| IN_REVIEW | REJECTED | reviewer | reason required | task completed | yes |
| REJECTED | DRAFT | author | — | — | yes |
| APPROVED | PUBLISHED | publish permission in scope | V-9 checks; approval content hash matches | previous published version → RETIRED (SUPERSEDED); `QuestionVersionPublished` | yes |
| DRAFT | PUBLISHED | author with publish permission | direct publishing enabled; V-9 checks | same as above | yes |
| PUBLISHED | RETIRED | publish permission in scope; automatic on supersession or question archive | — | `QuestionVersionRetired` | yes |
| RETIRED | PUBLISHED | publish permission in scope (reinstate) | latest version of its Question; Question ACTIVE; retirement reason MANUAL (W3-4) | question's current pointer set; `QuestionVersionPublished`; content unchanged | yes |
| PUBLISHED / RETIRED | any edit | — | **invalid** (immutable) | — | — |

## 5.2 Question

ACTIVE → ARCHIVED (publish permission in scope; current published version → RETIRED with reason QUESTION_ARCHIVED); ARCHIVED → ACTIVE (restore; the previous version is not re-published automatically; the next publish or W3-4 applies). Audited.

## 5.3 RubricVersion, HintSetVersion

DRAFT → PUBLISHED → RETIRED; immutable from PUBLISHED. Audited when published or retired.

## 5.4 TestSuiteVersion

DRAFT → VALIDATING → VALIDATED | VALIDATION_FAILED; VALIDATION_FAILED → DRAFT (edit); VALIDATED → PUBLISHED (with its question version) → RETIRED. Immutable from VALIDATED.

## 5.5 SourceDocument

UPLOADED → SCANNING → (INFECTED: rejected) → EXTRACTING → EXTRACTED | FAILED; any → DELETED. ExtractionArtifacts are immutable.

## 5.6 GenerationRequest and GenerationItem

Request: REQUESTED → RUNNING → COMPLETED | PARTIALLY_FAILED | FAILED | CANCELLED. Item: PENDING → SUCCEEDED (a draft is created when the teacher accepts it) | FAILED (AI operation failed) | REJECTED_BY_CHECK. **REJECTED_BY_CHECK → teacher chooses Keep → a DRAFT version with `check_failed = true` and preserved failure reasons** (W3-3); otherwise the item is discarded or regenerated under a new request id.

## 5.7 Topic

ACTIVE → RETIRED; scope changes audited (C7-B); merges and splits recorded as TopicMappings (append-only).

## 5.8 QuestionImport

UPLOADED → VALIDATING → PREVIEW_READY → COMMITTING → COMMITTED; FAILED; CANCELLED.

# 6. Permissions and Tenant Boundaries

Based on FD-1 (DM §5.4 matrix with the two FD-1 changes). Scope for content is the Question's owning course, or the organization for organization-wide questions.

| Action | Owner | Admin | Teacher (org scope) | Teacher (course scope) | Teacher (cohort scope) |
|---|---|---|---|---|---|
| Create question and draft versions | ✓ | ✓ | ✓ | ✓ in own courses | ✓ in cohort's course |
| Edit own drafts | ✓ | ✓ | ✓ | ✓ | ✓ in cohort's course |
| Edit others' drafts | ✓ | ✓ | ✓ | ✓ in own courses (PROPOSED DEFAULT) | ✓ in cohort's course (PROPOSED DEFAULT) |
| Review and approve others' versions | ✓ | ✓ | ✓ | ✓ in own courses | ✗ |
| Approve own version | only with direct publishing | only with direct publishing | only with direct publishing | only with direct publishing | ✗ |
| Publish (after approval) | ✓ | ✓ | ✓ | ✓ in own courses | ✗ |
| Retire version, archive and restore question | ✓ | ✓ | ✓ | ✓ in own courses | ✗ |
| Topics: create and rename | ✓ | ✓ | ✓ in scope | ✓ in own courses | ✗ |
| Topics: merge, split, scope change, retire | ✓ | ✓ | ✗ | ✗ | ✗ |
| Objectives | ✓ | ✓ | ✗ (PROPOSED DEFAULT) | ✗ | ✗ |
| Question import | ✓ | ✓ | ✓ (PROPOSED DEFAULT) | ✓ into own courses | ✗ |
| Upload source documents, request AI generation | ✓ | ✓ | ✓ | ✓ in own courses | ✓ in cohort's course |
| Enable direct publishing | ✓ | ✓ | ✗ | ✗ | ✗ |

**FD-1 applied precisely (W3-C4, LOCKED):** direct publishing is off by default. When off, no author approves their own content, regardless of role (Owner, Admin or Teacher); a second person approves. When on, the author may approve and publish their own content under the direct-publishing rule. The FD-1 rule that a teacher never approves their own regrade belongs to Wave 6 and is unaffected.

**Tenant boundaries:** all content is organization-owned (DM §8.1 content ownership: questions belong to the organization, not the author). Objects are keyed by organization; object storage keys are organization-prefixed; AI operations and sandbox runs are per organization and never combined.

# 7. Data Ownership

| Data | Owner | Decision owner | Source of truth | Versioned | Deletion / retention | Rebuild |
|---|---|---|---|---|---|---|
| Question | Content | authors, reviewers | content tables | no (metadata audited) | while organization active (R1) | not derived |
| QuestionVersion | Content | reviewer (approval), publisher | content tables | yes, immutable | never deleted while referenced (V-8); R1 | not derived |
| Rubric, TestSuite, HintSet versions | Content | authors, reviewers | content tables, object storage for large test data | yes, immutable | as QuestionVersion | not derived |
| Topic, TopicMapping, Objective | Content | W3-1 (topics); Owner/Admin (objectives) | content tables | mappings append-only | R1 | not derived |
| SourceDocument, ExtractionArtifact | Content | uploader, Admin | object storage + content tables | per upload / extractor version | see W3-C3 | re-extraction possible |
| GenerationRequest, GenerationItem | Content | requester | content tables | no | R1 | not derived |
| AI operations and payloads | AI Platform | — | ai tables, payload store | no | R1 metadata; R3 payloads (90 days) | not derived |
| Suite validation runs | Content (runs in Code Execution) | — | content + codeexec tables | no | R1 / R4 outputs | re-runnable |
| QuestionImport and rows | Content | importer | content tables | no | R9 (30 days) | not derived |

# 8. Cross-Module Contracts

All from DM §19–20 unless marked.

| From → To | Mech | Contract | Purpose |
|---|---|---|---|
| Content → AI Platform | A | `RequestAIOperation` (GenerateQuestion, ImproveQuestion, ClassifyQuestion, GenerateExplanation, GenerateVariant, GenerateRubric, GenerateHintSet, GenerateTests) with request id | AI drafting |
| AI Platform → Content | B | `AIOperationCompleted` | resume generation items |
| Content → Code Execution | A | `RequestExecution(purpose = SUITE_VALIDATION)` | suite validation |
| Code Execution → Content | B | `ExecutionCompleted` | record validation |
| Content → Review | A | `CreateReviewTask(CONTENT_APPROVAL)`, `CompleteTask`, `CancelTask` | approval workflow |
| Content → Challenge, Evaluation | B | `QuestionVersionPublished`, `QuestionVersionRetired` | selection pool, regrade targets |
| Content → Learning | B | `TopicMappingChanged`, `TopicScopeChanged` | projection rebuilds (C7-B) |
| Challenge → Content | A (read) | `SelectQuestionsForChallenge` (current published versions of non-archived questions) | materialization |
| Assessment → Content | A (read) | `GetStudentQuestionView`, `GetHintStep`, `GetStudentRevealView` | student-safe views |
| Evaluation → Content | A (read) | `GetEvaluatorQuestionView`, `GetCompatibilityChain` | marking, regrade |
| Learning → Content | A (read) | version metadata (topic weights, difficulty, question id) and topic mappings | evidence units (LTM C5) |
| Content → Tenancy | A | budget reserve/settle (TEACHER_GENERATION) | AI cost |

No new module or event is introduced by this wave.

# 9. Async / Failure Behavior

| Situation | Behavior |
|---|---|
| AI provider slow or down | Item retries (INFRASTRUCTURE); after caps the item is FAILED with a retry option; other items in the request continue; request PARTIALLY_FAILED |
| AI output invalid | One repair attempt; then REJECTED_BY_CHECK with reasons |
| Generation budget exhausted | Request refused or remaining items FAILED with "generation allowance used up"; drafts already created stay |
| Duplicate generation request (double click) | Same idempotency key → same request |
| Worker crash after the AI call succeeded | Job reruns; existing successful operation reused; a rare duplicate provider call is possible (Wave 1 J-6) and reconciled by AI usage reconciliation |
| Extraction provider down | Retries; document stays EXTRACTING; teacher sees "processing" |
| Malware scanner down | Upload held in SCANNING; nothing is extracted until scanned |
| Sandbox down during suite validation | Validation waits and retries; publication blocked (CS-6) |
| Two people publish two versions of the same question | Serialized on the question; the later publish becomes current and retires the earlier (W3-C2) |
| Reviewer approves while the author withdraws | Optimistic version check; one wins; the other gets CONFLICT |
| Import chunk fails | Retried; idempotent; per-row results in the report |
| Topic merge while a version is being published | Versions keep their topic ids; Learning resolves the mapping at projection time |

# 10. Privacy / Consent

- **Content is organization teaching material**, not learner content. It contains no learner answers.
- **Protected assessment material** (answer keys, rubrics, hidden tests, reference solutions, known-wrong variants, unreleased explanations) is classified S4 and never reaches learner views, logs or telemetry (DM §4, ADR-020).
- **Providers receiving content:** AI providers (question drafts, prompts, extracted document text), the document extractor and malware scanner (uploaded files), the code sandbox (reference solutions, known-wrong variants, test inputs). No learner data is sent in this wave.
- **Uploaded documents are untrusted** and may contain personal data or third-party material (LG-6).
- **Learner consent is not involved**: AI_PROCESSING consent applies to learner data (Wave 2); content generation uses no learner data.

# 11. Audit / Observability

**Audited:** question create, archive, restore, course change; version submit, withdraw, approve (including own approval under direct publishing), reject, publish, retire, reinstate (W3-4), delete of unreferenced drafts; direct-publishing setting changes; topic create, rename, retire, merge, split, scope change (C7-B); objective changes; import commit; source document upload and deletion; generation request (who, what, count; content by reference only); suite validation results.

**Metrics:** generation items by outcome (succeeded, rejected by check, failed) and check type; solve-check disagreement rate; teacher acceptance rate of AI items; time from draft to publish; review queue age for content approval; extraction failures by reason; OCR partial rate; suite validation failures; stale-artifact blocks.

**Never in telemetry:** question text, answer keys, rubrics, tests, solutions, document text, prompts, AI outputs.

# 12. Edge Cases

| Case | Behavior | Label |
|---|---|---|
| Teacher edits a question while a challenge using it is open | Edits create a new draft version; open student challenges keep their frozen version | EXISTING |
| Key fixed after half the cohort answered | New compatible version; learners who answered later in the same assignment still have the old version frozen; teacher may request a regrade | EXISTING |
| Question archived while an assignment is scheduled but not materialized | Skipped at materialization; teacher informed (CC-4) | EXISTING / PROPOSED |
| Only version is retired and a new challenge wants it | Not selectable; reinstate if W3-4 conditions hold (latest version, active question, reason MANUAL), otherwise publish a new version | LOCKED (W3-4) |
| Author leaves the organization | Content remains the organization's; drafts remain editable by others in scope | EXISTING (DM §8.1) |
| AI draft cites a document later deleted | Provenance shows "source deleted" | P-4 |
| Same document uploaded by two teachers | One SourceDocument; both can use its extraction | D-3 |
| Imported question duplicates a bank question | Flagged; skipped unless chosen | QI-4 |
| Variant generated from a question | New Question; counts as a different question for repeat exposure (D9) | LOCKED |
| Reinforcement repeats a question | Same Question identity; repeat-exposure factor applies (D9) | LOCKED |
| Topic scope changed after questions were published | Questions unchanged; Learning rebuilds under the new policy (C7-B) | LOCKED |
| Difficulty changed | New compatible version; learning evidence from older answers keeps the older difficulty (pinned) | W3-C1 |
| AI suggests a topic from another course | Classification suggestions are limited to topics valid for the question's scope | PROPOSED DEFAULT |
| Hint set answer leak detected on generation | Rejected by check; teacher-written hints are not auto-checked in V1 except the optional check | EXISTING + PROPOSED DEFAULT |
| Code question language removed from approved list later | Existing versions keep their runtime digest; no new versions in that language | PROPOSED DEFAULT |

# 13. Open Decisions

## Product decisions (resolved at closure)

### W3-1 — Who manages topics? — LOCKED: option B

- **Why it matters:** Topic changes affect every learner's topic states. Scope changes and merges rebuild learning projections (C7-B). FD-1's matrix does not cover topics.
- **Options:** (A) Owner and Admin only for everything; (B) Owner and Admin for merge, split, scope change and retirement; teachers (org- or course-scoped) may create and rename topics within their scope; (C) any teacher in scope may do everything.
- **Recommended:** B.
- **Consequences:** Teachers can extend the taxonomy for their course without being able to reshape learning data organization-wide.

### W3-2 — Content authority of cohort-scoped teachers — LOCKED: option B

- **Why it matters:** Content is course-level. Letting a cohort-scoped teacher approve course content would affect other cohorts, which extends authority beyond their scope.
- **Options:** (A) no content authoring (use content only); (B) author and edit drafts in their cohort's course, but not approve, publish, retire or archive; (C) same as a course-scoped teacher.
- **Recommended:** B.
- **Consequences:** Cohort teachers contribute questions; course- or organization-scoped staff approve them.

### W3-3 — Keeping an AI item that failed automatic checks — LOCKED: option B (explicit Keep transition, §5.6)

- **Options:** (A) never: failed items can only be discarded or regenerated; (B) the teacher may keep it as a draft carrying a visible "check failed" flag (with reasons) that reviewers see; normal publish checks still apply.
- **Recommended:** B. Solve-check can disagree when the key is right; teachers stay in control, and the flag keeps reviewers informed.
- **Consequences:** Provenance carries the flag (P-3); a metric tracks how often flagged drafts are published.

### W3-4 — Reinstating a manually retired version — LOCKED: option B (reason MANUAL only)

- **Options:** (A) never: publish a new version instead; (B) allowed only if the version is still the latest version of its question and the question is active; superseded versions can never be reinstated.
- **Recommended:** B. The content is immutable, so reinstating is safe and avoids version churn.
- **Consequences:** One extra transition (RETIRED → PUBLISHED) limited to reason MANUAL.

## Legal / compliance gate

### LG-6 — Rights and personal data in uploaded and imported teaching material — remains OPEN

- **Question:** Organizations may upload or import material they do not own, or material containing personal data (for example a scanned worksheet with student names), which is then sent to extraction and AI providers.
- **Proposed behavior:** Terms of use make the organization responsible for rights to uploaded material and prohibit learner personal data in uploads; no automated personal-data detection in V1; documents are deletable on request. Counsel to confirm per market, including the subprocessor disclosure for extraction and AI providers.

# 14. Traceability

| Rule group | Source | Status |
|---|---|---|
| Boundaries §1 | ADR-007, ADR-008, ADR-009, ADR-011, ADR-015, ADR-017, ADR-020, DM §8–§16, LTM | EXISTING / LOCKED |
| Q-1 … Q-4 | ADR-008, DM §8.1, §8.3 | EXISTING |
| Q-5 | W3-C2 | RECONCILED |
| §4.2 material changes | DM §8.2 + difficulty (W3-C1, LTM C3) | EXISTING + correction |
| V-1, V-4 … V-6, V-9 | ADR-008, DM §8.4 | EXISTING |
| V-2, V-3, V-8 | new | PROPOSED DEFAULT |
| V-7 | W3-4 | LOCKED |
| §4.4 components | DM §8.1, ADR-007, ADR-009 | EXISTING; sharing rule PROPOSED DEFAULT |
| T-1 … T-4, T-6, T-8, T-9 | ADR-008, DM §8, ADR-017 | EXISTING |
| T-3 | C7-B | LOCKED |
| T-5 | W3-1 | LOCKED |
| T-7 | W3-C1, LTM §8, C3 | RECONCILED |
| T-10 | new | PROPOSED DEFAULT |
| P-1, P-5 | DM §8.3, D9, LTM §4.3 | EXISTING / LOCKED |
| P-2, P-4 | new | PROPOSED DEFAULT |
| CS-1, CS-3, CS-5 … CS-8 | ADR-009, J1, ADR-020 | EXISTING |
| CS-2 (AI reference), CS-4 | new, precise form of ADR-009 | PROPOSED DEFAULT |
| D-1 … D-5, D-7 | Arch §20, ADR-017, ADR-024, DM §8.3 | EXISTING |
| D-6 (partial), D-8 | new | PROPOSED DEFAULT |
| AI-1 … AI-6, AI-10 … AI-12 | ADR-007, ADR-017, ADR-021, DM X6, §15 | EXISTING |
| AI-7 … AI-9 | new | PROPOSED DEFAULT |
| QI-1, QI-2, QI-5, QI-7 | ADR-018, DM §8, FD-1 | EXISTING / LOCKED |
| QI-3, QI-4, QI-6 | new | PROPOSED DEFAULT |
| CC-1 … CC-5 | ADR-008, ADR-011, DM §8.5, §9.3, J3 | EXISTING |
| §6 permissions | FD-1, DM §5.4, W3-1, W3-2, W3-C4 | LOCKED |
| P-3, AI-4, §5.6 Keep transition | W3-3 | LOCKED |
| D-8, source retention | W3-C3 | RECONCILED; LG-6 open |

# 15. Behavioral Acceptance Criteria

**Versioning and immutability**
1. No path (UI, API, import, AI workflow, background job, repair tool) can change a published version's student content, response specification, pinned component versions, topic weights, objectives, difficulty, explanation or provenance.
2. A material change to a published question creates a new DRAFT version with the next number and a link to its predecessor.
3. Changing only a question's title, tags or owning course creates no new version.
4. `compatible_with_previous` is false whenever prompt, options, media, response input shape or visible tests differ, and true when only key, rubric, hidden tests, runtime, hints, explanation, topic weights, objectives or difficulty differ.
5. Publishing version N+1 retires version N with reason SUPERSEDED; only one version of a question is current published at any time.
6. A retired or superseded version keeps working for every student challenge, evaluation and regrade that references it.
7. Editing a version in review is refused until it is withdrawn to draft; withdrawing cancels its review task.
8. An approved version whose content changed cannot be published without a new approval.

**Approval and permissions**
9. With direct publishing off, the author of a version cannot approve it, whatever their role.
10. With direct publishing on, the author can approve and publish their own version.
11. A course-scoped teacher cannot create, approve or publish content of another course or organization-wide content.
12. A learner cannot see any draft, in-review, approved-but-unpublished or retired-but-unmaterialized version.

**Components**
13. Correcting a rubric, test suite or hint set produces new component versions and a new question version; existing student challenges keep the previous version.
14. A code question cannot be published unless its test suite is VALIDATED: the reference solution passes all tests and each known-wrong variant fails at least one.
15. An AI-generated test whose expected output differs from the reference solution's output blocks validation until the teacher resolves it; expected outputs are never replaced silently.
16. Hidden tests, reference solutions, known-wrong variants, answer keys and rubrics never appear in any learner response.

**AI workflow**
17. No AI-generated or AI-assisted content reaches a learner without review, approval and publication.
18. An AI question whose solve-check answer disagrees with its key is REJECTED_BY_CHECK with that reason.
19. Retrying a generation item never calls the model again when a valid result exists; "generate another" creates a new request.
20. After a teacher changes a draft's prompt or key, dependent artifacts are marked stale and the version cannot be submitted until each is regenerated, edited or confirmed.
21. A generated hint set that reveals the final answer before its last step is rejected by check.
22. Document text flagged for prompt injection marks the resulting items for reviewer attention and is only ever passed to AI as delimited data.
23. Exhausting the generation budget never affects student marking.

**Documents and import**
24. An infected upload is never extracted.
25. A failed extraction produces no generation items; a provider error retries automatically; a content failure shows its reason.
26. Re-extracting with a newer extractor creates a new artifact and changes no existing version.
27. Deleting a source document removes its file and extraction outputs; versions citing it show "source deleted" and keep their content.
28. Importing a row whose external reference matches an existing question creates a new draft version and never changes a published version.
29. Re-importing the same file creates nothing new; content duplicates are flagged in the preview.

**Content and challenges**
30. Challenge selection returns only current published versions of non-archived questions.
31. A student challenge's frozen versions never change after materialization, whatever happens to the questions afterwards.
32. A regrade can target only a version in the evaluation-compatible chain of the version the learner saw.
33. A topic merge, rename or scope change creates no new question versions; learning is rebuilt per C7-B.

**Wave 3 decisions**
34. Owners and Admins can merge, split, change the scope of and retire topics; organization- and course-scoped teachers can only create and rename topics within their scope; cohort-scoped teachers have no topic authority; every structural change is audited and scope changes trigger the Learning rebuild (W3-1, C7-B).
35. A cohort-scoped teacher can create and edit drafts in their cohort's course and is refused when approving, publishing, retiring or archiving (W3-2).
36. Choosing Keep on a REJECTED_BY_CHECK item creates a DRAFT with `check_failed = true`, the preserved failure reasons and the original AI operation ids; reviewers see the flag; the draft must still pass review, approval and publication checks before any learner can see it (W3-3).
37. A manually retired version can be reinstated only if it is the latest version of an ACTIVE question; SUPERSEDED and QUESTION_ARCHIVED versions cannot; reinstatement leaves the version's content unchanged (W3-4).
38. Evidence from answers to an older version keeps that version's difficulty after the difficulty is changed in a newer version (W3-C1).
39. With direct publishing off, an Owner or Admin who authored a version cannot approve it; with it on, they can (W3-C4).
40. Deleting a source document never changes any published version; its provenance shows "source deleted" (W3-C3).

---

# Wave 3 Closure

**Status: APPROVED and CLOSED.**

## Content invariants (binding on all later waves)

1. Question = logical identity; QuestionVersion = immutable assessment bundle.
2. Published versions are immutable; no later wave may introduce a path that edits them.
3. StudentChallenge materialization freezes the exact QuestionVersion; later content changes never alter an already-materialized challenge.
4. Retired and superseded versions remain valid for existing challenges, evaluation, history and permitted regrades.
5. Content never decides results (Evaluation) and never computes TopicState, TopicTrajectory or signals (Learning).

## 1. Locked product decisions

| ID | Decision |
|---|---|
| W3-1 | Owners and Admins merge, split, change scope of and retire topics. Organization- and course-scoped teachers create and rename topics in their scope. Structural changes audited; C7-B rebuild preserved. |
| W3-2 | Cohort-scoped teachers create and edit drafts in their cohort's course; they cannot approve, publish, retire or archive. |
| W3-3 | A failed AI item may be kept: REJECTED_BY_CHECK → Keep → DRAFT with `check_failed = true` and preserved reasons and AI provenance; always visible to reviewers; bypasses no validation, review or publication check. |
| W3-4 | Reinstatement of a retired version only when it is the latest version, the Question is ACTIVE and the reason is MANUAL; SUPERSEDED never; QUESTION_ARCHIVED not through this rule; content never changes. |

## 2. Reconciled contradictions

| ID | Resolution |
|---|---|
| W3-C1 | Difficulty belongs to QuestionVersion; a change creates a new evaluation-compatible version; evidence keeps the difficulty of the version answered. |
| W3-C2 | One current published version per Question; publishing retires the previous one (SUPERSEDED); frozen challenges, regrades and history keep using retired versions. |
| W3-C3 | Source documents and extraction artifacts are organization content; deletion removes file and outputs; versions keep a "source deleted" provenance marker. |
| W3-C4 | With direct publishing off, no author approves their own content, regardless of role; with it on, the author may approve and publish their own content. Applies equally to Owners, Admins and Teachers. |

## 3. Open legal / compliance gate

**LG-6:** rights and personal data in uploaded and imported teaching material, and disclosure of extraction and AI providers as subprocessors. Proposed behavior only; counsel per market. LG-1 to LG-5 remain open from earlier waves.

## 4. Remaining non-blocking defaults and sign-off items

**Proposed defaults (recorded, not individually confirmed):** content frozen at IN_REVIEW with withdraw-to-edit (V-2); approval bound to content hash (V-3); unreferenced drafts deletable (V-8); components owned by one Question, reuse by copy (§4.4); difficulty optional and not shown to learners; question course change is metadata only (T-10); objectives managed by Owner and Admin; variant provenance link (P-1); AI_GENERATED → AI_ASSISTED on edit (P-2); AI-proposed reference solutions allowed as drafts (CS-2); disputed AI tests block validation (CS-4); partial extraction with warning (D-6); stale dependent artifacts must be regenerated, edited or confirmed (AI-8); checks re-run on submission for AI content, optional solve-check for manual content (AI-9); import by external reference creates a new draft version (QI-3); content duplicates flagged (QI-4); code imports need reference solution and tests (QI-6); FIXED-selection shortfall handling (CC-4); course-scoped teachers may edit others' drafts in their courses; cohort-scoped teachers may edit others' drafts in their cohort's course; teachers may import into their scope; classification suggestions limited to scope-valid topics; removed languages keep existing versions.

**Sign-off and verification items:** code language list (gate 2); extractor Arabic OCR quality and retention terms (provider verification); counsel on LG-6.

## 5. Domain Model and ADR reconciliation items

| Document | Section | Change |
|---|---|---|
| DM | §8.2, §8.3 | Difficulty moves from `content.question` to `content.question_version`; material and evaluation-compatible (W3-C1). |
| DM | §8.4 state table | Publishing retires the previous published version (SUPERSEDED); RETIRED carries reason SUPERSEDED, MANUAL or QUESTION_ARCHIVED; withdraw IN_REVIEW → DRAFT; reinstate RETIRED → PUBLISHED only under W3-4. |
| DM | §8.3 generation_item and provenance | REJECTED_BY_CHECK → Keep → DRAFT; `check_failed` flag and preserved reasons on the version's provenance (W3-3); variant-of link; "source deleted" marker. |
| DM | §8.5 queries | `SelectQuestionsForChallenge` returns current published versions of non-archived questions only. |
| DM | §8.3 test suites | Disputed state for AI-generated tests (CS-4). |
| DM | §4 retention, classification register | Source documents and extraction artifacts as organization content (R1) with deletion on request (W3-C3). |
| DM | §5.4 permission matrix | Topic rows (W3-1); cohort-scoped teacher content rights (W3-2); own-approval rule for all authors (W3-C4). |
| ADR-008 | wording | Difficulty in the material-change table; SUPERSEDED retirement; reinstatement conditions. |
| Carried from Wave 2 (unchanged) | DM §5.2, §5.4, §5.B, §7, §19–20; ADR-016; LTM §17 display note | Recorded at Wave 2 closure; not reopened. |

**STOP — Wave 3 closed. Wave 4 not started.**
