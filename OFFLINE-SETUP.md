# Offline / Air-Gapped Deployment Guide

How to run **AI Notes & Scheduling** on a Dev-Lan PC that has **no internet**.
Everything is downloaded on an internet PC, copied across (USB), and installed
from the copied files. You start the backend and frontend with **plain commands**
— no helper scripts.

> **The whole idea:** the offline PC cannot download anything (`pip install`,
> `npm install`, and `ollama pull` all need internet). So we fetch every
> dependency **and every AI model** on an internet PC, copy them over, and load
> them locally.

---

## 📦 What to transfer (verified 2026-06-28)

Zip the **entire project folder** and carry it across. The items below are the
ones that **don't live in git** — they will NOT be present in a fresh `git clone`,
so they must be physically copied. Everything else (source code, `keycloak\`
config, this guide) travels with the folder automatically.

| Path | Size | Why it's needed | Status |
|------|------|-----------------|--------|
| `offline\wheels-bundle\` | **4.16 GB** (147 wheels) | All backend Python deps incl. GPU torch + auth wheels (PyJWT/cryptography). Verified: installs with `--no-index`, exit 0. | ✅ ready |
| `offline\models\` | **6.59 GB** | AI model caches: `ollama-models` (LLM+embeddings), `huggingface-cache` (Whisper+Docling), `EasyOCR` | ✅ ready |
| `front-end\node_modules\` | **182 MB** | Frontend deps — **includes `keycloak-js`** (new in v2). `npm install` won't run offline, so this folder must be copied. | ✅ ready |
| `backend\.env` | <1 KB | DB password + service config. **Not in git** — copy your working file, or recreate from `.env.example` on the target (see C8). | ⚠️ copy it |
| `offline\installers\` | varies | **Python 3.11**, **PostgreSQL**, **Ollama** installers — only if the office PC doesn't already have them installed. | ⚠️ **add before sending** |

**Optional — only if you will turn on Keycloak auth (it's OFF by default):**

| Path | Size | Why |
|------|------|-----|
| A Java 17+ runtime (in `offline\installers\`) | ~50 MB | run Keycloak (already present on the dev PC, may be absent on the office PC) |
| Keycloak server zip → unzip to `keycloak\dist\` | ~250 MB | the auth server itself (not a Python package) |

> **Total core payload ≈ 11 GB** (wheels + models + node_modules). Auth is off by
> default, so the optional Keycloak rows are **not** needed for tomorrow unless you
> intend to enable multi-user login.

**Quick pre-flight on the internet PC before you zip:**
```powershell
# 1) wheels resolve offline (must end with exit code 0)
backend\venv\Scripts\python -m pip install --no-index `
  --find-links offline\wheels-bundle -r backend\requirements-lock.txt `
  --dry-run --ignore-installed
# 2) the new frontend dep is present
Test-Path front-end\node_modules\keycloak-js     # -> True
# 3) installers staged (or confirm the office PC already has them)
Get-ChildItem offline\installers
```

---

## What runs where

| Component | Where it runs | How it gets there offline |
|-----------|---------------|---------------------------|
| PostgreSQL (database) | App PC | Copied installer |
| Backend (FastAPI) | App PC | Python wheels (copied) |
| Frontend (React/Vite) | App PC | `node_modules` (copied) |
| **Ollama** (LLM + embeddings) | Office server | Install Ollama + copy the model blobs |
| **Qdrant** (vector index) | App PC (embedded) | Bundled with the Python wheels — no server needed |
| Docling / Whisper models | App PC | Copy the model caches |
| **Keycloak** (v2 auth — *optional*) | App PC / office server | JRE + Keycloak dist (add to bundle — see "Keycloak" section) |

> **Auth is optional and off by default.** With `AUTH_ENABLED=false` the app runs
> single-user exactly like v1 — you can ignore Keycloak entirely. Turn it on only
> when you want per-user accounts (see the **Keycloak (v2 multi-user)** section).

The app talks to Ollama over HTTP (`OLLAMA_HOST`), so Ollama can live on the
office server while the app runs on the same PC or another box on the Dev Lan.

---

## ✅ What this bundle already contains

This repo has been **pre-staged** — you don't need to download anything on an
internet PC. Just zip the project folder (with `offline\`) and carry it across.

| In `offline\` | What it is | Goes to |
|---------------|------------|---------|
| `wheels-bundle\` | All Python wheels — exact locked set (Win x64 / Py 3.11), **incl. GPU `torch` (cu128) for OCR + CUDA cuBLAS/cuDNN for voice** (~4.2 GB) | `pip install` on the App PC |
| `models\ollama-models\` | `gemma3:4b` + `bge-m3` (+ nomic) blobs | the office server's `.ollama\models` |
| `models\huggingface-cache\` | Whisper `distil-large-v3` (+ `base` fallback) + Docling layout models | App PC `%USERPROFILE%\.cache\huggingface` |
| `models\EasyOCR\` | OCR models | App PC `%USERPROFILE%\.EasyOCR` |

You still install **Python 3.11**, **PostgreSQL**, and **Ollama** from
`offline\installers\` (add those installers before sending). Part A below is only
needed if you ever want to **rebuild/refresh** the bundle.

> **v2 auth added four small wheels.** Keycloak token validation needs
> `PyJWT`, `cryptography`, `cffi`, `pycparser` — these are now in
> `wheels-bundle\` and `requirements-lock.txt` (all Win x64 / Py 3.11). They
> install with the same `--no-index` command; no other change. The **Keycloak
> server itself is NOT a Python package** — it's a separate Java service (see the
> Keycloak section). If you keep `AUTH_ENABLED=false`, these wheels are installed
> but unused.
>
> **No wheel changes for the earlier features.** Reminders/browser notifications
> (FR-37), AI-suggested soft links (FR-25), the auto-backup (FR-39) and the
> richer status page (FR-41 — model state, GPU, disk, queue depth) were all built
> on the **standard library + packages already in the bundle**. Nothing new to
> download; the existing `wheels-bundle\` is complete.
>
> - The status page reads GPU usage via **`nvidia-smi`**, which ships with the
>   NVIDIA driver — no Python package. On a box with no GPU it simply shows
>   "inference runs on the Ollama server" instead of failing.
> - The new `soft_links` table is created automatically on first startup
>   (idempotent schema) — no manual migration.
> - Browser notifications need no install; the browser prompts for permission
>   on first load, and the dashboard remains the reliable fallback.

> **Voice (FR-6) now runs on the GPU.** The STT model is **`distil-large-v3`**
> (English, near large-v3 accuracy, ~10x realtime on GPU once warm) instead of
> the old `base`. This added four **CUDA runtime wheels** to the bundle
> (`nvidia-cublas-cu12`, `nvidia-cudnn-cu12`, `nvidia-cuda-runtime-cu12`,
> `nvidia-cuda-nvrtc-cu12`, ~1.3 GB total), **pinned to the CUDA 12.8 series** to
> match the office GPU — already included in `wheels-bundle\`. These wheels are
> self-contained (they ship the actual CUDA DLLs), so **no CUDA toolkit install is
> needed** — only the **NVIDIA driver** (any that supports CUDA 12.x).
> `transcribe.py` auto-registers those DLLs at startup.
> On a box with **no GPU**, set `WHISPER_DEVICE=cpu` and `WHISPER_COMPUTE_TYPE=int8`
> in `.env` — it falls back automatically and still works (just slower).

> **Document extraction (FR-8) also runs OCR on the GPU now.** `torch` is the
> CUDA 12.8 build (`+cu128`), so Docling's EasyOCR + layout models use the GPU —
> a multi-page scanned letter parses in seconds instead of minutes. The parser
> auto-detects CUDA (`AcceleratorDevice.AUTO`) and falls back to CPU if there's no
> GPU, so nothing breaks on a CPU-only box.

---

## Start commands (normal — no scripts)

Two terminals, every time you run the app:

```powershell
# Terminal 1 — backend  (creates the DB + tables automatically on first run)
cd backend
.\venv\Scripts\activate
uvicorn api.main:app --host 0.0.0.0 --port 9000

# Terminal 2 — frontend  (Vite proxies /api -> localhost:9000 automatically)
cd front-end
npm run dev
```

Open **http://localhost:5173**.

---

# PART A — On the INTERNET PC (gather everything)

Use a **Windows x64** PC with internet, **Python 3.11**, and the repo cloned —
matching the App PC so the wheels are compatible.

### A1. Backend Python wheels → `wheels-bundle\`
The **exact** working package set is captured in `backend\requirements-lock.txt`
(generated with `pip freeze`). Because every version is pinned, the download is a
single fast, low-memory pass:
```powershell
cd backend
# torch/torchvision are GPU builds (+cu128), which live on the PyTorch index —
# add it as an extra index so the one pass finds everything.
python -m pip download -r requirements-lock.txt pip setuptools wheel `
  --extra-index-url https://download.pytorch.org/whl/cu128 `
  -d ..\offline\wheels-bundle
cd ..
```
> **GPU build (~4.2 GB total).** `torch==2.11.0+cu128` / `torchvision==0.26.0+cu128`
> (~2.6 GB) run **document OCR + layout on the GPU**, and the four `nvidia-*-cu12`
> wheels (CUDA 12.8, ~1.3 GB) let **CTranslate2 run Whisper on the GPU**. All are
> pinned in `requirements-lock.txt`; the `--extra-index-url` above is what makes
> the `+cu128` wheels resolvable. The cu128 torch wheel is self-contained (bundles
> its own CUDA libs).
>
> *CPU-only target?* Replace torch with the CPU build instead:
> `pip download torch==2.12.1 torchvision==0.27.1 -d ..\offline\wheels-bundle`
> (and drop the `+cu128` lines from the lock). The app auto-detects and falls back
> to CPU either way — it just runs OCR slower.

### A2. Frontend dependencies
```powershell
cd front-end
npm install        # creates node_modules/ — this is what you copy
cd ..
```
You copy the whole `front-end/node_modules/` folder; the offline PC never runs
`npm install`.

### A3. The AI MODELS → `offline\models\`
These normally download on first use, so pre-fetch them into `offline\models\`.

**1) Ollama models (LLM + embeddings):**
```powershell
ollama pull gemma3:4b
ollama pull bge-m3
robocopy "$env:USERPROFILE\.ollama\models" offline\models\ollama-models /E
```

**2) Whisper + Docling caches** — trigger each once, then copy the caches:
```powershell
cd backend; .\venv\Scripts\activate
python -c "from faster_whisper import WhisperModel; WhisperModel('distil-large-v3')"
python -c "from docling.document_converter import DocumentConverter; DocumentConverter()"
cd ..
robocopy "$env:USERPROFILE\.cache\huggingface" offline\models\huggingface-cache /E
robocopy "$env:USERPROFILE\.EasyOCR"           offline\models\EasyOCR /E
```
> Docling stores its layout models inside the HuggingFace cache, so
> `huggingface-cache` covers **both** Whisper and Docling.

### A4. Installers for the App PC
Download into `offline\installers\`:
- **Python 3.11 (Windows x64)** — https://www.python.org/downloads/
- **PostgreSQL (Windows x64)** — https://www.postgresql.org/download/windows/
- **Ollama (for the office server)** — https://ollama.com/download

### A5. Confirm the bundle
Before zipping, `offline\` must contain:
- ✅ `wheels-bundle\` (A1) · `models\ollama-models\`, `models\huggingface-cache\`,
  `models\EasyOCR\` (A3) · `installers\` (A4)
- ✅ `front-end\node_modules\` (A2) and the source code

You do **not** copy `backend\venv\` — it's rebuilt offline.

---

# PART B — Transfer

Zip the **entire project folder** (with `offline\`) and copy it to the office
network, e.g. `C:\AI-Notes-and-Scheduling`. Carry `offline\models\ollama-models\`
to the **office server** (where Ollama runs).

---

# PART C — On the OFFLINE PC / OFFICE SERVER (install & run)

### C1. Install prerequisites (from `offline\installers\`)
1. **Python 3.11** — tick **“Add python.exe to PATH”**.
2. **PostgreSQL** — note the `postgres` password, keep port `5432`.

### C2. Backend — install everything from the bundled wheels (no internet)
The bundle ships a single complete wheel folder, `offline\wheels-bundle\`
(**Windows x64 / Python 3.11**), matching `requirements-lock.txt` exactly.
Install the whole locked set in one go:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
python -m pip install --no-index --find-links ..\offline\wheels-bundle -r requirements-lock.txt
cd ..
```
- `--no-index` = never touch the internet; everything comes from the bundle.
> If the office server is **Linux**, these Windows wheels won't fit — re-run A1
> on a Linux box to regenerate `wheels-bundle` for that platform.

### C4. Frontend — drop in the copied `node_modules`
Place the copied `front-end\node_modules\` folder in `front-end\`. No install
needed; `npm run dev` will just work.

### C5. Set up Ollama on the office server
1. Install Ollama (from `offline\installers\`).
2. Copy the bundled model blobs **`offline\models\ollama-models\*`** into the
   server's Ollama models directory:
   - Windows: `C:\Users\<you>\.ollama\models`
   - Linux/macOS: `~/.ollama/models`
   (Ollama blobs are plain files — they transfer across OSes fine.)
3. Start Ollama and verify:
   ```powershell
   ollama serve          # if not already running as a service
   ollama list           # must show gemma3:4b and bge-m3
   ```

### C6. Place the Whisper + Docling + OCR model caches (on the App PC)
Copy the bundled caches into the App PC's user profile:
- `offline\models\huggingface-cache`  →  `%USERPROFILE%\.cache\huggingface`
  *(contains both the Whisper model and the Docling layout models)*
- `offline\models\EasyOCR`            →  `%USERPROFILE%\.EasyOCR`

### C7. Qdrant (vector search)
**Nothing to install** — the app uses Qdrant in **embedded mode** and stores the
index on disk at `backend\qdrant_data\`. It's built from the `qdrant-client`
wheel (already installed in C3) and rebuilds from your documents/notes via the
**“Rebuild index”** button on the Ask page.

> *Optional — a standalone Qdrant server:* if you prefer running Qdrant as a
> service on the office server, install it there and set `QDRANT_HOST` in `.env`;
> note the current code defaults to the embedded store, so the server path is an
> opt-in change in `backend/api/ai/vectorstore.py`.

### C8. Configure `backend\.env`
```powershell
copy backend\.env.example backend\.env
```
Edit it:
```ini
# Database
DB_PASSWORD=the-postgres-password-from-C1

# Ollama on the office server (use its hostname/IP if remote)
OLLAMA_HOST=http://OFFICE-SERVER:11434
OLLAMA_MODEL=gemma3:4b
EMBED_MODEL=bge-m3
OLLAMA_KEEP_ALIVE=30m

# Voice (faster-whisper). GPU default — needs only the NVIDIA driver; the CUDA
# DLLs ship as wheels and auto-load. No GPU? set device=cpu, compute_type=int8.
WHISPER_MODEL=distil-large-v3
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_LANGUAGE=en

# Authentication (v2). Leave false for single-user (v1 behavior). To turn on
# multi-user, set true AND start Keycloak (see the Keycloak section below).
AUTH_ENABLED=false
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=udaan
KEYCLOAK_CLIENT_ID=udaan-frontend
```
If the frontend and backend run on the **same** PC, the Vite proxy needs the
backend on `localhost:9000` — keep that. `OLLAMA_HOST` can point anywhere on the
Dev Lan.

### C9. Start it (normal commands)
Make sure PostgreSQL is running (Services → `postgresql-x64-…`), then use the two
**Start commands** at the top of this guide. The backend creates `udaan_db` and
all tables on first run.

---

## Keycloak (v2 multi-user auth) — optional

Skip this whole section to run single-user (the default). Turn it on when you
want each person to log in and see only their own documents, notes, events and
tasks. The data model was already per-user; enabling auth simply scopes every
request to the logged-in user. **Admin-only** pages (System status, Audit log,
Backup) require the `admin` realm role.

### What you must add to the bundle (one-time, on the internet PC)
Keycloak is a Java service — it is **not** a Python wheel. Add two things to
`offline\installers\` before transferring:

1. **A Java runtime** — JRE/JDK 17+ (e.g. Temurin/Adoptium MSI, or a portable zip).
2. **The Keycloak distribution** — `keycloak-XX.X.X.zip` from
   <https://www.keycloak.org/downloads> (the "Server" zip).

The realm definition, run script and client config already ship in the repo
under `keycloak\` (`udaan-realm.json`, `run-keycloak.ps1`).

### Install & run on the office PC
```powershell
# 1. Install the JRE (or unzip it) so `java -version` works, or set JAVA_HOME.
# 2. Unzip the Keycloak distribution into  keycloak\dist\
#    (so keycloak\dist\bin\kc.bat exists).
# 3. Start Keycloak (imports the udaan realm + udaan-frontend client on first run):
cd keycloak
powershell -ExecutionPolicy Bypass -File .\run-keycloak.ps1 -AdminUser admin -AdminPassword "CHANGE-ME"
```
Keycloak comes up on <http://localhost:8080>. By default it uses its own
file-based store (persists across restarts). To reuse the existing PostgreSQL
instead, create a `keycloak` database and run with `-UsePostgres`.

### Create users
1. Open <http://localhost:8080> → **Administration Console** → sign in with the
   admin/password above.
2. Switch the realm (top-left) from *master* to **udaan**.
3. **Users → Add user** → set username/email → **Credentials** tab → set a
   password (turn *Temporary* off).
4. For anyone who needs the System/Audit/Backup pages: **Role mapping → Assign
   role → `admin`**. Everyone else gets `user` automatically.

### Flip it on
```ini
# backend\.env
AUTH_ENABLED=true
KEYCLOAK_URL=http://localhost:8080      # or the server's hostname/IP on the LAN
KEYCLOAK_REALM=udaan
KEYCLOAK_CLIENT_ID=udaan-frontend
```
Restart the backend. The frontend auto-detects this via `GET /auth/config` and
redirects to the Keycloak login page; after login it attaches the access token to
every API call and refreshes it automatically. A **Sign out** button appears
top-right. To revert to single-user, set `AUTH_ENABLED=false` and restart — no
data is lost (existing single-user data stays owned by the built-in `default`
user; new Keycloak users start with their own empty workspace).

> **Redirect URIs:** `udaan-realm.json` allows `http://localhost:5173` and
> `:3000`. If you serve the frontend from another host/port, edit the client's
> *Valid redirect URIs* / *Web origins* in the admin console (Clients →
> udaan-frontend).

---

## Verify

```powershell
curl http://localhost:9000/health      # {"status":"ok"}
curl http://localhost:9000/services    # ollama:ok, docling:ok, ai_extraction:ready
```
Then open **http://localhost:5173** — no red “Backend offline” banner.

If `ai_extraction` is `offline`, check `OLLAMA_HOST` is reachable from the App PC
and `ollama list` shows both models on the server.

---

## The four AI model assets (quick reference)

| Asset | Bundled in | Goes to | Size |
|-------|-----------|---------|------|
| `gemma3:4b` (LLM) | `models\ollama-models` | server `.ollama\models` | ~3.3 GB |
| `bge-m3` (embeddings) | `models\ollama-models` | server `.ollama\models` | ~1.2 GB |
| Whisper `distil-large-v3` (voice) | `models\huggingface-cache` | App PC `.cache\huggingface` | ~1.45 GB |
| Whisper `base` (voice, CPU fallback) | `models\huggingface-cache` | App PC `.cache\huggingface` | ~0.15 GB |
| Docling layout (OCR) | `models\huggingface-cache` | App PC `.cache\huggingface` | ~0.45 GB |
| EasyOCR models | `models\EasyOCR` | App PC `.EasyOCR` | ~0.11 GB |

---

## Degraded mode (NFR-9)

If Ollama is unreachable, the app **still runs**: manual entry, calendar, tasks,
notes, keyword search, and viewing all work. Uploads are accepted and **queued**;
when Ollama returns, drain the backlog with `POST /queue/process` (or the
**“Run AI on queued”** button on Upload). The Status page shows the live state.

---

## What travels and what doesn't

| Item | In the bundle? | Notes |
|------|----------------|-------|
| Source code | ✅ | the repo |
| Backend wheels (core+ai+gpu) | ✅ | `offline\wheels-bundle\` |
| `front-end\node_modules\` | ✅ | so `npm run dev` works offline |
| Ollama model blobs | ✅ | `offline\models\ollama-models\` → office server `.ollama\models` |
| Whisper / Docling / EasyOCR caches | ✅ | `offline\models\` → user profile |
| Installers (Python/PostgreSQL/Ollama) | ✅ | `offline\installers\` |
| `backend\.env` | ❌ create offline | holds DB password + `OLLAMA_HOST` |
| `backend\venv\` | ❌ rebuilt offline | created in C2 |
| `backend\qdrant_data\` | ❌ built locally | “Rebuild index” regenerates it |
| Your data | ❌ | offline PC starts with an empty, auto-created DB |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Red “Backend offline” banner | Backend not running, wrong `DB_PASSWORD`, or not on `--port 9000`. |
| `pip` tries the internet | You missed `--no-index`. Point it only at `offline\wheels-bundle`. |
| `pip download` fails with `MemoryError` | Don't combine all requirements in one command — run the three passes separately (A1). |
| `pip` can't find a package | Wheels are for a different Python/CUDA — re-download with the explicit `--python-version 311` form (A3). |
| `ai_extraction: offline` | `OLLAMA_HOST` unreachable, or `ollama list` doesn't show the models on the server. |
| Upload says “queued”, never extracts | AI was offline at upload — call `POST /queue/process` once Ollama is up. |
| Voice: `cublas64_12.dll not found` | The CUDA toolkit DLLs aren't present — set `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`. |
| Docling OCR error about `rapidocr`/`PP-OCRv6` | Ensure `easyocr` is installed; the parser uses EasyOCR on purpose. |
| Dates look wrong | Always verify on the confirm screen — that step exists precisely because models misread dates (NFR-4). |

---

## One-breath summary

**Internet PC:** download wheels (core + ai + gpu), `npm install` for
`node_modules`, `ollama pull gemma3:4b` and `bge-m3` then copy
`.ollama/models`, trigger Whisper/Docling once and copy their caches, grab the
installers — copy it all to USB.
**Offline PC:** install Python + PostgreSQL, `pip install --no-index` the wheels,
drop in `node_modules` and the model caches, set up Ollama on the office server
with the copied models, set `DB_PASSWORD` + `OLLAMA_HOST` in `backend\.env`, then
run the two **Start commands**. Qdrant is embedded — nothing to install.
**No internet needed anywhere.**

---

# Changing the models on the offline PC

Every model is **config, not code** (NFR-7) — you swap it by editing
`backend\.env` and restarting the backend. No source changes.

> **Offline rule:** the offline PC can't `ollama pull` or download from
> HuggingFace. So for **any** new model, first get it on an internet PC, then
> copy it across (same as Part A4), before setting it in `.env`.

### 1) Document/extraction + RAG model — `OLLAMA_MODEL`
1. On an internet PC: `ollama pull <model>` → copy `.ollama/models` to the server.
2. On the server: confirm with `ollama list`.
3. In `backend\.env`: `OLLAMA_MODEL=<model>` → restart the backend.

| Option | Size (approx) | When to use |
|--------|---------------|-------------|
| `gemma3:4b` *(default)* | ~3.3 GB | 4 GB GPU dev box — multimodal, good balance |
| `qwen2.5:7b-instruct` | ~4.7 GB | Office GPU server — stronger text extraction |
| `qwen2.5vl:7b` | ~6 GB | Best for **scanned/handwritten** letters (true vision model) |
| `llama3.1:8b` | ~4.9 GB | Alternative general model |

### 2) Embedding model (semantic search / Ask) — `EMBED_MODEL`
1. Pull + copy the model to the server (as above).
2. In `backend\.env`: `EMBED_MODEL=<model>`.
3. **Rebuild the index** — the vector dimension differs per model. Either click
   **“Rebuild index”** on the Ask page, or delete `backend\qdrant_data\` and let
   it rebuild. (The app also auto-recreates the index if it detects a dimension
   change, so a swap never crashes.)

| Option | Dim | When to use |
|--------|-----|-------------|
| `bge-m3` *(default)* | 1024 | Best retrieval, multilingual, long context |
| `bge-large` | 1024 | Strong English-only, a bit lighter |
| `nomic-embed-text` | 768 | Lightest/fastest, lower accuracy |
| `mxbai-embed-large` | 1024 | Strong English alternative |

### 3) Voice model — `WHISPER_MODEL` / `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE`
Whisper models come from HuggingFace — pre-copy the cache (Part A4) before
selecting a bigger one. **Default is `distil-large-v3` on `cuda/float16`**
(English; bundled). GPU needs only the NVIDIA driver — the CUDA cuBLAS/cuDNN
DLLs ship as pip wheels and are auto-loaded by `transcribe.py`.

| Setting | No-GPU box | GPU box *(default)* | Multilingual |
|---------|-----------|---------------------|--------------|
| `WHISPER_MODEL` | `distil-large-v3` (slow) or `base` | `distil-large-v3` | `large-v3-turbo` |
| `WHISPER_DEVICE` | `cpu` | `cuda` | `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | `float16` | `float16` |
| `WHISPER_LANGUAGE` | `en` | `en` | `` *(empty = auto-detect)* |

> `distil-large-v3` is English-only. For Hindi/mixed audio switch to a
> multilingual model (e.g. `large-v3-turbo`) and clear `WHISPER_LANGUAGE` —
> pre-copy that model's HF cache first.

### 4) Document OCR (Docling / EasyOCR)
OCR is fixed (EasyOCR engine). To add a language, pre-copy that EasyOCR language
pack into `.EasyOCR` on an internet PC first; it can't download offline.

### After any swap
```powershell
# restart the backend so .env is re-read
cd backend; .\venv\Scripts\activate; uvicorn api.main:app --host 0.0.0.0 --port 9000
# embeddings changed? rebuild the index (Ask page button) or:
#   Remove-Item backend\qdrant_data -Recurse -Force   then click "Rebuild index"
```
Verify on the Status page: model loaded, and `curl http://localhost:9000/services`
shows `ai_extraction: ready`.
