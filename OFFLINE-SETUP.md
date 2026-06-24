# Offline / Air-Gapped Deployment — Complete Step-by-Step Guide

How to run **AI Notes & Scheduling** on a PC that has **no internet**, by
preparing everything on an internet-connected PC and transferring it via USB.

> **The whole idea:** the offline PC cannot download anything (`pip install` /
> `npm install` will fail). So we download every dependency on an internet PC,
> copy it across, and install from the copied files.

**The offline PC needs only two things installed: Python 3.11 and PostgreSQL.**
It does **NOT** need Node.js or Docker — the React UI is pre-built on the internet
PC and served by Python's own standard library.

---

## Table of contents
1. [What you are moving](#0-what-you-are-moving)
2. [Part A — On the INTERNET PC](#part-a--on-the-internet-pc-gather-everything)
3. [Part B — Transfer to USB](#part-b--transfer)
4. [Part C — On the OFFLINE PC](#part-c--on-the-offline-pc-install--run)
5. [The fast path (helper scripts)](#the-fast-path-using-the-helper-scripts)
6. [Verify it works](#verify-it-works)
7. [Docker alternative (Linux only)](#docker-alternative-linux-targets-only)
8. [What travels and what doesn't](#what-travels-and-what-doesnt)
9. [Troubleshooting](#troubleshooting)
10. [One-breath summary](#one-breath-summary)

---

## 0. What you are moving

| Piece | Needs internet on offline PC? | How it's handled |
|-------|------------------------------|------------------|
| PostgreSQL (database) | No | Installed from a copied installer |
| Python backend (FastAPI) | No | Installed from copied `.whl` files |
| React frontend | No | Pre-built on internet PC, served by Python |

Helper files in the `offline/` folder that you'll use:
- `1-fetch-on-internet-pc.bat` — automates downloading wheels + building the UI
- `2-install-on-offline-pc.bat` — automates creating the venv + installing wheels
- `3-run.bat` — starts the backend and the frontend together
- `serve_frontend.py` — the Node-free static server for the built UI
- `wheels/` — (you create this) the downloaded backend packages
- `installers/` — (you create this) the Python + PostgreSQL installers

---

## PART A — On the INTERNET PC (gather everything)

Use a **Windows x64** PC with internet and the repo cloned. Best results if it
has the **same Python version (3.11)** as the offline PC will have.

### A1. Download the backend Python packages (wheels)
From the project root:
```powershell
cd backend
python -m pip download -r requirements.txt -d ..\offline\wheels
python -m pip download pip setuptools wheel -d ..\offline\wheels
cd ..
```
Result: `offline\wheels\` fills with `.whl` files (≈ 50–100 MB).

> **If the offline PC has a different Python version**, force the target:
> ```powershell
> python -m pip download -r backend\requirements.txt -d offline\wheels ^
>   --only-binary=:all: --platform win_amd64 --python-version 311 ^
>   --implementation cp --abi cp311
> ```

### A2. Build the frontend (React → plain static files)
```powershell
cd front-end
npm install
$env:VITE_API_BASE = "http://localhost:9000"
npm run build
$env:VITE_API_BASE = ""
cd ..
```
- `npm run build` creates `front-end\dist\` — plain HTML/CSS/JS, no Node needed.
- Setting `VITE_API_BASE` makes the built UI call the backend directly on port
  9000 (the offline server has no proxy).

### A3. Download the installers for the offline PC
Create `offline\installers\` and download these two into it:
- **Python 3.11 (Windows x64)** — https://www.python.org/downloads/
- **PostgreSQL (Windows x64)** — https://www.postgresql.org/download/windows/

### A4. (Optional) Cloudflare tunnel binary
Only if you'll later share the offline PC's app over a LAN — copy `cloudflared.exe`
into the project root too.

### A5. Confirm the bundle contents
Before copying, the project folder must contain:
- ✅ `offline\wheels\` (from A1)
- ✅ `front-end\dist\` (from A2)
- ✅ `offline\installers\` with both installers (from A3)
- ✅ all the source code (the rest of the repo)

> You do **not** copy `venv\` or `node_modules\` — those get rebuilt on the
> offline PC.

---

## PART B — Transfer

Copy the **entire project folder** onto a USB drive, then onto the offline PC,
e.g. to `C:\AI-Notes-and-Scheduling`.

---

## PART C — On the OFFLINE PC (install & run)

### C1. Install the prerequisites (from `offline\installers\`)
1. Run the **Python 3.11** installer — **tick “Add python.exe to PATH”**.
2. Run the **PostgreSQL** installer — **write down the password** you set for the
   `postgres` user; you'll need it in C3. Keep the default port `5432`.

Verify Python is on PATH (open a **new** terminal):
```powershell
python --version        # should print Python 3.11.x
```

### C2. Install the backend from the copied wheels (no internet)
From the project root:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
python -m pip install --no-index --find-links ..\offline\wheels -r requirements.txt
cd ..
```
- `--no-index` = **never go to the internet**.
- `--find-links ..\offline\wheels` = install from the copied files.

### C3. Create the `.env` file with your database password
```powershell
copy backend\.env.example backend\.env
```
Open `backend\.env` in Notepad and set:
```
DB_PASSWORD=the-password-you-set-in-C1
```
Leave `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=udaan_db`, `DB_USER=postgres`
unless your PostgreSQL install differs.

### C4. Make sure PostgreSQL is running
Open **Services** (Win+R → `services.msc`) and confirm `postgresql-x64-…` is
**Running** (or open pgAdmin). You do **not** create the database or tables by
hand — the backend does it automatically on first start.

### C5. Start the app
```powershell
offline\3-run.bat
```
This opens two windows:
- **Backend** → http://localhost:9000 (creates `udaan_db` + all tables on first run)
- **Frontend** → http://localhost:5173 (served by Python)

Or start them manually in two terminals:
```powershell
# Terminal 1 — backend
cd backend
.\venv\Scripts\activate
uvicorn api.main:app --host 0.0.0.0 --port 9000

# Terminal 2 — frontend (system Python, stdlib only)
python offline\serve_frontend.py
```

### C6. Open the app
Browse to **http://localhost:5173**. Fully offline. 🎉

---

## The fast path (using the helper scripts)

If you'd rather not type the commands:

**On the internet PC:**
```powershell
offline\1-fetch-on-internet-pc.bat     # does A1 + A2 automatically
```
Then do A3 (download the two installers into `offline\installers\`) and copy the
folder to USB.

**On the offline PC:**
```powershell
offline\2-install-on-offline-pc.bat    # does C2 (venv + wheels)
# then set DB_PASSWORD in backend\.env  (C3)
offline\3-run.bat                      # starts backend + frontend (C5)
```

---

## Verify it works

On the offline PC, after C5:
```powershell
# backend alive?
curl http://localhost:9000/health        # -> {"status":"ok","version":"1.0.0"}
```
The backend window should log:
```
Database 'udaan_db' created.       (first run only)
Schema applied successfully.
Database ready.
Application startup complete.
```
Then the browser at http://localhost:5173 should load with no red “Backend
offline” banner.

---

## Docker alternative (Linux targets only)

**On Windows offline PCs, skip Docker** — it needs WSL2, which is a heavy offline
install. Use the native steps above.

**If the offline target is a Linux server that already has Docker**, you can ship
containers instead:
```bash
# On the internet PC (has Docker):
docker compose build
docker save -o ai-notes-images.tar \
  ai-notes-and-scheduling-backend ai-notes-and-scheduling-frontend postgres:16

# Copy ai-notes-images.tar + docker-compose.yml to the offline server, then:
docker load -i ai-notes-images.tar
docker compose up -d
```
This bundles PostgreSQL, backend and frontend as images — the target needs only
Docker (no Python, Node, or wheels). Files used: `docker-compose.yml`,
`backend/Dockerfile`, `front-end/Dockerfile`.

---

## What travels and what doesn't

| Item | In the USB bundle? | Notes |
|------|--------------------|-------|
| Source code | ✅ | the repo |
| `offline/wheels/` | ✅ | backend dependencies (from A1) |
| `front-end/dist/` | ✅ | pre-built UI (from A2) |
| Python + PostgreSQL installers | ✅ | `offline/installers/` (from A3) |
| `backend/.env` | ❌ create on offline PC | holds the DB password (C3) |
| `venv/` | ❌ rebuilt on offline PC | created in C2 |
| `node_modules/` | ❌ not needed offline | only used to build in A2 |
| **Your data** | ❌ | offline PC starts with an empty, auto-created database |

---

## Troubleshooting

| Problem | Cause / Fix |
|---------|-------------|
| Red **“Backend offline”** banner | Backend not running, wrong `DB_PASSWORD` in `.env`, or you forgot `--port 9000`. |
| `pip` tries to reach the internet | You missed `--no-index`. It must point only at `offline\wheels`. |
| `pip` can't find a package | Wheels were downloaded for a different Python version — redo A1 with the explicit `--python-version 311` form. |
| `python` not recognized | Python 3.11 wasn't added to PATH — reinstall and tick “Add python.exe to PATH”, then open a new terminal. |
| PostgreSQL “connection refused” | The PostgreSQL service isn't running, or `DB_PORT`/`DB_USER` in `.env` don't match your install. |
| Backend starts but “password authentication failed” | `DB_PASSWORD` in `.env` doesn't match the password you set during PostgreSQL install (C1). |
| Frontend loads but shows no data | Backend isn't on port 9000, or A2 build didn't set `VITE_API_BASE=http://localhost:9000`. |
| Port 9000 or 5173 already in use | Close the other process, or change the port (and `VITE_API_BASE` if you change 9000). |

---

## One-breath summary

**Internet PC:** download wheels (`offline\1-fetch-on-internet-pc.bat`), build the
UI, drop the Python + PostgreSQL installers into `offline\installers\`, copy the
whole folder to USB.
**Offline PC:** install Python & PostgreSQL, create a `venv` and
`pip install --no-index` from the copied wheels (`offline\2-install-on-offline-pc.bat`),
set `DB_PASSWORD` in `backend\.env`, run `offline\3-run.bat`, open
`http://localhost:5173`.
**No internet, no Node, no Docker required.**
