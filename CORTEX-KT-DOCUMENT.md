# CORTEX — Knowledge Transfer Document

**C**orrespondence, **O**rganisation, **R**ecords & **T**asking **EX**pert-system · Indian Air Force · v2 (10 Jul 2026)
Base KT reference: architecture, every feature and how it works, and a complete map of where AI is used.

---

## 1. What the system is

> **Naming note:** the product name is **CORTEX**; internal identifiers created earlier keep the historical codename *udaan* (database `udaan_db`, Keycloak realm `udaan`, container `udaan` in the air-gap kit). Do not rename those — nothing depends on the display name.

CORTEX turns **official letters, voice notes and quick text** into structured, trackable office work: calendar events, tasks, a correspondence (DAK) register, reply tracking with AI-drafted replies, semantic search, and a knowledge graph — with a **human-confirmation gate** on everything the AI proposes. It is built to run **fully offline** inside one Docker container; the only network call is to the **vLLM inference server deployed on the LAN** (OpenAI-compatible /v1).

### Golden rule of the design
> **The AI proposes; the user approves.** No extracted event/task is saved until a human confirms it (the Inbox → Confirm flow). Unreadable/missing fields are left blank — the extractor is instructed to never invent data (FR-11), and date-sanity flags (past meeting date, overdue reply-by) are computed deterministically, not by the model.

---

## 2. Architecture

```
┌────────────────────────────  Docker container (single box)  ───────────────────────────┐
│                                                                                        │
│  React 19 + Vite (5173, production build via `vite preview`, /api proxied → 9000)      │
│      │  REST (JSON)                                                                    │
│  FastAPI backend (9000, uvicorn, NO --reload)                                          │
│      ├── PostgreSQL 15 (5432, in-container)   ← all structured data                    │
│      ├── Embedded Qdrant (on-disk, backend/qdrant_data)  ← vector index                │
│      ├── Embeddings server (8100, fastembed bge-small-en-v1.5, OpenAI-compatible)      │
│      ├── faster-whisper large-v3 (in-process, CPU/int8, lazy-loaded)                   │
│      ├── Docling + EasyOCR (in-process document parsing/OCR, CPU)                      │
│      └── code-server IDE (8080, no auth — firewall it)                                 │
│                                                                                        │
└───────────── outbound: ONE call class — OpenAI-compatible chat LLM (/v1) ──────────────┘
                          LAN vLLM inference server — endpoint/model switchable live in AI Settings
```

- **No ORM** — raw `psycopg2` with dict cursors everywhere.
- **Frontend calls** go through one helper: `front-end/src/services/api.js` → `req(method, path, body)` against `BASE = VITE_API_BASE || "/api"`. The Vite dev server *and* `vite preview` both proxy `/api → localhost:9000` (see `front-end/vite.config.js`).
- **Auth** is scaffolded for Keycloak (v2) but **disabled** (`AUTH_ENABLED=false`): `api/auth.py` returns a fixed single user; every route still takes `user: CurrentUser = Depends(current_user)` so enabling auth later needs no route changes.

### Repository layout

```
backend/
  api/
    main.py            app init, router registration, lifespan (db_init, auto-backup, qdrant warm-up)
    config.py          env-driven config (.env)
    settings_store.py  DB-backed runtime settings (overrides .env, live)
    db.py / db_init.py connection + idempotent schema (CREATE IF NOT EXISTS + ALTERs)
    auth.py            single-user shim / Keycloak-ready
    ai/                ← ALL AI lives here (see §4)
    routes/            one file per API area (25 files)
front-end/
  src/
    services/api.js    every backend call
    pages/             17 route pages
    components/        shared UI (modals, sidebar, palette, skeletons, toasts…)
    theme/             ThemeProvider (light/dark + font scale), theme.css tokens
scripts/               start-all / start-db / start-backend / start-frontend / stop-all
```

---

## 3. Database (PostgreSQL, schema in `api/db_init.py`, idempotent)

