# Keycloak (v2 multi-user auth)

Optional. Only needed when `AUTH_ENABLED=true` in `backend/.env`. With auth off,
the app runs single-user and you can ignore this folder.

## Files
- `udaan-realm.json` — realm export: the `udaan` realm, the public PKCE SPA client
  `udaan-frontend`, and the `user` / `admin` roles. Imported automatically on
  first start.
- `run-keycloak.ps1` — starts the bundled Keycloak (dev mode), importing the realm.
- `dist/` — **you add this**: unzip a Keycloak server distribution here so
  `dist/bin/kc.bat` exists. Git-ignored (it's large).

## Quick start (offline)
1. Install Java 17+ (`java -version` must work) or set `JAVA_HOME`.
2. Unzip a Keycloak server distribution into `dist/`.
3. `powershell -ExecutionPolicy Bypass -File .\run-keycloak.ps1 -AdminPassword "CHANGE-ME"`
4. Open http://localhost:8080 → realm **udaan** → create users; assign the
   `admin` role to anyone who needs the System/Audit/Backup pages.
5. Set `AUTH_ENABLED=true` in `backend/.env` and restart the backend.

Full walkthrough: see the **Keycloak (v2 multi-user auth)** section in
`../OFFLINE-SETUP.md`.
