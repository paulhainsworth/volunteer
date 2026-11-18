#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

host=${PGHOST:-127.0.0.1}
database=${PGDATABASE:?Set PGDATABASE to an empty local Supabase database}
port=${PGPORT:-5432}
case "$host" in
  localhost|127.0.0.1|::1) ;;
  *) echo 'Bootstrap is limited to an empty local database.' >&2; exit 2 ;;
esac
if [[ ! $database =~ ^[a-zA-Z0-9_.-]+$ || ! $port =~ ^[0-9]{1,5}$ ]]; then
  echo 'Invalid local database name or port.' >&2
  exit 2
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
prerequisites=(
  SUPABASE_SCHEMA.sql
  ADD_EMERGENCY_CONTACT.sql
  ADD_VOLUNTEER_LEADER_ROLE.sql
  ADD_LEADER_DOMAINS_SAFE.sql
  ADD_TEAM_CLUB_AFFILIATION.sql
  ADD_PUBLIC_SIGNUP_COUNTS_RLS.sql
)

check=$(cat <<'SQL'
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Install the local Supabase Auth schema before bootstrapping';
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL OR to_regclass('public.volunteer_roles') IS NOT NULL THEN
    RAISE EXCEPTION 'Bootstrap requires an empty volunteer schema';
  END IF;
END
$$;
SQL
)
args=(--command="$check")
for file in "${prerequisites[@]}"; do
  path=
  for dir in "$repo/supabase/bootstrap" "$repo/supabase/manual" "$repo"; do
    if [[ -f "$dir/$file" ]]; then path="$dir/$file"; break; fi
  done
  if [[ -z $path ]]; then echo "Missing bootstrap file: $file" >&2; exit 2; fi
  args+=(--file="$path")
done
for migration in "$repo"/supabase/migrations/*.sql; do
  args+=(--file="$migration")
done

unset PGHOSTADDR PGSERVICE PGSERVICEFILE
exec psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --host="$host" --port="$port" --dbname="$database" "${args[@]}"
