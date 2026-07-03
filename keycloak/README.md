# Keycloak (v2 multi-user auth)

Optional. Only needed when `AUTH_ENABLED=true`. With auth off, the app runs
single-user and you can ignore this folder.

## Files
- `udaan-realm.json` — realm export: the `udaan` realm, the public PKCE SPA client
  `udaan-frontend`, and the `user` / `admin` roles. Imported automatically on
  first start.
- `run-keycloak.ps1` — starts a bundled (non-Docker) Keycloak for air-gapped boxes
  that can't run containers. Needs Java 17+ and a Keycloak distribution in `dist/`.

## Quick start — Docker (recommended, one command)

Keycloak is wired into the root `docker-compose.yml` using the official image
(`quay.io/keycloak/keycloak`). From the repo root:

```
docker compose up -d --build
```

That brings up **db + backend + frontend + Keycloak** together. On first start
Keycloak auto-imports the `udaan` realm and `udaan-frontend` client.

Then:
1. Open http://localhost:8080 → log in as **admin / admin** (change this for
   anything but a local demo — set `KC_BOOTSTRAP_ADMIN_PASSWORD` in the compose
   file).
2. Realm **udaan** → **Users** → create users; assign the `admin` role to anyone
   who needs the System/Audit/Backup pages.
3. Open http://localhost:5173 — you'll be redirected to Keycloak to log in.

Auth is already enabled in compose (`AUTH_ENABLED=true` on the backend). To run
single-user instead, set it to `"false"` and you can drop the `keycloak` service.

### Docker networking note (issuer vs JWKS)
The browser reaches Keycloak at `http://localhost:8080`, so tokens are issued
with that issuer — but the backend container reaches it by service name. Compose
sets both:
- `KEYCLOAK_URL=http://localhost:8080` — public URL: told to the frontend and
  verified as the token issuer.
- `KEYCLOAK_INTERNAL_URL=http://keycloak:8080` — how the backend fetches the
  realm signing keys (JWKS) from inside the compose network.

Leave `KEYCLOAK_INTERNAL_URL` blank when the backend and browser reach Keycloak
at the same address (e.g. both on `localhost` without Docker).

## Air-gapped alternative (no Docker) — `run-keycloak.ps1`
For boxes that can't run containers:
1. Install Java 17+ (`java -version` must work) or set `JAVA_HOME`.
2. Unzip a Keycloak server distribution into `dist/` (so `dist/bin/kc.bat` exists).
3. `powershell -ExecutionPolicy Bypass -File .\run-keycloak.ps1 -AdminPassword "CHANGE-ME"`
4. Then the same steps 1–3 above (create users, enable `AUTH_ENABLED=true` in
   `backend/.env`, restart the backend).

Full walkthrough: see the **Keycloak (v2 multi-user auth)** section in
`../OFFLINE-SETUP.md`.
