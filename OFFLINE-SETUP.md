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

## What runs where

| Component | Where it runs | How it gets there offline |
|-----------|---------------|---------------------------|
| PostgreSQL (database) | App PC | Copied installer |
| Backend (FastAPI) | App PC | Python wheels (copied) |
| Frontend (React/Vite) | App PC | `node_modules` (copied) |
| **Ollama** (LLM + embeddings) | Office server | Install Ollama + copy the model blobs |
| **Qdrant** (vector index) | App PC (embedded) | Bundled with the Python wheels — no server needed |
| Docling / Whisper models | App PC | Copy the model caches |

The app talks to Ollama over HTTP (`OLLAMA_HOST`), so Ollama can live on the
office server while the app runs on the same PC or another box on the Dev Lan.

---

## ✅ What this bundle already contains

This repo has been **pre-staged** — you don't need to download anything on an
internet PC. Just zip the project folder (with `offline\`) and carry it across.

| In `offline\` | What it is | Goes to |
|---------------|------------|---------|
| `wheels-bundle\` | All Python wheels — exact locked set (Win x64 / Py 3.11) | `pip install` on the App PC |
| `models\ollama-models\` | `gemma3:4b` + `bge-m3` (+ nomic) blobs | the office server's `.ollama\models` |
| `models\huggingface-cache\` | Whisper `base` + Docling layout models | App PC `%USERPROFILE%\.cache\huggingface` |
| `models\EasyOCR\` | OCR models | App PC `%USERPROFILE%\.EasyOCR` |

You still install **Python 3.11**, **PostgreSQL**, and **Ollama** from
`offline\installers\` (add those installers before sending). Part A below is only
needed if you ever want to **rebuild/refresh** the bundle.

> **No wheel changes for the latest features.** Reminders/browser notifications
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
python -m pip download -r requirements-lock.txt pip setuptools wheel -d ..\offline\wheels-bundle
cd ..
```
> All wheels are plain PyPI (CPU `torch` ~123 MB) — **no CUDA index needed**. The
> GPU is driven by Ollama (LLM + embeddings) and CTranslate2 (Whisper), not by
> Python torch. This keeps the bundle ~1 GB instead of ~3.5 GB.

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
python -c "from faster_whisper import WhisperModel; WhisperModel('base')"
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

# Voice (faster-whisper). Use cpu on machines without the CUDA toolkit DLLs.
WHISPER_MODEL=base
WHISPER_DEVICE=cpu          # set to cuda on the GPU server
WHISPER_COMPUTE_TYPE=int8   # float16 on cuda
```
If the frontend and backend run on the **same** PC, the Vite proxy needs the
backend on `localhost:9000` — keep that. `OLLAMA_HOST` can point anywhere on the
Dev Lan.

### C9. Start it (normal commands)
Make sure PostgreSQL is running (Services → `postgresql-x64-…`), then use the two
**Start commands** at the top of this guide. The backend creates `udaan_db` and
all tables on first run.

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
| Whisper `base` (voice) | `models\huggingface-cache` | App PC `.cache\huggingface` | ~0.15 GB |
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
selecting a bigger one.

| Setting | 4 GB / CPU box | GPU server |
|---------|----------------|-----------|
| `WHISPER_MODEL` | `base` | `medium` or `large-v3` |
| `WHISPER_DEVICE` | `cpu` | `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | `float16` |

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
