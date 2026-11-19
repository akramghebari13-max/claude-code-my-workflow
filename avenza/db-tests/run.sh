#!/usr/bin/env bash
# Apply every migration to a fresh database, then run each db-tests/*.test.sql file.
# Needs PostgreSQL 16 running; PGHOST/PGPORT/PGUSER choose which one (defaults: local socket).
# Usage: db-tests/run.sh            (all tests)
#        db-tests/run.sh bank       (only tests whose file name contains "bank")
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DB="avenza_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase-stub.sql" >/dev/null
for m in "$ROOT"/drizzle/migrations/[0-9]*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$m" >/dev/null 2>"$HERE/.last-error" \
    || { echo "FAILED applying $(basename "$m"):"; cat "$HERE/.last-error"; exit 1; }
done
rm -f "$HERE/.last-error"
echo "applied $(ls "$ROOT"/drizzle/migrations/[0-9]*.sql | wc -l) migrations"
cd "$ROOT"   # tests read fixtures by path from the app folder
status=0
shopt -s nullglob
for t in "$HERE"/*.test.sql "$ROOT"/src/test/*.sql; do
  [[ -n "${1:-}" && "$(basename "$t")" != *"$1"* ]] && continue
  src="$t"
  # PostgreSQL 16 has no MAINTAIN privilege (added in 17, which Supabase runs): check the rest.
  if [[ "$(psql -tAd "$DB" -c 'show server_version_num')" -lt 170000 ]] && grep -q "'MAINTAIN'" "$t"; then
    src="$(mktemp)"; sed "s/,'MAINTAIN'//g" "$t" > "$src"
  fi
  if out=$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -tA -f "$src" 2>&1); then
    echo "$out" | grep -E '^(PASS|FAIL)' || true
  else
    echo "FAIL: $(basename "$t") stopped with an error:"; echo "$out" | tail -5; status=1
  fi
done
exit $status