| Table | Purpose | Key columns worth knowing |
|---|---|---|
| `users` | single row in v1 (auth off) | |
| `documents` | every uploaded letter/file | `file_hash` (sha256 dedupe), `full_text` (OCR/parse result), `ref_number`, `letter_status` (open/replied/closed), `status` (queued→processing→ready_to_confirm→done/failed/trashed), `classification` |
| `processing_queue` | AI pipeline job per document | `status`: waiting→processing→awaiting_confirm/failed, `retry_count` |
| `extractions` | **what the AI read** from a source, pre-confirmation | `subject,event_date,event_time,event_end_time,venue,attendees,ref_number,deadline,reply_by`, `field_confidence` (jsonb 0–1 per field), `model_name`, `status` pending/confirmed/dismissed, `meeting_date_flag`, `reply_by_overdue` |
| `events` | confirmed calendar events | `priority`, `event_end_time`, `classification`, `source` ('ai'/'manual'), `recurrence_id`, `parent_event_id` |
| `event_recurrence` | recurrence rules (FR-20) | |
| `tasks` | confirmed/manual tasks | `priority` (auto-escalates to Critical when overdue), `is_reply_task`, `classification` |
| `notes` + `note_versions` | markdown notes, every edit versioned | `summary`, `tags` (AI-written) |
| `audio` | every voice recording (kept even if transcription fails) | `transcript`, `duration`, `file_path` |
| `linked_documents` | provenance: which doc produced which event/task | `link_type='source'` — drives cascade-delete and event detail |
| `soft_links` | human-confirmed associations between any two items | via `links.py` accept/reject |
| `reminders` | event reminders (1day/1hour/15min offsets) | delivered flag |
| `audit_log` | every action (FR-28) | CHECK-constrained `action` list (incl. `escalated`) |
| `app_settings` | **runtime overrides** (LLM URL/model/key/prompt, vision_mode) | key/value; read live by the AI layer |
| `backups`, `system_status` | daily auto-backup bookkeeping | |
| `feedback` | TEMP tester-report widget storage | remove after test phase |

**Delete model:** everything is soft-delete (`status='trashed'`/`deleted_at`) with a Trash page + restore; deleting a document **cascades** to its extracted events/tasks (via `linked_documents` where `link_type='source'`) and clears its queue row + pending extractions.

---

## 4. THE AI LAYER — where AI is used, and exactly how

All AI code is in `backend/api/ai/`. There are **four model classes** in play:

| # | Model | Runs where | Used for |
|---|---|---|---|
| 1 | **Chat LLM** (Llama-3.3-70B-class instruct model served by the LAN vLLM) | **external** — the only outbound call | field extraction, Ask AI answers, reply drafting, morning brief, note summarize/actions |
| 2 | **Whisper large-v3** (faster-whisper, CPU int8) | in-process | voice → text |
| 3 | **bge-small-en-v1.5** (fastembed/ONNX) | local server :8100 | embeddings for semantic search |
| 4 | **Docling layout models + EasyOCR** | in-process | PDF/image parsing & OCR |

### 4.1 `llm.py` — the single LLM client
- Plain `httpx` against any **OpenAI-compatible** `/v1/chat/completions` — no vendor SDK, so any OpenAI-compatible server works (vLLM, Ollama, TGI).
- **Config is read live per call** via `current_config()`: Settings-page overrides in `app_settings` first, `.env` fallback. Changing the vLLM URL in the UI applies instantly, no restart. Blank model → auto-detect from `/v1/models`.
- `generate_json(prompt)` — temperature 0, requests `response_format: json_object` when `llm_json_mode` on, **auto-retries without it** if the server 400s.
- `generate_text(prompt)` — free-form (Ask AI / drafts); honours the **custom system prompt** setting (extraction deliberately does NOT — its tuned prompt is protected).
- `generate_json_vision(prompt, images)` — same call with OpenAI vision `content` arrays (data-URI page images).

### 4.2 Document understanding pipeline (`pipeline.py` → `parser.py` → `extractor.py`)
The heart of the system. Per document:

```
upload (documents.py /upload)
  └ sha256 dedupe → INSERT documents(status=queued) + processing_queue(waiting)
  └ BackgroundTask: process_document(doc_id)
       1. parser.parse_document()      → Docling parse; OCR_MODE=auto (digital PDFs skip OCR)
       2. vision gate (_should_use_vision, reads vision_mode LIVE: off|auto|on)
          auto → image uploads always; PDFs whose text layer < VISION_AUTO_TEXT_FLOOR
          if used: render.render_pages() → page PNGs → extractor.extract_fields_from_images()
       3. readability gate (FR-4): text < MIN_READABLE_CHARS and no vision → status=failed
          ("re-upload a clearer copy") — never guessed
       4. extractor.extract_fields(text) → LLM prompt (see below) → _normalise()
       5. INSERT extractions(status=pending) + documents.status=ready_to_confirm
       6. semantic indexing: vectorstore.index_text() (chunked, retried once)
```

