// Same-origin "/api" by default (Vite/nginx proxy forwards it to the backend),
// so the app works behind a single Cloudflare tunnel URL. The offline build
// overrides this with VITE_API_BASE=http://localhost:9000 (direct, no proxy).
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function req(method, path, body) {
  const isForm = body instanceof FormData;
  const opts = {
    method,
    headers: isForm ? {} : { "Content-Type": "application/json" },
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

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboard = () => req("GET", "/dashboard");

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

// FR-27 — open the original document (returns a URL for <a>/<img>)
export const documentDownloadUrl = (id) => `${BASE}/documents/${id}/download`;

// FR-39 — backups
export const createBackup  = () => req("POST", "/backup");
export const getLastBackup = () => req("GET", "/backup/last");

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
export const updateNote    = (id, data) => req("PUT", `/notes/${id}`, data);
export const deleteNote    = (id) => req("DELETE", `/notes/${id}`);
export const scheduleNote  = (id) => req("POST", `/notes/${id}/schedule`);

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
