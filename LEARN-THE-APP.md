# Understanding UDAAN — From Zero

> A from-scratch explanation of this entire application, written for someone with
> **no prior knowledge**. Read it top to bottom. I assume you know nothing about
> web apps, databases, or AI — so I explain *every* concept the first time it
> appears. Take your time; this is long on purpose.

This document has **five parts**:

- **Part 1 — How the logic works** (the actual mechanics: the document pipeline,
  how the *confidence score* is created, semantic search, voice, auth…)
- **Part 2 — Why we needed each thing** (the reason behind every technology and
  decision — the "intuition")
- **Part 3 — Every concept explained** (a plain-English glossary of every term and
  library used)
- **Part 4 — The small details that matter** (subtle but important patterns this
  codebase uses: prop drilling, React keys, immutable state, transactions, lazy
  singletons, chunking, caching, status codes… the stuff that makes you a real dev)
- **Part 5 — The folder structure** (what every file/submodule does)

---

## The 10,000-foot view: what is this app?

UDAAN takes the **documents and voice notes** that land on an officer's desk —
letters, meeting notices, scanned mail — and **automatically turns them into
calendar events and to-do tasks**, using AI that runs **entirely on a local
machine with no internet**.

A real-world analogy: imagine a diligent **office assistant**. You hand them a
letter. They *read* it (even if it's a photo/scan), *understand* it ("this is a
meeting on 9 July at 10:30 in Room 4"), and *write it into your diary*. Then they
ask you "shall I add this?" and on your nod, it's in your calendar. UDAAN is that
assistant, built in software.

Three big pieces make it work. Keep this mental model — everything below hangs off it:

```
┌─────────────────┐   HTTP requests    ┌──────────────────┐   SQL    ┌────────────┐
│   FRONTEND      │ ─────────────────▶ │     BACKEND      │ ───────▶ │ PostgreSQL │
│  (React, the    │ ◀───────────────── │   (FastAPI, the  │ ◀─────── │ (the       │
│   screen you    │   JSON responses   │    brain/rules)  │          │  memory)   │
│   click on)     │                    │                  │          └────────────┘
└─────────────────┘                    │   calls local AI │
                                       └────────┬─────────┘
                                                │ HTTP
                                   ┌────────────▼─────────────┐
                                   │  LOCAL AI SERVICES        │
                                   │  • Ollama (the LLM brain  │
                                   │    + embeddings)          │
                                   │  • Docling+EasyOCR (eyes) │
                                   │  • Whisper (ears)         │
                                   │  • Qdrant (semantic memory)│
                                   └───────────────────────────┘
```

- **Frontend** = what the user sees and clicks (runs in the web browser).
- **Backend** = the rules and logic; it receives requests, talks to the database
  and the AI, and sends answers back.
- **Database (PostgreSQL)** = permanent memory (events, tasks, documents…).
- **AI services** = separate local programs the backend calls to "read", "listen",
  "understand", and "remember by meaning".

Why split into pieces at all? Because each piece has **one job** and can be
swapped or restarted without breaking the others. This is called **separation of
concerns** — the single most important idea in software design. (More in Part 2.)

> ### ⚠️ Architecture update (2026) — read this before Part 1
> The AI layer was reworked from "everything via local **Ollama**" to **networked,
> URL-configured services**. Wherever older paragraphs below say *Ollama / gemma3 /
> "embedded Qdrant" / `/api/embeddings` / `format:json` / `keep_alive`*, read them
> through this map:
>
> | Old (in some paragraphs) | Now (current code) |
> |---|---|
> | Ollama runs the LLM (`gemma3:4b`) | **Any OpenAI-compatible server** via `LLM_BASE_URL` — **vLLM** in production (Ollama still works) — client in `ai/llm.py` |
> | Embeddings via Ollama `/api/embeddings` | OpenAI `/v1/embeddings` via `EMBED_BASE_URL` (`ai/embeddings.py`) |
> | Docling runs in-process | Remote **docling-serve** via `DOCLING_URL` (or in-process if blank) |
> | Qdrant "embedded only" | **Server** via `QDRANT_URL` **or** embedded file (config-chosen) |
> | `format:json`, `num_predict`, `keep_alive` | OpenAI `response_format:{json_object}`, `max_tokens` (no keep_alive) |
>
> Whisper still runs **locally** on the app PC GPU. Every model is now reached by a
> URL in `backend/.env`. The **end-to-end workflows in §1.8 are written against the
> current code** — trust those for exact file/table flow. (Full deployment detail:
> `OFFLINE-SETUP.md`.)

---

# PART 1 — How the logic works

## 1.1 The lifecycle of a single request (the heartbeat)

Everything the app does is a variation of this loop. Understand it once and the
whole app makes sense.

1. You click a button in the browser (e.g. "Tasks").
2. The frontend runs a JavaScript function that makes an **HTTP request** — a
   message over the network — to the backend, e.g. `GET /tasks`.
3. The backend has a **route** (a function tied to that URL). It runs.
4. That function asks the **database** for the data using **SQL** (the language
   databases speak): `SELECT * FROM tasks WHERE ...`.
5. The database returns rows. The backend packages them as **JSON** (a simple
   text format for data) and sends it back as the **HTTP response**.
6. The frontend receives the JSON and **renders** it — draws it on screen.

That's it. "Frontend asks, backend answers using the database." Let's see it in
the real code.

**Frontend side** (`front-end/src/services/api.js`) — one helper does *all* network calls:

```js
async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, opts);   // send the request
  if (!res.ok) throw new Error(...);                  // turn errors into JS errors
  return res.json();                                  // parse the JSON answer
}
export const getTasks = () => req("GET", "/tasks").then(r => r.tasks || []);
```

- `fetch` is the browser's built-in function to make HTTP requests.
- `async`/`await`: network calls take time. `await` means "pause here until the
  answer comes back, without freezing the whole page." (Concept explained in Part 3.)
- `BASE` is `/api` (or `http://localhost:9000` offline) — the backend's address.

**Backend side** (`backend/api/routes/tasks.py`):

```python
@router.get("/tasks")
def list_tasks(status=None, category=None, user=Depends(current_user)):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE deleted_at IS NULL AND users_id = %s", [user["id"]])
    return {"tasks": cur.fetchall()}
```

- `@router.get("/tasks")` is a **decorator** — it says "when an HTTP GET comes to
  `/tasks`, run this function." (FastAPI wiring — Part 3.)
- `cur.execute(... %s ...)` runs SQL. The `%s` is a **placeholder** — we never glue
  user text directly into SQL (that would be the famous **SQL-injection** security
  hole). The database driver safely substitutes the value. This matters.
- `return {...}` — FastAPI automatically converts the Python dict to JSON.

So a "page load" is really: React component → `api.js` → `fetch` → FastAPI route →
psycopg2 → PostgreSQL → back up the chain. **Memorize this round-trip.**

## 1.1.5 How clicking a tab takes you to a different page (routing)

You asked exactly the right question. Let's kill the mystery completely.

**The old way (and why it felt different).** Classically, every page of a website
was a *separate file* on the server (`tasks.html`, `calendar.html`). Clicking a
link told the **browser** "go ask the server for that whole new file," the screen
went blank for a moment, and a brand-new page loaded. A full **page reload** every
click.

**This app is a Single-Page Application (SPA).** The browser loads **one** HTML
page *once*. After that, clicking a tab does **not** fetch a new page from the
server — instead, **JavaScript swaps what's shown on screen**. No blank flash, no
reload. It only *looks* like you changed pages. This is faster and smoother, and
it's why your data and scroll feel instant.

The library that makes this work is **React Router** (`react-router-dom`). It has
**three parts**, and they live in two of your files:

**Part A — The "map" of URL → page** (`front-end/src/App.jsx`):
```jsx
<BrowserRouter>
  <Routes>
    <Route path="/tasks"    element={<TasksPage />} />
    <Route path="/calendar" element={<CalendarPage />} />
    ...
  </Routes>
</BrowserRouter>
```
Read this as a lookup table: *"if the URL path is `/tasks`, show the `TasksPage`
component; if it's `/calendar`, show `CalendarPage`."* `<BrowserRouter>` is the
engine that watches the browser's address bar; `<Routes>` picks the one `<Route>`
whose `path` matches the current URL.

**Part B — The clickable tabs** (`front-end/src/components/Sidebar.jsx`):
```jsx
<Link to="/tasks">Tasks</Link>
```
This is the key. A `<Link>` *looks* like a normal link, but it is **not** a normal
link. A normal `<a href>` would tell the browser to go fetch a whole new page
(reload). `<Link>` **intercepts the click**, stops that default behavior, and
instead just **changes the URL** in the address bar using the browser's built-in
**History API** — *without contacting the server at all*.

**Part C — The reaction.** When `<Link>` changes the URL, `<BrowserRouter>` notices,
`<Routes>` re-checks which `<Route>` now matches, finds `/tasks`, and renders
`<TasksPage />`. React then **swaps** the old page component out and the new one in,
right there in the page. The sidebar itself doesn't re-render — only the main
content area changes. That's why the menu stays put while the page content flips.

**The full click, step by step** — you click "Tasks" in the sidebar:
1. `<Link to="/tasks">` catches the click and calls `preventDefault()` (cancels the
   browser's "go load a new page" reflex).
2. It updates the URL to `…/tasks` via the History API. **No network request.**
3. `<BrowserRouter>` sees the URL changed → `<Routes>` matches `/tasks` →
   React renders `<TasksPage />` in place of the previous page.
4. *Now* `TasksPage` runs its `useEffect`, which calls `getTasks()` in `api.js` —
   and **that** is the one network request, to fetch the task data (the lifecycle
   from 1.1). The page draws the tasks.

So there are **two different things** that happen on a click — don't confuse them:
- **Navigation** (steps 1–3): purely local, instant, no server. React Router
  swapping components.
- **Data fetching** (step 4): the new page asks the backend for its data over HTTP.

**Bonus — how the active tab gets highlighted.** The sidebar calls `useLocation()`,
which gives it the *current* URL path. For each item it checks
`location.pathname === item.path` and, if true, paints that tab blue. That's why
the highlight follows you around as you navigate.

```
Click <Link to="/tasks">  →  URL becomes /tasks (no reload)
        →  <Routes> matches  →  React shows <TasksPage/>
        →  TasksPage fetches its data via api.js  →  tasks appear
```

That's the whole trick: **the URL is the single source of truth, `<Link>` changes
it without a reload, and `<Routes>` shows whichever page matches.**

## 1.2 The document pipeline (the crown jewel)

This is the heart of the app: turning an uploaded PDF/scan into structured fields.
It runs in stages. Open `backend/api/ai/pipeline.py` to follow along.

**Stage 0 — Upload** (`routes/documents.py`, `POST /upload`)
- The browser sends the file. The backend checks the type (PDF/JPG/PNG/TIFF) and
  size (≤50 MB), computes a **SHA-256 hash** (a unique fingerprint of the bytes)
  to detect duplicates, saves the file to disk, writes a `documents` row, and adds
  a `processing_queue` row with status `waiting`.
- It then kicks off the AI work **in the background** (`BackgroundTasks`) so the
  upload request returns instantly instead of making the user wait ~60 seconds.

**Stage 1 — Parse / OCR** (`ai/parser.py`)
- **OCR** = Optical Character Recognition = turning the *pixels* of a scanned
  document into actual *text characters*. A scan is just an image; the computer
  can't "read" it until OCR converts picture→text.
- We use **Docling** (a document-understanding library) with **EasyOCR** (the OCR
  engine). It returns the document as **Markdown** text (plain text with simple
  formatting). It runs on the **GPU** when available (much faster).

**Stage 2 — Quality gate** (`pipeline.py`)
- If the OCR produced almost no text (`< MIN_READABLE_CHARS`, default 25), the scan
  is unreadable. We **stop here** and mark it failed with a helpful message,
  rather than feeding garbage to the AI and getting made-up answers. (This is the
  "never invent data" principle — see confidence below.)

**Stage 3 — Field extraction by the LLM** (`ai/extractor.py`)
- **LLM** = Large Language Model = an AI trained to understand and generate text
  (here, a local model called **gemma3:4b**, run by **Ollama**).
- We send the document text to the LLM with a carefully written **prompt**
  (instructions) that says: "Read this and return a strict JSON object with these
  keys: subject, event_date, event_time, venue, attendees, ref_number, deadline,
  reply_by, item_type, and a field_confidence object." We also give it an example
  and strict rules ("NEVER invent a date").
- The model returns JSON text. We parse it, validate the dates, and store an
  `extractions` row with status `pending`.

**Stage 4 — Human confirmation** (`routes/confirmations.py`)
- The extracted item waits in `awaiting_confirm`. The user sees a preview and
  clicks **"Add to calendar"** → `POST /confirmations/confirm-all` inserts the
  event(s)/task(s) into the real `events`/`tasks` tables. **AI proposes; the human
  decides.** Nothing reaches the calendar without a click.

**Stage 5 — Semantic indexing** (best-effort)
- The document text is also embedded into the vector store (see 1.4) so it becomes
  searchable by *meaning*, not just keywords.

The whole flow:
```
upload → OCR (image→text) → quality gate → LLM extracts fields (+confidence)
        → store as "pending" → user clicks "Add" → event/task created
```

## 1.3 ⭐ How the confidence score is created (your specific question)

This is the part everyone gets wrong, so read carefully.

**The confidence score is produced by the LLM itself — it is the model's own
self-assessment of how sure it is about each field.** It is *not* a separate
mathematical formula we compute. Here's exactly how.

In `ai/extractor.py`, the prompt we send to the model includes:

```
- "field_confidence": an object mapping EACH field above to a number 0.0–1.0
Rules:
- NEVER invent or guess a date. If a date is not clearly written, use null and confidence 0.
```

And we give it a worked example so it learns the format:
```
Output: {"subject":"Budget Meeting", "event_date":"09 Jun 2026", ...,
         "field_confidence":{"subject":0.95,"event_date":0.95,"venue":0.9, ...}}
```

So when the model reads your letter, for each field it outputs both the **value**
and a **number from 0 to 1** saying "how confident am I that this is correct?":
- `0.95` → "I'm very sure" (the value was written plainly in the text).
- `0.0` → "Not present / I couldn't find it" (and per our rule it must use `null`).

Then in Python we **clean it up** (`extract_fields`):
```python
conf = data.get("field_confidence") or {}
"field_confidence": {k: float(conf.get(k, 0) or 0) for k in FIELDS}
```
This line says: for every expected field, take the model's number, force it to a
real float, and **default to 0 if the model didn't give one**. So even if the
model misbehaves, we always end up with a clean 0–1 number per field.

**How the score is *used*:** `config.py` has `CONFIDENCE_THRESHOLD = 0.7`. On the
review screen, any field whose confidence is below 0.7 is **flagged** ("please
double-check this one"). High-confidence fields are shown normally. So the score's
real job is **to tell the human which fields to verify**, focusing attention where
the AI is unsure.

**An honest caveat (senior-dev truth):** an LLM's self-reported confidence is a
*heuristic*, not a calibrated statistical probability. A model can be confidently
wrong. That's exactly *why* we keep a human in the loop (Stage 4) and never
auto-insert. The confidence score makes the human's review faster, it doesn't
replace it. Treat it as "where should I look first," not "this is mathematically
90% correct."

**Two more "never invent" safeguards** also live here (`extract_fields`):
- **Date sanity flags**: if a meeting date is in the past, we set
  `meeting_date_flag = True` (implausible — flag it). If a reply-by date is past,
  `reply_by_overdue = True`. These are simple `date < today` comparisons.
- **Tolerant JSON parsing** (`_safe_json`): LLMs sometimes wrap JSON in extra prose
  or code fences. We try a strict parse, then fall back to grabbing the text
  between the first `{` and last `}`, and if even that fails we re-prompt once
  asking for "ONLY valid JSON." Robustness against a slightly messy model.

## 1.4 Semantic search & "Ask your documents" (embeddings + RAG)

**The problem:** normal search is keyword-based — searching "car" won't find a
document that says "automobile." We want search by **meaning**.

**The trick: embeddings.** An **embedding** is a list of numbers (a **vector**,
e.g. 1024 numbers) that represents the *meaning* of a piece of text. Texts with
similar meaning get vectors that are close together in space. "car" and
"automobile" land near each other; "car" and "banana" land far apart.

- `ai/embeddings.py` calls Ollama's `/api/embeddings` with the **bge-m3** model to
  turn text into a vector.
- `ai/vectorstore.py` stores those vectors in **Qdrant** (a *vector database* — a
  database specialized in "find me the nearest vectors"). Each stored chunk also
  carries a `payload`: which document it came from, its title, and the `user_id`.
- **Searching** = embed your question, then ask Qdrant for the **nearest** stored
  vectors (using **cosine similarity** — a measure of "how close in meaning").
  Those are your most relevant results.

**"Ask your documents" = RAG** (`routes/ask.py`). RAG = Retrieval-Augmented
Generation. Instead of asking the LLM to answer from memory (it would hallucinate),
we:
1. **Route** the question: is it about your *schedule* ("what's on next week?") or
   document *content* ("what did the drainage letter say?"). Schedule questions are
   answered **directly from the database** (exact, never made up).
2. For content questions: **Retrieve** the most relevant chunks from Qdrant
   (the "R").
3. **Augment** the LLM prompt with those chunks as context, and tell it "use ONLY
   this context, cite your sources [1][2]" (the "AG").

So the AI answers *grounded in your actual documents*, with citations — not from
its imagination. That's the whole point of RAG.

## 1.5 Voice notes (Whisper) — `ai/transcribe.py`

- You record audio in the browser. The backend saves it and runs **faster-whisper**
  (a fast version of OpenAI's Whisper speech-to-text model) to **transcribe** it
  (audio → text). Then that text goes through the *same* extractor as documents.
- It runs on the **GPU** (`cuda`/`float16`) for speed, with an automatic **fallback
  to CPU** if the GPU isn't available — so it always works.
- Windows-specific detail: the GPU engine needs certain NVIDIA `.dll` files. The
  `_register_cuda_dlls()` function puts them on the search path before the engine
  loads. (You don't need to understand the internals — just know "it makes the GPU
  findable on Windows.")

## 1.6 The supporting logic (briefly)

- **Reminders** (`routes/reminders.py`): an event can have offsets like "1day",
  "1hour". We compute `fire_at = event_datetime − offset`; the frontend polls
  `/reminders/due` every 60s and pops a browser notification when one is due.
- **Recurrence** (`routes/events.py`): "every Monday" is expanded into many event
  rows by stepping the date forward (`_occurrence_dates`), with a safety cap so it
  can't generate infinite rows.
- **Soft links** (`routes/links.py`): "this note seems related to that document" —
  suggested via embedding similarity, but **only applied if the user accepts**.
- **Trash** (`routes/trash.py`): nothing is hard-deleted from the UI. Items are
  marked `trashed` (a **soft delete**) and can be restored; a timed purge is the
  only permanent removal.
- **Backup** (`routes/backup.py`): on startup, if the last backup is >24h old, it
  exports every table to JSON + copies the notes. A safety net with no cloud.

## 1.7 Authentication & multi-user (v2) — `auth.py`

Originally everyone shared one workspace. v2 added **accounts**.

- **Authentication** = proving who you are (logging in). We use **Keycloak**, a
  ready-made login server, speaking **OIDC** (OpenID Connect — the standard
  protocol for "log in with…").
- After you log in, Keycloak gives the browser a **JWT** (JSON Web Token) — a
  digitally *signed* string that says "this is user Kanishk." The frontend attaches
  it to every API request in the `Authorization: Bearer <token>` header.
- The backend **verifies the signature** of that token against Keycloak's public
  keys (`auth.py`, using the `PyJWT` library). If valid, it trusts the identity; if
  not, it returns **401 Unauthorized**.
- **Multi-user data isolation**: every table row has a `users_id` owner column, and
  every query is filtered `WHERE users_id = <you>`. So you only ever see your own
  data. The `current_user` **dependency** (see Part 3 on dependency injection)
  runs before every protected route and supplies "who is asking."
- **The toggle**: `AUTH_ENABLED=false` (default) skips all of this and uses a
  single built-in `default` user — so the app still runs exactly like v1 with no
  Keycloak needed. Flip it to `true` to require login.

## 1.8 Input workflows end-to-end (file-by-file, table-by-table)

This is the section you asked for: each kind of input traced from the **exact
frontend file**, through the **exact backend file(s)**, to the **exact database
tables that change**. This matches the *current* code.

**Legend:** 🖥️ frontend file · 🔌 `api.js` call → endpoint · 🐍 backend file ·
🗄️ table written · 🧠 Qdrant vector store (not a SQL table).

**The tables involved (the app's "memory"):**
`documents` (uploaded files) · `processing_queue` (one job per document) ·
`extractions` (AI's proposed fields, `pending` until confirmed) · `events` ·
`tasks` · `reminders` · `linked_documents` (ties an event/task back to its source
document) · `audio` (voice notes) · `notes` + `note_versions` · `audit_log`
(every action) · `users`.

---

### A) Document upload (PDF / image)  →  calendar event / task

```
🖥️ UploadPage.jsx
  └─🔌 uploadFile(file)  ──POST /upload──▶ 🐍 routes/documents.py
                                              │ 🗄️ documents (status=queued)
                                              │ 🗄️ processing_queue (status=waiting)
                                              │ 🗄️ audit_log (uploaded)
                                              └─ schedules background job, returns now
        (background) 🐍 ai/pipeline.py::process_document
              │ 🗄️ documents→processing, processing_queue→processing
              ├─🐍 ai/parser.py   (Docling remote/in-proc; OCR gated by OCR_MODE) → text
              │     └─ quality gate: too little text → 🗄️ documents→failed, queue→failed, audit_log → STOP
              ├─🐍 ai/extractor.py → 🐍 ai/llm.py (LLM /v1/chat/completions) → fields+confidence
              │ 🗄️ documents (full_text, page_count, classification, ref_number, status=ready_to_confirm)
              │ 🗄️ extractions (status=pending, field_confidence JSONB, model_name)
              │ 🗄️ processing_queue → awaiting_confirm
              │ 🗄️ audit_log (extracted)
              └─🐍 ai/embeddings.py + ai/vectorstore.py → 🧠 Qdrant (best-effort)
🖥️ UploadPage.jsx polls 🔌 getDocuments() (/documents) + getPendingConfirmations()
   user clicks "Add to calendar"
  └─🔌 confirmAllExtractions(jobId) ──POST /confirmations/confirm-all──▶ 🐍 routes/confirmations.py
        for each pending extraction:
          event → 🗄️ events  +  🗄️ reminders (default 1day)  +  🗄️ linked_documents
                  reply_by? → 🗄️ tasks (reply) + 🗄️ linked_documents
          task  → 🗄️ tasks  +  🗄️ linked_documents
          🗄️ extractions→confirmed, 🗄️ audit_log (confirmed)
        end → 🗄️ processing_queue→done, 🗄️ documents→done
🖥️ now visible on CalendarPage.jsx / TasksPage.jsx
```

**Tables changed:** `documents`, `processing_queue`, `extractions`, `audit_log`,
then on confirm `events`/`tasks`, `reminders`, `linked_documents` (+ 🧠 Qdrant).
**Key idea:** nothing reaches `events`/`tasks` until the human clicks — until then
it only lives as a `pending` row in `extractions`.

---

### B) Voice note  →  task / event

```
🖥️ VoicePage.jsx (record/upload)
  └─🔌 uploadVoice(file) ──POST /upload/voice──▶ 🐍 routes/voice.py::upload_voice
        │ saves audio to backend/uploads/audio/
        │ 🗄️ audio (status=transcribing)
        ├─🐍 ai/transcribe.py::transcribe  (Whisper, LOCAL GPU) → transcript
        │ 🗄️ audio (transcript, duration, status=ready) + 🗄️ audit_log
        └─ returns transcript
🖥️ user edits the transcript, clicks Extract
  └─🔌 voiceExtract(text) ──POST /voice/extract──▶ 🐍 routes/voice.py::extract_from_transcript
        └─🐍 ai/extractor.py (same LLM as documents) → proposed fields
           ⚠️ returns fields only — WRITES NOTHING to the DB
🖥️ user reviews, clicks save
  └─🔌 createEvent()/createTask() ──POST /events/manual or /tasks/manual──▶
        🐍 routes/events.py / tasks.py → 🗄️ events (+reminders) or 🗄️ tasks (+audit_log)
```

**Tables changed:** `audio`, `audit_log`, then `events`/`tasks` (+`reminders`) on
save. **Note the difference from documents:** voice has *no* `extractions`/
`processing_queue`/confirm-all step — the transcript→fields result is shown
straight in the Voice page and saved via the **manual** create endpoints.

---

### C) Query — "Ask your documents" & search  (READ-ONLY)

```
🖥️ AskPage.jsx
  └─🔌 ask(q) ──POST /ask──▶ 🐍 routes/ask.py
        ├─ route the question (🐍 ai/llm.py): schedule vs content
        ├─ SCHEDULE ("what's on next week?") → SELECT 🗄️ events  (exact, from DB)
        └─ CONTENT  ("what did the drainage letter say?")
              🐍 ai/embeddings.py embed(q) → 🧠 Qdrant search → 🐍 ai/llm.py generate_text
              → grounded answer + citations
  (per-user in-memory cache, 600s)

🖥️ SearchPage.jsx
  └─🔌 search(q) ──POST /search──▶ 🐍 routes/search.py → SELECT 🗄️ events/documents/notes

🖥️ AskPage "Rebuild index"
  └─🔌 reindex() ──POST /ask/reindex──▶ reads documents+notes → 🧠 Qdrant (rebuild)
```

**Tables changed: NONE.** Queries only **read** — schedule answers come from the
`events` table, content answers from the Qdrant vector store. This is deliberate:
*answering a question must never mutate your data.* (Reindex writes only to Qdrant,
not to any SQL table.)

---

### D) Bonus — the AI-free paths (always work, even if every model is down)

- **Typed note:** 🖥️ `NotesPage.jsx` → 🔌 `createNote()` → `POST /notes`
  (🐍 `routes/notes.py`) → 🗄️ `notes` row **+ a Markdown file** in `backend/notes/`
  (edits add 🗄️ `note_versions`) + 🗄️ `audit_log`. Becomes searchable after reindex.
- **Manual event/task (FR-7):** 🖥️ `CalendarPage.jsx`/`TasksPage.jsx` →
  🔌 `createEvent()`/`createTask()` → `/events/manual` · `/tasks/manual` →
  🗄️ `events` (+`reminders`) / `tasks` + `audit_log`. No AI involved — this is why
  the app is fully usable even with the LLM/Docling offline (NFR-9).

**The one pattern under all of them:** `page → api.js → route → (SQL tables and/or
AI modules) → back to the page`. Inputs that *propose* (document, voice) stage a
`pending` row a human must confirm; inputs that *ask* (query) only read.

---

# PART 2 — Why we needed each thing (the intuition)

For each technology, ask: *what problem would we have without it?*

**Why a separate frontend and backend?**
The browser can't safely hold database passwords or run heavy AI. And we want the
same backend to potentially serve a web app, a mobile app, etc. So the backend
owns the data and rules; the frontend just shows things and collects clicks. If
the UI crashes, your data is safe in the backend. **Separation of concerns.**

**Why FastAPI (the backend framework)?**
We need something to listen for HTTP requests and route them to Python functions.
FastAPI does that, plus it **auto-validates input** (via Pydantic) and
**auto-generates API docs** (visit `/docs`). It's fast and modern. Without it we'd
hand-write a lot of fragile plumbing.

**Why PostgreSQL (the database)?**
We need data to **survive restarts** and support complex queries ("events next
week, not trashed, owned by me, sorted by time"). A database does this reliably
with **transactions** (all-or-nothing changes, so we never half-save). A plain file
can't. Postgres is the robust, free, industry-standard choice.

**Why React (the frontend library)?**
A modern UI has lots of moving parts that change as data arrives (lists, modals,
live status). React lets us describe the UI as **components** ("a Task card looks
like this") and automatically re-draws them when data changes, instead of us
manually poking the page. Less bug-prone.

**Why Vite?**
The browser understands plain HTML/CSS/JS, but we write modern JSX/modules. Vite
is the **build tool** that converts our code into what the browser runs, and gives
a fast dev server with instant reload.

**Why Ollama + a local LLM (gemma3:4b)?**
We need AI that **understands language** to extract fields — but the data is
sensitive government mail and the machine is **air-gapped (no internet)**. So we
can't use ChatGPT (cloud). Ollama runs an open model *locally*, on the office GPU.
Privacy + offline + no API bills.

**Why Docling + EasyOCR?**
Most documents are **scans/photos** = images. Without OCR, the text is invisible to
the computer. OCR turns pixels into characters so the LLM can read them.

**Why Qdrant + embeddings?**
Keyword search misses synonyms and meaning. Embeddings capture meaning as numbers;
Qdrant finds the nearest ones fast. This powers semantic search and grounded
"Ask" answers (RAG) so the AI cites real documents instead of hallucinating.

**Why Whisper?**
Officers want to *speak* a note ("remind me to reply to the audit letter by
Friday"). Whisper converts speech → text locally so it can be processed like any
document.

**Why the GPU (and CUDA)?**
AI math is huge matrix multiplication. A **GPU** does thousands of these in
parallel, turning a 90-second CPU job into a few seconds. **CUDA** is NVIDIA's
toolkit that lets our libraries use the GPU. We pin CUDA 12.8 wheels so the exact
right GPU libraries ship in the offline bundle.

**Why the "human confirms" step?**
Because **AI is not perfect**. Auto-adding wrong meetings to an officer's calendar
is worse than useless. So AI does the tedious reading; the human gives a one-click
yes. Trust + safety.

**Why Keycloak (v2)?**
Writing secure login yourself (password hashing, sessions, token signing, "forgot
password") is hard and dangerous to get wrong. Keycloak is a battle-tested server
that does it properly, so we don't reinvent security.

**Why "offline / air-gapped" shapes *everything*?**
The target PC has **no internet**. So we can't `pip install`, `npm install`, or
`ollama pull` on it. Every dependency and AI model must be **downloaded elsewhere
and physically carried over**. That's why there's a whole `offline/` bundle and a
strict "no new dependencies without re-checking the bundle" discipline.

---

# PART 3 — Every concept explained (plain-English glossary)

**HTTP** — the rules computers use to talk over the web. A **request** goes from
browser to server; a **response** comes back. Methods: **GET** (read), **POST**
(create), **PATCH** (update), **DELETE** (remove).

**Endpoint / Route** — a specific URL the backend answers, e.g. `GET /tasks`. In
code, a Python function tied to that URL with `@router.get(...)`.

**API** — Application Programming Interface — the set of endpoints the backend
exposes for the frontend to call. The "menu" of things you can ask for.

**JSON** — a simple text format for structured data:
`{"title": "Meeting", "date": "2026-07-09"}`. How frontend and backend exchange data.

**Frontend / Backend** — the part in the browser (UI) vs. the part on the server
(logic + data).

**Database / SQL** — the permanent data store. **SQL** is the query language:
`SELECT` (read), `INSERT` (add), `UPDATE` (change), `DELETE` (remove).

**Row / Table / Column** — a table is a spreadsheet; each **row** is one record
(one task), each **column** is a field (title, due_date).

**Schema** — the *shape* of the database: which tables and columns exist. Ours is
built idempotently in `db_init.py` (idempotent = running it twice is safe).

**Transaction** — a group of changes that all succeed or all fail together
(`commit` to save, `rollback` to undo). Prevents half-finished states.

**Foreign key** — a column pointing to another table's row, e.g. a task's
`users_id` points at a `users` row. Models relationships.

**psycopg2** — the Python **library** ("driver") that lets Python talk to
PostgreSQL. `RealDictCursor` makes query results come back as dictionaries
(`row["title"]`) instead of positional tuples.

**Library / Package / Dependency** — pre-written code we reuse instead of writing
ourselves. Python ones are installed by **pip**; JavaScript ones by **npm** and
live in `node_modules/`.

**Framework** — a big library that gives your app its overall structure (FastAPI
for backend, React for frontend).

**FastAPI** — our backend framework. Key ideas:
- **Router** — groups related endpoints (`tasks.py` has all task routes).
- **Decorator** (`@router.get`) — attaches a URL+method to a function.
- **Pydantic model** — a class describing the expected shape of input (see
  `models.py`); FastAPI auto-rejects bad input with a clear error.
- **Dependency injection** (`Depends(...)`) — "before running this route, run this
  helper and give me its result." We use `Depends(current_user)` so every route
  automatically gets the logged-in user without repeating code. This is a
  professional pattern for sharing logic (auth, db) cleanly.

**Async / await** — network and disk operations are slow. `async` functions can
`await` a slow operation and let the program do other work meanwhile, instead of
freezing. (Concurrency without complexity.)

**React** — frontend library. Key ideas:
- **Component** — a reusable piece of UI written as a function returning **JSX**
  (HTML-like syntax inside JavaScript).
- **State** (`useState`) — data that, when changed, causes the component to
  re-draw. E.g. the list of documents.
- **Effect** (`useEffect`) — code that runs at certain times, e.g. "fetch data when
  the page loads" or "poll every 5 seconds."
- **Props** — inputs passed into a component (like function arguments).

**Vite** — the frontend build tool + dev server. **Proxy**: in development, Vite
forwards `/api/...` calls to the backend on port 9000 so the browser thinks it's
all one server (avoids cross-origin issues).

**LLM (Large Language Model)** — an AI that understands/generates text. Ours is
**gemma3:4b** ("4b" = 4 billion parameters — its "size/brainpower"), run locally by
**Ollama**.

**Prompt** — the instructions we send the LLM. Good prompting (clear rules + an
example) is *how you program an LLM*. **Temperature 0** = make it deterministic
(same input → same output), which we want for data extraction.

**Token** — LLMs read/write in chunks called tokens (~¾ of a word). `num_predict`
caps how many it generates (our JSON is small, so we cap it for speed).

**OCR (Optical Character Recognition)** — converting an image of text into actual
text. Done by **Docling + EasyOCR**.

**Embedding / Vector** — a list of numbers representing a text's *meaning*. Similar
meanings → nearby vectors. The basis of semantic search.

**Vector database (Qdrant)** — stores vectors and finds the nearest ones quickly
(**cosine similarity** = the closeness measure). Runs **embedded** (inside our
process, no separate server).

**RAG (Retrieval-Augmented Generation)** — answer a question by first *retrieving*
relevant real text, then asking the LLM to answer *using only that*. Stops
hallucination, enables citations.

**Whisper / faster-whisper** — speech-to-text AI. "faster-whisper" is an optimized
implementation (via an engine called **CTranslate2**).

**GPU / CUDA** — the graphics chip that does AI math in parallel; CUDA is NVIDIA's
software toolkit to use it. **Wheel** = a pre-built Python package file (`.whl`);
we ship CUDA-enabled wheels so the GPU works offline.

**Hash (SHA-256)** — a fixed-length fingerprint of data. Same file → same hash, so
we detect duplicate uploads by comparing hashes.

**Authentication vs Authorization** — *authentication* = who are you (login);
*authorization* = what are you allowed to do (e.g. admin-only pages).

**JWT (JSON Web Token)** — a signed token proving your identity, sent with each
request. The backend verifies the **signature** (not a password) on every call.
**OIDC** — the standard protocol Keycloak uses to issue these. **JWKS** — the set
of public keys the backend uses to check the signature.

**Keycloak** — a ready-made identity/login server (a separate Java program).

**Environment variables / `.env`** — settings kept outside the code (DB password,
toggles) so the same code runs in different places. Read via `os.getenv(...)`.

**Soft delete** — marking a row as deleted (a `deleted_at` timestamp) instead of
truly removing it, so it can be restored.

**Polling** — repeatedly asking the server "any updates?" on a timer (used for
processing status and due reminders). Simple alternative to push notifications.

**CORS** — a browser security rule about which sites may call an API; the backend
explicitly allows the frontend's origin.

---

# PART 4 — The small details that matter

These are the "minute details" — small patterns that appear all over the code.
Each one is grounded in a real file so you can go look. Once you *see* these, you
start noticing them everywhere.

## A. Frontend details

**A1. Prop drilling (a.k.a. "data drilling").**
React passes data **down** from a parent component to a child through **props**
(inputs). When a value has to travel through several layers to reach where it's
used, that's *prop drilling*. Real example in this app: the logged-in `user` is
created in `App.jsx`, passed to `<AppShell user={user}>`, which passes it again to
`<UserMenu user={user}>` where it's finally shown. The data is "drilled" down two
levels.
```
App.jsx ──user──▶ AppShell ──user──▶ UserMenu  (shows name + Sign out)
```
It's fine for one or two levels. It becomes painful when a value must pass through
many components that don't even use it (they just forward it). The cure is Context↓.

**A2. React Context (the cure for deep prop drilling).**
Context lets a value be put in one place and read **directly** by any component
deep in the tree — no drilling. This app uses it for toast pop-ups
(`components/ToastProvider.jsx`): `ToastProvider` wraps the whole app and provides
`success/error/info` functions; any component calls `useToast()` to grab them
**without** them being passed as props:
```js
const toast = useToast();      // reach into Context directly, no drilling
toast.success("Added to your calendar.");
```
Rule of thumb: drill for shallow/local data; use Context for app-wide things
(current user, theme, toasts).

**A3. Why every list item needs a `key`.**
Whenever you render a list with `.map(...)`, each item needs a unique `key`:
```jsx
{documents.map((doc) => <div key={doc.id}> … </div>)}
```
React uses `key` to track *which* item is which between re-renders, so when the
list changes it can update just the changed row instead of redrawing everything.
Without stable keys you get subtle bugs (wrong row updates, lost input focus).
Use a stable id (`doc.id`), **not** the array index when the list can reorder.

**A4. State is immutable — never edit it in place.**
In React you must **replace** state, not mutate it. Look at the upload queue
(`UploadPage.jsx`):
```js
setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: "done" } : item));
```
This builds a **new** array (`.map`) with a **new** object (`{ ...item, status }`)
for the one that changed. We never do `q[i].status = "done"`. Why? React detects
"did this change?" by checking if the *reference* (the object identity) is new. If
you mutate in place, the reference is the same and React may not re-render. The
`{ ...item }` is the **spread operator** = "copy all fields, then override some."

**A5. Functional `setState` (the `prev =>` form).**
Notice `setQueue((q) => …)` takes a *function* of the previous value, instead of
`setQueue(newValue)`. Use this whenever the new value depends on the old one. It
guarantees you're updating the *latest* state even if several updates happen
quickly (avoids "stale state" bugs). Same reason `setDetails((d) => ({ ...d, … }))`
is used when caching extraction previews.

**A6. Conditional rendering.**
UI that appears only sometimes is written with plain JavaScript inside JSX:
```jsx
{pending.length > 0 && <ReadyToAddSection />}      // show only if there's data
{loading ? <LoadingScreen /> : <App />}            // either/or
```
`cond && <X/>` means "render X only if cond is true." This is how the Processing
section, the user menu, error banners, etc. show/hide.

**A7. `useEffect` + cleanup (the polling timer).**
`useEffect` runs side-effects (things outside drawing) at the right time. The
reminder/processing pollers start a timer and **must clean it up**, or you'd stack
up dozens of timers:
```js
useEffect(() => {
  if (inProgress.length === 0) return;
  const id = setInterval(loadData, 4000);   // start polling
  return () => clearInterval(id);           // ← cleanup: stop when it changes/unmounts
}, [inProgress.length]);                     // ← dependency array: when to re-run
```
The returned function is the **cleanup**; the array `[inProgress.length]` is the
**dependency list** — the effect re-runs only when those values change.

**A8. The three states every screen needs: loading, empty, error.**
A robust screen handles all three, not just the happy path: while data is fetching
(show a spinner/skeleton), when there's no data (show "nothing here yet"), and when
the call fails (show an error/toast). You'll see these throughout — e.g. the
Processing section, empty-list checks (`documents.length > 0`), and `.catch(...)`
toasts. New devs only build the "data exists" case and the UI looks broken in the
other two.

**A9. `ErrorBoundary` — one crash shouldn't kill the app.**
Each page in `App.jsx` is wrapped in `<ErrorBoundary>`. If a page component throws
while rendering, the boundary catches it and shows a fallback **instead of a blank
white screen for the whole app**. It's a safety net so a bug on the Notes page
doesn't take down the Calendar too.

**A10. One `api.js` wrapper = Don't Repeat Yourself (DRY).**
Every backend call goes through the single `req()` function in
`services/api.js`. That's deliberate: error handling, JSON parsing, and the auth
`Bearer` token are written **once** there, not copy-pasted into 50 components. When
v2 added auth, we only had to inject the token in *one* place
(`setTokenProvider`) and every call got it for free. Centralizing the "edge" of
your app is a hallmark of maintainable code.

## B. Backend details

**B1. SQL placeholders, not string-gluing (security).**
We always pass values separately:
```python
cur.execute("SELECT * FROM tasks WHERE users_id = %s", [user["id"]])   # ✅ safe
```
Never `f"... WHERE users_id = {user_id}"`. If a value contained SQL (e.g. a
malicious filename), gluing it in would let an attacker run their own commands —
**SQL injection**. The `%s` lets the database driver escape values safely. This is
non-negotiable.

**B2. Open → use → always close (try/finally).**
Every route opens a DB connection and closes it in a `finally` block:
```python
conn = get_db(); cur = conn.cursor()
try:
    ...
finally:
    cur.close(); conn.close()
```
`finally` runs *even if an error is thrown*, so connections never leak. A database
has a limited number of connections; leaking them eventually freezes the app.

**B3. Transactions: all-or-nothing (commit / rollback).**
When a route makes several changes that must succeed together (e.g. insert an
event **and** its reminders **and** an audit log row), they're one **transaction**:
```python
try:
    cur.execute(...); cur.execute(...)   # several changes
    conn.commit()                        # save them together
except Exception:
    conn.rollback()                      # undo everything on any failure
    raise
```
This prevents half-finished states (an event with no audit trail). The
`confirm-all` endpoint relies on this: if inserting item #3 fails, items #1–2 are
rolled back too.

**B4. Idempotent schema (safe to run every startup).**
`db_init.py` runs on every boot, but uses `CREATE TABLE IF NOT EXISTS` and
`ALTER TABLE … ADD COLUMN IF NOT EXISTS`. "Idempotent" = running it once or a
hundred times gives the same result. That's how the app self-migrates (e.g. v2
adding `users.keycloak_sub`) without a separate migration tool, and without
crashing if the column already exists.

**B5. Lazy imports (import *inside* a function).**
Heavy AI libraries are imported *inside* functions, not at the top of the file:
```python
def _get_converter():
    from docling.document_converter import DocumentConverter   # only now
```
Two reasons: (1) **startup speed** — the API boots instantly instead of loading
gigabytes of ML libraries it may not need yet; (2) **graceful degradation
(NFR-9)** — if Docling isn't installed, the rest of the app still runs; only the
OCR feature is unavailable. The cost of the import is paid once, on first use.

**B6. Load-once singletons + keeping models "warm".**
Expensive things are created **once** and reused via a module-level variable:
`parser.py`'s converter cache, `transcribe.py`'s `_model`, `vectorstore.py`'s
`_client`, `llm.py`'s resolved model id, `auth.py`'s `_jwks_client`. The first call
pays the load cost; every call after is instant. Related: the **LLM server (vLLM)**
keeps the model resident in GPU memory itself, so requests don't pay a "cold start"
— our client just sends HTTP. (The local **Whisper** model is the one *we* keep warm
via the singleton above.)

**B7. Background tasks (return fast, work later).**
Upload returns immediately and does OCR+LLM **after** responding, via FastAPI's
`BackgroundTasks`. Without this, the user's browser would hang ~60 seconds waiting.
The pattern: accept the work, hand back a "job is queued" response, do the slow
part in the background, and let the frontend **poll** for the result (A7).

**B8. Startup hook (lifespan).**
`main.py` defines a `lifespan` function that runs once when the server starts:
create the DB/tables, run an auto-backup if one is due. It's the backend's
"on power-on" routine.

**B9. Dependency injection beats copy-paste.**
`Depends(current_user)` runs the auth check *before* a route and hands it the user.
Every protected route writes `user = Depends(current_user)` instead of repeating
20 lines of token parsing. Change the auth logic once, and all routes get it. (Same
idea as A10, but on the backend.)

**B10. Graceful degradation everywhere (NFR-9).**
Notice how AI calls are wrapped so failure returns *empty*, not a crash:
`search()` returns `[]` if Qdrant is down; `embed_available()` is checked before
"Ask"; the whole app runs with `AUTH_ENABLED=false` if Keycloak is absent. The
philosophy: **a missing optional service degrades a feature, it never takes down
the app.** Critical for an offline box where a service might not be running.

## C. AI / data details

**C1. Text chunking + overlap (why we split documents).**
Before embedding, long text is cut into ~900-character **chunks** with ~120-char
**overlap** (`vectorstore.py` `_chunks`). Why chunk? Embeddings represent a *bounded*
amount of text well; one vector for a 10-page doc would be a blurry average. Small
chunks give precise matches ("the paragraph about drainage"). Why overlap? So a
sentence that straddles a boundary isn't split in a way that loses its meaning —
the overlap keeps context continuous across chunks.

**C2. Embedding dimension must match (model swaps).**
Each embedding model outputs a vector of a fixed length (its **dimension** — bge-m3
is 1024). The vector store is created for that exact size. If you switch embedding
models, the dimension changes, so `vectorstore.py` detects the mismatch and
**rebuilds** the collection. That's why the docs say "rebuild the index after
changing EMBED_MODEL."

**C3. Determinism on purpose (temperature).**
For **extraction** we set `temperature: 0` — we want the *same* fields every time,
no creativity. For **answering** questions (RAG) we use a small `0.2` — a little
fluency is fine. Temperature is the "creativity/randomness" dial; choosing it per
task is a real engineering decision.

**C4. Caching with a TTL + invalidation.**
`ask.py` keeps an in-memory cache of recent answers for 600 seconds (**TTL** =
time-to-live) so repeating a question is instant. Two subtleties this code gets
right: the cache key is **per-user** (`f"{user_id}:{question}"`) so answers never
leak between users, and the cache is **cleared on reindex** (because the underlying
documents changed). "There are only two hard problems in CS: naming things, cache
invalidation, and off-by-one errors." Caching is easy; knowing *when to throw it
away* is the hard part.

**C5. Deduplication by hash.**
Uploads are fingerprinted with SHA-256 and checked before saving, so the same file
isn't processed twice. v2 made the hash unique **per user** (so two users *can*
upload the same letter). A tiny detail with real correctness impact.

**C6. Limits / pagination.**
Queries use `LIMIT` and searches use `top_k` so we never accidentally load 10,000
rows into memory or the UI. Always bound the size of what you fetch.

## D. Cross-cutting details

**D1. HTTP status codes (what the numbers mean).**
The backend doesn't just return data — it returns a **status code** that tells the
frontend *what happened*. This app uses:

| Code | Meaning | Where it shows up here |
|------|---------|------------------------|
| 200 | OK | normal successful GET/POST |
| 400 | Bad request | wrong file type, batch too large |
| 401 | Unauthorized | no/invalid login token (auth on) |
| 403 | Forbidden | logged in but not admin (System/Audit) |
| 404 | Not found | item missing or not yours |
| 409 | Conflict | duplicate upload |
| 410 | Gone | file record exists but the file is off disk |
| 422 | Unprocessable | input fails Pydantic validation |
| 500 | Server error | an unhandled exception |
| 503 | Service unavailable | AI/Ollama offline |

**D2. The 422 you actually hit (validation).**
Remember the dismiss bug? The frontend sent only `{job_id}` but the `DismissItem`
model **required** `item_index`, so FastAPI rejected it with **422** before our
code even ran. That's **Pydantic validation** doing its job — it guarantees a
route never runs with malformed input. The fix was a new endpoint whose model only
needs `job_id`. Lesson: a 422 means "your input shape is wrong," not "the server
broke."

**D3. Config & secrets live in `.env`, not in code (12-factor).**
Passwords, hostnames, and toggles are read from environment variables
(`os.getenv`), never hard-coded. The same code then runs on your laptop and the
office server just by changing `.env`. Secrets stay out of git (it's
`.gitignore`d). This is part of the "12-factor app" methodology.

**D4. PKCE + token refresh (the safe login dance).**
When auth is on, the browser logs in with **PKCE** (a method that lets a
public app — one that can't keep a secret — log in securely without a client
secret). The access token is short-lived; `auth/auth.js` calls `updateToken(30)`
before each request to silently **refresh** it if it's about to expire, so you're
not logged out mid-session. You don't need the cryptographic details — just know
"short-lived tokens, auto-refreshed = secure *and* convenient."

**D5. Polling vs WebSockets (two ways to get live updates).**
For "is it done yet?" this app mostly **polls** (asks every few seconds — simple,
robust). There's also a **WebSocket** endpoint scaffolded in `main.py`
(`/ws/processing-status`) — a WebSocket is a *persistent two-way pipe* where the
server can **push** updates instantly without being asked. Polling is simpler and
fine here; WebSockets shine when you need real-time, high-frequency updates.

## E. Database concepts (how the "memory" is organised)

**E1. Primary keys & `SERIAL` (every row gets a unique id).**
Every table starts with `id SERIAL PRIMARY KEY`. **Primary key** = the column that
*uniquely* identifies a row; no two rows share an id. **`SERIAL`** = "auto-increment"
— the database hands out 1, 2, 3, … automatically, so you never pick ids yourself.
That id is how everything else refers to this row.

**E2. Relationships & foreign keys (how tables connect).**
Real data is connected: an event *has* reminders; a note *has* versions. We model
this with a **foreign key** — a column in the child table that stores the parent's
id. Example (`db_init.py`):
```sql
CREATE TABLE reminders (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ...
);
```
- `REFERENCES events(id)` = "`event_id` must be a real event's id" (the DB refuses
  orphan reminders). This is a **one-to-many** relationship: one event → many
  reminders.
- `ON DELETE CASCADE` = "if the event is deleted, delete its reminders too,"
  automatically. (Used for reminders, note_versions, processing_queue.)
This is the heart of a **relational database**: data split into related tables
instead of one giant blob. Splitting like this is called **normalization** — each
fact lives in exactly one place, so it can't get out of sync.

**E3. Indexes (why queries are fast).** *(This one is a big deal.)*
An **index** is like the index at the back of a book. Without it, to find every
"event owned by user 5," the database must scan *every* row (slow as data grows).
With an index on `users_id`, it jumps straight to the matching rows. We create many
(`db_init.py`): `idx_documents_owner`, `idx_events_owner_date`, `idx_tasks_status`…
```sql
CREATE INDEX idx_events_owner_date ON events(users_id, event_date);
```
The trade-off: indexes make **reads** fast but **writes** slightly slower (the
index must be updated too) and use disk space. So you index the columns you
*filter/sort by often* (owner, status, date), not every column. Choosing indexes is
a core performance skill.

**E4. Constraints (the database refuses bad data).**
The schema enforces rules so invalid data can't even be saved — defense at the
deepest layer:
```sql
status TEXT NOT NULL DEFAULT 'queued'
  CHECK (status IN ('queued','processing','ready_to_confirm','done','failed','trashed'))
```
- **`NOT NULL`** = this column must have a value.
- **`CHECK (... IN ...)`** = status can only be one of these exact words; a typo
  like `'procesing'` is rejected.
- **`UNIQUE`** = no duplicates (e.g. a username, or `(users_id, file_hash)` so the
  same user can't upload the same file twice).
Even if a bug in the code tried to write garbage, the database is the last line of
defense. Don't rely only on frontend validation.

**E5. `JSONB` (flexible data inside a relational table).**
Most columns are simple (text, date). But the per-field confidence is a small
*object* of varying keys, so we store it in a **`JSONB`** column — PostgreSQL's
binary JSON type:
```sql
field_confidence JSONB
```
This lets us keep structured-but-flexible data without inventing a whole new table.
In `pipeline.py` we insert it with `%s::jsonb` (cast the JSON string to JSONB).
Use JSONB for genuinely variable shapes; use real columns for things you filter on.

**E6. `NULL` means "unknown / absent" (and that's intentional).**
If the AI can't find a venue, that field is `NULL`, not `""` or a guess. `NULL` is
the database's way of saying "no value." It's central to the app's "never invent
data" rule — a missing field stays *honestly empty* so a human notices. Note SQL
treats `NULL` specially (`= NULL` doesn't work; you use `IS NULL`), which is why
you see `WHERE deleted_at IS NULL` everywhere (= "not trashed").

**E7. Status columns are tiny state machines.**
A document's `status` moves through a fixed set of stages:
`queued → processing → ready_to_confirm → done` (or `failed`, or `trashed`). This is
a **state machine**: a thing that's always in exactly one known state and can only
move along allowed transitions. The `CHECK` constraint (E4) enforces the *allowed
states*; the code enforces the *transitions*. Modelling workflows as explicit
states (instead of scattered booleans like `is_done`, `is_failed`) keeps logic
clean and bug-resistant.

## F. How it actually runs (the runtime)

**F1. uvicorn & ASGI (the thing that hosts FastAPI).**
FastAPI is just your code; something has to **listen on a network port** and feed it
requests. That's **uvicorn** — the server you launch with
`uvicorn api.main:app --port 9000`. Uvicorn speaks **ASGI** (Asynchronous Server
Gateway Interface) — the standard "socket" between a Python web server and an async
app. Mental model: *uvicorn is the receptionist taking calls; FastAPI is the staff
answering them.*

**F2. The async event loop (one waiter, many tables).**
A web server spends most of its time *waiting* (for the database, for Ollama). The
**event loop** is a single thread that, whenever one request is waiting, goes and
makes progress on another — like one skilled waiter juggling many tables instead of
one waiter frozen per table. That's why `async def` + `await` matters: it lets the
server handle many requests concurrently without a thread per request. (It's great
for **I/O-bound** work like ours; not for heavy CPU math — which is why the AI runs
as separate services / background tasks.)

**F3. Middleware (code that wraps every request).**
**Middleware** runs *around* every request — before it reaches your route and after
it leaves. `main.py` adds **CORS middleware**:
```python
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)
```
**CORS** (Cross-Origin Resource Sharing) is a browser security rule: a page served
from one origin can't call an API on another origin unless the API *says it's
allowed*. The middleware adds the headers that grant that permission, so the
frontend (port 5173) may call the backend (port 9000). Middleware is the right place
for cross-cutting concerns (auth, logging, CORS) that apply to *all* routes.

**F4. OpenAPI / Swagger (`/docs` for free).**
Because routes declare their inputs (Pydantic models) and outputs, FastAPI
auto-generates a live, interactive API catalogue at `http://localhost:9000/docs`.
You can read every endpoint and *try it in the browser*. This is **OpenAPI** (the
spec) rendered by **Swagger UI**. Hugely useful for learning the backend — go click
around it.

**F5. Logging (why not `print`).**
The code uses Python's `logging` module (`log = logging.getLogger(__name__)`), not
`print`. Logging has **levels** (`debug/info/warning/error`), shows *where* a
message came from, and can be turned up/down or sent to a file — essential on a
server you can't watch live. `print` is for quick throwaway scripts; `logging` is
for real software.

## G. Deeper frontend (how React really updates the screen)

**G1. The render cycle, Virtual DOM & reconciliation.**
When state changes (`setX(...)`), React **re-runs your component function** to get a
fresh description of the UI. It doesn't rebuild the real page (slow). Instead it
builds a lightweight in-memory copy called the **Virtual DOM**, compares it to the
previous one (**diffing / reconciliation**), and updates **only** the parts of the
real page that actually changed. That's why React feels fast and why `key` (A3) and
immutable state (A4) matter — they make the diff accurate.

**G2. JSX is not HTML (it's JavaScript in disguise).**
`<div className="x">{name}</div>` *looks* like HTML but compiles to JavaScript
function calls that create UI objects. Consequences you'll notice: it's
`className` not `class`, attributes are camelCase (`onClick`), and `{ }` drops you
back into JavaScript to embed values/expressions. JSX is just a nicer way to write
"create this UI."

**G3. ES Modules + bundling + hot reload.**
Each file uses `import`/`export` (**ES Modules**) to share code. The browser could
load hundreds of tiny files, but that's slow — so **Vite** (using Rollup under the
hood) **bundles** them into a few optimized files for production. In development it
serves them fast and does **HMR** (Hot Module Replacement) — when you save a file,
just that piece updates in the browser **without a full reload**, keeping your app
state. (That's why, when the UI seemed stale earlier, a hard refresh fixed it — HMR
occasionally needs a reset.)

**G4. Controlled inputs (React owns the form).**
The standard React form pattern (used by the app's text boxes and pickers) is the
**controlled component**: the input's value comes *from* state, and typing calls
`onChange` to update that state:
```jsx
<input value={title} onChange={e => setTitle(e.target.value)} />
```
React state is the **single source of truth** — the input can't drift out of sync,
and you can validate/transform as the user types. (The file `<input type=file>` is
the exception — it's *uncontrolled*, we just read its files on change.)

**G5. FormData & multipart upload (sending files).**
You can't send a file as JSON. Uploads use **`FormData`**, which the browser
encodes as `multipart/form-data` (`services/api.js`):
```js
const fd = new FormData(); fd.append("file", file);
return req("POST", "/upload", fd);
```
Subtlety in the code: when the body is `FormData`, we **don't** set a
`Content-Type` header manually — the browser must set it itself (with the special
`boundary` marker). That's why `req()` checks `body instanceof FormData`.

**G6. Promises (what `async/await` is really doing).**
A **Promise** is an object representing a value that *will arrive later* (the result
of a network call). You can handle it with `.then(result => …).catch(err => …)`, or
more readably with `await` (which pauses until the Promise resolves). They're the
same thing — `await` is just sugar over Promises. You'll see both styles:
`getDocuments().then(setDocuments).catch(...)` and `const res = await uploadFile(f)`.

**G7. `import.meta.env` (build-time settings).**
The frontend reads settings like `import.meta.env.VITE_API_BASE`. Vite injects these
at **build time** from `.env` files. Only variables prefixed `VITE_` are exposed to
the browser (so you can't accidentally leak server secrets into the shipped JS).

## H. Deeper AI (what's happening inside the models)

**H1. Parameters & quantization ("4b").**
`gemma3:4b` has ~**4 billion parameters** — the tunable numbers that encode what the
model "knows"; more parameters ≈ more capability but more memory/compute. To fit a
model on a normal GPU, Ollama typically serves a **quantized** version — the
parameters are stored at lower precision (e.g. 4-bit instead of 16-bit), which
shrinks it ~4× with minor quality loss. That's how a capable model runs on local
office hardware.

**H2. Tokens & the context window.**
Models don't read characters or words — they read **tokens** (word-pieces, ~¾ of a
word each). A model can only consider so many tokens at once — its **context
window**. That's why `extractor.py` truncates input with `text[:12000]` — to stay
within budget and keep it fast. Output is also measured in tokens, which is why we
cap generation with `num_predict` (our JSON answer is small).

**H3. Prompt engineering (programming a model with words).**
We don't "train" the model here — we *instruct* it precisely. The extractor prompt
uses three techniques: a clear **system instruction** ("return STRICT JSON with
these keys… NEVER invent a date"), a **few-shot example** (one worked
input→output pair so it copies the format), and **JSON mode**
(`"format": "json"` tells Ollama to constrain output to valid JSON). Good prompting
is the difference between reliable extraction and garbage.

**H4. Decoding: how the model picks its words (greedy vs beam; VAD).**
A model outputs *probabilities* for the next token; **decoding** is how we choose.
**Greedy** = always take the most likely token (fast, deterministic). Whisper here
uses `beam_size=1` (greedy) for speed. **Beam search** keeps several candidate
sequences and picks the best overall (slower, sometimes better). Whisper also uses
**VAD** (Voice Activity Detection) to skip silence — faster and cleaner
transcripts.

**H5. Cosine similarity (the intuition behind search).**
Think of each embedding as an **arrow** in space. Two texts with similar meaning
point in nearly the **same direction**. **Cosine similarity** measures the *angle*
between two arrows: ~1.0 = same direction (very similar), ~0 = perpendicular
(unrelated). Qdrant ranks results by this. It compares *direction*, not length, so
it focuses on meaning rather than text size.

## I. Deeper security (how login is actually trusted)

**I1. Anatomy of a JWT.**
The token Keycloak issues is three base64 pieces joined by dots:
`header.payload.signature`. The **header** says the algorithm (RS256), the
**payload** holds claims (who you are: `sub`, `preferred_username`, roles, expiry),
and the **signature** proves it wasn't tampered with. The payload is *readable* (not
secret) — security comes from the signature, not from hiding the contents.

**I2. Asymmetric crypto / RS256 (sign with private, verify with public).**
Keycloak has a **private key** (kept secret) and a matching **public key** (shared
openly). It **signs** the token with the private key. Our backend fetches the public
key (from Keycloak's **JWKS** URL) and uses it only to **verify** the signature
(`auth.py`, via `PyJWT`). The magic of asymmetric cryptography: the public key can
*check* a signature but can't *create* one. So our backend can trust tokens
**without ever holding a secret** — even if our backend code leaked, no one could
forge logins. This is why JWT auth is **stateless**: the backend doesn't store
sessions; it just verifies the signature on every request.

**I3. Why verify a token instead of checking a password every time.**
Sending your password on every request would be dangerous and slow. Instead you log
in *once*, get a short-lived signed token, and every later request just carries that
token in the `Authorization: Bearer …` header. The server cryptographically
verifies it in microseconds, no database lookup. Short life + refresh (D4) keeps it
secure if a token is ever stolen.

---

# PART 5 — The folder structure (every submodule)

The repo has two apps that run together: `backend/` (Python) and `front-end/`
(React), plus an `offline/` bundle and a `keycloak/` config folder.

```
AI-Notes-and-Scheduling/
├── backend/                 ← the Python server (FastAPI)
│   └── api/
│       ├── main.py          ← app entry point: starts FastAPI, registers all routers
│       ├── config.py        ← all settings (DB, LLM/embeddings/Docling/Qdrant URLs, Whisper, auth) from .env
│       ├── db.py            ← get_db(): opens one PostgreSQL connection
│       ├── db_init.py       ← creates the DB + all tables on startup (idempotent schema)
│       ├── models.py        ← Pydantic input shapes (ManualEvent, ConfirmItem, …)
│       ├── auth.py          ← v2: verify Keycloak JWTs, current_user dependency
│       ├── ai/              ← everything that talks to an AI model
│       │   ├── llm.py            ← OpenAI-compatible LLM client (vLLM/Ollama via LLM_BASE_URL)
│       │   ├── extractor.py      ← prompt → structured fields + confidence (calls llm.py)
│       │   ├── parser.py         ← Docling (remote DOCLING_URL or in-process) → Markdown; OCR gated
│       │   ├── pipeline.py       ← orchestrates parse → extract → store (the assembly line)
│       │   ├── embeddings.py     ← text → vector (OpenAI /v1/embeddings via EMBED_BASE_URL)
│       │   ├── vectorstore.py    ← Qdrant (server OR embedded): store/search vectors
│       │   └── transcribe.py     ← Whisper: audio → text, LOCAL on the app PC GPU
│       └── routes/          ← one file per feature; each defines its endpoints
│           ├── documents.py     ← upload, list, download, re-extract, delete docs
│           ├── confirmations.py ← review/confirm/dismiss extractions → make events/tasks
│           ├── events.py        ← calendar CRUD + recurrence expansion
│           ├── tasks.py         ← to-do CRUD
│           ├── notes.py         ← notes (DB metadata + Markdown files + version history)
│           ├── voice.py         ← audio upload → transcribe → extract
│           ├── search.py        ← keyword search across events/docs/notes
│           ├── ask.py           ← RAG "ask your documents" + schedule Q&A + reindex
│           ├── links.py         ← FR-25 soft links (AI suggestions you accept/reject)
│           ├── reminders.py     ← compute due reminders for browser notifications
│           ├── dashboard.py     ← aggregated home-screen data
│           ├── timeline.py      ← merged chronological view of everything
│           ├── trash.py         ← soft-delete restore + purge
│           ├── queue.py         ← processing-queue status / retry / cancel
│           ├── backup.py        ← export DB+notes to JSON (admin)
│           ├── system.py        ← FR-41 status: model loaded, GPU, disk, queue (admin)
│           ├── audit.py         ← read the audit log (who did what, admin)
│           └── auth.py          ← /auth/config + /auth/me (login bootstrap)
│       └── requirements-lock.txt ← exact list of Python deps (for offline install)
│
├── front-end/               ← the React app (what the browser runs)
│   └── src/
│       ├── main.jsx         ← entry point: mounts <App> into the page
│       ├── App.jsx          ← top-level: runs auth, sets up routing (URL → page)
│       ├── auth/auth.js     ← v2: Keycloak login adapter + token refresh
│       ├── services/api.js  ← THE single place all backend calls live (one fetch wrapper)
│       ├── pages/           ← one component per screen (route target)
│       │   ├── DashboardPage.jsx   ← home: today's events, open tasks, pending
│       │   ├── UploadPage.jsx      ← upload + live Processing + one-click "Add to calendar"
│       │   ├── CalendarPage.jsx    ← calendar view of events
│       │   ├── TasksPage.jsx       ← task list
│       │   ├── NotesPage.jsx       ← notes editor + related items
│       │   ├── VoicePage.jsx       ← record/upload voice notes
│       │   ├── SearchPage.jsx      ← keyword search UI
│       │   ├── AskPage.jsx         ← ask-your-documents UI (RAG)
│       │   ├── TimelinePage.jsx    ← unified timeline
│       │   ├── TrashPage.jsx       ← trash + restore
│       │   ├── AuditLogPage.jsx    ← audit history (admin)
│       │   └── SystemStatusPage.jsx← model/GPU/disk status (admin)
│       └── components/      ← reusable UI pieces shared by pages
│           ├── AppShell.jsx        ← page frame: sidebar + main area + user menu
│           ├── Sidebar.jsx / Navbar.jsx ← navigation
│           ├── ExtractionReviewModal.jsx ← (legacy) detailed per-field review
│           ├── ReminderNotifier.jsx ← polls /reminders/due, raises notifications
│           ├── RelatedItems.jsx    ← shows soft-link suggestions
│           ├── ToastProvider.jsx   ← little pop-up success/error messages
│           ├── UserMenu.jsx        ← v2: signed-in user + Sign out
│           ├── BackendStatus.jsx   ← shows if backend/AI is reachable
│           ├── DateInput.jsx, StatCard.jsx, LoadingScreen.jsx, … ← small helpers
│           └── ErrorBoundary.jsx   ← catches a crashing page so the app survives
│
├── keycloak/                ← v2 auth server config (optional; off by default)
│   ├── udaan-realm.json     ← realm + client + roles, auto-imported on first start
│   ├── run-keycloak.ps1     ← starts Keycloak (dev mode)
│   └── dist/                ← (you add) the Keycloak server itself — git-ignored
│
├── offline/                 ← everything needed to install with NO internet
│   ├── wheels-bundle/       ← all Python packages as .whl files (~4 GB)
│   ├── models/              ← Whisper model cache only (slimmed; ~1.5 GB)
│   ├── whisper/             ← install-whisper-cache.ps1 + README (set up the cache correctly)
│   └── installers/          ← (you add) Python, PostgreSQL installers
│
├── OFFLINE-SETUP.md         ← how to deploy on the air-gapped office PC
└── LEARN-THE-APP.md         ← this file
```

### How the submodules cooperate (a worked example)
Trace an upload through the folders, and you've understood the whole app:

1. `front-end/src/pages/UploadPage.jsx` collects the file and calls `uploadFile()`
   in `front-end/src/services/api.js`.
2. That `fetch`es `POST /upload` → handled by `backend/api/routes/documents.py`.
3. `documents.py` saves the file, writes rows via `backend/api/db.py`, and triggers
   `backend/api/ai/pipeline.py` in the background.
4. `pipeline.py` calls `ai/parser.py` (OCR → text), then `ai/extractor.py`
   (LLM → fields + confidence), and stores the result; it also calls
   `ai/embeddings.py` + `ai/vectorstore.py` to make it searchable.
5. `UploadPage.jsx` polls `getDocuments()` (`/documents`) and shows the **Processing**
   section until status flips, then shows the **preview**; clicking "Add to calendar"
   calls `/confirmations/confirm-all` in `routes/confirmations.py`, which inserts the
   event/task — now visible on `CalendarPage.jsx` / `TasksPage.jsx`.

Every other feature is a variation on this same path: **page → api.js → route →
(db and/or ai modules) → back to the page.**

---

## Where to go next (how to learn it hands-on)
1. Start the app (see `OFFLINE-SETUP.md` start commands). Open `http://localhost:9000/docs`
   — FastAPI's auto-generated, clickable API. Try `GET /tasks`. Watch the JSON.
2. Open the browser's **DevTools → Network tab**, click around the UI, and watch the
   exact requests fly to the backend. This makes Part 1.1 *real*.
3. Read **one** route file end-to-end (`routes/tasks.py` is the simplest). Then its
   page (`pages/TasksPage.jsx`). You'll see both ends of the same feature.
4. Then read `ai/extractor.py` slowly — that's the cleverest file, and now you know
   exactly how its confidence score is born.

You now know, end to end, what this application is, how it thinks, and why every
piece exists. Welcome to building software. — Dad 🛠️
