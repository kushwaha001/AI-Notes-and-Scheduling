import { useState, useEffect } from "react";
import { getLlmSettings, saveLlmSettings, testLlmSettings } from "../services/api";
import { useToast } from "../components/ToastProvider";

// AI / LLM settings — point the app at any OpenAI-compatible server (vLLM,
// Ollama /v1, cloud) at runtime. Built for the air-gapped deployment: change
// the URL/model here, no .env edit, no restart. Saved values override .env;
// clearing a field falls back to the .env default.
const card = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
};
const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid var(--border-2)",
  fontSize: 15.5, boxSizing: "border-box", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit",
};
const labelStyle = {
  display: "block", fontSize: 13, color: "var(--muted)", margin: "16px 0 6px",
  fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px",
};

function StatusPill({ ok, text }) {
  return (
    <span style={{
      background: ok ? "var(--ok-soft)" : "var(--danger-soft)",
      color: ok ? "var(--ok)" : "var(--danger)",
      fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 99,
    }}>
      {text}
    </span>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState(null);   // null until loaded
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLlmSettings()
      .then((r) => {
        setForm({
          base_url: r.base_url || "",
          model: r.model || "",
          api_key: r.api_key || "",
          json_mode: r.json_mode !== false,
          system_prompt: r.system_prompt || "",
          vision_mode: r.vision_mode || "off",
        });
        setStatus(r.status || null);
      })
      .catch((e) => toast.error(e.message));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const r = await testLlmSettings(form);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await saveLlmSettings(form);
      toast.success(`Saved — now using ${r.applied.base_url} (${r.applied.model}).`);
      const fresh = await getLlmSettings();
      setStatus(fresh.status || null);
      setTestResult(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div style={{ color: "var(--muted)" }}>Loading settings…</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 20px" }}>
        Point the app at any OpenAI-compatible model server — a LAN vLLM, Ollama, or a cloud API.
        Changes apply immediately, no restart needed. Clearing the Server URL resets everything to the box's built-in (.env) defaults.
      </p>

      <div style={{ ...card, padding: "22px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>AI model server</h2>
          {status && (
            <StatusPill ok={status.ok}
              text={status.ok ? `connected · ${(status.models || []).length} model(s)` : "unreachable"} />
          )}
        </div>

        <label style={labelStyle}>Server URL (OpenAI-compatible /v1)</label>
        <input value={form.base_url} onChange={set("base_url")}
          placeholder="http://192.168.1.50:8000/v1" style={inputStyle} />

        <label style={labelStyle}>Model name</label>
        <input value={form.model} onChange={set("model")}
          placeholder="leave blank to auto-detect the served model" style={inputStyle} />
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>
          Blank = use whatever the server reports at /models (handy when vLLM serves a single model).
        </div>

        <label style={labelStyle}>API key</label>
        <input value={form.api_key} onChange={set("api_key")} type="password"
          placeholder="leave empty if the server needs none (typical for LAN vLLM)" style={inputStyle} />

        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.json_mode}
            onChange={(e) => setForm((f) => ({ ...f, json_mode: e.target.checked }))}
            style={{ width: 17, height: 17, cursor: "pointer" }} />
          Request strict JSON mode (response_format) — auto-retries without it if the server rejects it
        </label>

        <label style={labelStyle}>Custom system prompt <span style={{ fontWeight: 400, textTransform: "none" }}>· applies to Ask AI answers only</span></label>
        <textarea value={form.system_prompt} onChange={set("system_prompt")} rows={4}
          placeholder="Optional. e.g. 'Answer formally, in the style of official correspondence…' Document extraction keeps its own tuned prompt."
          style={{ ...inputStyle, resize: "vertical" }} />

        <label style={labelStyle}>Document reading (vision)</label>
        <select value={form.vision_mode} onChange={set("vision_mode")}
          style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="off">Off — text extraction only</option>
          <option value="auto">Auto — photos &amp; thin scans use the vision model (recommended if your model has vision)</option>
          <option value="on">On — always read pages as images</option>
        </select>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>
          Needs a vision-capable model (e.g. Qwen-VL) on your server. Enables reading handwritten notes and photographed letters.
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{
            marginTop: 16, padding: "12px 15px", borderRadius: 10, fontSize: 14,
            background: testResult.ok ? "var(--ok-soft)" : "var(--danger-soft)",
            color: testResult.ok ? "var(--ok)" : "var(--danger)",
          }}>
            {testResult.ok ? (
              <>
                ✓ Connected. Serving: <b>{(testResult.models || []).slice(0, 6).join(", ") || "(none)"}</b>
                {(testResult.models || []).length > 6 ? ` +${testResult.models.length - 6} more` : ""}
              </>
            ) : (
              <>✗ Could not connect — {testResult.error}</>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={handleTest} disabled={testing}
            style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border-2)", padding: "12px 22px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "12px 26px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
            {saving ? "Saving…" : "Save & apply"}
          </button>
        </div>
      </div>

      <div style={{ ...card, padding: "16px 22px", marginTop: 16, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.7 }}>
        <b style={{ color: "var(--text-2)" }}>Air-gap tip:</b> everything else (Whisper voice, OCR, embeddings, search)
        already runs inside this box. This model server is the only outside call — point it at your LAN vLLM
        (e.g. <code>http://&lt;host&gt;:8000/v1</code>) and the whole app is offline-complete.
      </div>
    </div>
  );
}
