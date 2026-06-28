# ─────────────────────────────────────────────────────────────────────────────
# Start the bundled Keycloak for UDAAN (offline / air-gapped friendly).
#
# Prereqs (all offline-installable — see OFFLINE-SETUP.md section "Keycloak"):
#   1. A Java 17+ runtime (JRE/JDK). Either on PATH as `java`, or set $env:JAVA_HOME.
#   2. A Keycloak distribution unzipped to .\dist  (so .\dist\bin\kc.bat exists).
#
# First run imports the `udaan` realm + `udaan-frontend` client from
# udaan-realm.json. After it's up, create users in the admin console
# (http://localhost:8080  ->  realm "udaan"  ->  Users), assigning the `admin`
# role to anyone who should reach the System/Audit/Backup pages.
#
# Then set AUTH_ENABLED=true in backend/.env and restart the backend.
# ─────────────────────────────────────────────────────────────────────────────

param(
  [int]    $Port          = 8080,
  [string] $AdminUser     = "admin",
  [string] $AdminPassword = "admin",   # CHANGE THIS for anything but a demo
  [switch] $UsePostgres                  # use the existing Postgres instead of file/H2
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$kc   = Join-Path $here "dist\bin\kc.bat"

if (-not (Test-Path $kc)) {
  Write-Error "Keycloak not found at $kc. Unzip a Keycloak distribution into '$here\dist' (so dist\bin\kc.bat exists)."
}

# Bootstrap admin — set both old and new env var names so this works across
# Keycloak versions (KEYCLOAK_ADMIN* <= 25, KC_BOOTSTRAP_ADMIN_* >= 26).
$env:KEYCLOAK_ADMIN            = $AdminUser
$env:KEYCLOAK_ADMIN_PASSWORD  = $AdminPassword
$env:KC_BOOTSTRAP_ADMIN_USERNAME = $AdminUser
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = $AdminPassword

if ($UsePostgres) {
  # Reuse the same Postgres that backs UDAAN (separate database "keycloak").
  $env:KC_DB          = "postgres"
  $env:KC_DB_URL      = "jdbc:postgresql://localhost:5432/keycloak"
  $env:KC_DB_USERNAME = "postgres"
  if (-not $env:KC_DB_PASSWORD) { $env:KC_DB_PASSWORD = "0085" }
  Write-Host "Using Postgres (jdbc:postgresql://localhost:5432/keycloak). Create that DB first." -ForegroundColor Yellow
}

# Keycloak imports any realm files placed in <dist>/data/import/ when started
# with --import-realm (already-existing realms are skipped, so re-runs are safe).
$importDir = Join-Path $here "dist\data\import"
New-Item -ItemType Directory -Force -Path $importDir | Out-Null
Copy-Item (Join-Path $here "udaan-realm.json") (Join-Path $importDir "udaan-realm.json") -Force

Write-Host "Starting Keycloak on http://localhost:$Port (dev mode)…" -ForegroundColor Cyan
# start-dev = HTTP only, no hostname/SSL strictness — correct for an internal LAN.
& $kc start-dev --http-port $Port --import-realm
