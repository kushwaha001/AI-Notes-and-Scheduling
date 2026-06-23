# Offline / Air-Gapped Deployment

How to set up **AI Notes and Scheduling** on a PC with **no internet**, by
downloading everything on an internet-connected PC first and transferring it.

There are two paths. **Use Path A (native)** unless you specifically want Docker.

---

## Path A — Native (recommended for Windows)

The offline PC only needs **Python 3.11** and **PostgreSQL**. No Node.js, no Docker.
The pre-built frontend is served by Python's standard library.

### On the INTERNET PC

1. Install **Python 3.11 (x64)** and **Node.js** (only needed here, to build the UI).
2. From the project root, run:

   ```
   offline\1-fetch-on-internet-pc.bat
   ```

   This downloads all backend wheels into `offline\wheels\` and builds the
   frontend into `front-end\dist\`.

3. Download these installers into `offline\installers\`:
   - **Python 3.11 (Windows x64)** — https://www.python.org/downloads/
   - **PostgreSQL (Windows x64)** — https://www.postgresql.org/download/windows/

4. Copy the **entire project folder** (including `offline\wheels` and
   `front-end\dist`) to the offline PC via USB.

### On the OFFLINE PC

1. Install **Python 3.11** from `offline\installers\`
   — tick **“Add python.exe to PATH”**.
2. Install **PostgreSQL** from `offline\installers\`. Remember the password you set
   for the `postgres` user.
3. Edit `backend\.env` and set `DB_PASSWORD=` to that PostgreSQL password.
4. Install the backend (offline):

   ```
   offline\2-install-on-offline-pc.bat
   ```

5. Start everything:

   ```
   offline\3-run.bat
   ```

6. Open **http://localhost:5173** in a browser.

> The database `udaan_db` and all tables are created **automatically** on first
> startup — you never run any SQL by hand.

#### If the offline PC has a different Python version
Re-run the wheel download on the internet PC with explicit targeting:

```
python -m pip download -r backend\requirements.txt -d offline\wheels ^
  --only-binary=:all: --platform win_amd64 --python-version 311 ^
  --implementation cp --abi cp311
```

---

## Path B — Docker (for a Linux offline server, or if you prefer containers)

Everything (Postgres, backend, frontend) runs in containers. The offline machine
needs **Docker** + **Docker Compose** already installed.

### On the INTERNET PC (has Docker)

```bash
# 1. Build all images (pulls base images + bakes in dependencies)
docker compose build

# 2. Save the images to a single tar file
docker compose pull db                         # ensure postgres:16 is local
docker save -o ai-notes-images.tar \
  ai-notes-and-scheduling-backend \
  ai-notes-and-scheduling-frontend \
  postgres:16
```

(Use `docker images` to confirm the exact backend/frontend image names — Compose
names them `<folder>-backend` and `<folder>-frontend`.)

Copy `ai-notes-images.tar` **and** `docker-compose.yml` to the offline machine.

### On the OFFLINE machine (has Docker)

```bash
# 1. Load the images
docker load -i ai-notes-images.tar

# 2. Start the stack (no build needed — images already loaded)
docker compose up -d
```

- Frontend: **http://localhost:5173**
- Backend:  **http://localhost:9000/docs**
- Postgres data persists in the `pgdata` volume; tables auto-create on startup.

---

## What gets transferred (checklist)

| Item | Path | Path A | Path B |
|------|------|:------:|:------:|
| Project source code        | whole repo            | ✅ | ✅ (compose file only) |
| Backend Python wheels      | `offline/wheels/`     | ✅ | — (baked into image) |
| Pre-built frontend         | `front-end/dist/`     | ✅ | — (built in image) |
| Python 3.11 installer      | `offline/installers/` | ✅ | — |
| PostgreSQL installer       | `offline/installers/` | ✅ | — |
| Docker images tar          | `ai-notes-images.tar` | — | ✅ |

---

## Notes

- **Privacy (NFR-3):** nothing here calls the internet at runtime. All fetching
  happens once on the internet PC; the offline PC runs fully self-contained.
- **AI services** (Ollama / Qdrant / Redis / Whisper) are **not** part of this
  bundle yet — the app runs in degraded mode (NFR-9): manual entry, calendar,
  tasks, notes, search and audit all work without them.
- The hard-coded API base in `front-end/src/services/api.js` is
  `http://localhost:9000`. If you serve the app to **other machines** on the LAN,
  change it to the server's LAN IP and rebuild the frontend.
