#!/usr/bin/env bash
# Start PostgreSQL inside the container and make sure the postgres role has a
# known password so the backend can connect over TCP. The backend db_init
# auto-creates the udaan_db database and all tables on first startup.
#
# NOTE: on first boot from a freshly-loaded image (or after a hard stop) PG may
# do crash recovery with a long fsync pass — the Debian init script can time
# out even though the server comes up fine moments later. So: never trust the
# init script exit code; wait on pg_isready ourselves (up to 3 minutes).
set -uo pipefail

echo "▶ Starting PostgreSQL..."
sudo service postgresql start || echo "  (init script timed out — waiting for recovery to finish...)"

READY=0
for _ in $(seq 1 180); do
  if pg_isready -q -h 127.0.0.1 -p 5432; then READY=1; break; fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "✗ PostgreSQL did not come up in 3 minutes."
  echo "  Log: sudo tail -30 /var/log/postgresql/postgresql-15-main.log"
  exit 1
fi

# Idempotent: set the password the backend/.env expects.
sudo -u postgres psql -tc "ALTER USER postgres PASSWORD 'postgres';" >/dev/null

echo "✓ PostgreSQL ready on localhost:5432  (user=postgres  password=postgres)"
