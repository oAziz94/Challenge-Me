#!/usr/bin/env bash
# Integration-job skeleton probe (Foundation Task 2; STACK-ADR-001 4.14): the PostgreSQL service container of the job is
# reachable and runs major 18. It uses the connection variables PGHOST, PGPORT and PGUSER and no password (the service
# is job-local with trust authentication; no credential exists). Real roles and migrations are PENDING gates.
set -euo pipefail

for attempt in $(seq 1 30); do
  if pg_isready -q; then break; fi
  if [ "$attempt" = "30" ]; then echo "PostgreSQL did not become ready" >&2; exit 1; fi
  sleep 2
done

version_num="$(psql -X -tA -c 'SHOW server_version_num')"
version="$(psql -X -tA -c 'SHOW server_version')"
echo "PostgreSQL server_version=${version} server_version_num=${version_num}"
case "$version_num" in
  18????) echo "PostgreSQL major 18: ok" ;;
  *) echo "expected PostgreSQL major 18" >&2; exit 1 ;;
esac
