# Offline / Air-Gapped Deployment Guide

How to run **AI Notes & Scheduling** on an air-gapped office network with **no
internet** — where the AI models are served as **separate in-network services**
(vLLM, an embeddings server, Docling, Qdrant) and only voice transcription runs
locally on the app PC's GPU.

> **The whole idea:** the office network has no internet, so nothing can be
> downloaded there (`pip install`, `npm install`, model pulls all need internet).
> Everything is fetched on an internet PC, copied across (USB), and run from the
> copied files. The heavy AI models live on in-network **servers** reached by
> URL; the app just makes HTTP calls to them.

---

## 1. Architecture — what runs where

```
                          OFFICE LAN (no internet)
 ┌────────────────────────────┐        ┌─────────────────────────────────────┐
 │  APP PC                     │        │  IN-NETWORK SERVICES (other hosts)   │
 │  ─────────                  │        │  ─────────────────────────────────  │
 │  • Backend (FastAPI)        │  HTTP  │  • vLLM        → LLM_BASE_URL  /v1   │
 │  • Frontend (React/Vite)    │ ─────▶ │  • Embeddings  → EMBED_BASE_URL/v1   │
 │  • PostgreSQL (DB)          │        │  • docling-serve → DOCLING_URL       │
 │  • Whisper STT (local GPU)  │        │  • Qdrant      → QDRANT_URL :6333    │
 │  • Qdrant (embedded option) │        │                                      │
 └────────────────────────────┘        └─────────────────────────────────────┘
```

Every model is reached by a **URL in `backend/.env`** (NFR-7). You can run the
services on one box or several — the app only needs the URLs. The two pieces that
are *not* networked:

| Component | Where it runs | Why |
|-----------|---------------|-----|
| **Whisper** (voice → text) | App PC GPU (e.g. RTX 3070) | Low-latency local transcription; model cache staged on the app PC |
| **Qdrant** (vector index) | App PC *embedded file* **or** a server | Embedded = zero setup (single process). Server = recommended for multi-user / multiple workers |

> **Auth is optional and off by default** (`AUTH_ENABLED=false` = single-user, v1
> behaviour). Turn on Keycloak only for per-user accounts (last section).

---

## 2. Do you need to rebuild the wheels? — No

The application's Python dependencies are **unchanged**. The services-based
design uses only `httpx` + `pypdf`, both already in `requirements-lock.txt`. So
the existing `offline\wheels-bundle\` is complete — install it as-is.

You only rebuild wheels if you change `requirements-lock.txt` itself (see
Appendix A). Otherwise: **don't rebuild.**

---

## 3. What to transfer

Zip the **entire project folder** and carry it across. The items below don't live
in git, so they must be physically copied.

> **If one big zip has failed for you before,** an equivalent split works fine:
> a **code zip** of the project *without* `offline\` (make sure it still includes
> `front-end\node_modules\`), plus the `offline\` subfolders — `wheels-bundle\`,
> `models\`, `whisper\` — sent separately and dropped back into `offline\` on the
> target (same names).

| Path | Size | Needed on | Status |
|------|------|-----------|--------|
| `offline\wheels-bundle\` | ~4.2 GB | App PC | ✅ ready — install as-is |
| `front-end\node_modules\` | ~182 MB | App PC | ✅ ready (`npm install` won't run offline) |
| `offline\models\huggingface-cache\` (Whisper only) | ~1.5 GB | App PC | ✅ needed for local voice |
| `backend\.env` | <1 KB | App PC | ⚠️ create from `.env.example` on the target |
| `offline\installers\` (Python 3.11, PostgreSQL) | varies | App PC | ⚠️ add if the box doesn't have them |

**Server-side models are NOT part of this bundle** — they're provisioned on the
service hosts by whoever runs them:

| Service | What that host needs |
|---------|----------------------|
| vLLM | the LLM weights + a vLLM install on its host (their responsibility) |
| Embeddings | the embedding model (e.g. `bge-m3`) on its host |
| docling-serve | Docling + its layout/OCR models on its host |
| Qdrant | the Qdrant binary, or the Docker image (`docker save`/`load` for air-gap) |

> **This bundle is slimmed to Whisper-only** — `offline\models\` ships just the
> Whisper cache. The deployment uses a **remote `DOCLING_URL`**, so the app PC
> needs no Docling/OCR models locally. If you ever want to run Docling
> **in-process** instead (blank `DOCLING_URL`), you must first **re-stage** the
> Docling layout cache + `EasyOCR` cache on an internet PC (Appendix B style) —
> they were removed from this bundle to keep it small.

---

## 4. Prerequisites on the App PC

Install from `offline\installers\` (skip any already present):

1. **Python 3.11 (Windows x64)** — tick **"Add python.exe to PATH"**.
2. **PostgreSQL (Windows x64)** — note the `postgres` password; keep port `5432`.
3. **NVIDIA driver** — any that supports CUDA 12.x (for Whisper on the GPU). The
   CUDA cuBLAS/cuDNN DLLs ship as pip wheels and auto-load — **no CUDA toolkit
   install needed**.

The in-network service hosts (vLLM / embeddings / Docling / Qdrant) are set up
separately — you only need their URLs.

---

## 5. Install & run on the App PC

### 5.1 Backend — install from the bundled wheels (no internet)
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
python -m pip install --no-index --find-links ..\offline\wheels-bundle -r requirements-lock.txt
cd ..
```
`--no-index` = never touch the internet; everything comes from the bundle.

