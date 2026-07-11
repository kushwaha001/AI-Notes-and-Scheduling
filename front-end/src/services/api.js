// Same-origin "/api" by default (Vite/nginx proxy forwards it to the backend),
// so the app works behind a single Cloudflare tunnel URL. The offline build
// overrides this with VITE_API_BASE=http://localhost:9000 (direct, no proxy).
const BASE = import.meta.env.VITE_API_BASE || "/api";

// v2 auth: the auth layer registers a provider that returns a fresh access
// token (refreshing if needed). When auth is disabled it's never set, so no
// Authorization header is sent and the backend attributes everything to the
// default user — identical to v1.
let _tokenProvider = null;
export function setTokenProvider(fn) {
  _tokenProvider = fn;
}

async function req(method, path, body) {
  const isForm = body instanceof FormData;
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  if (_tokenProvider) {
    const token = await _tokenProvider();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const opts = {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Health ────────────────────────────────────────────────────
export const checkHealth   = () => req("GET", "/health");
export const checkServices = () => req("GET", "/services");

// ── Auth (v2) ─────────────────────────────────────────────────
export const getAuthConfig = () => req("GET", "/auth/config");
export const getMe         = () => req("GET", "/auth/me");

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboard = () => req("GET", "/dashboard");

// 'Needs attention' digest — overdue/soon/replies + an AI briefing line.
export const getAttention = () => req("GET", "/attention");

// ── Events ────────────────────────────────────────────────────
export const getTodayEvents = () =>
  req("GET", "/events/today").then((r) => r.events || []);

export const getEvents = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();
  return req("GET", `/events${qs ? `?${qs}` : ""}`).then((r) => r.events || []);
};

export const getEvent    = (id) => req("GET", `/events/${id}`);
export const createEvent = (data) => req("POST", "/events/manual", data);
export const updateEvent = (id, data) => req("PATCH", `/events/${id}`, data);
export const deleteEvent = (id, scope = "occurrence") =>
  req("DELETE", `/events/${id}?scope=${scope}`);

// ── Tasks ─────────────────────────────────────────────────────
export const getTasks = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();
  return req("GET", `/tasks${qs ? `?${qs}` : ""}`).then((r) => r.tasks || []);
};

export const getOpenTasks = () =>
  req("GET", "/tasks/open").then((r) => r.tasks || []);

export const getTask = (id) => req("GET", `/tasks/${id}`);

export const createTask = (data) => req("POST", "/tasks/manual", data);
export const updateTask = (id, data) => req("PATCH", `/tasks/${id}`, data);
export const deleteTask = (id) => req("DELETE", `/tasks/${id}`);

// ── Documents & Upload ────────────────────────────────────────
export const getDocuments = () =>
  req("GET", "/documents").then((r) => r.documents || []);

export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return req("POST", "/upload", fd);
};

export const deleteDocument = (id) => req("DELETE", `/documents/${id}`);
export const reextractDocument = (id) => req("POST", `/documents/${id}/reextract`);
// FR-24/25 — past items related to a document (ref-number + series + semantic)
export const getRelatedForDoc = (id) =>
  req("GET", `/documents/${id}/related`).then((r) => r.related || []);
// Correspondence lifecycle: open | replied | closed
export const setLetterStatus = (id, status) =>
  req("PATCH", `/documents/${id}/letter-status`, { status });
// Connections / backlinks for any item (document | note | event | task)
export const getConnections = (kind, id) =>
  req("GET", `/connections/${kind}/${id}`);
// Reply-draft assistant (local LLM) → { draft, ref_number }
export const draftReply = (id) => req("POST", `/documents/${id}/draft-reply`);
// Correspondence register (all letters with ref/status/dates)
export const getRegister = () =>
  req("GET", "/documents/register").then((r) => r.register || []);
// Natural-language quick capture → parsed single item
export const parseCapture = (text) => req("POST", "/tasks/parse", { text });
// Knowledge graph: whole-corpus nodes + labeled edges
export const getGraph = () => req("GET", "/graph");
// Item preview (summary + key fields + full body) for the click-to-peek panel
export const getPreview = (kind, id) => req("GET", `/preview/${kind}/${id}`);

// FR-27 — open the original document (returns a URL for <a>/<img>)
export const documentDownloadUrl = (id) => `${BASE}/documents/${id}/download`;

// ── Letters workspace / reply workflow ──
// "Replies due" = open letters that carry a reply-by date. Derived from the
// register (doc id + ref + reply_by all present) rather than /pending-replies,
// which returns reply TASKS in a 2-day window — a different, narrower thing.
export const getPendingReplies = () =>
  req("GET", "/documents/register").then((r) =>
    (r.register || []).filter((d) => (d.letter_status || "open") === "open" && d.reply_by));
export const registerCsvUrl    = () => `${BASE}/documents/register.csv`;

// ── Morning brief (daily digest on Today) ──
export const getDigest = () => req("GET", "/digest");

// ── Settings — runtime LLM / vLLM configuration ──
export const getLlmSettings  = () => req("GET", "/settings/llm");
export const saveLlmSettings = (data) => req("PUT", "/settings/llm", data);
export const testLlmSettings = (data) => req("POST", "/settings/llm/test", data);

