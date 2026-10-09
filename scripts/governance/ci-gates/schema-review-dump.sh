#!/usr/bin/env bash
# Reviewer-visible schema output for the migration-verification job (STACK-ADR-003 section 10; STACK-ADR-001 4.4 A.8; R5, R7).
#
# Bootstraps a review database in the job-local PostgreSQL 18 service container as the container superuser (provider plane, test
# only), runs the real migration command twice as cm_migrator (second run must be a no-op), then prints a schema-only dump and a
# roles-only dump to the job log AND to the job summary. No artifact is uploaded and no action is used.
#
# The PostgreSQL 18 client tools are the ones inside the service container (pg_dump and pg_dumpall of the same image as the server),
# reached with `docker exec`; the superuser connects over the container's local socket with trust authentication, so no credential
# is needed for the dump. The cm_migrator password is generated here, used only for the migrate command, masked, and checked to be
# absent from everything printed. Role password hashes are never dumped (--no-role-passwords); a defensive check fails the step if
# the output contains a password clause. No connection string is printed.
#
# Local verification only: CM_REVIEW_LOCAL_PG_BIN=<dir with PostgreSQL 18 binaries> uses them against PGHOST/PGPORT instead of docker.
set -euo pipefail

host="${PGHOST:-localhost}"
port="${PGPORT:-5432}"
db="cm_review"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "${CM_REVIEW_LOCAL_PG_BIN:-}" ]; then
  pgx() { local tool="$1"; shift; "$CM_REVIEW_LOCAL_PG_BIN/$tool" -h "$host" -p "$port" -U postgres "$@"; }
  pg_dump_version() { "$CM_REVIEW_LOCAL_PG_BIN/pg_dump" --version; }
else
  cid="$(docker ps -q --filter "publish=5432")"
  if [ "$(printf '%s\n' "$cid" | grep -c .)" != "1" ]; then echo "expected exactly one PostgreSQL service container" >&2; exit 1; fi
  pgx() { local tool="$1"; shift; docker exec -i "$cid" "$tool" -U postgres "$@"; }
  pg_dump_version() { docker exec "$cid" pg_dump --version; }
fi

version_num="$(pgx psql -X -tA -c 'SHOW server_version_num')"
case "$version_num" in 18????) ;; *) echo "expected PostgreSQL major 18 server" >&2; exit 1 ;; esac
pg_dump_version | grep -q '(PostgreSQL) 18' || { echo "expected PostgreSQL 18 client tools" >&2; exit 1; }

pw="$(openssl rand -hex 24)"
echo "::add-mask::$pw"

# Provider-plane bootstrap (test/container only; the production bootstrap mechanism is not decided: STACK-ADR-003 section 11).
# cm_resolver is deliberately NOT created (CR-7 item 5).
pgx psql -X -q -v ON_ERROR_STOP=1 -v pw="$pw" -v db="$db" <<'SQL'
DO $do$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['cm_migrator', 'cm_app', 'cm_queue'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cm_ops_readonly') THEN
    CREATE ROLE cm_ops_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
  END IF;
END $do$;
ALTER ROLE cm_migrator PASSWORD :'pw';
DROP DATABASE IF EXISTS :"db";
CREATE DATABASE :"db";
SQL
pgx psql -X -q -v ON_ERROR_STOP=1 -v db="$db" -d "$db" <<'SQL'
GRANT CREATE ON DATABASE :"db" TO cm_migrator;
CREATE SCHEMA migration AUTHORIZATION cm_migrator;
GRANT USAGE ON SCHEMA migration TO cm_ops_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE cm_migrator IN SCHEMA migration GRANT SELECT ON TABLES TO cm_ops_readonly;
SQL

# The real migration command, twice: the second run must change nothing.
export CM_MIGRATOR_DATABASE_URL="postgres://cm_migrator:${pw}@${host}:${port}/${db}"
corepack pnpm run migrate
second="$(corepack pnpm run migrate)"
echo "$second"
grep -q '"event":"run.noop"' <<< "$second" || { echo "second migrate run was not a no-op" >&2; exit 1; }
unset CM_MIGRATOR_DATABASE_URL

pgx pg_dump --schema-only --create --dbname="$db" > "$work/schema.sql"
pgx pg_dumpall --roles-only --no-role-passwords > "$work/roles.sql"

# Defensive checks before anything is shown.
if grep -qi 'PASSWORD' "$work/roles.sql" "$work/schema.sql"; then echo "output contains a password clause" >&2; exit 1; fi
if grep -qF "$pw" "$work/roles.sql" "$work/schema.sql"; then echo "output contains the generated credential" >&2; exit 1; fi
if grep -q 'postgres://' "$work/roles.sql" "$work/schema.sql"; then echo "output contains a connection string" >&2; exit 1; fi

emit() {
  echo "## Schema review output (PostgreSQL 18, generated from a fresh migration)"
  echo
  echo "Server: PostgreSQL ${version_num}. Roles: pg_dumpall --roles-only --no-role-passwords. Schema, owners, grants, default privileges and policies: pg_dump --schema-only --create."
  echo
  echo "### Roles"
  echo '```sql'
  cat "$work/roles.sql"
  echo '```'
  echo
  echo "### Schema"
  echo '```sql'
  cat "$work/schema.sql"
  echo '```'
}
emit | tee -a "$summary"