### 5.2 Frontend — drop in the copied `node_modules`
Place the copied `front-end\node_modules\` into `front-end\`. No install needed.

### 5.3 Whisper model cache (local voice)
Run the bundled installer — it copies the Whisper model(s) into the right place
with the correct `hub\` structure (the part that's easy to get wrong by hand):
```powershell
cd offline\whisper
powershell -ExecutionPolicy Bypass -File .\install-whisper-cache.ps1
cd ..\..
```
See `offline\whisper\README.md` for details and how to use a different model.
*(Only if you run **in-process** Docling instead of a remote `DOCLING_URL`, also
copy `offline\models\huggingface-cache` → `%USERPROFILE%\.cache\huggingface` and
`offline\models\EasyOCR` → `%USERPROFILE%\.EasyOCR`.)*

### 5.4 Configure `backend\.env`
```powershell
copy backend\.env.example backend\.env
```
Edit it — this is the heart of the deployment:

```ini
# Database
DB_PASSWORD=the-postgres-password-from-step-4

# LLM (vLLM — OpenAI-compatible). INCLUDE the /v1 suffix.
LLM_BASE_URL=http://OFFICE-LLM:8000/v1
LLM_MODEL=                       # blank = auto-pick the one model vLLM serves
LLM_API_KEY=                     # set if vLLM requires a token

# Embeddings (separate server, or blank = same as LLM_BASE_URL)
EMBED_BASE_URL=http://OFFICE-EMBED:8001/v1
EMBED_MODEL=bge-m3               # blank = auto-pick the server's first model
EMBED_API_KEY=

# Docling (your running service)
DOCLING_URL=http://OFFICE-DOCLING:5001
DOCLING_API_KEY=

# Qdrant (server recommended; blank = embedded local file)
QDRANT_URL=http://OFFICE-QDRANT:6333
QDRANT_API_KEY=

# Voice (local on the app PC GPU)
WHISPER_MODEL=distil-large-v3    # English; large-v3-turbo for Hindi/mixed
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_BEAM_SIZE=5              # 5 = accurate; 1 = fastest
WHISPER_LANGUAGE=en             # clear (=) if using a multilingual model

