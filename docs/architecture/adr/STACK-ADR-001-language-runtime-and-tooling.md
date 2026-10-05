# STACK-ADR-001: Language, runtime and engineering tooling

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID         | STACK-ADR-001 (the prefix keeps this series apart from the contract's ADR-001…ADR-025 in document 02; the naming is itself a proposal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| State      | ACCEPTED — engineering authority: Omar Abdulaziz, 2026-10-05. (State values per the AI_WORKFLOW §10 "Approval states" table, row "Provider/stack ADR": states "PROPOSED → ACCEPTED / REJECTED", final state set by "Human".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Drafted by | Claude Fable 5.1 (architect role), 2026-10-04. Revised the same day on engineering-authority direction before independent review (language status, version policy, data-access boundary, migration decision split, framework comparison, boundary enforcement, queue scope). Revised again after the independent Codex review (PASS WITH REQUIRED CORRECTIONS, findings F-01 to F-05, as relayed by the engineering authority): §2, §4.3, §4.7, §4.8, §7, §9, §10, §11. Revised 2026-10-05 after the Opus architecture/security review (PASS WITH REQUIRED CORRECTIONS, no blockers, no technology replacement; findings S-01 to S-19, as relayed by the engineering authority): §2, §4.2–§4.8, §4.10–§4.13, §5, §6, §8–§11. No technology choice changed in that pass |
| Decider    | Engineering authority (Omar Abdulaziz)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Baseline   | Commit `dabaa0c` — Domain Model rev. 1.8.4, ADR set V1.4.6, Reconciliation Report rev. 3.6; Foundation brief APPROVED                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Scope      | The stack and tooling decisions the Foundation brief marks `UNRESOLVED — STACK ADR REQUIRED`. Vendor and provider choices are out of scope (section 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

This ADR chooses tools. It changes no contract rule, resolves no change record and authorizes no implementation. Where it and the contract differ, the contract governs.

**Labels.** `[A]` authoritative requirement (documents 00–18) · `[B]` Foundation-brief requirement · `[C]` implementation preference or mechanism proposed here · `[D]` unresolved decision or open change record. An authoritative outcome and the mechanism proposed to achieve it are always labelled separately: the outcome may be `[A]` while the mechanism is `[C]`.

**Abbreviations.** DM = document 01; ADR-0xx = document 02; W1 = document 05; Arch = document 17; Rem = document 18; AIW = `docs/engineering/AI_WORKFLOW.md`; FB = `docs/architecture/modules/foundation.md`.

## 1. Context

The contract fixes the architecture and deliberately names no technology: "Vendor choices are implementation decisions recorded in provider-selection ADRs" (Cross-ADR Rule 5). A search of documents 00–18 found no programming language, runtime, framework, ORM, test runner, CI system or cloud named anywhere. The only technology the contract fixes is PostgreSQL (ADR-001; DM A3) and, for learner code questions, Python 3 inside the sandbox (W7-1), which is unrelated to the platform's own language.

Three things in the repository hint at a Node.js/TypeScript stack: `.gitignore` lists `node_modules/`; `.claude/settings.json` protects a `prisma/` path; the Reconciliation Report §6.3 says no "Prisma models" were added. These are hints, not decisions. **TypeScript on Node.js is therefore a new implementation-level decision made by this ADR. It is not inherited from the authoritative contract, and nothing in the contract would be contradicted by a different language.**

Implementation cannot start without this ADR (AIW §4; FB §21).

## 2. Requirements-to-tooling matrix

The first four columns state the requirement and classify **the requirement only**. The last column is this ADR's inference about tooling or its proposed mechanism; **everything in the last column is `[C]`** and is not part of the cited source.

| #   | Authoritative outcome or constraint                                                                                                                                                                                      | Source                                                                                          | Label of the requirement          | Proposed implication or mechanism — always `[C]`                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Modular monolith, one codebase, one image, three entry points (API, worker, scheduler) scaled independently                                                                                                              | DM A1; Arch §3, §33                                                                             | A                                 | One deployable package is sufficient; multi-package tooling is not needed                                                                                                                                                         |
| R2  | 14 modules; a module reaches another only by public service call (A) or same-transaction job (B); no shared ORM entities; no cross-schema access "direct or indirect"; "Architecture tests enforce dependency direction" | ADR-013; DM §19; AGENTS §4                                                                      | A                                 | No single data model spanning modules; the enforcement model of 4.8                                                                                                                                                               |
| R3  | PostgreSQL authoritative; PostgreSQL-native queue is the outbox; no Redis for correctness                                                                                                                                | ADR-001; DM A3                                                                                  | A                                 | Queue and domain writes share one database and one transaction                                                                                                                                                                    |
| R4  | Tenant context only by transaction-local `set_config(..., true)`; session-level `SET` forbidden; safe under transaction-mode pooling                                                                                     | ADR-012; DM §6.2                                                                                | A                                 | A data layer that gives explicit control of the transaction and of its first statements; nothing relies on session state                                                                                                          |
| R5  | Forced, fail-closed RLS; five database roles; `BYPASSRLS` on two only; column-level grants; SECURITY DEFINER functions owned by a NOLOGIN role                                                                           | DM §6.3, §6.4 incl. [CR-3], [CR-3-F1]; ADR-012                                                  | A                                 | DDL is hand-authored in SQL rather than generated by a tool                                                                                                                                                                       |
| R6  | One schema per module plus `audit` and `foundation`; no cross-schema FK                                                                                                                                                  | DM §4, §22; ADR-013 [CR-3-F1]; Rem R4                                                           | A                                 | Explicit schema-qualified object names in module and migration SQL (4.3, 4.4); per-module generated types                                                                                                                         |
| R7  | Migrations: expand/contract, additive-only on immutable tables, run as `cm_migrator` in the pipeline before deploy, one-release compatibility                                                                            | ADR-023 "Migrations"; Arch §33                                                                  | A                                 | SQL-first, forward-only migration files run by a separate pipeline job (4.4)                                                                                                                                                      |
| R8  | Partial indexes, CHECK-constrained text enums, immutability triggers, UUIDv7 ids, `citext`, `jsonb`, `bytea`                                                                                                             | DM §4, §5.2, §23, A10–A12                                                                       | A (A10–A12 are PROPOSED DEFAULTs) | Full PostgreSQL DDL surface; no lowest-common-denominator abstraction                                                                                                                                                             |
| R9  | Queue: enqueue inside the caller's transaction; lock-free claiming; leases with heartbeat; priorities; admission tokens; failure classes; dead letter                                                                    | ADR-001                                                                                         | A                                 | Queue code runs on the caller's transaction handle; `SKIP LOCKED` must be expressible                                                                                                                                             |
| R10 | No database transaction spans network I/O; this is checked by lint and test                                                                                                                                              | Cross-ADR Rule 8; ADR-001; W1 J-4; DM §29 Queue row ("no transaction across I/O (lint + test)") | A                                 | Mechanism proposed: a lint rule, plus a runtime guard active in tests that fails when an adapter is called inside an open transaction (4.7)                                                                                       |
| R11 | Head compare-and-set; property tests for CAS and for projection-equals-rebuild                                                                                                                                           | ADR-011, ADR-014; AGENTS §7                                                                     | A                                 | A property-testing library; multi-connection concurrency tests against real PostgreSQL                                                                                                                                            |
| R12 | Provider SDKs only inside adapters; ports for storage, scanner, auth and others                                                                                                                                          | ADR-013; Arch §29                                                                               | A                                 | Import rules per directory (4.8)                                                                                                                                                                                                  |
| R13 | Telemetry: span names, attribute allow-list, `tenant_id` and `correlation_id` on every span; no SQL parameters, bodies or free text; auto-instrumentation must not capture them; audit separate from telemetry           | DM §27, §30; ADR-006; W1 §11                                                                    | A                                 | Open-standard tracing and metrics; allow-listing as the primary policy for log fields and exported attributes, redaction as defense in depth; instrumentations enabled one by one rather than as a bundle (4.11)                  |
| R14 | Stable error codes; explicit DTOs; tenant from context, never from the body; idempotency-key header; handlers accept job payload versions N and N−1                                                                      | DM §28; W1 J-12, J-13; ADR-023                                                                  | A                                 | Mechanism proposed: runtime schema validation at each boundary (4.6). The contract requires explicit DTOs and version handling; it does not prescribe runtime schema validation. Validation never supplies security context (4.6) |
| R15 | Secrets only from a managed secret store / KMS at the adapter boundary; secret scan in CI; a local-development mechanism defined by the stack ADR                                                                        | ADR-024; AGENTS §9.2, §9.6; AIW §11.1                                                           | A                                 | A secret-access port and the local mechanism of 4.10                                                                                                                                                                              |
| R16 | Test catalogue: registry-vs-RLS, cross-tenant suite, pooled-connection leak, job tenant mismatch, canaries, architecture tests, migration test, provider contract tests                                                  | DM §29; Arch §31, §32; FB §14                                                                   | A / B                             | Tests against real PostgreSQL with the real roles; catalogue assertions written as SQL (4.7)                                                                                                                                      |
| R17 | CI runs the catalogue and gates on every change; authoritative folder protected                                                                                                                                          | AIW §11.1; FB §16 rows 1–2                                                                      | A (process) / B                   | The CI capabilities of 4.13; the platform is `[D]`                                                                                                                                                                                |
| R18 | Managed PostgreSQL with PITR; object storage with versioning; managed secret store and KMS                                                                                                                               | Arch §33; ADR-023                                                                               | A (baseline)                      | Requirements on providers (section 5); vendors are `[D]`                                                                                                                                                                          |
| R19 | Queue library is sign-off gate 12; "(or a thin in-house table using row locking with SKIP LOCKED)"                                                                                                                       | ADR-001; 16 §6.5 row 12                                                                         | A / D                             | This ADR does not select the queue implementation (4.5)                                                                                                                                                                           |
| R20 | V1 remains production-grade                                                                                                                                                                                              | Cross-ADR Rule 6                                                                                | A                                 | Maintained, supported versions; reproducible builds (section 7)                                                                                                                                                                   |

## 3. Existing decisions that bind the stack

| Area                                                                                                                                                             | Already decided?                                                              | By                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| Database engine                                                                                                                                                  | Yes — PostgreSQL                                                              | ADR-001           |
| Cache / broker                                                                                                                                                   | Yes — none required; Redis only for a measured need                           | ADR-001; Arch §33 |
| Deployable shape                                                                                                                                                 | Yes — one image, three entry points, migration as a pipeline job              | Arch §3, §33      |
| Queue technology class                                                                                                                                           | Yes — PostgreSQL-native. Library: open (gate 12)                              | ADR-001           |
| Tracing style                                                                                                                                                    | Baseline description only — "OpenTelemetry-style traces", one primary backend | Arch §30          |
| Language, runtime, framework, data access, migration tool, validation, test runner, package manager, lint/format, containers, CI, hosting, storage, KMS, scanner | No                                                                            | —                 |

Nothing proposed below overrides an existing authoritative choice.

## 4. Decisions proposed

Every item in this section is `[C]` — an implementation-level choice made by this ADR, not contract text — unless marked otherwise. The items were drafted as proposals and were accepted by the engineering authority on 2026-10-05 (section 11); the word "Proposal" in the subsections below is kept as drafted. Items marked `[D]` or deferred remain undecided.

### 4.1 Language and runtime

**Proposal.** TypeScript in strict mode, on Node.js.

- _Status of this choice._ A new implementation-level decision. No authoritative source requires it; it is proposed on engineering grounds only.
- _Why._ One language for API, worker and scheduler; a mature PostgreSQL driver with full control of connections and transactions; strong static typing for DTOs, payload versions and module boundaries; the repository hints already point here; the implementing agents are most reliable in it.
- _Alternatives._ Go (excellent PostgreSQL control and operations, weaker expressiveness for the DTO and policy modelling the domain needs); Java/Kotlin (mature, heavier runtime and build); Python (weaker static guarantees for this size of domain; also the sandbox language, which invites confusion); C#/.NET (viable; no existing hint or tooling in the repository). None is ruled out by the contract.
- _Runtime version._ Governed by the policy in section 7, not by this subsection.
- _Lock-in._ High, as for any language choice.

### 4.2 HTTP framework and composition

**Proposal.** Fastify, with explicit composition: each module exposes one public entry file (its mechanism-A service interface); dependencies are passed through constructors in a composition root per entry point; no dependency-injection container is used.

**The trade-off, stated fairly.** NestJS is the serious alternative, and it has real advantages: mature dependency-injection and module conventions; wide familiarity, which lowers onboarding cost; a large ecosystem of integrations; and established testing conventions. Its module "exports" also map naturally to public services. Decorators and emitted metadata are not, by themselves, a reason to reject it.

Explicit composition is preferred **for this architecture** for six specific reasons:

| Concern in this architecture                                 | With explicit composition                                                                                   | With a DI container                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActorContext` visibility (ADR-012; DM §5.3)                 | The actor is a parameter. A reviewer sees at every call site where it came from                             | The actor can be injected or held in request scope; its origin is resolved by the container at run time                                            |
| `TenantTransaction` visibility (DM §6.2)                     | The transaction handle is passed explicitly; code that has no handle cannot query                           | A transaction or tenant-scoped client can be supplied implicitly, which is exactly the pattern that hides a missing or wrong tenant context        |
| Worker and scheduler composition (Arch §3)                   | Each entry point has its own short composition root listing what it constructs and with which database role | The same module graph is bootstrapped in a different mode; which providers and roles are live in a worker is a property of container configuration |
| Module-boundary enforcement (ADR-013; AGENTS §4)             | A cross-module dependency is an import, and imports are machine-checked (4.8)                               | A dependency can also be created by registering or exporting a provider; that wiring must be policed in addition to imports                        |
| Security reviewability (Rem §1 human review of ADR-012 work) | The path from HTTP handler to SQL is ordinary function calls a reviewer can read top to bottom              | Part of the path is container resolution, interceptors and guards whose order is framework-defined                                                 |
| Hidden lifecycle and context behaviour                       | Start-up, shutdown and per-request state are written out                                                    | Lifecycle hooks and request scoping are powerful and mostly invisible in the code being reviewed                                                   |

The common thread: the contract's hardest rules are about _where tenant context and actors come from_. This proposal favours a style in which that is always visible in the code, at the cost of convention and convenience.

**Fastify has a framework-defined lifecycle too.** The comparison above is one of degree. Fastify orders its own hooks (request, parsing, validation, handler, serialization, response, error) and encapsulates plugins; that ordering is framework-defined, not written by this project. Choosing Fastify does not remove hidden lifecycle; it leaves less of it between the handler and the SQL. The following constraints keep it that way (`[C]`):

- transactions are not opened or committed implicitly by generic Fastify hooks, plugins or decorators; a transaction is opened by an explicit call to Foundation in the code path that needs it;
- an application success response is not finalized before the transaction it depends on has committed successfully; a failed commit is reported as a failure;
- a custom error handler maps every failure to the approved stable error-code contract (DM §28) and never exposes raw `err.message`, stack traces or database error text to the caller;
- asynchronous context (async-local storage) carries correlation and observability context only;
- `ActorContext` and tenant authorization context are passed explicitly as parameters and are never held in ambient async-local state or on a request decorator that data-access code reads implicitly.

**`ActorContext` and `SystemActor` construction** (`[C]` tooling constraints serving DM §5 "Owns ActorContext construction", DM §6.4 [CR-3] and ADR-012 [CR-1]):

- construction of staff, learner and guardian `ActorContext` values is owned by Identity & Access, as the contract states; no other module may import or call a constructor or factory for them;
- construction of `SystemActor` is restricted to the approved infrastructure entry-point paths (worker and scheduler composition). Which purposes and permissions a `SystemActor` carries remains subject to CR-1-F1, which this ADR does not resolve;
- feature modules cannot construct an `ActorContext` or `SystemActor` from request data, URL parameters, job payloads or webhook payloads, and the types are built so that a plain object literal does not satisfy them;
- architecture/import tests assert this boundary (4.7, 4.8 layer 1).

- _What is given up._ Conventions out of the box, a familiar structure for engineers who know NestJS, and ready-made integrations. Mitigation: one documented module template, enforced by the architecture tests.
- _When NestJS would be the better answer._ If the team that will maintain the system is already fluent in it and the engineering authority judges familiarity to outweigh explicitness. In that case the same rules must hold as constraints: no request-scoped providers for actor or tenant context; the transaction handle passed explicitly; provider registration subject to the boundary tests.
- _Other candidates._ Express (older middleware model, no schema-first validation); newer frameworks (not materially justified for a V1 that should be boring).
- _Lock-in._ Low to moderate; handlers are thin and domain code is framework-free.

### 4.3 PostgreSQL access

**Proposal.** Three layers with fixed responsibilities, and no ORM. Kysely was put to the architecture/security review (section 11) and is accepted with this ADR, under the confinement stated below.

| Layer                | Role                                           | Owns                                                                                       |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pg` (node-postgres) | PostgreSQL driver                              | Pools, physical connections, statement execution — constructed and held only by Foundation |
| Kysely               | Typed query construction                       | Building and typing DML queries, executed on a transaction supplied from above             |
| Plain SQL files      | Schema, security and migration source of truth | All DDL (4.4)                                                                              |

Foundation database infrastructure owns the transaction lifecycle: when a transaction begins, what its first statements are, and when and how it ends. Whether `BEGIN` / `COMMIT` / `ROLLBACK` are physically emitted through `pg` directly or through Kysely's transaction facility driven by Foundation is an implementation detail. In neither case does a feature module, a plugin or a library default decide it.

**Ownership boundary — who may hold what.**

Foundation database infrastructure, and nothing else, owns and constructs:

- `pg` pools, including the role-specific pools (`cm_app`, `cm_queue`);
- physical connection acquisition and release;
- transaction creation and the transaction lifecycle;
- installation of tenant and actor context (`set_config(..., true)`) as the first statements of the transaction;
- the Kysely dialect and any Kysely root instance;
- any unrestricted or raw client "escape hatch".

Feature modules receive only a **transaction-bound query surface**, handed to them by Foundation's `TenantTransaction` for the duration of one transaction. That surface must:

- be incapable of creating a pool;
- be incapable of acquiring another connection;
- be incapable of starting an independent root transaction;
- remain bound to the Foundation-managed transaction and become unusable when it ends;
- carry the transaction-local tenant and actor context already installed, with no operation that changes it;
- expose only the query operations the infrastructure abstraction intentionally allows. It is typed to the receiving module's own schema as an aid to authors and reviewers; that typing is not a restriction (see "Escape hatches" below).

The visible chain is therefore: `ActorContext` → `TenantTransaction` → transaction-local tenant context → the module's query operations on the bound surface. **The runtime object handed to a module must itself omit the forbidden capabilities.** A full Kysely object viewed through a narrowed TypeScript interface is not sufficient, because the methods are still present at run time. How Foundation builds the restricted object is an implementation detail; the properties above are the requirement and are verified by the negative tests below.

**Escape hatches — Kysely can do cross-schema and raw operations.** Kysely itself is capable of naming any schema or table and of executing arbitrary SQL. Typing the surface to one module's schema does not make another module's tables unnameable. The following capabilities, and their equivalents in the pinned version, are therefore prohibited to feature-module data access and absent from the runtime object modules receive:

- `withSchema()` and `withTables()`;
- `sql.raw()`, `sql.id()`, `sql.table()`, `sql.ref()`, `sql.lit()`;
- `CompiledQuery.raw` and `executeQuery`;
- `getExecutor()`;
- schema-building and introspection APIs;
- plugin registration and mutation APIs;
- unsafe casts (`as any`, `as unknown as …`) used to get past the query-surface type.

This list is not permanently exhaustive. It is reviewed against the library's public API whenever Kysely is upgraded, and the negative tests (4.7) are revisited at the same time; an upgrade is not adopted until both are done.

Feature-module raw SQL is limited to **static SQL templates with bound values**. Building identifiers, schema names or table names dynamically is prohibited in feature modules (4.8 layer 5). The Foundation infrastructure directory is the only place where an escape hatch may be used, under review.

**Connection and transaction lifecycle invariants.** These are required properties; the mechanism that delivers them is deferred to implementation and to the Foundation brief.

1. A physical connection returns to its pool only after a confirmed `COMMIT` or `ROLLBACK`.
2. If transaction cleanup cannot be confirmed, the connection is destroyed, not returned for reuse.
3. The module query surface is revoked before `COMMIT` or `ROLLBACK` begins.
4. A stale surface cannot execute anything after its transaction has completed.
5. In-flight or un-awaited work cannot escape into autocommit or into a later borrower's transaction.
6. A feature-module surface cannot issue `BEGIN` or create a nested or root transaction.
7. Tests against real PostgreSQL cover: normal commit; rollback; thrown exception; timeout; cancellation; an un-awaited query or promise; a stale reference; and subsequent reuse of the pooled connection by a different tenant (4.7).

**Cross-module transaction handle.** Transaction propagation is separated from query capability. This is a tooling and security constraint on how the contract's existing cross-module mechanisms (ADR-013; DM §19) are implemented; it changes none of them.

- What passes between module public APIs to carry a transaction is an opaque handle. It has no query-builder capability and no method that executes SQL.
- It exposes nothing equivalent to `tx.forSchema("identity")`, where an arbitrary caller chooses a schema.
- Only the owning module can derive its own schema-bound query surface from the handle, through a capability private to that module and protected by the layer 1 import rules (4.8).
- Public module APIs never accept or return query surfaces, Kysely builders, database clients, SQL fragments or any schema-selection capability.
- Negative architecture tests assert each of these (4.7).

**Transactions opened before a tenant is known.** Not every `cm_app` transaction begins with a known tenant; the contract authorizes certain operations before tenant resolution. Foundation still opens **every** `cm_app` transaction. For a transaction opened before tenant resolution:

- context is explicitly initialized in the fail-closed, no-tenant state — it is set, not left unset;
- no tenant context can be inherited from an earlier use of the connection;
- the surface made available is narrower than the normal tenant-bound surface;
- it exists only for operations the contract already authorizes.

This ADR does not enumerate or redefine those operations; they are the contract's and the Foundation brief's. Job-path variants that run without a tenant remain blocked by CR-10, which this ADR does not decide.

**How the boundary is enforced.** TypeScript types alone are not a security boundary: a type can be cast away, and types do not exist at run time. The boundary rests on four things together:

1. _Import restrictions._ Outside the Foundation database infrastructure directory, importing `pg`, the Kysely root and dialect constructors, or Foundation's database internals is forbidden by an architecture rule (4.8). Feature modules can import only the surface's interface type.
2. _Negative architecture tests._ Tests assert that no feature-module file imports or constructs the forbidden primitives; that the runtime object given to a module has no reachable method that opens a connection, pool or root transaction; and that each prohibited capability class in "Escape hatches" is absent from it.
3. _Runtime behaviour._ The lifecycle invariants above; credentials for the database roles are held only by the infrastructure; the pooled-connection leak test and the cross-tenant suite (4.7) run against real PostgreSQL.
4. _Database controls._ Forced RLS, role privileges and grants (DM §6.3, §6.4) are the actual tenant-security boundary and hold even if application code is wrong.

**Credential reachability and session-context controls** (`[C]` mechanisms serving DM §6.2, §6.4 and Arch §3).

- Each entry point's composition root receives only the runtime database credentials that entry point is allowed to use (Arch §3): the API composition only its own; the worker and scheduler compositions only theirs.
- `cm_migrator` credentials are unavailable to API, worker and scheduler composition. Only the migration command consumes them (4.12).
- `cm_ops_readonly` credentials are unavailable to normal runtime composition.
- Runtime SQL controls (lint rules and tests, 4.7) prohibit, in application code, every form that alters session or security context: session-level `set_config(..., false)`; `SET` other than transaction-local use by Foundation; `SET ROLE`; `SET SESSION AUTHORIZATION`; `RESET`; `DISCARD`; and equivalent mechanisms.
- Catalogue assertions (4.7) verify that `cm_app` and `cm_queue` are not `SUPERUSER`, not `CREATEROLE`, not `BYPASSRLS`, and not members of any other role. Nothing is asserted here about role membership involving `cm_migrator` or `cm_resolver`; where that is unresolved it stays with CR-7.

**Schema qualification.** Feature-module SQL and migration SQL name every object with its explicit schema. Runtime correctness never depends on a session-set `search_path`. SECURITY DEFINER functions still carry their own explicitly pinned, safe `search_path`, as their security rules require (FB §14).

**What Kysely must not own, define or be relied on for:**

- the transaction lifecycle — when a transaction starts and ends is Foundation's decision, even where Kysely physically emits the statements;
- tenant context — no query-builder plugin or hook issues `set_config`;
- RLS — policies exist only in SQL migrations; no application-side filter stands in for them;
- roles and grants;
- schema definitions as migration authority — its types are _generated from_ the migrated database, per module schema, and are never the source of DDL; its migration facility is not used;
- SECURITY DEFINER functions;
- any other security-sensitive DDL.

Evaluation against the contract:

| Requirement                                                                     | `pg` + Kysely                              | Prisma                                                                                                        | Drizzle                                                              | `pg` alone         |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| Explicit transaction; `set_config` as first statement (R4)                      | Direct                                     | Possible through interactive transactions or a client extension that wraps queries; the mechanism is implicit | Direct                                                               | Direct             |
| Separate pools per role — `cm_app`, `cm_queue` (R5)                             | Direct                                     | One client per connection string                                                                              | Direct                                                               | Direct             |
| DDL authored exactly: roles, column grants, policies, SECURITY DEFINER (R5, R7) | Not involved — DDL lives in SQL migrations | Its schema file and migration engine expect to own DDL; grants, policies and functions sit outside its model  | Its kit can generate DDL from a TypeScript schema; usable without it | Not involved       |
| No data model spanning modules (R2)                                             | Per-schema generated types                 | One schema file with relations across models                                                                  | Per-schema definitions possible                                      | Hand-written types |
| `FOR UPDATE SKIP LOCKED`, advisory locks (R9)                                   | Yes                                        | Raw SQL only                                                                                                  | Yes                                                                  | Yes                |
| Type safety                                                                     | Good                                       | Very good                                                                                                     | Good                                                                 | Low                |

- _Why._ The security model lives in the database. The data layer must stay out of the way of DDL and give explicit control of the transaction. A query builder does that; an ORM adds a second source of truth for the schema.
- _Rejected: Prisma._ Not because it cannot do RLS — it can — but because its schema and migration engine compete with SQL-first DDL, and a single schema file with relations across modules contradicts "no shared ORM entities" (ADR-013).
- _Rejected: Drizzle._ Capable and close to Kysely as a query layer. Not proposed because its schema-definition and migration generator would be a second place where tables are described; Kysely has no schema-management role in this design.
- _Pre-1.0 status — flagged for review._ Kysely's published version is below 1.0 (npm registry, checked 2026-10-04), so minor releases may contain breaking changes. Mitigations proposed: exact pin; construction confined to Foundation and use confined to module data-access code; because of the boundary above, replacing Kysely with `pg` alone would change query-building code only, not transactions, security or migrations.
- _Rule that follows._ No code may rely on session state. The application never connects as a schema owner or superuser (DM §6.4).

### 4.4 Migrations

Two decisions are kept apart.

**A. Migration architecture — proposed for acceptance.**

1. SQL-first: migrations are plain SQL.
2. Forward-only: expand/contract per ADR-023; a mistake is corrected by a new migration, not by a down-migration.
3. The reviewed SQL files are authoritative. Nothing generates DDL from application code, and no tool's model of the schema outranks the files.
4. Migrations execute under the migration role, `cm_migrator`, in the deployment pipeline before the application is deployed (ADR-023; Arch §3, §33; DM §6.4). The application roles cannot run them.
5. Migration history and integrity are recorded: which files were applied, in what order, with a checksum, so that an edited or missing applied file is detected.
6. CI proves two things on every change: a clean database migrates from nothing to the current schema; and the applicable upgrade path works — the previous release's schema migrates forward, and the previous release's code still runs against the new schema for one release (ADR-023).
7. Each file is attributed to one module schema or to Foundation, in a single ordered history.
8. A schema-only dump is produced in CI so that reviewers read the resulting roles, grants, policies and functions, not only the deltas.
9. Migration SQL uses explicit schema-qualified object names and does not depend on a session-set `search_path` (4.3).

**Migration security invariants** (`[C]` mechanisms serving DM §6.3, §6.4 and ADR-012). Migrations must not:

- disable RLS on a protected table;
- remove `FORCE ROW LEVEL SECURITY`;
- grant `BYPASSRLS` outside an authoritative decision;
- create role membership the contract does not authorize.

These are checked statically on the migration files and, where the result is observable, by PostgreSQL catalogue assertions after migration (4.7).

Every SECURITY DEFINER function must have: an explicitly pinned, safe `search_path`; `EXECUTE` revoked from `PUBLIC`; explicit `EXECUTE` grants to the intended roles only; and reviewed ownership. Catalogue assertions verify all four.

**Test-harness privileges.**

- Superuser or provider-admin access is used only for the bootstrap actions that production also needs from the provider or admin plane.
- The migrations themselves execute as `cm_migrator` with production-equivalent privileges.
- Application and RLS tests execute as the actual runtime roles.
- A test must not pass because the test container defaulted to a superuser connection; the harness asserts the role it is connected as.

**Blocked or open, not solved here.**

- _Role bootstrap._ How the five roles — in particular the NOLOGIN `BYPASSRLS` role — are created on managed PostgreSQL has no final mechanism until CR-7 item 5 and the managed-PostgreSQL provider ADR are decided. `[D]`
- _FORCE-RLS and backfills._ How a data backfill is carried out on a table under forced RLS, by a role without `BYPASSRLS`, is an open question for the Foundation brief. It is recorded here and not answered. `[D]`

_Why._ R5, R7 and R8 need roles, column grants, policies, triggers, partial indexes and SECURITY DEFINER functions written exactly as designed. Plain SQL represents all of it; nothing has to be worked around.

**B. Migration runner — deferred** `[D]`. No runner is selected: this ADR does not hold enough evidence to accept one. The runner is chosen by a short follow-up decision (section 6) against these acceptance criteria:

| #   | The runner must                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Execute plain SQL files unchanged, up-only                                                                                                                                            |
| M2  | Keep one ordered history with per-file checksums and fail on tampering or gaps                                                                                                        |
| M3  | Run under a supplied non-superuser role and need no privilege beyond what `cm_migrator` holds                                                                                         |
| M4  | Manage no roles, schemas or objects on its own initiative beyond its history table                                                                                                    |
| M5  | Be callable from the test harness, so tests migrate a real database the same way the pipeline does                                                                                    |
| M6  | Allow statements that cannot run inside a transaction to be marked as such                                                                                                            |
| M7  | Be maintained, with a supported release for the pinned runtime                                                                                                                        |
| M8  | State, for its migration-history table: where it is stored (schema and table), who owns it, which privileges it needs, and how it is treated in the table-category registry (DM §6.3) |

On M8: no schema or placement is invented here. If the selected runner requires a schema or table placement that the authoritative contract does not permit, engineering-authority approval — and possibly a change record — is required before implementation. No change record is created now.

Candidates to assess against M1–M8 (none preferred here): node-pg-migrate in SQL-file mode, dbmate, Flyway, graphile-migrate, or a minimal in-repository runner. Atlas-style declarative diffing is excluded by A.3.

_Left open._ The runner (above); any rollback procedure beyond roll-forward (the contract specifies none; FB §15).

### 4.5 Queue — integration capabilities only

**Deferred** `[D]`. The queue implementation is not chosen, evaluated or narrowed by this ADR. It is sign-off gate 12 (16 §6.5 row 12); ADR-001 sets its acceptance criteria; and CR-10 (OPEN) governs the job table's `tenant_id` and the job envelope. A separate queue-implementation ADR is required before Foundation task 7, after CR-10 is decided.

**What this stack must offer any queue implementation** (restating ADR-001 in stack terms; nothing new is decided):

- the queue lives in the same PostgreSQL database as the domain data;
- enqueue runs on the caller's open transaction handle (4.3), so a job exists only if the producing transaction commits;
- workers dequeue through a `cm_queue` pool that is separate from the `cm_app` pool;
- row locking with `SKIP LOCKED` and multi-statement transactions are available to it through `pg`;
- its tables are created by SQL migrations under 4.4 and registered like any other table;
- no broker or cache is added.

Nothing here decides the envelope, the representation of jobs without a tenant, or any library.

**Queue writer role — open question for the queue ADR / gate 12** `[D]`. This ADR does not decide which role inserts job rows. The queue ADR must answer:

- which runtime role inserts (enqueues) job rows;
- what grants that requires;
- how enqueue-in-the-caller's-transaction (ADR-001) is preserved under that answer.

For context only: the contract lists the OPERATIONAL category as written by "cm_queue, cm_app (rate limits)" (DM §6.3) and limits `cm_queue` to "queue and admission tables only" (DM §6.4), while ADR-001 requires enqueue inside the caller's transaction. Reconciling these is the queue ADR's task. If its answer conflicts with the authoritative role and grant contract, a change record is required before implementation. None is created now.

### 4.6 Validation and API contracts

**Proposal.** Zod for runtime validation at every boundary: HTTP request and response DTOs, job payloads per `payload_version`, configuration at start-up. Static types are inferred from the schemas.

**Trust boundaries that are validated at run time** (`[C]`). In addition to HTTP requests, job payloads and configuration:

- inbound webhooks, after provider and signature verification (verification comes first; validation does not replace it);
- responses from external providers and adapters, including where applicable AI outputs, sandbox / code-execution results, extraction and parser results, and messaging-provider responses.

**What validation is not.** Validation checks shape. It does not perform authorization; it does not resolve tenant identity; it does not construct `ActorContext`; it does not replace business-invariant checks; and it does not replace database constraints. DTO schemas must not accept caller-supplied security-context fields (tenant, actor, role, permission) as a substitute for trusted context (DM §28; ADR-012).

- _Alternatives._ TypeBox (JSON Schema, native to Fastify, faster; less expressive refinement); class-validator (decorator-based; weaker inference); Valibot (smaller ecosystem).
- _Left open._ API description format and any generated client. Job payload schemas must not fix whether `tenant_id` is optional — CR-10.

### 4.7 Testing

**Proposal.**

| Need                                                                                                                                            | Tool / approach                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner for unit, integration and architecture tests                                                                                             | Vitest                                                                                                                                                                                                                                                                                                                                            |
| Real PostgreSQL in tests                                                                                                                        | Testcontainers, same PostgreSQL major as production; superuser used only for provider-plane bootstrap; migrations applied as `cm_migrator`; tests connect as `cm_app` / `cm_queue`, never as owner or superuser, and assert the connected role (4.4)                                                                                              |
| RLS, grants, registry-vs-RLS, cross-schema FK, role attributes                                                                                  | Assertions written as SQL against the system catalogues, including: `cm_app` and `cm_queue` not `SUPERUSER`, `CREATEROLE` or `BYPASSRLS` and not members of another role (4.3); RLS enabled and forced after every migration; SECURITY DEFINER functions with pinned `search_path`, no `PUBLIC` execute, intended grants and expected owner (4.4) |
| Migration security                                                                                                                              | Static checks on migration files for the prohibited statements of 4.4, plus the catalogue assertions above                                                                                                                                                                                                                                        |
| Connection and transaction lifecycle                                                                                                            | Integration tests for the eight cases of 4.3 (commit, rollback, exception, timeout, cancellation, un-awaited work, stale reference, cross-tenant pool reuse)                                                                                                                                                                                      |
| Query-surface escape hatches; opaque transaction handle; `ActorContext` / `SystemActor` construction                                            | Negative architecture tests per prohibited capability class (4.2, 4.3); revisited on every Kysely upgrade                                                                                                                                                                                                                                         |
| Sensitive-logging canaries                                                                                                                      | The canary suite extended to URL / path / query tokens, database error details and validation errors (4.11)                                                                                                                                                                                                                                       |
| Pooled-connection leak                                                                                                                          | The integration suite run through a transaction-mode pooler container as well as direct pools                                                                                                                                                                                                                                                     |
| Concurrency (CAS, leases, SKIP LOCKED)                                                                                                          | Multiple real connections; no mocks                                                                                                                                                                                                                                                                                                               |
| Property tests (head CAS; projection equals rebuild)                                                                                            | fast-check                                                                                                                                                                                                                                                                                                                                        |
| Import boundaries: module public surface, SDK outside adapters, dependency direction, forbidden database-constructor imports                    | dependency-cruiser rules (4.8 layers 1–2)                                                                                                                                                                                                                                                                                                         |
| SQL ownership: location of SQL and query helpers; static SQL naming another module's schema; dynamic identifier construction in feature modules | Repository-convention checks and lint rules (4.8 layers 4–5); acknowledged as incomplete for dynamically built SQL                                                                                                                                                                                                                                |
| Negative tests for prohibited access paths                                                                                                      | Architecture tests on the query surface (4.3); integration tests against real PostgreSQL wherever the database's own privileges can refuse the action (4.8 layer 6)                                                                                                                                                                               |
| Session-level `SET` and the other session- or role-changing forms of 4.3; transaction across I/O                                                | Lint rules, plus a runtime guard active in tests that fails when an adapter is called inside an open transaction                                                                                                                                                                                                                                  |
| Provider contract tests                                                                                                                         | One contract suite per port, run against each adapter                                                                                                                                                                                                                                                                                             |

Rule: where PostgreSQL behaviour is what is being verified, PostgreSQL is used. Mocks are for provider ports only.

- _Alternative runner._ Jest (mature; slower; awkward with native ES modules); the Node built-in test runner (no dependency; thinner tooling).

### 4.8 Repository structure, boundary enforcement and package management

**Proposal.** A single package. No workspaces, no Nx, no Turborepo. pnpm as package manager, pinned exactly, with a committed lockfile.

**A single package does not mean weak module boundaries**, and no single tool proves them. The contract says schema isolation is enforced "by architecture tests and repository conventions, not grants" (DM X15), and AGENTS §4 extends the prohibition to every indirect path: raw SQL, shared repository helpers, generic data-access packages, query builders, views, helper services, cross-schema joins and cross-module FKs. Import analysis cannot establish data ownership by itself. The proposal is defense in depth, in seven layers.

**Two different things are being enforced, and they are not the same:**

- _Architectural ownership_ — module A does not read or write module B's tables. In this architecture that is enforced by conventions, static checks and tests. PostgreSQL does **not** enforce it between feature modules (layer 6).
- _Tenant security_ — tenant X never sees tenant Y's rows. That is enforced by PostgreSQL itself through forced RLS and role privileges, whatever the application code does.

**Layer 1 — Import boundaries.** dependency-cruiser rules, run as architecture tests, forbid a module from importing: another module's internal files of any kind, including its data-access code and repositories; another module's private SQL or query helpers; Foundation's database internals; and provider SDKs outside `adapters/`. The only importable part of a module is its public entry file (ADR-013; DM §19). Dependency direction follows AGENTS §4; cycles are forbidden.

**Layer 2 — Database construction boundary.** Only Foundation database infrastructure may construct a `pg` Pool, a `pg` Client, a Kysely root instance, a Kysely dialect, any unrestricted or raw database client, or any transaction-capable database root. Feature modules construct none of them. Enforced by forbidden-import rules on those packages and constructors outside the infrastructure directory, with a negative test (4.3).

**Layer 3 — Transaction-bound data surface.** Module data-access code receives the narrow query surface of 4.3, already bound to the active Foundation-owned transaction. It never receives a pool or root client from which another connection or transaction could be made. The chain `ActorContext` → `TenantTransaction` → transaction-local tenant context → module query operations stays visible in the code. The surface is typed to the receiving module's schema, which helps authors and reviewers; it does not make another module's tables unnameable, because Kysely itself can address any schema and run raw SQL. The escape hatches listed in 4.3 are therefore removed from the runtime object and prohibited by lint rule. What crosses a module's public API to carry a transaction is the opaque handle of 4.3, never a query surface.

**Layer 4 — SQL ownership convention.** All raw SQL and all query helpers live under an identifiable owner: a module's own data-access directory, or the approved Foundation infrastructure location. No shared or generic data-access directory exists. A check fails on SQL or query helpers found anywhere else. Feature-module SQL must not target another module's schema. The only cross-module database mechanisms are those the architecture already defines; this ADR adds none:

- the six X1 resolver functions, owned by Foundation, as the closed exception (DM §6.4 [CR-3], [CR-3-F1]);
- the shared `audit` schema written through the `RecordAuditEvent` library (W1 §7, §8);
- the queue and admission tables used through Foundation's queue infrastructure (ADR-001; DM §6.3).

**Layer 5 — Static-analysis limit, stated plainly.** Static analysis cannot soundly determine the target of arbitrary dynamically constructed SQL. Neither dependency-cruiser nor a lint rule nor a text scan can prove the absence of cross-schema access, and this ADR does not claim that they do. What is proposed instead:

- feature-module data access must not construct SQL identifiers or schema names dynamically — no building of table, column or schema names from variables, and no raw-string SQL interpolation — unless an explicitly reviewed Foundation infrastructure mechanism requires it;
- passing _values_ as bound parameters is ordinary and is not dynamic identifier construction;
- feature-module raw SQL is limited to static SQL templates with bound values, using explicit schema-qualified names;
- lint rules forbid the raw and dynamic-identifier escape hatches of the query layer in feature modules (the list in 4.3, which is not permanently exhaustive), and the runtime object omits them;
- with identifiers static, a scan of SQL text and of migrations for schema-qualified names outside the owning schema is meaningful as a detective check. It remains a detective check, not a proof.

**Layer 6 — What the database enforces, and what it cannot.** PostgreSQL privileges, ownership and RLS are part of the real enforcement boundary, within the approved role model (DM §6.3, §6.4):

| The database does enforce                                                                                                                                 | The database does not enforce                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation on every tenant-owned table (forced RLS), for every module alike                                                                         | Separation between feature modules: all of them run as the single application role `cm_app`, which has DML on module tables. The contract defines no per-module roles ("per-module roles would break mechanism A", DM X15), and this ADR invents none |
| `cm_queue` limited to queue and admission tables                                                                                                          | Which module issued a given statement                                                                                                                                                                                                                 |
| `cm_app` is not an owner, has no `BYPASSRLS`, cannot alter schema                                                                                         |                                                                                                                                                                                                                                                       |
| Append-only audit (no UPDATE or DELETE for the application role); REFERENCE tables read-only to `cm_app`; `cm_app` has no write grants on PLATFORM tables |                                                                                                                                                                                                                                                       |
| `cm_resolver` limited to its listed columns and to INSERT on `identity.resolver_audit`; `cm_app` without that INSERT                                      |                                                                                                                                                                                                                                                       |

On PLATFORM tables this ADR states only what the role table supports. DM §6.3 attributes their writes to a "platform ops role", but the role table in DM §6.4 defines no role of that name. Which role or mechanism writes PLATFORM tables is an existing unresolved concern outside this ADR `[D]`; it is neither decided nor assumed here.

So a statement from module A against module B's tenant table, inside a valid tenant transaction, would be allowed by PostgreSQL and still constrained to the right tenant. Preventing it is the job of layers 1–5 and of review. This is a property of the approved architecture, not a weakness introduced by the single package.

**Layer 7 — Evidence required in CI.** Complementary, none sufficient alone:

- dependency and import architecture tests (layer 1);
- forbidden database-constructor import tests (layer 2) and negative tests on the query surface (layer 3), one per prohibited capability class, revisited on every Kysely upgrade;
- negative tests that no public module API accepts or returns a query surface, builder, client, SQL fragment or schema-selection capability, and that `ActorContext` / `SystemActor` cannot be constructed outside their owners (4.2, 4.3);
- SQL-ownership location check and the static SQL scan (layers 4–5);
- tests that attempt each prohibited cross-module access path that is statically expressible, and must fail the build;
- PostgreSQL catalogue assertions: grants, ownership, role attributes, forced RLS, no cross-schema FK;
- negative integration tests against real PostgreSQL wherever the database's own model can refuse the action — for example `cm_app` updating an audit row, `cm_queue` reading a domain table, a query without tenant context returning rows, a cross-tenant id.

These are the architecture tests the Foundation brief already requires (FB §14); this ADR names tools and makes the limits explicit. Reviewers judge "by what a call actually reads, not by the layer it is called through" (AGENTS §4); the checks support that review and do not replace it.

**When workspace or monorepo tooling would be justified later.** Any one of: a second independently deployable artefact with its own dependency set; a module that must be published or versioned separately; build or test time that file-level caching inside one package can no longer keep acceptable; or a boundary that cannot be expressed as an import rule. None applies to the contract's one-image design (Arch §33). Adding such tooling would be a new ADR. Note that workspaces would strengthen layer 1 only; they would not change layers 5 or 6.

- _Why pnpm._ Strict dependency resolution prevents use of undeclared packages, and dependency install scripts are not run unless allowed, which matters for supply-chain safety (R20). _Alternative:_ npm (one tool fewer; looser resolution). Either satisfies the contract.
- _Layout (indicative, `[C]`)._ `src/modules/<schema>/` with a public entry file, domain, data access and `adapters/`; `src/foundation/` including the database infrastructure; `src/entrypoints/{api,worker,scheduler}`; `migrations/`; `tests/`.

### 4.9 Lint and format

**Proposal.** ESLint with typescript-eslint for correctness rules and the custom rules of 4.7; Prettier for formatting, **excluding `docs/specifications/authoritative/`** so that frozen documents are never reformatted.

### 4.10 Local development and local secrets

**Proposal.** Docker Compose for a long-lived local PostgreSQL (and the pooler); Testcontainers for tests. Native services are not required.

Local secret mechanism (AGENTS §9.6 requires this ADR to define it): configuration is read from environment variables and validated at start-up; locally they come from an untracked `.env.local` (already ignored by `.gitignore`) holding only credentials for local containers; a committed `.env.example` lists variable names with placeholders. No production or provider credential is ever placed in a local file. Code reads secrets only through a secret-access port; the local adapter reads the environment, and the deployed adapter is defined by the secrets/KMS provider ADR.

**Local and CI secret hygiene** (`[C]` architecture-level rules serving ADR-024 and AGENTS §9; no secret store or KMS vendor is chosen):

- Compose consumes local secrets only from the approved untracked local mechanism above;
- `.env*` files are excluded from the image build context;
- secrets are never Docker build arguments;
- secrets are never baked into image layers;
- configuration-validation errors report key names, never values;
- resolved configuration is never dumped to logs;
- local and test databases use ephemeral, non-production credentials;
- operational instructions avoid placing credentials on command lines where practical.

### 4.11 Observability

**Proposal.** OpenTelemetry API and SDK for traces and metrics, exported over OTLP to a collector endpoint; structured JSON logs to standard output with pino; correlation id carried in asynchronous context and set on every span and log line. Instrumentations are enabled one by one and configured not to record SQL parameters or HTTP bodies (R13). Errors are reported through traces and logs; no separate error-reporting vendor.

**Data minimization: allow-listing is the primary policy** (`[C]` mechanisms serving DM §27, §30 and ADR-006). Redaction remains as defense in depth; it is not the primary control.

- The logging API accepts only explicitly allowed structured fields. There is no free-form object or message interpolation path that bypasses the allow-list.
- OpenTelemetry export passes through an allow-list policy/processor that removes every attribute not approved for export.

Required behaviour:

- the framework's default request logging is disabled wherever it could record a sensitive URL;
- no raw request URL that may contain capability or token material is recorded; routes are recorded as templates;
- no request or response bodies by default;
- no authorization, cookie or token headers;
- no SQL parameter values and no sensitive database statement data;
- database errors are logged by stable code and constraint metadata, not by raw `detail` or `where` values;
- validation errors do not echo sensitive input values;
- no learner, guardian, provider or AI content, unless a later data-classification rule explicitly approves it;
- `tenant_id` is set on spans as the contract requires (DM §27) but is not propagated as outbound baggage to third parties.

The sensitive-logging canary tests (DM §29; FB §14) are extended to cover URL / path / query tokens, database error details and validation errors (4.7). No observability vendor is chosen.

- _Why._ Open standard; no vendor chosen; traces and metrics are stable in the JavaScript SDK while the logs signal is not, so logs stay on standard output.
- _Left open_ `[D]`. The backend and collector deployment (provider ADR); SLO and alert thresholds (gate 11).

### 4.12 Containers

**Proposal.** One OCI image built from a pinned Node.js base image, non-root, with three start commands. The migration job uses the same image with a fourth command and the `cm_migrator` credential; that credential is supplied to the migration command only and is never present in the API, worker or scheduler environment (4.3). Production base images are pinned by digest. No secret is passed as a build argument or stored in a layer, and `.env*` is excluded from the build context (4.10).

### 4.13 CI — required capabilities

The platform is `[D]`: the repository has no remote configured, so no host is fixed. Whatever is chosen must provide: runs on every change; container services for PostgreSQL and the pooler; required status checks and branch protection; a path guard on `docs/specifications/authoritative/**`; secret scanning (candidate tool: gitleaks); the migration job as a separate step under `cm_migrator`; building and storing the image. No CI is created by this ADR.

**Supply-chain controls** (`[C]`, proportionate to a commercial V1; serving Cross-ADR Rule 6; no vendor chosen):

- CI installs dependencies from the frozen lockfile and fails if the lockfile would change;
- every exception that allows a dependency's install script to run is explicit and reviewed;
- dependency vulnerability scanning is a required CI capability;
- container image vulnerability scanning is a required CI capability;
- production base images are pinned by digest (4.12).

### 4.14 PostgreSQL version

**Proposal.** PostgreSQL 18 is the Phase 1 baseline major: development, tests, CI and production all run major 18.

- _Evidence._ The PostgreSQL versioning policy page lists 18 as the latest supported major (first released 25 September 2025; supported until 14 November 2030; current minor 18.6 on 2026-10-04). Its documentation includes a native `uuidv7()` function, which matches the DM A10 identifier default.
- _This is a pinned baseline, not a minimum._ A later PostgreSQL major is not acceptable merely because its number is higher. Adopting one is a deliberate infrastructure and runtime upgrade: the full test catalogue passes on the new major in CI, the provider supports it, the upgrade is rehearsed, and the change is recorded. Minor releases within major 18 follow the provider's maintenance.
- _Left open._ Whether the chosen managed provider offers major 18 (provider ADR).

## 5. Requirements this stack places on providers (not vendor choices)

| Area               | Requirement                                                                                                                                                                                                                                                                                      | Source                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Runtime            | Runs OCI containers; three independently scaled services plus a one-off job                                                                                                                                                                                                                      | Arch §33                               |
| Managed PostgreSQL | The baseline major of 4.14 (18); PITR; `citext`; the five roles as designed. Whether and how a NOLOGIN `BYPASSRLS` role can be created, and function ownership assigned to it, without superuser is **CR-7 item 5 — a question the provider decision must answer, not an outcome presumed here** | Arch §33; ADR-023; DM §5.2, §6.4; CR-7 |
| Pooling            | Transaction-mode pooling compatible with the driver's statement handling                                                                                                                                                                                                                         | ADR-012                                |
| Object storage     | Versioning; write-once (object lock) for the deletion ledger; short-lived signed URLs                                                                                                                                                                                                            | DM X11, §22; ADR-012                   |
| Secrets / KMS      | Managed store; envelope encryption for per-tenant credentials                                                                                                                                                                                                                                    | ADR-024                                |
| Telemetry          | Accepts OTLP                                                                                                                                                                                                                                                                                     | Arch §30                               |

## 6. Decisions deliberately deferred

| Decision                                                                                              | Where it belongs                                                                                                                                                         | Blocks                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Queue implementation, including which runtime role enqueues job rows and with what grants (4.5)       | Separate stack ADR, after CR-10; feeds gate 12. A change record is required first if its answer conflicts with the role and grant contract                               | FB task 7                                          |
| Migration runner, including history-table location, ownership, privileges and registry treatment (M8) | Short follow-up decision against criteria M1–M8 (4.4 B). Engineering-authority approval, and possibly a change record, if the placement is not permitted by the contract | FB task 3 and every later task with a migration    |
| Role bootstrap mechanism on managed PostgreSQL                                                        | CR-7 item 5 and the managed-PostgreSQL provider ADR                                                                                                                      | FB task 3 (role creation)                          |
| Backfill handling under forced RLS                                                                    | Foundation brief (open question)                                                                                                                                         | Any migration with a backfill on a protected table |
| Writer role or mechanism for PLATFORM tables                                                          | Existing unresolved concern outside this ADR (DM §6.3 names a role that DM §6.4 does not define)                                                                         | Not decided here                                   |
| Implementation mechanism for the lifecycle invariants and the restricted query surface (4.3)          | Implementation detail under the Foundation brief                                                                                                                         | FB data-access tasks                               |
| Repository host and CI platform                                                                       | Separate stack ADR or an amendment to this one                                                                                                                           | FB tasks 1–2                                       |
| Hosting, managed PostgreSQL, pooler product                                                           | Provider ADR; must answer CR-7 item 5                                                                                                                                    | FB task 3 (role creation); deployment              |
| Object storage                                                                                        | Provider ADR                                                                                                                                                             | FB task 8                                          |
| Secret store / KMS                                                                                    | Provider ADR                                                                                                                                                             | FB task 9                                          |
| Observability backend                                                                                 | Provider ADR                                                                                                                                                             | FB task 10                                         |
| Staff IdP, messaging, AI, sandbox, malware scanner, document extraction                               | Provider ADRs under the owning modules' briefs                                                                                                                           | Not Foundation                                     |
| Health/readiness endpoints, graceful shutdown                                                         | Implementation detail within the framework chosen here; the contract is silent (FB §8, §10)                                                                              | —                                                  |

**ADR boundary.** One ADR for language, runtime and tooling, because these choices constrain each other and reviewing them apart would hide the interactions. Vendors and the queue get their own ADRs because each has a different owner, gate or open change record.

## 7. Version policy

Version numbers are not architecture. This section fixes the policy and records only the two versions that are baseline decisions or currently applicable candidates. Library version numbers are deliberately absent: they are resolved from the package registry when the lockfile is first created and are recorded there.

**Durable policy.**

1. Production runs a supported Node.js LTS major.
2. The repository, toolchain and container image pin the exact Node.js major (and the exact version in the image and runtime version file).
3. A runtime-major upgrade requires CI compatibility verification — the full catalogue green on the new major — before it is adopted. It is a deliberate change, not an automatic one.
4. The PostgreSQL major is pinned as in 4.14 and upgraded under the same discipline.
5. The TypeScript compiler and the package manager are pinned exactly.
6. Libraries use semver ranges within their current major, with the committed lockfile giving reproducible builds. Pre-1.0 libraries are pinned exactly.
7. Dependency updates are proposed automatically and reviewed like any other change. No dependency is added without a named need.
8. Only maintained releases supported on the pinned runtime are used (Cross-ADR Rule 6).

**Currently applicable candidates** (primary sources, checked 2026-10-04):

| Item       | Verified status                                                                                                                                                                                                                                     | Candidate under the policy                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js    | Release schedule of the Node.js Release working group: v24 entered LTS 2025-10-28, moves to maintenance 2026-10-20, end of life 2028-04-30. v26 was released 2026-05-05 and is scheduled to enter LTS on 2026-10-28; it is not an LTS release today | More than one supported LTS major can satisfy policy rule 1 at a given time (v22 is also still within its supported LTS life, to 2027-04-30). **Node.js 24 is the proposed Phase 1 baseline.** The exact runtime major is pinned in the repository, toolchain and container configuration after this ADR is accepted. Node.js 26 is not selected, because it has not reached LTS; any later major upgrade requires the compatibility verification of rule 3 |
| PostgreSQL | Versioning policy page: 18 is the latest supported major                                                                                                                                                                                            | **PostgreSQL 18** (4.14)                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Version numbers reported by secondary sources for other tools were removed from this ADR as unverified.

## 8. Interaction with open change records

| Record                                             | Interaction                                                                                                                                                                                                                                                                                | Decided here? |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| CR-1-F1 (SystemActor permission matrix)            | 4.2 restricts _where_ a `SystemActor` may be constructed; what it is authorized to do stays with CR-1-F1                                                                                                                                                                                   | No            |
| CR-5-F1 (classification of `provider_account_ref`) | None                                                                                                                                                                                                                                                                                       | No            |
| CR-7 (resolver schema and ownership privileges)    | Items 1–4, 6, 7 are expressible in plain SQL migrations whatever is decided. Item 5 is a question the managed-PostgreSQL provider ADR must answer (section 5); the role-bootstrap mechanism and any role membership involving `cm_migrator` or `cm_resolver` stay blocked on it (4.3, 4.4) | No            |
| CR-8 (duplicate provider account reference)        | Either path is a constraint or function behaviour in SQL                                                                                                                                                                                                                                   | No            |
| CR-9 (resolver-audit hashed inputs)                | A keyed hash would create a dependency on the secrets/KMS ADR; no algorithm, key or location is implied by this stack                                                                                                                                                                      | No            |
| CR-10 (jobs without a tenant)                      | The queue implementation ADR waits for it; payload schemas and generated types fix nothing about `tenant_id`; the job-path variants of the pre-tenant transaction (4.3) stay blocked on it                                                                                                 | No            |
| CR-6                                               | Closed; unaffected                                                                                                                                                                                                                                                                         | —             |

## 9. Source-trace matrix

| Decision                                                                                                                                                                                                                                                                 | Traces to                                                                                                                                       | Kind                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 TypeScript / Node.js                                                                                                                                                                                                                                                 | No contract source; repository hints only                                                                                                       | New implementation-level decision; not inherited from the contract                                                                |
| 4.2 Fastify, explicit composition; lifecycle constraints; `ActorContext` / `SystemActor` construction constraints                                                                                                                                                        | ADR-013 "Communication mechanisms"; DM §19; DM X15; Arch §3; DM §28; DM §5 and §6.4 [CR-3] (Identity "Owns ActorContext construction"); ADR-012 | Proposal serving authoritative rules; the lifecycle and construction constraints are mechanisms `[C]`, not contract text          |
| 4.3 `pg` + Kysely, no ORM; Foundation-owned construction and transaction lifecycle; restricted runtime query surface; escape-hatch prohibition; lifecycle invariants; opaque cross-module handle; pre-tenant transactions; credential reachability; schema qualification | ADR-012; DM §6.2–§6.4; ADR-013 "Forbidden" list; ADR-001; AGENTS §4; Arch §3                                                                    | Proposal serving authoritative rules; every mechanism listed is `[C]`; Kysely subject to security review                          |
| 4.4 A Migration architecture, security invariants and test-harness privileges (runner deferred; M8 history table)                                                                                                                                                        | ADR-023 "Migrations"; Arch §3, §33; DM §6.3, §6.4; FB §14                                                                                       | Proposal serving authoritative rules; the invariants and checks are mechanisms `[C]`                                              |
| 4.5 Queue integration capabilities; implementation and writer role deferred                                                                                                                                                                                              | ADR-001; DM §6.3, §6.4; 16 §6.5 row 12; CR-10                                                                                                   | Restates authoritative rules; decides nothing about the queue                                                                     |
| 4.6 Runtime schema validation with Zod; validated trust boundaries; limits of validation                                                                                                                                                                                 | Serves DM §28 (explicit DTOs), ADR-023 "Job payload versioning", W1 J-12; the contract does not prescribe runtime validation                    | Proposed mechanism `[C]`                                                                                                          |
| 4.7 Test tooling, including the I/O-in-transaction runtime guard                                                                                                                                                                                                         | Serves DM §29, Arch §31, §32, AGENTS §7, FB §14, Cross-ADR Rule 8; the guard itself is not prescribed by the contract                           | Proposed mechanisms `[C]` serving the catalogue                                                                                   |
| 4.8 Single package; seven-layer boundary enforcement; pnpm                                                                                                                                                                                                               | DM A1, X15; DM §6.3, §6.4; ADR-013; AGENTS §4; W1 §7, §8; Arch §33; Cross-ADR Rule 6                                                            | Proposed mechanisms `[C]` serving authoritative rules; the database-enforcement limits are restated from DM X15 and §6.4, not new |
| 4.9 Lint/format                                                                                                                                                                                                                                                          | AGENTS §7; FB §14                                                                                                                               | Proposal                                                                                                                          |
| 4.10 Local development and secrets; local/CI secret hygiene                                                                                                                                                                                                              | AGENTS §9.6; ADR-024; AIW §11.1                                                                                                                 | Proposal required by governance; the hygiene rules are mechanisms `[C]`                                                           |
| 4.11 OpenTelemetry, pino; allow-list-first data minimization                                                                                                                                                                                                             | DM §27, §30; ADR-006; Arch §30; W1 §11                                                                                                          | Proposal serving authoritative rules; the allow-list mechanisms and extended canaries are `[C]`                                   |
| 4.12 One image; digest pinning; migrator credential confined to the migration command                                                                                                                                                                                    | Arch §33; DM §6.4                                                                                                                               | Restates the baseline; the pinning and confinement rules are `[C]`                                                                |
| 4.13 CI capabilities; supply-chain controls                                                                                                                                                                                                                              | AIW §11.1; FB §16 rows 1–2; Cross-ADR Rule 6                                                                                                    | Restates process requirements; supply-chain controls are `[C]`; platform deferred                                                 |
| 4.14 PostgreSQL 18 as pinned baseline major                                                                                                                                                                                                                              | ADR-001; DM A10; PostgreSQL versioning policy                                                                                                   | Proposal                                                                                                                          |

No proposed choice was found to conflict with an authoritative source, and this ADR itself requires no change record as written. That statement does not extend to the deferred decisions: the queue writer role (4.5) and the migration-history table placement (4.4 M8) are open, and a change record is required before implementation if the eventual answer to either conflicts with the authoritative contract.

## 10. Risks and open questions

1. **The language is an unanchored choice.** Nothing in the contract requires TypeScript. If the engineering authority prefers another language, sections 4.2–4.9 must be redone.
2. **Kysely is pre-1.0.** See 4.3; put to the reviewers in section 11 and accepted with this ADR under the stated confinement and mitigations.
   2a. **Module ownership is not enforced by PostgreSQL.** All feature modules share `cm_app` (DM X15), so architectural ownership rests on the static and test layers of 4.8 and on review. Static analysis cannot prove the absence of cross-schema access in dynamically built SQL; the proposal prohibits such construction in feature modules instead of claiming to detect it.
   2b. **Kysely's escape hatches move with its API.** The prohibited-capability list in 4.3 is not exhaustive and can go stale on an upgrade. The control is the restricted runtime object plus negative tests re-examined on every upgrade; if that proves impractical to maintain, the fallback is `pg` alone.
   2c. **The lifecycle invariants have no chosen mechanism yet.** Revoking the surface before commit, destroying connections whose cleanup is unconfirmed, and containing un-awaited work (4.3) are stated as requirements; whether the proposed libraries can deliver all of them is proven only by the eight lifecycle tests.
   2d. **Queue writer role.** The contract's role and category tables and ADR-001's enqueue-in-caller-transaction rule must be reconciled by the queue ADR (4.5); a change record may be needed then.
   2e. **Migration-history table placement** may not fit the contract's schema and registry rules for some runners (M8); approval and possibly a change record would be needed then.
   2f. **PLATFORM-table writer.** DM §6.3 names a "platform ops role" that DM §6.4 does not define; unresolved, outside this ADR.
   2g. **Backfills under forced RLS** are an open Foundation-brief question (4.4).
3. **The migration runner is undecided.** Task 3 cannot start until it is chosen against M1–M8.
4. **Framework trade-off.** Explicit composition gives up NestJS's conventions and familiarity (4.2). If the maintaining team's fluency points the other way, the decision should be revisited before code exists, not after.
5. **Managed PostgreSQL and `BYPASSRLS`.** If no acceptable provider allows the role model, that is a contract-level problem to raise under CR-7, not something to work around.
6. **Node.js timing.** Node.js 24 enters maintenance on 2026-10-20 and remains supported to 2028-04-30; Node.js 26 becomes LTS shortly after. Pinning 24 now means a planned runtime-major upgrade later under policy rule 3.
7. **The APPROVED Foundation brief still says `UNRESOLVED — STACK ADR REQUIRED`** in several places. After acceptance it needs a brief amendment (AIW §11 step 6) to cite this ADR; that is a separate, later step.
8. **Compiler and tooling compatibility** between the pinned TypeScript version, the linter and the test runner is confirmed when the toolchain is first pinned, not here.

## 11. Review and acceptance

| Step                                                                  | Who                                                      | Record                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent review                                                    | Codex, fresh instance                                    | PASS WITH REQUIRED CORRECTIONS (F-01 to F-05), as relayed by the engineering authority; corrections applied 2026-10-04. Reviewer instance identifier not supplied to the drafting agent                                         |
| Architecture / security review (touches ADR-012 and ADR-013 concerns) | Opus, fresh instance                                     | PASS WITH REQUIRED CORRECTIONS (S-01 to S-19; no blockers; no technology replacement), as relayed by the engineering authority; corrections applied 2026-10-05. Reviewer instance identifier not supplied to the drafting agent |
| Verification of the applied corrections                               | A different instance from the drafting agent (AGENTS §6) | VERIFIED — ready for engineering-authority acceptance; remaining corrections: none; further architecture/security review required: no. Result as relayed by the engineering authority on 2026-10-05; reviewer instance identifier not supplied to the drafting agent |
| Decision                                                              | Engineering authority                                    | Omar Abdulaziz / 2026-10-05 / ACCEPTED                                                                                                                                                                                          |

**Questions put to the Codex review.**

1. Does every row of the requirements matrix (section 2) match its cited source, and is any stack-relevant requirement in documents 00–18 or the Foundation brief missing?
2. Is it correct that the contract names no language, runtime, framework or tool, so that section 3 is complete?
3. Does any proposal contradict an authoritative rule, or quietly decide something reserved to CR-1-F1, CR-5-F1, CR-7, CR-8, CR-9, CR-10, gate 11 or gate 12?
4. Does the ownership boundary in 4.3 leave any transaction, tenant-context, RLS or DDL responsibility with the query builder, and is every forbidden primitive covered by an import rule and a negative test?
5. Is Kysely's pre-1.0 status acceptable given the stated mitigations, or should the proposal be `pg` alone?
6. Are the migration-architecture points A.1–A.9 each supported by ADR-023 or correctly labelled as proposals, and are the runner criteria M1–M8 sufficient and testable?
7. Do the seven layers in 4.8 cover every form of indirect cross-module access listed in AGENTS §4, without claiming more than static analysis or the database can deliver?
8. Is every "STACK ADR REQUIRED" item in the Foundation brief either decided here or listed in section 6?
9. Are the version statements in section 7 limited to what the cited primary sources say?

**Questions put to the Opus architecture / security review.**

1. Does explicit composition actually improve the reviewability of `ActorContext` and `TenantTransaction` flow as claimed in 4.2, and is the NestJS comparison fair?
2. Can tenant context be lost, reused or bypassed in the proposed `pg` / wrapper / Kysely layering, including under transaction-mode pooling and on error paths?
3. Are separate pools per database role sufficient to keep `cm_queue` and `cm_app` privileges apart inside one process, and is there any path by which application code could obtain an owner or `BYPASSRLS` connection?
4. Is "SQL-first, forward-only, checksummed history, run as `cm_migrator`" adequate for security-sensitive DDL (grants, policies, SECURITY DEFINER functions), and what must the review of a migration include?
5. Does the test approach in 4.7 genuinely verify RLS, grants and the pooled-connection leak against real PostgreSQL, with no mock standing in for database behaviour?
6. Does the telemetry proposal in 4.11 reliably keep SQL parameters, bodies and learner content out of traces and logs?
7. Is the local secret mechanism in 4.10 consistent with ADR-024 and AGENTS §9, and can it leak a real credential?
8. Is the supply-chain posture (pinning, lockfile, install-script policy, update review) adequate for Cross-ADR Rule 6?
9. Does anything in the proposal make CR-7 item 5 harder to satisfy on managed PostgreSQL?
10. Can the transaction-bound query surface of 4.3 be made genuinely incapable of opening a connection, pool or root transaction with the proposed library, and which escape hatches (raw SQL, dynamic identifiers, plugins, casts) must be closed by lint rule or wrapper?
11. Is Kysely, at pre-1.0, acceptable in the data path under the stated confinement, or should the proposal be `pg` alone?
12. Given that PostgreSQL does not separate feature modules under the single `cm_app` role, are layers 1–5 and 7 of 4.8 an adequate control for architectural ownership, and is any prohibited path left without evidence in CI?
13. Is the prohibition on dynamic identifier and schema construction in feature modules precise enough to be enforced, and does it leave legitimate infrastructure needs a reviewed route?

**Questions for whoever verifies the S-01 to S-19 corrections.**

1. Is every mechanism added in that pass labelled `[C]`, with none presented as contract text?
2. Does any added constraint decide something reserved to CR-1-F1, CR-7, CR-10, gate 12 or the migration-runner decision?
3. Are the source citations added in that pass (DM §5, §6.3, §6.4, §28; Arch §3; FB §14) accurate?

State: ACCEPTED — written by the engineering authority (Omar Abdulaziz) on 2026-10-05. Acceptance of this ADR authorizes no implementation by itself, resolves no change record and decides none of the deferred items in section 6; the Foundation brief's implementation prerequisites (FB §20, §21) continue to apply.
