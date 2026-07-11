# AI Notes and Scheduling

> Turn documents, letters, voice notes, and scanned mail into calendar events and searchable notes — powered by a private AI server, never a cloud model.

![Status](https://img.shields.io/badge/status-in%20development-blue)
![Python](https://img.shields.io/badge/python-3.11+-green)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-teal)
![React](https://img.shields.io/badge/frontend-React-61DAFB)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Table of Contents

- [What it does](#what-it-does)
- [Key design principles](#key-design-principles)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [API endpoints](#api-endpoints)
- [Journeys](#journeys)
- [Requirements coverage](#requirements-coverage)
- [Team](#team)
- [Roadmap](#roadmap)

---

## What it does

Most important information arrives as paper — letters, notices, meeting invites, contracts. You read them, mentally note the date and venue, and then forget to add them to your calendar. This app closes that gap.

You upload the document (or speak a voice note). A Vision LLM running locally on a private GPU server reads it and extracts the key fields — subject, date, time, venue, attendees, reference number, deadline, and reply-by date. You review everything on a confirm screen, correct anything the AI got wrong, and hit Approve. The event lands on your calendar and the original document is linked permanently so you can verify the source at any time.

Nothing is saved automatically. The AI proposes, the human confirms.

---

## Key design principles

**1. Human always confirms before anything saves.**
The AI extracts and proposes. Every extracted event or task sits on a confirm screen where the user can edit, approve, or dismiss. Low-confidence fields are highlighted. This is the primary defence against misread dates — the single biggest risk in the system.

**2. Nothing is ever lost.**
If you dismiss a proposed event, the document is still stored and searchable. You can re-run extraction on it later. If the AI server goes down, uploaded files sit in a queue and are processed automatically when the server comes back.

**3. Zero external calls.**
All processing happens on the internal network. The Vision LLM, STT model, embedding model, and vector database all run locally. No document or note ever leaves the private server. Built for air-gapped / Dev Lan environments.

**4. AI never invents a date.**
If a date cannot be read with confidence, the field is left blank and flagged — never guessed. Past meeting dates are flagged, not silently discarded. All dates are displayed as DD MMM YYYY to eliminate ambiguity.

**5. Schedule answers come from the database, not the AI.**
When you ask "what meetings do I have next week?", the answer is a SQL query against the calendar table — not an AI recall. The AI is only involved in the extraction step, never in answering schedule questions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      React Frontend                      │
│   Dashboard · Upload · Calendar · Tasks · Search         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                        │
│  /upload  /query  /events  /tasks  /health  /services    │
└──────┬──────────┬──────────┬──────────┬─────────────────┘
       │          │          │          │
  ┌────▼───┐ ┌───▼────┐ ┌───▼───┐ ┌────▼────┐
  │ vLLM   │ │Whisper │ │Qdrant │ │PostgreSQL│
  │(Vision │ │ (STT)  │ │(Vector│ │   (DB)  │
  │  LLM)  │ │        │ │  DB)  │ │         │
  └────────┘ └────────┘ └───────┘ └─────────┘
                                        │
                              ┌─────────▼──────┐
                              │     Redis       │
                              │ (Semantic Cache)│
                              └────────────────┘
```

**Component responsibilities:**

| Component | Role |
|-----------|------|
| React | UI — all screens the user sees and interacts with |
| FastAPI | Brain — receives every request, orchestrates all services |
| vLLM + Qwen/Vision | Extracts structured fields from documents and transcripts |
| Whisper | Converts voice notes to text (local, no cloud) |
| PostgreSQL | Stores events, tasks, documents, queue, audit log |
| Qdrant | Vector database for semantic search across document content |
| BGE-Large | Embedding model — turns text into vectors for semantic search |
| BGE Reranker | Re-scores search results for accuracy |
| Redis | Semantic cache — skips re-processing repeated queries |
| Keycloak | Authentication — issues and validates tokens |

---

## Tech stack

**Backend**
- Python 3.11+
- FastAPI — REST API framework
- vLLM — local LLM inference server (OpenAI-compatible endpoint)
- Whisper — local speech-to-text
- Docling — document parsing (PDF, DOCX, images)
- PostgreSQL — relational database
- Qdrant — vector database for semantic search
- Redis — semantic caching
- Keycloak — authentication

**Frontend**
- React (Vite)
- Plain CSS / inline styles (no heavy framework dependency)

**Infrastructure**
- Docker + Docker Compose
- Ubuntu 22.04
- NVIDIA GPU (24GB+ VRAM recommended for Vision LLM)

---

## Project structure

```
AI-Notes-and-Scheduling/
│
├── backend/
│   ├── api/
│   │   └── main.py              # All FastAPI endpoints
│   ├── ingestion/
│   │   └── pipeline.py          # Document parsing + chunking + embedding
│   ├── retrieval/
│   │   └── search.py            # Qdrant search + RRF + reranker
│   ├── utils/
│   │   ├── embeddings.py        # BGE-Large embedding service
│   │   ├── reranker.py          # BGE Reranker service
│   │   ├── cache.py             # Redis semantic cache
│   │   ├── evaluator.py         # LLM-as-judge quality check
│   │   ├── whisper_stt.py       # Whisper voice transcription
│   │   └── qdrant_setup.py      # Qdrant collection initialisation
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root component + routing
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Today view — meetings and tasks
│   │   │   ├── Upload.jsx       # File upload + confirm screen
│   │   │   ├── Calendar.jsx     # Calendar views (day/week/month)
│   │   │   ├── Tasks.jsx        # Task list + status
│   │   │   └── Search.jsx       # Keyword + semantic search
│   │   └── components/
│   │       ├── Sidebar.jsx
│   │       ├── ConfirmScreen.jsx
│   │       └── ConflictWarning.jsx
│   └── package.json
│
├── database/
│   ├── schema.sql               # All table definitions
│   └── README.md                # Schema documentation
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker + Docker Compose
- NVIDIA GPU with 24GB+ VRAM (for Vision LLM)
- CUDA 12.1+

### 1. Clone the repo

```bash
git clone https://github.com/kushwaha001/AI-Notes-and-Scheduling.git
cd AI-Notes-and-Scheduling
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
```

Key variables in `.env` (see `backend/.env.example` for the full list, and
[OFFLINE-SETUP.md](./OFFLINE-SETUP.md) for air-gapped deployment):

```env
# LLM (OpenAI-compatible: vLLM or Ollama). INCLUDE the /v1 suffix.
LLM_BASE_URL=http://localhost:8000/v1
LLM_MODEL=                       # blank = auto-pick the served model
# Embeddings (blank = reuse LLM_BASE_URL)
EMBED_BASE_URL=http://localhost:8001/v1
EMBED_MODEL=bge-m3
# Docling (blank = in-process; or a docling-serve URL)
DOCLING_URL=
OCR_MODE=auto
# Qdrant (blank = embedded local file)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=udaan_db
DB_USER=postgres
DB_PASSWORD=
CONFIDENCE_THRESHOLD=0.7
```

### 3. Start infrastructure services

```bash
docker-compose up -d qdrant redis postgres
```

### 4. Start the Vision LLM via vLLM

```bash
vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ \
  --quantization awq \
  --tensor-parallel-size 2 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.60 \
  --port 8000
```

### 5. Install backend dependencies and run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 9000
```

### 6. Install frontend dependencies and run

```bash
cd frontend
npm install
npm run dev
```

### 7. Verify everything is running

```bash
curl http://localhost:9000/health
# → {"status": "ok", "version": "1.0.0"}

curl http://localhost:9000/services
# → {"llm":"ok","embeddings":"ok","qdrant":"ok","docling":"ok","postgres":"ok","ai_extraction":"ready"}
```

Open `http://localhost:5173` in your browser.

---

## API endpoints

| Method | Endpoint | Description | Requirements |
|--------|----------|-------------|--------------|
| GET | `/health` | App health check | NFR-9 |
| GET | `/services` | Status of all services | NFR-9 |
| POST | `/upload` | Upload document (PDF/JPG/PNG/TIFF ≤50MB) | FR-1, FR-3, FR-4 |
| POST | `/upload/voice` | Upload voice note (≤5 min audio) | FR-6 |
| POST | `/events/manual` | Create event manually without AI | FR-7 |
| POST | `/events/confirm` | Approve extracted event | FR-14 |
| POST | `/events/dismiss` | Dismiss proposed event (keeps document) | FR-14a |
| GET | `/events` | List all calendar events | FR-16 |
| GET | `/events/today` | Today's events for dashboard | FR-33 |
| GET | `/tasks` | List all tasks | FR-22 |
| POST | `/query` | Search notes and documents | FR-29, FR-30, FR-31 |
| GET | `/documents` | List all uploaded documents | FR-2 |
| GET | `/cache/stats` | Redis cache statistics | — |
| DELETE | `/cache/clear` | Clear semantic cache | — |

---

## Journeys

### Journey 1 — Document upload → calendar event

```
Upload file (PDF/JPG/PNG/TIFF)
  → Validate format and size (FR-1)
  → Hash check for duplicates (FR-3)
  → Readability check (FR-4)
  → Queue for processing (NFR-6)
  → AI server check (NFR-9) — if down, stay queued (NFR-2)
  → Vision LLM extracts fields + confidence scores (FR-8, FR-9, FR-10)
  → Date sanity checks (FR-11, NFR-4)
  → Reference number duplicate check (FR-3)
  → Confirm screen — human reviews, edits, approves (FR-14, FR-15)
      → Dismiss: event discarded, document kept and searchable (FR-14a)
      → Approve: save to calendar + audit log + search index (FR-16–21, FR-26–28)
```

### Journey 2 — Voice note → task

```
Record voice note (≤5 min, FR-6)
  → Whisper STT — local, never leaves network (FR-6, NFR-3)
  → Human reviews and edits transcript (FR-6)
  → Queue for processing (NFR-6)
  → AI server check (NFR-9)
  → LLM extracts task + resolves relative dates (FR-12)
  → Schedulable? No → save as plain note (FR-13)
  → Confirm screen — human approves proposed task (FR-14, NFR-4)
      → Dismiss: note kept (FR-14a)
      → Approve: save task linked to audio + transcript (FR-22, FR-26, FR-28)
```

### Journey 3 — Ask about schedule

```
User types a query
  → Query router classifies: schedule question vs content question (FR-32)
      → Schedule: SQL query against calendar table (FR-29)
            → 0 results: show empty state, never AI-invented answer
            → Results: show events sourced from DB
      → Content: keyword + semantic search across documents (FR-30, FR-31)
            → 0 results: show empty state
            → Results: show matching documents with source links (FR-26, FR-27)

Note: keyword search works even when AI server is down (NFR-9)
Note: AI summary of results deferred to v1.1
```

---

## Requirements coverage

### Functional Requirements

| FR | Description | Status |
|----|-------------|--------|
| FR-1 | Accept PDF, JPG, PNG, TIFF — max 50MB, max 20 files | Day 2 |
| FR-2 | Show upload status | Day 2 |
| FR-3 | Duplicate detection via file hash and reference number | Day 2 |
| FR-4 | Readability check before processing | Day 3 |
| FR-5 | Typed note input | Day 4 |
| FR-6 | Voice note — max 5 min, Whisper STT, audio kept | Day 5 |
| FR-7 | Manual event entry — no AI, always works | Day 1 ✓ |
| FR-8 | Extract: subject, date, time, venue, attendees, ref#, deadline, reply-by | Day 3 |
| FR-9 | Store full document text | Day 2 |
| FR-10 | Confidence score per extracted field | Day 3 |
| FR-11 | Date sanity checks — past dates flagged, blank not invented | Day 3 |
| FR-12 | Task extraction from voice notes, relative date resolution | Day 5 |
| FR-13 | Save unschedulable voice notes as plain notes | Day 5 |
| FR-14 | Confirm screen — all fields shown, low-confidence highlighted, editable | Day 3 |
| FR-14a | Dismiss keeps document, discards event | Day 3 |
| FR-15 | Conflict warning on confirm screen | Day 4 |
| FR-16–21 | Calendar — day/week/month/year views, event CRUD | Day 4 |
| FR-22–23 | Task list, pending replies | Day 5 |
| FR-26–27 | Source document link on every event and task | Day 4 |
| FR-28 | Audit log — every action recorded | Day 4 |
| FR-29–32 | Search — keyword, semantic, schedule query, query router | Day 6 |
| FR-33–34 | Today dashboard, timeline view | Day 5 |
| FR-38 | Notes stored as Markdown | Day 6 |

### Non-Functional Requirements

## Non-Functional Requirements (NFRs)

| NFR   | Description                              | How it is Met                                                      |
| ----- | ---------------------------------------- | ------------------------------------------------------------------ |
| NFR-1 | Correctness beats speed                  | Confirmation step before creating events/tasks                     |
| NFR-2 | Nothing captured by the user can be lost | PostgreSQL retry queue persists across restarts                    |
| NFR-3 | Total privacy, no external network calls | All AI services run locally                                        |
| NFR-4 | Misread dates are the primary risk       | Validation rules, confidence highlighting, and confirmation screen |
| NFR-5 | Dates displayed as DD MMM YYYY           | Enforced at the UI layer                                           |
| NFR-6 | One file processed at a time (v1)        | Queue with a single worker                                         |
| NFR-7 | AI models are swappable                  | Configurable through environment variables                         |
| NFR-8 | Use an existing React calendar library   | Calendar built using a maintained React library                    |
| NFR-9 | App remains usable if AI services fail   | Core features work normally; AI jobs remain queued                 |

---

## Team

| Name | Role | Branch |
|------|------|--------|
| Jahnavi Rajpoot | Database, Infrastructure,CRUD APIs  | `feature/api-core`, `feature/calendar-view`|
| Khushagr | Frontend, UI/UX | `feature/frontend-shell`, `feature/confirm-screen` |
|  Kanishk Kushwaha | Backend,Infrastructure,CRUD APIs  | `feature/database-schema`,  `feature/vision-extraction` |

---

## Roadmap

**v1 — Current (10-day sprint)**
- Document upload and extraction
- Voice note transcription
- Human confirm screen
- Internal calendar
- Keyword and semantic search
- Single user

**v1.1 — Next**
- AI-written search summaries with citations (RAG)
- Query router improvements
- Notification reminders

**v2 — Future**
- Multi-user with role-based access (Keycloak RBAC)
- Bulk document ingestion
- Export to external calendar formats (ICS)
- Mobile-responsive layout

---

## Contributing

This is an internal project. If you are a team member:

1. Never commit directly to `main`
2. One branch per feature — named `feature/what-it-does`
3. Open a Pull Request and link the FR number it implements
4. All PRs require review before merge

See [`Git-Team-Guide`](./Git-Team-Guide-AI-Notes-Scheduler.docx) for the full workflow.