# Air-gap hardening
OFFLINE_MODE=true               # force Whisper/Docling to use ONLY local caches
NO_PROXY=localhost,127.0.0.1,OFFICE-LLM,OFFICE-EMBED,OFFICE-DOCLING,OFFICE-QDRANT
```

> **`OFFLINE_MODE=true` is important on an air-gapped box.** Whisper (and
> in-process Docling) use HuggingFace, which otherwise pings the internet to
> "check for updates" on load and **hangs on a dead network**. This forces them
> to use only the pre-staged cache.

> **`NO_PROXY` prevents the classic 401.** If the box has a corporate
> `HTTP(S)_PROXY` set, calls to your LAN services get routed through the proxy,
> which often answers **401 Unauthorized**. List every service host in `NO_PROXY`.

### 5.5 Verify the links *before* starting the app
From the app PC (catches problems in seconds). **Use `curl.exe`** — in PowerShell
plain `curl` is an alias for `Invoke-WebRequest` and won't accept `-H`:
```powershell
curl.exe http://OFFICE-LLM:8000/v1/models          # lists the served model
curl.exe http://OFFICE-EMBED:8001/v1/models
curl.exe http://OFFICE-DOCLING:5001/health
curl.exe http://OFFICE-QDRANT:6333/collections -H "api-key: YOUR_KEY"   # drop -H if not keyed
```

### 5.6 Start it
Make sure PostgreSQL is running (Services → `postgresql-x64-…`), then:
```powershell
# Terminal 1 — backend (creates DB + tables on first run)
cd backend
.\venv\Scripts\activate
uvicorn api.main:app --host 0.0.0.0 --port 9000

# Terminal 2 — frontend (Vite proxies /api -> localhost:9000)
cd front-end
npm run dev
```
Open **http://localhost:5173**.

### 5.7 Verify health
```powershell
curl.exe http://localhost:9000/health      # {"status":"ok"}
curl.exe http://localhost:9000/services    # every line should read "ok"
```
`/services` reports: `llm`, `embeddings`, `qdrant`, `docling`, `postgres`,
`ai_extraction`, `whisper`. The Status page (admin) shows the same live.

---

## 6. The in-network services

The app talks to each over HTTP. You only configure the URL (+ optional API key).

### 6.1 LLM — vLLM (OpenAI-compatible)
vLLM exposes `/v1/chat/completions` and `/v1/models`. Point `LLM_BASE_URL` at it
**with the `/v1` suffix**. Leave `LLM_MODEL` blank to auto-pick the one model it
serves, or set it to the server's `--served-model-name`. If the server needs a
token, set `LLM_API_KEY`. (Ollama also speaks `/v1`, so the same client works if
you ever point back at Ollama.)

### 6.2 Embeddings (OpenAI-compatible)
A separate vLLM/TEI instance serving `/v1/embeddings`. Set `EMBED_BASE_URL` (and
`EMBED_MODEL`, default `bge-m3`). Leave `EMBED_BASE_URL` blank to reuse
`LLM_BASE_URL`. **If you change the embedding model, the vector dimension may
change** — click **"Rebuild index"** on the Ask page (the app also auto-recreates
the index on a dimension change, so it never crashes).

### 6.3 Docling (document parsing / OCR)
A running `docling-serve` instance. Set `DOCLING_URL` (e.g.
`http://OFFICE-DOCLING:5001`); the app POSTs files to
`DOCLING_URL` + `DOCLING_CONVERT_PATH` (default `/v1/convert/file`) and reads the
returned markdown. Leave `DOCLING_URL` blank to run Docling **in-process** on the
app PC instead (needs the Docling + EasyOCR caches locally).

### 6.4 Qdrant (vector DB)
- **Server (recommended):** set `QDRANT_URL` (+ `QDRANT_API_KEY` if it requires
  one). Best for multi-user and multiple uvicorn workers. Air-gapped install:
  `docker save qdrant/qdrant -o qdrant.tar` on an internet PC, copy it, then
  `docker load -i qdrant.tar` and run the container on the office box.
