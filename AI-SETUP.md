# Enabling AI Extraction (Docling + an LLM server)

The app runs fine without AI (manual entry, calendar, tasks, notes, search all
work). This guide turns on **automatic extraction**: upload a letter → it's parsed
to text → the meeting/task fields are pulled out → you review and confirm.

```
Upload → Docling parses the PDF/image to text → an LLM (vLLM or Ollama, via an
OpenAI-compatible API) extracts subject/date/time/venue/ref#/deadline/reply-by
with confidence → Confirm screen → you edit/approve → event or task is created
```

Every model is reached by a **URL** (NFR-7), so the LLM, embeddings and Docling
can each run locally or on a separate in-network server. For full air-gapped
deployment see **[OFFLINE-SETUP.md](./OFFLINE-SETUP.md)**.

---

## What you need

| Piece | What it is | Where |
|-------|-----------|-------|
| **LLM server** | OpenAI-compatible — **vLLM** (or Ollama's `/v1`) | local or a LAN host |
| **Embedding server** | OpenAI-compatible `/v1/embeddings` (e.g. `bge-m3`) | local or a LAN host (can be the same as the LLM) |
| **Docling** | document parsing / OCR — in-process (bundled) **or** a `docling-serve` URL | app PC or a LAN host |
| **Whisper** | local speech-to-text (for voice notes) | app PC GPU |
| Python AI packages | docling, easyocr, faster-whisper, qdrant-client, … | in `backend/requirements-lock.txt` (already installed) |

A GPU helps a lot for Whisper and (if local) Docling OCR.

---

## Step 1 — Point at your LLM + embedding servers

The app doesn't run the LLM itself; it calls one over HTTP. Start whichever you use.

**vLLM (OpenAI-compatible):**
```bash
vllm serve <your-model> --port 8000
# exposes http://<host>:8000/v1
```

**or Ollama (also exposes an OpenAI-compatible /v1):**
```powershell
ollama serve
ollama pull gemma3:4b
ollama pull bge-m3
# exposes http://localhost:11434/v1
```

Confirm a server answers:
```powershell
curl http://<llm-host>:8000/v1/models     # vLLM
curl http://localhost:11434/v1/models     # Ollama
```

## Step 2 — Configure `backend/.env`
```ini
AI_ENABLED=true                  # master switch

# LLM (include the /v1 suffix)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=                       # blank = auto-pick the server's first model
LLM_API_KEY=                     # set if the server needs a token

# Embeddings (blank EMBED_BASE_URL = reuse LLM_BASE_URL)
EMBED_BASE_URL=
EMBED_MODEL=bge-m3

# Docling (blank = in-process; or your docling-serve URL)
DOCLING_URL=
OCR_MODE=auto                    # auto skips OCR for digital PDFs (faster)

CONFIDENCE_THRESHOLD=0.7         # fields below this are flagged on the confirm screen
```

> **In-process Docling** (blank `DOCLING_URL`) downloads its layout + EasyOCR
> models on the first document (one-time, a few hundred MB). After that it's
> local. On an air-gapped box, pre-stage those caches and set `OFFLINE_MODE=true`
> (see OFFLINE-SETUP.md). A **remote `DOCLING_URL`** needs nothing locally.

## Step 3 — Run and use it
1. Backend: `uvicorn api.main:app --port 9000`
2. Frontend: `npm run dev`
3. Go to **Upload**, drop a PDF/image, and upload.
4. When extraction finishes, the document appears under **Pending AI Extractions**
   — click **Review & Confirm**.
5. The confirm screen shows the extracted fields. **Low-confidence fields are
   flagged**, past meeting dates and overdue reply-by dates are warned. Edit
   anything, then **Confirm & Save** (creates the event/task) or **Dismiss**
   (keeps the document, discards the proposal).

---

## Swapping models (NFR-7)
Models are config, not code:
- **LLM** — change `LLM_BASE_URL` / `LLM_MODEL`, restart the backend.
- **Embeddings** — change `EMBED_BASE_URL` / `EMBED_MODEL`, then **rebuild the
  index** (Ask page → "Rebuild index") because the vector dimension may change.
  The app also auto-recreates the index on a dimension change, so a swap never
  crashes.
- **Voice** — `WHISPER_MODEL` (`distil-large-v3` English; `large-v3-turbo`
  multilingual), `WHISPER_BEAM_SIZE` (accuracy vs speed). See OFFLINE-SETUP.md §8.

---

## Degraded mode (NFR-9) — what happens if AI is off
- If the LLM/Docling are unreachable, uploads are still **accepted and queued** —
  nothing is lost. The rest of the app works normally.
- When AI comes back, drain the backlog: `POST /queue/process` (or **"Run AI on
  queued"** on the Upload page).
- The **Status** page shows `ai_extraction: ready / offline`, plus `llm`,
  `embeddings` and `docling` health.

---

## Checking it's working
```powershell
curl http://localhost:9000/services
# look for:  "llm":"ok", "embeddings":"ok", "docling":"ok", "ai_extraction":"ready"
```

---

## Troubleshooting
| Symptom | Cause / Fix |
|---|---|
| `ai_extraction: offline` | LLM server unreachable. `curl <LLM_BASE_URL>/models`. Check `LLM_BASE_URL` includes `/v1`. |
| **401 from a service** | A corporate proxy is intercepting LAN calls — add the hosts to `NO_PROXY`. Or the service needs a key — set `LLM_API_KEY` / `EMBED_API_KEY` / `QDRANT_API_KEY`. |
| Embeddings/Ask "not reachable" | Check `EMBED_BASE_URL` / `EMBED_MODEL`; `curl <EMBED_BASE_URL>/models`. |
| Docling parse fails | Remote: check `DOCLING_URL` + `/health`. In-process: ensure Docling/EasyOCR caches are present (or `OFFLINE_MODE` is set with caches staged). |
| Voice load hangs on a dead network | Set `OFFLINE_MODE=true`. |
| Plain PDF slow | Confirm `OCR_MODE=auto` (it skips OCR for digital PDFs). |
| Dates look wrong | Always check them on the confirm screen — that step exists because models misread dates (NFR-4). |
