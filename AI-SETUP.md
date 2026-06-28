# Enabling the AI Extraction (Docling + local model)

The app runs fine without AI (manual entry, calendar, tasks, notes, search all
work). This guide turns on the **automatic extraction**: upload a letter →
it's parsed and the meeting/task fields are pulled out → you review and confirm.

```
Upload → Docling parses the PDF/image to text → local model (gemma3:4b via
Ollama) extracts subject/date/time/venue/ref#/deadline/reply-by with confidence
→ Confirm screen → you edit/approve → event or task is created
```

---

## What you need
- **Ollama** (runs the local model) — https://ollama.com
- A pulled model — **`gemma3:4b`** (default; configurable)
- Python AI packages — **docling, easyocr, ollama** (in `backend/requirements-ai.txt`)
- A GPU helps a lot. On a 4 GB GPU `gemma3:4b` is tight/slow; an 8 GB+ GPU is comfortable.

---

## Step 1 — Install Ollama and pull the model
1. Install Ollama from https://ollama.com (it runs a local server on port 11434).
2. Pull the model:
   ```powershell
   ollama pull gemma3:4b
   ```
3. Confirm it's running:
   ```powershell
   curl http://localhost:11434/api/tags
   ```

## Step 2 — Install the Python AI packages
```powershell
cd backend
.\venv\Scripts\activate
pip install -r requirements-ai.txt
```
> First document you process, Docling + EasyOCR download their models
> (one-time, a few hundred MB). After that it's local and offline.

## Step 3 — Configure (optional)
In `backend/.env` (all have sensible defaults):
```
AI_ENABLED=true                 # master switch
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma3:4b          # swap the model here (NFR-7) — no code change
CONFIDENCE_THRESHOLD=0.7        # fields below this are flagged on the confirm screen
```

## Step 4 — Run and use it
1. Start the backend: `uvicorn api.main:app --port 9000`
2. Start the frontend: `npm run dev`
3. Go to **Upload**, drop a PDF/image, and upload.
4. When extraction finishes, the document appears under **Pending AI Extractions**
   — click **Review & Confirm**.
5. The confirm screen shows the extracted fields. **Low-confidence fields are
   flagged**, past meeting dates and overdue reply-by dates are warned. Edit
   anything, then **Confirm & Save** (creates the event/task) or **Dismiss**
   (keeps the document, discards the proposal).

---

## How the model is swappable (NFR-7)
The model name is only ever read from `OLLAMA_MODEL`. To try a different one:
```powershell
ollama pull qwen2.5:3b
# set OLLAMA_MODEL=qwen2.5:3b in backend/.env, restart the backend
```
Good small options: `gemma3:4b` (multimodal), `qwen2.5:3b` (lighter), or a
stronger VLM like `qwen2.5vl:7b` on a bigger GPU.

---

## Degraded mode (NFR-9) — what happens if AI is off
- If Ollama isn't running or the AI packages aren't installed, uploads are still
  **accepted and queued** — nothing is lost.
- The rest of the app keeps working normally.
- When AI comes back, process the backlog with one call:
  ```
  POST /queue/process
  ```
- The **Status** page shows `ai_extraction: ready / offline`, plus `ollama` and
  `docling` health, so you can see the state at a glance.

---

## Checking it's working
```powershell
curl http://localhost:9000/services
# look for:  "ollama":"ok", "docling":"ok", "ai_extraction":"ready"
```

---

## Troubleshooting
| Symptom | Cause / Fix |
|---|---|
| `ai_extraction: offline` | Ollama not running, or `pip install -r requirements-ai.txt` not done. |
| Upload says “queued”, never extracts | AI was offline at upload time — call `POST /queue/process` once it's up. |
| OCR error about `rapidocr` / `PP-OCRv6` | Make sure **easyocr** is installed (`pip install easyocr`); the parser uses EasyOCR on purpose. |
| Extraction very slow / out-of-memory | Model too big for the GPU. Use a smaller model (`qwen2.5:3b`) or run on a bigger GPU. |
| Dates look wrong | Always check them on the confirm screen — that step exists precisely because models misread dates (NFR-4). |
