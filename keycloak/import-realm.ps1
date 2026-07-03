# ─────────────────────────────────────────────────────────────────────────────
# Import the UDAAN realm into an ALREADY-RUNNING Keycloak (e.g. the office server).
#
# Usage (from the keycloak/ folder):
#   .\import-realm.ps1 -KeycloakUrl "http://OFFICE-KEYCLOAK:8080" -AdminPassword "xxxx"
#
# Optional:
#   -AdminUser  admin           (default "admin")
#   -RealmFile  .\udaan-realm.json  (default; edit its redirect URLs first!)
#
# Re-import of an existing realm returns HTTP 409 — delete it in the admin console
# first, or edit it in place instead.
# ─────────────────────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)] [string] $KeycloakUrl,
  [Parameter(Mandatory = $true)] [string] $AdminPassword,
  [string] $AdminUser = "admin",
  [string] $RealmFile = (Join-Path $PSScriptRoot "udaan-realm.json")
)

$ErrorActionPreference = "Stop"
$KeycloakUrl = $KeycloakUrl.TrimEnd("/")

if (-not (Test-Path $RealmFile)) { throw "Realm file not found: $RealmFile" }

Write-Host "Getting admin token from $KeycloakUrl ..." -ForegroundColor Cyan
$tok = (Invoke-RestMethod -Method Post `
    "$KeycloakUrl/realms/master/protocol/openid-connect/token" `
    -Body @{ grant_type = "password"; client_id = "admin-cli"; username = $AdminUser; password = $AdminPassword }
).access_token

Write-Host "Importing realm from $RealmFile ..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Method Post "$KeycloakUrl/admin/realms" `
    -Headers @{ Authorization = "Bearer $tok" } `
    -ContentType "application/json" `
    -Body (Get-Content $RealmFile -Raw)
  Write-Host "Done. Realm 'udaan' imported into $KeycloakUrl" -ForegroundColor Green
  Write-Host "Next: create Users in the admin console and assign the 'admin' role where needed." -ForegroundColor Yellow
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Warning "Realm 'udaan' already exists (409). Delete it in the admin console to re-import, or edit it in place."
  } else { throw }
}
