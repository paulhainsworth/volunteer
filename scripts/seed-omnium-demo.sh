#!/bin/sh
set -eu

container=supabase_db_volunteer-local-runtime
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# Pin the Docker daemon and container so this cannot target a hosted database.
unset DOCKER_HOST DOCKER_CONTEXT
if [ "$(docker --context default inspect --format '{{.State.Running}}' "$container" 2>/dev/null)" != true ]; then
  echo "Start the local Volunteer Docker database ($container) before seeding." >&2
  exit 1
fi

docker --context default exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  --single-transaction -U postgres -d postgres < "$repo/supabase/demo/omnium-2026.sql"