- **Embedded (zero setup):** leave `QDRANT_URL` blank. Stores the index on disk
  at `backend\qdrant_data\`. **Single process only** — don't run multiple workers
  against it.

The health check follows whichever mode is active, so there's no phantom server
to 401 against.

---

## 7. OCR behaviour (faster uploads)

`OCR_MODE` controls when OCR runs:
- **`auto` (default):** a digital PDF with a real text layer **skips OCR
  entirely** (parsed in a fraction of the time); only scans/images are OCR'd.
- **`force`:** always OCR. **`off`:** never OCR.

This means a plain text PDF no longer wastes time going through OCR.

---

## 8. Voice (Whisper) on the app PC GPU

Runs locally on the 3070 — configured entirely in `.env` (no code change):

| Audio | `WHISPER_MODEL` | `WHISPER_LANGUAGE` | Notes |
|-------|-----------------|--------------------|-------|
| English (default) | `distil-large-v3` | `en` | Near large-v3 accuracy, ~6× faster, **bundled** |
| Hindi / mixed | `large-v3-turbo` | `` (auto) or `hi` | Multilingual; **must pre-stage its cache first** |
| Max accuracy | `large-v3` | `` | Slower; pre-stage its cache |

`WHISPER_COMPUTE_TYPE=float16` is the sweet spot on Ampere (don't use int8 — you
have the VRAM). `WHISPER_BEAM_SIZE=5` favours accuracy; set `1` for max speed.

> **Air-gap rule:** any Whisper model other than `distil-large-v3` must have its
> HuggingFace cache **pre-downloaded on an internet PC and copied over** before
> you set it in `.env`. With `OFFLINE_MODE=true`, an un-cached model won't
> download — it'll just fail to load (and fall back to CPU). On a **no-GPU** box,
> set `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`.

---

## 9. Config reference (every model = its own URL)

| Variable | Default | Meaning |
|----------|---------|---------|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | LLM server (OpenAI-compatible), include `/v1` |
| `LLM_MODEL` | *(blank)* | served model id; blank = auto-pick |
| `LLM_API_KEY` | *(blank)* | bearer token if required |
| `LLM_JSON_MODE` | `true` | request strict JSON; auto-retries without it if rejected |
| `EMBED_BASE_URL` | = `LLM_BASE_URL` | embeddings server |
| `EMBED_MODEL` | `bge-m3` | embedding model; blank = auto-pick |
| `EMBED_API_KEY` | *(blank)* | bearer token if required |
| `DOCLING_URL` | *(blank)* | docling-serve base URL; blank = in-process |
| `DOCLING_API_KEY` | *(blank)* | bearer token if required |
| `DOCLING_CONVERT_PATH` | `/v1/convert/file` | docling-serve convert endpoint |
| `OCR_MODE` | `auto` | `auto` / `force` / `off` |
| `QDRANT_URL` | *(blank)* | Qdrant server; blank = embedded file |
| `QDRANT_API_KEY` | *(blank)* | Qdrant key if required |
| `QDRANT_COLLECTION` | `udaan_content` | collection name |
| `WHISPER_MODEL` | `distil-large-v3` | local STT model |
| `WHISPER_DEVICE` | `cuda` | `cuda` / `cpu` |
| `WHISPER_COMPUTE_TYPE` | `float16` | `float16` (GPU) / `int8` (CPU) |
| `WHISPER_BEAM_SIZE` | `5` | accuracy vs speed |
| `WHISPER_LANGUAGE` | `en` | hint; empty = auto-detect |
| `OFFLINE_MODE` | `false` | **set `true` on the air-gapped box** |
| `AI_ENABLED` | `true` | master switch for document extraction |
| `AUTH_ENABLED` | `false` | Keycloak multi-user (off = single-user) |

---

## 10. Degraded mode (NFR-9)

If any AI service is unreachable, the app **still runs**: manual entry, calendar,
tasks, notes, keyword search, and viewing all work. Uploads are accepted and
**queued**; when the LLM/Docling return, drain the backlog with
`POST /queue/process` (or **"Run AI on queued"** on Upload). The Status page shows
live service health.

---

## 11. Troubleshooting

| Problem | Fix |
|---------|-----|
| **401 from a service (LLM/Qdrant/Docling)** | A corporate proxy is intercepting LAN calls. Add every service host to `NO_PROXY` in `.env`. If the service genuinely needs a key, set its `*_API_KEY`. |
| `pip` tries the internet | You missed `--no-index`. Point it only at `offline\wheels-bundle`. |
| Voice load hangs / "connection" errors on startup | Set `OFFLINE_MODE=true` (stops HuggingFace update checks). |
| `ai_extraction: offline` on `/services` | `LLM_BASE_URL` unreachable, or `/v1/models` returns nothing. Test with `curl …/v1/models`. |
| Embeddings/Ask says "not reachable" | Check `EMBED_BASE_URL` / `EMBED_MODEL`; `curl …/v1/models`. |
| Docling parse fails | Check `DOCLING_URL` + `DOCLING_CONVERT_PATH`; `curl …/health`. If using in-process, ensure the Docling/EasyOCR caches are staged. |
| Whisper `cublas64_12.dll not found` | GPU runtime DLLs missing — set `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`. |
| Upload says "queued", never extracts | AI was offline at upload — call `POST /queue/process` once services are up. |
| Plain PDF still slow | Confirm `OCR_MODE=auto` (it skips OCR for digital PDFs). |
| Dates look wrong | Always verify on the confirm screen — that step exists because models misread dates (NFR-4). |

---

## 12. Keycloak (v2 multi-user auth) — optional

Skip to run single-user (default). To enable per-user accounts:

1. Add to `offline\installers\`: a **JRE/JDK 17+** and the **Keycloak server zip**
   (`keycloak-XX.X.X.zip`). The realm + run script ship in `keycloak\`.
2. Install the JRE; unzip Keycloak into `keycloak\dist\` (so
   `keycloak\dist\bin\kc.bat` exists).
3. Start it (imports the `udaan` realm + `udaan-frontend` client on first run):
   ```powershell
   cd keycloak
   powershell -ExecutionPolicy Bypass -File .\run-keycloak.ps1 -AdminUser admin -AdminPassword "CHANGE-ME"
   ```
4. In the admin console (http://localhost:8080) switch to the **udaan** realm →
   **Users → Add user** → set a password (Temporary off). For
   System/Audit/Backup pages: **Role mapping → Assign role → `admin`**.
5. Flip it on in `backend\.env`:
   ```ini
   AUTH_ENABLED=true
   KEYCLOAK_URL=http://localhost:8080
   KEYCLOAK_REALM=udaan
   KEYCLOAK_CLIENT_ID=udaan-frontend
   ```
   Restart the backend. To revert: `AUTH_ENABLED=false` — no data lost (existing
   single-user data stays owned by the built-in `default` user).

> **Redirect URIs:** `udaan-realm.json` allows `http://localhost:5173`/`:3000`.
> Serving from another host/port? Edit the client's *Valid redirect URIs* /
> *Web origins* in the admin console.

