# Dev container — code-server + backend + frontend + Postgres

One Docker image that bundles **everything** so you can edit and run the whole app
from a browser IDE:

- **code-server** (VS Code in the browser) on `:8080`
- **FastAPI backend** on `:9000` (Python venv pre-installed)
- **React/Vite frontend** on `:5173` (node_modules pre-installed)
- **PostgreSQL** inside the same container (auto-created DB + schema on first boot)

You start the container with one host script, then run a couple of scripts from
inside the IDE terminal to bring the app up.

---

## 1. Build & run (on the host)

```bash
./dev-container/run.sh
```

This builds the image `note-app-dev` and starts a container publishing ports
`8080`, `5173`, `9000`.

## 2. Open the IDE

Go to **http://localhost:8080** (auth is disabled for local dev).

## 3. Start the app from the IDE terminal

Open **Terminal ▸ New Terminal** and run:

```bash
./scripts/start-all.sh
```

That starts PostgreSQL, then the backend and frontend in the background
(logs in `logs/`). Or start them one at a time:

```bash
./scripts/start-db.sh        # PostgreSQL
./scripts/start-backend.sh   # FastAPI  (:9000, autoreload)
./scripts/start-frontend.sh  # Vite dev (:5173)
```

Then open:

- Frontend → **http://localhost:5173**
- API docs → **http://localhost:9000/docs**

Stop the app (keeps the IDE running): `./scripts/stop-all.sh`
Stop the whole container: `docker rm -f note-app-dev`

---

## Pointing at your LAN AI server

The container has no LLM inside it. Once the app is running, open the app's
**Settings** page (sidebar ⚙) and set the **LLM Base URL** to your vLLM/Ollama
box (e.g. `http://192.168.1.50:8000/v1`), pick a model, and **Test connection**.
No restart needed. (You can also preset `LLM_BASE_URL` in `backend/.env`.)

## Offline / air-gapped transfer

Build on a machine with internet, then move the image to the LAN box:

```bash
# on the build machine
docker save note-app-dev | gzip > note-app-dev.tar.gz

# copy the file across, then on the target machine
docker load < note-app-dev.tar.gz
docker run -d --name note-app-dev -p 8080:8080 -p 5173:5173 -p 9000:9000 note-app-dev
```

## Semantic search / Ask (RAG)

Semantic search needs an **embeddings** endpoint, which chat-only LLM servers
(Groq, some vLLM setups) don't provide. So the image bundles a tiny CPU
embeddings server — `dev-container/embed_server.py` (fastembed / ONNX,
`bge-small-en-v1.5`) — started by `scripts/start-embeddings.sh` on `:8100`.
`start-all.sh` launches it automatically and the backend's `EMBED_BASE_URL`
points at it, so **Ask** and related-items work out of the box. To use a
dedicated embeddings server on your LAN instead, change the embeddings Base URL
on the app's Settings page.

Digital PDFs are parsed via **pypdf** (no docling needed), so upload → extract →
confirm → calendar works with just an LLM configured.

## Notes

- Voice transcription (`faster-whisper`) and in-process OCR of *scanned* images
  (`docling`, `easyocr`) are **not** installed in this dev image (they're large /
  GPU-oriented). Digital-PDF upload, calendar, tasks, notes, keyword + semantic
  search, and the Settings-driven LLM path all work. To add the heavy AI extras:
  `backend/.venv/bin/pip install -r backend/requirements-ai.txt`.
- Data lives inside the container. `docker rm` deletes it. Add a volume mount for
  `/var/lib/postgresql` and `/home/coder/project` if you need persistence.
