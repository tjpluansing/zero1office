#!/usr/bin/env bash
# Runs the RBAC tests against a throwaway database on a local Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=z1_rbac_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/auth_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f tests/rbac_test.sql 2>&1 | grep -v "^$" | sed "s/^psql:[^ ]* NOTICE:  //"