// ── Voice — saved recordings (replay even if transcription failed) ──
export const listAudio        = () => req("GET", "/audio").then((r) => r.audio || []);
export const audioDownloadUrl = (id) => `${BASE}/audio/${id}/download`;


// FR-39 — backups
export const createBackup  = () => req("POST", "/backup");
export const getLastBackup = () => req("GET", "/backup/last");

// FR-41 — system status (model loaded, GPU/disk, queue depth, last backup)
export const getSystemStatus = () => req("GET", "/system/status");

// FR-37 — reminders → browser notifications
export const getDueReminders   = (windowMin = 1) =>
  req("GET", `/reminders/due?window_min=${windowMin}`).then((r) => r.due || []);
export const markReminderDelivered = (id) =>
  req("POST", `/reminders/${id}/delivered`);

// FR-25 — AI-suggested soft links
export const getLinkSuggestions = (kind, id, topK = 5) =>
  req("GET", `/links/suggestions/${kind}/${id}?top_k=${topK}`).then((r) => r.suggestions || []);
export const getAcceptedLinks = (kind, id) =>
  req("GET", `/links/${kind}/${id}`).then((r) => r.linked || []);
export const acceptLink = (pair) => req("POST", "/links/accept", pair);
export const rejectLink = (pair) => req("POST", "/links/reject", pair);

// ── Queue ─────────────────────────────────────────────────────
export const getQueue = () => req("GET", "/queue").then((r) => r.jobs || []);
export const getJob   = (id) => req("GET", `/queue/${id}`).then((r) => r.job);
export const retryJob = (id) => req("POST", `/queue/${id}/retry`);
export const cancelJob = (id) => req("DELETE", `/queue/${id}`);

// ── Confirmations ─────────────────────────────────────────────
export const getPendingConfirmations = () =>
  req("GET", "/confirmations/pending").then((r) => r.pending || []);

export const getConfirmation = (jobId) => req("GET", `/confirmations/${jobId}`);

export const confirmItem = (data) => req("POST", "/confirmations/confirm", data);
export const dismissItem = (data) => req("POST", "/confirmations/dismiss", data);
// One-click: add every extracted item from a job to the calendar/tasks at once.
export const confirmAllExtractions = (jobId) =>
  req("POST", "/confirmations/confirm-all", { job_id: jobId });
// One-click: dismiss every extraction for a job (document is kept).
export const dismissAllExtractions = (jobId) =>
  req("POST", "/confirmations/dismiss-all", { job_id: jobId });

export const processQueue = () => req("POST", "/queue/process");

// ── Search ────────────────────────────────────────────────────
export const search = (q, params = {}) =>
  req("POST", "/search", { q, top_k: 10, ...params });

// ── Ask (RAG over documents + notes) ──────────────────────────
export const ask     = (q, top_k = 5) => req("POST", "/ask", { q, top_k });
export const reindex = () => req("POST", "/ask/reindex");

// ── Voice (FR-6) ──────────────────────────────────────────────
export const uploadVoice = (file) => {
  const fd = new FormData();
  fd.append("file", file, file.name || "voice.webm");
  return req("POST", "/upload/voice", fd);
};
export const voiceExtract = (transcript) => req("POST", "/voice/extract", { transcript });

// ── Notes ─────────────────────────────────────────────────────
export const getNotes      = () => req("GET", "/notes").then((r) => r.notes || []);
export const getNote       = (id) => req("GET", `/notes/${id}`);
export const createNote    = (data) => req("POST", "/notes", data);
// Notes attached to a specific event/task (shown in the detail popups)
export const getNotesFor   = (entityType, id) =>
  req("GET", `/notes/for/${entityType}/${id}`).then((r) => r.notes || []);
export const updateNote    = (id, data) => req("PUT", `/notes/${id}`, data);
export const deleteNote    = (id) => req("DELETE", `/notes/${id}`);
export const scheduleNote  = (id) => req("POST", `/notes/${id}/schedule`);
// AI auto-summary + tags for a note (local LLM). Returns { summary, tags }.
export const summarizeNote = (id) => req("POST", `/notes/${id}/summarize`);

// FR-39 — note version history
export const getNoteVersions = (id) =>
  req("GET", `/notes/${id}/versions`).then((r) => r.versions || []);
export const getNoteVersion  = (id, version) =>
  req("GET", `/notes/${id}/versions/${version}`);

// ── Timeline (FR-34) ──────────────────────────────────────────
export const getTimeline = () =>
  req("GET", "/timeline").then((r) => r.timeline || []);

// ── Trash (FR-19) ─────────────────────────────────────────────
export const getTrash    = () => req("GET", "/trash");
export const restoreItem = (type, id) => req("POST", `/trash/${type}/${id}/restore`);
export const purgeItem   = (type, id) => req("DELETE", `/trash/${type}/${id}`);

// ── Audit ─────────────────────────────────────────────────────
export const getAuditLog = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString();
  return req("GET", `/audit-log${qs ? `?${qs}` : ""}`).then((r) => r.audit_log || []);
};
