#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: bash scripts/run-sql-cleanup.sh SCRIPT --target HOST:PORT/DATABASE@USER [--apply]' >&2
  exit 2
}

[[ $# -eq 3 || $# -eq 4 ]] || usage
[[ $2 == --target ]] || usage
case "$1" in
  CLEANUP_TEST_USERS.sql|REMOVE_CLOWN_ROLES.sql|REMOVE_MAILINATOR_ACCOUNTS.sql|REMOVE_VOLUNTEERS_BY_EMAIL.sql) ;;
  *) usage ;;
esac
if [[ $# -eq 4 && $4 != --apply ]]; then usage; fi

host=${PGHOST:?Set PGHOST to the approved connection hostname}
port=${PGPORT:-5432}
database=${PGDATABASE:?Set PGDATABASE to the approved database}
username=${PGUSER:?Set PGUSER to the approved database user}
[[ $host =~ ^[a-zA-Z0-9.-]+$ && $port =~ ^[0-9]{1,5}$ &&
   $database =~ ^[a-zA-Z0-9_.-]+$ && $username =~ ^[a-zA-Z0-9_.-]+$ ]] || usage

target="$host:$port/$database@$username"
if [[ $target != "$3" ]]; then
  echo 'Connection settings do not match the approved target. No SQL was run.' >&2
  exit 2
fi

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_file=
for dir in "$repo/scripts/sql" "$repo/scripts" "$repo"; do
  if [[ -f "$dir/$1" ]]; then
    source_file="$dir/$1"
    break
  fi
done
[[ -n $source_file ]] || usage

end=ROLLBACK
if [[ ${4:-} == --apply ]]; then end=COMMIT; fi
# An inherited connection service or host address can override routing.
unset PGHOSTADDR PGSERVICE PGSERVICEFILE
echo "$end mode for $target"
exec psql -X --set=ON_ERROR_STOP=1 --host="$host" --port="$port" \
  --dbname="$database" --username="$username" \
  --command=BEGIN --file="$source_file" --command="$end"
