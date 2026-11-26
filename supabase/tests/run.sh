#!/usr/bin/env bash
# Runs every tests/*_test.sql against its own throwaway database on a local Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh [test-name ...]
set -euo pipefail
cd "$(dirname "$0")/.."
tests=("$@")
[ ${#tests[@]} -eq 0 ] && tests=($(cd tests && ls *_test.sql | sed 's/\.sql$//'))
for t in "${tests[@]}"; do
  DB=z1_${t}_$$
  createdb "$DB"
  trap 'dropdb --if-exists "$DB" 2>/dev/null' EXIT
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/auth_stub.sql
  for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
  psql -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "tests/$t.sql" 2>&1 | grep -v "^$" | sed "s/^psql:[^ ]* NOTICE:  //"
  dropdb --if-exists "$DB"
done
