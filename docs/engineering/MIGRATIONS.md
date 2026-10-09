# Migrations — runner, files and operating procedure

Status: Foundation task 3 delivery record. Implements STACK-ADR-003 (ACCEPTED 2026-10-09) and Foundation brief amendment A-2. It
adds no decision; where this file and STACK-ADR-003 or the contract differ, they govern.

## What exists

| Piece                      | Location                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| Runner (`pg` only)         | `src/foundation/migrations/runner.ts`                            |
| Static rules               | `src/foundation/migrations/static-rules.ts`                      |
| File discovery, checksums  | `src/foundation/migrations/files.ts`                             |
| Command                    | `src/foundation/migrations/cli.ts` (`pnpm run migrate`)          |
| Migration files            | `migrations/NNNN_<attribution>__<slug>.sql`                      |
| Schema / role inventories  | `src/foundation/db/schema-inventory.ts`, `role-inventory.ts`     |
| Table-category registry    | `src/foundation/db/table-registry.ts`                            |
| Catalogue assertions       | `src/foundation/db/catalogue-checks.ts`, `migration-schema-check.ts` |
| RLS template (DM §6.2)     | `src/foundation/db/rls-template.ts`                              |
| Advisory-lock namespaces   | `src/foundation/db/lock-registry.ts`                             |

Three things are kept apart: **test/container bootstrap** (`tests/integration/support/`), the **runner**, and **migration SQL**.

## Migration files

- Plain forward-only SQL, LF only (`.gitattributes` pins `migrations/*.sql` to LF). No CR, no UTF-8 BOM, valid UTF-8, no NUL.
- Name: four-digit version, attribution (one of the 14 module schemas or `foundation`), `__`, slug. Versions are contiguous from 1.
- Default mode is transactional. A file whose exact first line is `-- cm:mode=no_transaction` holds exactly one statement and is
  applied outside a transaction.
- No transaction-control statement (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `PREPARE TRANSACTION`, ...).
- No reference to schema `migration` at all (whole word, outside comments). Only the runner manages `migration.history`.
- No `DISABLE ROW LEVEL SECURITY`, no `NO FORCE ROW LEVEL SECURITY`, no `BYPASSRLS`, no role membership (`GRANT role TO role`).
- The checks are lexical, not a SQL parser. SQL assembled dynamically inside a DO block is outside what they can prove.

## Running

- Local: put `CM_MIGRATOR_DATABASE_URL` (the `cm_migrator` connection string) in the untracked `.env.local`, then `pnpm run migrate`.
- The runner connects directly (never through a pooler), asserts it is `cm_migrator` and not a superuser, asserts schema `migration`
  exists and is owned by `cm_migrator` (it never creates it), takes a session-level advisory lock, runs the integrity checks, then
  applies pending files in order. With nothing pending it writes nothing.
- Output is JSON events (versions, file names, durations, SQLSTATE). No SQL text, parameter value, data or connection string.

## Bootstrap contract (what must exist before the runner)

Test/container bootstrap (`tests/integration/support/database.ts`, superuser, provider plane): roles `cm_migrator`, `cm_app`,
`cm_queue`, `cm_ops_readonly`; `GRANT CREATE ON DATABASE` to `cm_migrator`; `CREATE SCHEMA migration AUTHORIZATION cm_migrator`;
`GRANT USAGE ON SCHEMA migration TO cm_ops_readonly`; `ALTER DEFAULT PRIVILEGES FOR ROLE cm_migrator IN SCHEMA migration GRANT SELECT ON TABLES TO cm_ops_readonly`
(this is how `cm_ops_readonly` receives SELECT on a table the runner creates later).
**This is test bootstrap only.** The production bootstrap mechanism is not decided (STACK-ADR-003 §11); production deployment of
migrations stays blocked until it is. `cm_resolver` is not created anywhere (CR-7 item 5; managed-PostgreSQL decision).

## An unfinished no-transaction migration

A `started` row means the statement may have run partly, fully or not at all. The runner stops before applying anything and never
retries. The only recording command is `pnpm run migrate -- --resolve-started <version> --checksum <sha256 of the file>`. It refuses
unless the row is `started`, the file on disk still has the recorded name and checksum, and the checksum you pass matches. It performs
the same single `started -> complete` transition the runner uses; it is a reviewed write path and is reviewed as one.

1. **The statement succeeded but recording the completion was interrupted** (for example the session died after the statement). Inspect
   the database first. Use `--resolve-started` only after confirming that the intended effect exists.
2. **The statement failed, or its effect was manually reverted.** Within the currently accepted STACK-ADR-003 lifecycle the only
   resolution is to re-establish the intended effect manually and then use `--resolve-started`.
3. **Abandoning the migration after its effect was reverted is unsupported.** The accepted lifecycle has no delete, no retry and no
   alternate terminal state, so `started` can only become `complete`. Supporting abandonment would require a future STACK-ADR-003
   amendment (for example a new terminal state). That decision must be made no later than the review of the first no-transaction
   migration.

There is deliberately no reverted state, no delete, no retry, no checksum override, no arbitrary history update and no other
resolution mode.

## Known limits (STACK-ADR-003 §8)

`cm_migrator` owns `migration.history`; PostgreSQL grants cannot make an owner incapable of changing its own table. Enforcement rests
on the runner exposing only the two inserts and the one `started -> complete` update (proven by a source-scan test), the static rule
that migration SQL cannot touch the schema, the integrity checks on every run, and the catalogue and lifecycle tests. No trigger was
chosen (the ADR makes it optional).

## Reviewer-visible schema output

The `migration-verification` job ends with `scripts/governance/ci-gates/schema-review-dump.sh`. After the verification tests pass it
bootstraps a review database in the job-local PostgreSQL 18 service container, runs `pnpm run migrate` twice (the second run must be a
no-op), then prints `pg_dump --schema-only --create` (schemas, owners, grants, default privileges, policies, functions) and
`pg_dumpall --roles-only --no-role-passwords` (roles and attributes) to the **job log and the job summary** (`GITHUB_STEP_SUMMARY`). It uses the
PostgreSQL 18 tools inside the service container (`docker exec`), prints no password hash and no connection string, masks the generated
`cm_migrator` password and fails if any password clause, that password or a connection string appears in the output. **No downloadable
artifact exists**; no upload action is used.

## Not delivered by task 3 (recorded, not resolved)

- **Previous-release upgrade verification** (STACK-ADR-001 §4.4 A.6). Applies once a first release exists; the gate catalogue cannot
  express that condition and no prerequisite kind was added.
- **OPERATIONAL "no S2-S4 column except hashes"** (DM §6.3). It needs the Privacy classification register; the pending gate
  `purge-handler-registration-gate` (prerequisites `fb20-task-11`, `fb20-task-12`) tracks that delivery and its entry records that the
  same delivery completes this assertion. Task 3 does not implement it.
- **Migration command in the OCI image** (STACK-ADR-001 §4.12): not wired; production deployment of migrations is blocked anyway.