**The extraction prompt** (`extractor.py`) — few-shot, strict-JSON schema demanding: subject (always, 3–6 words), event_date/`event_time`/**event_end_time** (time ranges like "1430–1600 hrs"), venue, attendees, ref_number, deadline, reply_by, item_type (event|task), and **`field_confidence` 0–1 per field**. Rules: *never invent dates*, resolve relative dates against today, null + confidence 0 when absent. `_normalise()` then does deterministic post-processing: date parsing (multiple formats), time cleaning, **fallback title derivation** if the model returned no subject, and the two sanity flags (`meeting_date_flag`, `reply_by_overdue`) computed in Python — not trusted to the model.

**Where the human comes in:** `ConfirmPage` shows the source (inline iframe) next to editable fields with per-field confidence badges (<70% highlighted "check"); approve inserts into `events`/`tasks` + `linked_documents(source)`, dismiss marks the extraction dismissed. `confirm-all` bulk-inserts every pending extraction of a job.

### 4.3 Voice (`transcribe.py`, `routes/voice.py`)
- `POST /upload/voice` → audio saved to `audio` table/disk **first** (never lost), then **faster-whisper large-v3** transcribes in-process (CPU/int8, beam 1, `vad_filter=False` — the Silero VAD wrongly deleted entire browser webm clips as "silence"; disabled after a tester incident).
- The editable transcript can be saved as a note, or run through the **same LLM extractor** (`/voice/extract`) to become an event/task proposal → same confirm flow.
- `GET /audio` + `/audio/{id}/download` — every recording replayable even when transcription failed.

### 4.4 Semantic search & RAG (`embeddings.py`, `vectorstore.py`, `routes/search.py`, `routes/ask.py`)
- **Indexing:** document full-text and notes are chunked (900 chars, 120 overlap), embedded via the local :8100 server, upserted into **embedded Qdrant** (cosine; collection auto-recreated if the embedding dim changes). Point ids are md5-derived from (kind,item_id,chunk) → re-index replaces cleanly.
- **Search (`POST /search`):** merges (a) tokenized SQL keyword search (ALL tokens must match across filename/full_text/titles) and (b) Qdrant vector hits — so both "exact ref number" and "what did we say about data fusion" work.
- **Ask AI (`/ask`):** two answer paths:
  - **Schedule questions** are answered **deterministically from SQL** (events + tasks merged chronologically, "overdue" keyword → open tasks past due). No LLM hallucination window for dates.
  - **Content questions** are RAG: top-k Qdrant chunks → `generate_text()` with the retrieved context (+ optional custom system prompt).
- Qdrant client is a **thread-safe singleton** (double-checked lock) opened eagerly at startup — the embedded store allows exactly one accessor per process (see §9 gotchas).

### 4.5 The office-AI features (all chat-LLM, all with deterministic fallbacks)
| Feature | Endpoint | How |
|---|---|---|
| **Draft Reply** | `POST /documents/{id}/draft-reply` | letter `full_text` + ref → `generate_text()` with a formal-correspondence prompt → editable draft in `DraftReplyModal`; user copies or saves as a `Reply` note. Nothing auto-sent. |
| **Morning brief** | `GET /digest` | counts from SQL (meetings today, replies due 7d, overdue, awaiting confirm) → short LLM sentence (temp 0.3), **cached per (user, date)**; deterministic sentence if LLM down. Also runs the **escalation sweep** (overdue open tasks → priority Critical, once, audit-logged). |
| **Note summarize** | `POST /notes/{id}/summarize` | LLM → `summary` + `tags` on the note (best-effort, offline-safe). |
| **Find tasks & events in a note** | `POST /notes/{id}/schedule` | extractor over note body → proposed items → one-click add (same confirm philosophy). |
| **Attention briefing** | `GET /attention` | overdue/slipping items from SQL; one-line LLM phrasing with deterministic fallback. |
| **NL quick-add** | `POST /tasks/parse` | "pay bill next Tuesday, high priority" → LLM JSON → prefilled task form (user still saves). |

### 4.6 Where AI is deliberately NOT used
- **Reference-series letter threading / knowledge-graph edges** — pure algorithm (`_ref_series`, `_file_no`, `_norm_ref` in `documents.py`, shared by `graph.py` and `/documents/{id}/thread`): HTML-entity unescape → uppercase → anchor on the longest ≥3-digit run (the file number, OCR-stable) → chain letters by running index. Survives OCR-garbled refs.
- Duplicate detection (sha256), date sanity flags, escalation, reminders, conflict warnings, register/CSV — all deterministic SQL/Python.

---

## 5. Feature catalogue — FE page → BE endpoints → tables → AI?

| Feature | Frontend | Backend | Tables | AI |
|---|---|---|---|---|
| Upload & batch capture | `UploadPage` (drag-drop, >50 MB pre-flight, duplicate toast) | `POST /upload`, `/documents`, `/reextract` | documents, processing_queue | pipeline §4.2 |
| Inbox / review queue | `InboxPage` (pending, processing, recently-captured; Confirm-all) | `/confirmations/pending`, `/{job}`, `confirm`, `confirm-all`, `dismiss-all` | extractions→events/tasks, linked_documents | displays AI output |
| Confirm screen | `ConfirmPage` (source iframe `?inline=1`, per-field confidence, category picker, related-items linking) | `confirmations.py`, `/documents/{id}/related`, `links.py` | same + soft_links | extraction + embeddings (related) |
| **Letters workspace** | `LettersPage` + `DraftReplyModal` | `/documents/register`, `/register.csv`, `PATCH /{id}/letter-status`, `POST /{id}/draft-reply` | documents, extractions | **Draft Reply (LLM)** |
| Calendar | `CalendarPage` (+ schedule-x `CalendarContainer`, Month/Week/Day/Year, `EventDetailModal` with **letter thread**, edit, recurrence, conflict + past-date warnings) | `events.py`, `/documents/{id}/thread`, reminders | events, event_recurrence, reminders | thread = algorithmic |
| Tasks | `TasksPage` (priority chips, inline edit, undo-trash, NL quick add) | `tasks.py` (`/tasks/parse`) | tasks | NL parse (LLM) |
| Notes | `NotesPage` (versions, summarize, find-actions) | `notes.py` | notes, note_versions | summarize + actions (LLM) |
| Voice | `VoicePage` (record/upload, recordings list) | `voice.py` | audio (+extractions) | Whisper + extractor |
| Search | `SearchPage` (typeahead, Coming-up panel) | `search.py` | + Qdrant | embeddings |
| Ask AI | `AskPage` (suggested questions) | `ask.py` | — | RAG + SQL schedule answers |
| Knowledge graph | `GraphPage` (web/timeline layouts, focus strip, +/−/Reset zoom) | `graph.py` | all item tables | edges algorithmic |
| Today dashboard | `DashboardPage` (**morning brief**, first-run guide, attention, stats) | `dashboard.py`, `digest.py`, `attention.py` | — | brief + attention (LLM, cached) |
| Command palette | `CommandPalette` (Ctrl+K: actions + item search + peek) | `graph.py` (node index) | — | no |
| AI Settings | `SettingsPage` | `settings.py` (`GET/PUT /settings/llm`, `/test`) | app_settings | configures AI |
| Trash / Audit / Status | `TrashPage`, `AuditLogPage` (entity names), `SystemStatusPage` | `trash.py`, `audit.py`, `system.py` | audit_log | no |
| Reminders/notifications | `NotificationManager` (browser Notification, secure-context-guarded; meetings + replies-due) | `reminders.py`, register | reminders | no |

---

## 6. Key flows, step by step

**A. Letter → calendar (the core magic):** upload → dedupe/queue → Docling/OCR (or vision) → LLM strict-JSON extraction with confidences → `extractions(pending)` → Inbox card → Confirm screen (human edits/approves, picks category) → `events` row + `linked_documents(source)` + default reminders → Calendar; letter appears in Register with reply-by tracking; full text semantically indexed.

**B. Reply workflow:** Register/replies-due (open letters with `reply_by`) → sidebar badge + desktop notification (≤3 days) → "✍️ Draft reply" → LLM draft → edit → copy / save as `Reply` note → "✓ Mark replied" (`letter_status='replied'`; completing a linked reply-task does the same automatically in `tasks.py`).

**C. Voice → task:** record → Whisper (local) → editable transcript → extract → confirm → task with due date; audio always kept.

**D. Ask "what's overdue?":** keyword-routed to SQL (no LLM); content questions → embeddings → Qdrant top-k → LLM with context.

---

## 7. Runtime configuration

Two layers, both read **live**:
1. `.env` (`backend/.env`, template auto-written by `scripts/start-backend.sh`) — DB, `LLM_BASE_URL/MODEL/API_KEY/JSON_MODE`, `EMBED_BASE_URL` (:8100), Whisper (`large-v3/cpu/int8`), `OCR_MODE=auto`, `VISION_MODE`, `OFFLINE_MODE=true` (forces HF offline).
2. `app_settings` table via the **AI Settings page** — overrides .env with exact semantics: clearing the Server URL resets everything to .env; with a URL set, blank model = auto-detect and blank key = send none (the LAN-vLLM case). `vision_mode` rides the same store and is read per-document by the pipeline.

---

## 8. Deployment & operations

- **Dev box:** container `note-app-dev`; hot-patch = `docker cp` into `/home/coder/project/...`; backend restart = kill uvicorn + relaunch (**no `--reload`** — it hangs on busy background tasks and double-processes fight over the embedded Qdrant lock); frontend = `npm run build` + `vite preview` on 5173. Access over the LAN: `http://<host-ip>:5173`.
- **Air-gap kit** (`I:\10Jul26\note_app`): `note-app-airgap-v2.tar.gz` (image with models + demo corpus baked, secrets scrubbed, PG cleanly shut down), `1-install.sh` (sha256 + docker load), `2-run.sh` (create container + start), `start.sh` (after every reboot), `stop.sh`, `status.sh`, `README.md`. Point at vLLM via AI Settings → Test → Save. Ports: 5173 app / 9000 API / 8080 IDE (restrict!).
- **Backups:** daily auto pg-dump-style export on startup if >24 h old (`backup.py`); manual `POST /backup`.

---

## 9. Gotchas & known limitations (read before changing things)

1. **Embedded Qdrant = one accessor per process.** Never run two backend processes against `backend/qdrant_data`. Client is a locked singleton + eager startup init + indexing retry. For multi-worker, set `QDRANT_URL` to a Qdrant server.
2. **No uvicorn `--reload`, ever** (see §8). Restart explicitly after backend edits.
3. **Extraction model quality matters.** Strict JSON needs a strong instruct model (validated: Llama-3.3-70B). Small models → empty fields. `gpt-oss` returned non-JSON and was abandoned. JSON-mode auto-retry exists but is not magic.
4. **Whisper VAD is off** deliberately (§4.3) — don't re-enable without testing browser-recorded webm.
5. **Browser notifications need a secure context** (https or localhost) — on plain LAN http they silently don't exist; in-app reminders still work.
6. **Single-user mode**: auth shim returns user id 1. Keycloak scaffolding exists (`auth.py`, `soft_links`… user-scoped queries throughout) — enabling it is config + Keycloak server, not a rewrite.
7. **Feedback widget was removed** after the test phase (11 Jul); the `feedback` table remains as a historical record of the 31 tester reports.
8. **schedule-x renders ZonedDateTime by UTC instant** — event times are stored as IST wall-clock and anchored to UTC on render so every viewer sees the literal time (`CalendarContainer.jsx`). Don't "fix" this back to `[Asia/Kolkata]`.
9. **Route ordering in FastAPI matters** — `/documents/register`, `/register.csv`, `/{id}/thread` are declared **before** `/documents/{doc_id}`.
10. Escalation runs on `/digest` (dashboard load) — idempotent by WHERE clause; there is no cron daemon in the box.

---

## 10. Quick dev workflow (code-server, port 8080)

```bash
# backend change
pkill -f "uvicorn api.main"
cd /home/coder/project/backend && nohup ./.venv/bin/uvicorn api.main:app \
  --host 0.0.0.0 --port 9000 > ../logs/backend.log 2>&1 &

# frontend, while iterating (hot reload)
pkill -f "vite preview"; cd /home/coder/project/front-end && npm run dev -- --host 0.0.0.0 --port 5173

# frontend, back to production mode
npm run build && nohup ./node_modules/.bin/vite preview --host 0.0.0.0 --port 5173 --strictPort \
  > ../logs/frontend.log 2>&1 &

# everything at once
bash scripts/stop-all.sh && bash scripts/start-all.sh
```

*Prepared 11 Jul 2026 · reflects the v2 image (all 08–10 Jul test-cycle fixes + the Letters workspace, morning brief, palette, escalation, vision setting, thread view).*
