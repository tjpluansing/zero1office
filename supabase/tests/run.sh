#!/usr/bin/env bash
# Runs the database tests (RBAC, SOA tracker) against a throwaway database on a local Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=z1_test_$$
trap 'dropdb --if-exists "$DB"' EXIT
# Each test file gets a fresh database with every migration applied.
for t in tests/*_test.sql; do
  dropdb --if-exists "$DB"
  createdb "$DB"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/auth_stub.sql
  for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
  psql -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | grep -v "^$" | sed "s/^psql:[^ ]* NOTICE:  //"
done