---

## Appendix A — Rebuilding the wheel bundle (only if deps change)

You do **not** normally need this (see §2). Only if you edit
`requirements-lock.txt`: on a **Windows x64 / Python 3.11** internet PC,
```powershell
cd backend
python -m pip download -r requirements-lock.txt pip setuptools wheel `
  --extra-index-url https://download.pytorch.org/whl/cu128 `
  -d ..\offline\wheels-bundle
cd ..
```
Pre-flight (must end exit 0):
```powershell
backend\venv\Scripts\python -m pip install --no-index `
  --find-links offline\wheels-bundle -r backend\requirements-lock.txt `
  --dry-run --ignore-installed
```

## Appendix B — Pre-staging a Whisper model cache (for non-default models)

On an internet PC with the venv:
```powershell
cd backend; .\venv\Scripts\activate
python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo')"
cd ..
robocopy "$env:USERPROFILE\.cache\huggingface" offline\models\huggingface-cache /E
```
Copy `offline\models\huggingface-cache` to the app PC's `%USERPROFILE%\.cache\huggingface`,
then set `WHISPER_MODEL=large-v3-turbo` in `.env`.

---

## One-breath summary

**App PC:** install Python + PostgreSQL, `pip install --no-index` the (unchanged)
wheels, drop in `node_modules` and the Whisper cache, fill `backend\.env` with the
**service URLs** + `OFFLINE_MODE=true` + `NO_PROXY`, run the two start commands.
**Services:** vLLM, embeddings, docling-serve and Qdrant run on the LAN; the app
reaches them by URL. **No internet needed anywhere. No wheel rebuild needed.**
