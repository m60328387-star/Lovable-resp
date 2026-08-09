#!/bin/bash
set -e

# Seed the owner profile if WEAVER_OWNER_EMAIL is set in the environment.
# Runs automatically after the schema is created by PostgreSQL.

if [ -n "$WEAVER_OWNER_EMAIL" ]; then
  owner_id=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT uuid_generate_v5(uuid_ns_oid(), 'weaver:' || lower('${WEAVER_OWNER_EMAIL}'));")
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOF
    INSERT INTO public.profiles (id, display_name)
    VALUES ('${owner_id}', split_part('${WEAVER_OWNER_EMAIL}', '@', 1))
    ON CONFLICT (id) DO NOTHING;
EOF
  echo "Seeded owner profile for ${WEAVER_OWNER_EMAIL}"
fi
