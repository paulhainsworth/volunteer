#!/bin/sh
set -eu
export LC_ALL=C

host=${PGHOST:-127.0.0.1}
database=${PGDATABASE:?Set PGDATABASE to an empty local Supabase database}
port=${PGPORT:-5432}
case "$host" in
  localhost|127.0.0.1|::1) ;;
  *) echo 'Bootstrap is limited to an empty local database.' >&2; exit 2 ;;
esac
case "$database" in
  *[!a-zA-Z0-9_.-]*) echo 'Invalid local database name.' >&2; exit 2 ;;
esac
case "$port" in
  *[!0-9]*|??????*) echo 'Invalid local database port.' >&2; exit 2 ;;
esac

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

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
set -- --command="$check"
for file in SUPABASE_SCHEMA.sql ADD_EMERGENCY_CONTACT.sql ADD_VOLUNTEER_LEADER_ROLE.sql \
  ADD_LEADER_DOMAINS_SAFE.sql ADD_TEAM_CLUB_AFFILIATION.sql; do
  set -- "$@" --file="$repo/supabase/bootstrap/$file"
done
set -- "$@" --file="$repo/supabase/manual/ADD_PUBLIC_SIGNUP_COUNTS_RLS.sql"
for migration in "$repo"/supabase/migrations/*.sql; do
  set -- "$@" --file="$migration"
done

unset PGHOSTADDR PGSERVICE PGSERVICEFILE
exec psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --host="$host" --port="$port" --dbname="$database" "$@"
