# Office setup checklist — connect UDAAN to the office Keycloak

Do these in order when you reach the office. Goal: use the **existing office
Keycloak service** (don't run your own Keycloak container) and get login working.

Fill in these two values first, you'll reuse them everywhere below:

- **Office Keycloak URL:** `http://__________:8080`   ← ask IT / check the service
- **Your frontend URL:**   `http://__________:5173`   ← where users open the app

---

## 1. Get the office Keycloak admin login
You need an admin username + password for the office Keycloak (ask whoever runs it).

- If they let you **create a new realm** → do Step 2 (import).
- If they only give you a **pre-made realm/client** → SKIP Step 2 and Step 3,
  jump to Step 4 and just use the realm/client names they gave you.

---

## 2. Edit the realm file's URLs (BEFORE importing)
Open `keycloak/udaan-realm.json` and replace every `http://localhost:5173`
with **your frontend URL** (from the top of this file). It appears in:
- `rootUrl`, `baseUrl`
- `redirectUris` (keep the `/*` on the end)
- `webOrigins`
- the `post.logout.redirect.uris` attribute

If you skip this, login will fail with a "redirect URI" error.

---

## 3. Import the realm into the office Keycloak
From the `keycloak/` folder, run (fill in the URL + admin password):

```powershell
.\import-realm.ps1 -KeycloakUrl "http://OFFICE-KEYCLOAK:8080" -AdminPassword "THE-ADMIN-PASSWORD"
```

- Success → realm **udaan** + client **udaan-frontend** now exist on the office server.
- "409 already exists" → it's already there; either delete it in the admin
  console and re-run, or leave it and move on.
- No PowerShell / prefer clicking? In the Keycloak admin console:
  **realm dropdown → Create realm → Browse → pick the edited udaan-realm.json → Create.**

---

## 4. Create your users
In the office Keycloak admin console:
1. Switch to realm **udaan** (or the realm IT gave you).
2. **Users → Add user** → set username/email → **Create**.
3. **Credentials** tab → set a password (turn **Temporary** off).
4. **Role mapping** tab → assign **admin** to anyone who needs the
   System / Audit / Backup pages. Everyone else just gets **user** (automatic).

---

## 5. Point the backend at the office Keycloak
Set these on the backend. **Leave `KEYCLOAK_INTERNAL_URL` blank** — that's only
for the bundled container, not a real office server.

```
AUTH_ENABLED=true
KEYCLOAK_URL=http://OFFICE-KEYCLOAK:8080     # the office service URL
KEYCLOAK_INTERNAL_URL=                       # BLANK
KEYCLOAK_REALM=udaan                         # or the realm name IT gave you
KEYCLOAK_CLIENT_ID=udaan-frontend            # or the client id IT gave you
```

Where to put them:
- **Backend run natively (no Docker):** put them in `backend/.env`.
- **Backend run via docker compose:** edit the `backend` service `environment:`
  in `docker-compose.yml`, AND **delete the whole `keycloak:` service block +
  the `kc_data` volume** (you're not running your own Keycloak).

---

## 6. Start the app and test
- Native: start the backend, then `npm run dev` in `front-end/`.
- Docker: `docker compose up -d --build` (now brings up only db + backend + frontend).

Then:
1. Open your frontend URL → it should redirect you to the **office** Keycloak login.
2. Log in with the user from Step 4.
3. Calendar should load (no "Internal Server Error").

---

## If something breaks
- **Redirect URI error on login** → the client's redirect URIs don't include your
  frontend URL. Fix in admin console: realm udaan → Clients → udaan-frontend →
  Valid redirect URIs / Web origins.
- **Calendar 401 / kicked to login repeatedly** → token issuer mismatch. Make sure
  `KEYCLOAK_URL` on the backend is the **same URL the browser uses** for Keycloak.
- **Calendar 500 Internal Server Error** → backend can't reach Keycloak's keys.
  Confirm the backend machine can open `KEYCLOAK_URL` (curl/browser) on the LAN;
  check `NO_PROXY` includes the Keycloak host if the box has a corporate proxy.
- **Can't create a realm (no permission)** → use the realm/client IT provides;
  set `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` to match, skip Steps 2–3.

---

### Quick reference — what you're NOT doing
- Not running the Keycloak container (`run-keycloak.ps1` / the compose `keycloak`
  service) — the office already runs Keycloak.
- Not setting `KEYCLOAK_INTERNAL_URL` — that's only for the self-contained Docker
  demo where browser and backend reach Keycloak at different addresses.
