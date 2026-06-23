import { useState, useEffect, useCallback } from "react";
import CalendarContainer from "../components/CalendarContainer";
import EventDetailModal from "../components/EventDetailModal";
import DateInput, { fmtDate, isoToDDMmmYYYY } from "../components/DateInput";
import { motion } from "framer-motion";
import { createEvent, getEvents, deleteEvent, updateEvent } from "../services/api";

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const CATEGORIES = ["General","Meeting","Reply","Review","Personal","Restricted","Confidential"];

// ── Year view ─────────────────────────────────────────────────────────────────
function YearView({ year, events, onDayClick }) {
  const eventDates = new Set(
    events.map((e) => e.event_date ? String(e.event_date).split("T")[0] : null).filter(Boolean)
  );
  const today = new Date();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
      {Array.from({ length: 12 }, (_, mi) => {
        const firstDay = new Date(year, mi, 1);
        const lastDay  = new Date(year, mi + 1, 0);
        const startDow = firstDay.getDay();

        return (
          <div key={mi} style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "13px", color: "#1e293b" }}>
              {MONTHS[mi]}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
              {DAYS.map((d) => (
                <div key={d} style={{ fontSize: "9px", color: "#94a3b8", textAlign: "center" }}>{d}</div>
              ))}
              {Array.from({ length: startDow }, (_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: lastDay.getDate() }, (_, d) => {
                const day   = d + 1;
                const dateStr = `${year}-${String(mi + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isToday = today.getFullYear() === year && today.getMonth() === mi && today.getDate() === day;
                const hasEv   = eventDates.has(dateStr);

                return (
                  <div
                    key={day}
                    onClick={() => onDayClick(dateStr)}
                    title={hasEv ? "Has event" : ""}
                    style={{
                      fontSize: "10px",
                      textAlign: "center",
                      cursor: "pointer",
                      borderRadius: "50%",
                      width: "18px",
                      height: "18px",
                      lineHeight: "18px",
                      margin: "auto",
                      background: isToday ? "#2563eb" : hasEv ? "#bfdbfe" : "transparent",
                      color: isToday ? "white" : hasEv ? "#1d4ed8" : "#374151",
                      fontWeight: isToday || hasEv ? 700 : 400,
                    }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [activeView, setActiveView]   = useState("calendar"); // calendar | year
  const [eventCount, setEventCount]   = useState(null);
  const [allEvents, setAllEvents]     = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [selectedDayEvents, setSelectedDayEvents] = useState(null);

  const [yearNav, setYearNav] = useState(new Date().getFullYear());

  const EMPTY_FORM = {
    title: "", event_date: "", event_time: "",
    venue: "", attendees: "", classification: "General",
    recurrence: "", interval: 1, end_date: "", end_count: "",
  };
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  // FR-18 — edit/reschedule
  const [editing, setEditing] = useState(null); // event being edited

  // event detail popup
  const [detailEventId, setDetailEventId] = useState(null);

  useEffect(() => {
    getEvents().then(setAllEvents).catch(() => {});
  }, [refreshKey]);

  async function handleCreate() {
    if (!form.title || !form.event_date) { setMsg("Title and date are required."); return; }
    setSaving(true); setMsg("");
    try {
      // FR-15 — conflict warning at save
      const clash = allEvents.find(
        (e) => String(e.event_date).split("T")[0] === form.event_date
      );
      if (clash) {
        const ok = window.confirm(
          `⚠ Conflict (FR-15): "${clash.title}" is already on ${fmtDate(form.event_date)}.\nSave anyway?`
        );
        if (!ok) { setSaving(false); return; }
      }
      const payload = {
        title         : form.title,
        event_date    : isoToDDMmmYYYY(form.event_date),
        event_time    : form.event_time,
        venue         : form.venue,
        attendees     : form.attendees,
        category      : form.classification,
        classification: form.classification,
      };
      // FR-20 — recurrence
      if (form.recurrence) {
        payload.recurrence = form.recurrence;
        payload.interval   = Number(form.interval) || 1;
        if (form.end_date)  payload.end_date  = isoToDDMmmYYYY(form.end_date);
        if (form.end_count) payload.end_count = Number(form.end_count);
      }
      const res = await createEvent(payload);
      setMsg(res.occurrences > 1 ? `Saved ${res.occurrences} occurrences.` : "Event saved.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(ev) {
    setEditing({
      id        : ev.id,
      title     : ev.title || "",
      event_date: String(ev.event_date).split("T")[0],
      event_time: ev.event_time ? String(ev.event_time).slice(0, 5) : "",
      venue     : ev.venue || "",
      attendees : ev.attendees || "",
      classification: ev.classification || "General",
    });
  }

  async function handleUpdate() {
    if (!editing) return;
    try {
      await updateEvent(editing.id, {
        title         : editing.title,
        event_date    : isoToDDMmmYYYY(editing.event_date),
        event_time    : editing.event_time,
        venue         : editing.venue,
        attendees     : editing.attendees,
        category      : editing.classification,
      });
      setEditing(null);
      setRefreshKey((k) => k + 1);
      setSelectedDayEvents(null);
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Move event to trash? You can restore it later (FR-19).")) return;
    await deleteEvent(id).catch((e) => alert(e.message));
    setRefreshKey((k) => k + 1);
    setSelectedDayEvents(null);
  }

  function handleDayClick(dateStr) {
    const evs = allEvents.filter(
      (e) => String(e.event_date).split("T")[0] === dateStr
    );
    setSelectedDayEvents({ date: dateStr, events: evs });
  }

  // Clicking an event in the schedule-x calendar opens the detail popup
  function handleEventClick(calendarEvent) {
    if (calendarEvent?.id != null) setDetailEventId(Number(calendarEvent.id));
  }

  const now = new Date();

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
          Calendar Workspace
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Schedule &amp; Events</h1>
      </div>

      {/* View switcher — Month/Week/Day are handled by schedule-x's own toolbar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveView("calendar")}
          style={{
            padding: "9px 20px", borderRadius: "10px", border: "none",
            background: activeView === "calendar" ? "#2563eb" : "#f1f5f9",
            color: activeView === "calendar" ? "white" : "#475569",
            fontWeight: 600, cursor: "pointer", fontSize: "14px",
          }}
        >
          Calendar
        </button>
        <button
          onClick={() => setActiveView("year")}
          style={{
            padding: "9px 20px", borderRadius: "10px", border: "none",
            background: activeView === "year" ? "#2563eb" : "#f1f5f9",
            color: activeView === "year" ? "white" : "#475569",
            fontWeight: 600, cursor: "pointer", fontSize: "14px",
          }}
        >
          Year
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setShowForm((v) => !v); setMsg(""); }}
          style={{
            background: "#2563eb", color: "white", border: "none",
            padding: "9px 20px", borderRadius: "10px", cursor: "pointer",
            fontWeight: 600, fontSize: "14px",
          }}
        >
          + Add Event
        </button>
      </div>

      {/* Create event form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{
            background: "white", borderRadius: "18px",
            padding: "22px", marginBottom: "20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
            border: "1px solid #e2e8f0",
          }}
        >
          <h3 style={{ margin: "0 0 16px" }}>New Event (FR-7)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Title *</label>
              <input type="text" value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            <DateInput label="Date" required value={form.event_date}
              onChange={(v) => setForm((f) => ({ ...f, event_date: v }))} />
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Time</label>
              <input type="time" value={form.event_time}
                onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Venue</label>
              <input type="text" value={form.venue}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Attendees</label>
              <input type="text" value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Classification (FR-36)</label>
              <select value={form.classification}
                onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* FR-20 — recurrence */}
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "14px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", fontSize: "13px", color: "#475569", fontWeight: 600, marginBottom: "10px" }}>
              Repeat (FR-20)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
              <select value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                style={{ padding: "9px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}>
                <option value="">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              {form.recurrence && (
                <>
                  <div>
                    <input type="number" min="1" value={form.interval}
                      onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))}
                      placeholder="Every N"
                      title="Repeat every N periods"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <input type="date" value={form.end_date}
                      onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value, end_count: "" }))}
                      title="End date"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <input type="number" min="1" value={form.end_count}
                      onChange={(e) => setForm((f) => ({ ...f, end_count: e.target.value, end_date: "" }))}
                      placeholder="# times"
                      title="Number of occurrences"
                      style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }} />
                  </div>
                </>
              )}
            </div>
            {form.recurrence && (
              <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: "12px" }}>
                Set an end date <em>or</em> a number of occurrences (not both).
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={handleCreate} disabled={saving}
              style={{ background: "#10b981", color: "white", border: "none", padding: "10px 22px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
              {saving ? "Saving…" : "Save Event"}
            </button>
            <button onClick={() => { setShowForm(false); setMsg(""); }}
              style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "10px 22px", borderRadius: "10px", cursor: "pointer" }}>
              Cancel
            </button>
            {msg && <span style={{ color: msg.startsWith("Error") ? "#ef4444" : "#10b981", fontSize: "14px" }}>{msg}</span>}
          </div>
        </motion.div>
      )}

      {/* Calendar area */}
      <div style={{ display: "grid", gridTemplateColumns: selectedDayEvents ? "2fr 1fr" : "1fr", gap: "20px" }}>
        <div style={{ background: "white", borderRadius: "24px", padding: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>

          {/* Year view navigator */}
          {activeView === "year" && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              <button onClick={() => setYearNav((y) => y - 1)}
                style={{ background: "#f1f5f9", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}>
                ‹
              </button>
              <h2 style={{ margin: 0 }}>{yearNav}</h2>
              <button onClick={() => setYearNav((y) => y + 1)}
                style={{ background: "#f1f5f9", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}>
                ›
              </button>
              <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                {allEvents.filter((e) => String(e.event_date).startsWith(String(yearNav))).length} events this year
              </span>
            </div>
          )}

          {activeView === "year" ? (
            <YearView year={yearNav} events={allEvents} onDayClick={handleDayClick} />
          ) : (
            /* schedule-x renders its own Month/Week/Day toolbar inside */
            <CalendarContainer
              onEventCount={setEventCount}
              refreshKey={refreshKey}
              onEventClick={handleEventClick}
            />
          )}
        </div>

        {/* Day detail panel */}
        {selectedDayEvents && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(10px)",
              borderRadius: "24px",
              padding: "22px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>{fmtDate(selectedDayEvents.date)}</h3>
              <button onClick={() => setSelectedDayEvents(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "18px" }}>
                ×
              </button>
            </div>

            {selectedDayEvents.events.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: "14px" }}>No events on this day.</p>
            ) : (
              selectedDayEvents.events.map((ev) => (
                <div key={ev.id} style={{
                  background: "#f8fafc", borderRadius: "12px",
                  padding: "14px", marginBottom: "10px",
                  border: "1px solid #e2e8f0",
                }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{ev.title}</p>
                  {ev.event_time && <p style={{ margin: "0 0 4px", color: "#2563eb", fontSize: "13px" }}>{ev.event_time.slice(0,5)}</p>}
                  {ev.venue     && <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "13px" }}>{ev.venue}</p>}
                  {ev.attendees && <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px" }}>👥 {ev.attendees}</p>}
                  {ev.classification && (
                    <span style={{
                      fontSize: "11px", background: "#faf5ff", color: "#7c3aed",
                      padding: "2px 8px", borderRadius: "99px", marginRight: "8px",
                    }}>{ev.classification}</span>
                  )}
                  <div style={{ display: "flex", gap: "6px", marginTop: "8px", justifyContent: "flex-end" }}>
                    <button onClick={() => setDetailEventId(ev.id)}
                      style={{ background: "#2563eb", color: "white", border: "none", padding: "3px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                      Details
                    </button>
                    <button onClick={() => startEdit(ev)}
                      style={{ background: "transparent", color: "#2563eb", border: "1px solid #2563eb", padding: "3px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(ev.id)}
                      style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "3px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}

            <button
              onClick={() => { setShowForm(true); setForm((f) => ({ ...f, event_date: selectedDayEvents.date })); }}
              style={{
                marginTop: "10px", width: "100%",
                background: "#2563eb", color: "white",
                border: "none", padding: "10px", borderRadius: "10px",
                cursor: "pointer", fontWeight: 600, fontSize: "14px",
              }}
            >
              + Add Event on this Day
            </button>
          </motion.div>
        )}
      </div>

      {/* Event count chip */}
      {activeView !== "year" && eventCount !== null && (
        <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "12px" }}>
          {eventCount} total events in calendar
        </p>
      )}

      {/* FR-18 — edit / reschedule modal */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: "20px",
              padding: "26px", width: "100%", maxWidth: "520px",
              boxShadow: "0 30px 80px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ margin: "0 0 18px" }}>Edit / Reschedule Event (FR-18)</h3>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Title</label>
              <input type="text" value={editing.title}
                onChange={(e) => setEditing((d) => ({ ...d, title: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <DateInput label="Date" value={editing.event_date}
                onChange={(v) => setEditing((d) => ({ ...d, event_date: v }))} />
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Time</label>
                <input type="time" value={editing.event_time}
                  onChange={(e) => setEditing((d) => ({ ...d, event_time: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Venue</label>
                <input type="text" value={editing.venue}
                  onChange={(e) => setEditing((d) => ({ ...d, venue: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Attendees</label>
                <input type="text" value={editing.attendees}
                  onChange={(e) => setEditing((d) => ({ ...d, attendees: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Classification</label>
              <select value={editing.classification}
                onChange={(e) => setEditing((d) => ({ ...d, classification: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)}
                style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "10px 22px", borderRadius: "10px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleUpdate}
                style={{ background: "#2563eb", color: "white", border: "none", padding: "10px 22px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Event detail popup — shows AI-parsed fields + source document */}
      {detailEventId != null && (
        <EventDetailModal
          eventId={detailEventId}
          onClose={() => setDetailEventId(null)}
          onEdit={(ev) => { setDetailEventId(null); startEdit(ev); }}
          onDelete={(id) => { setDetailEventId(null); handleDelete(id); }}
        />
      )}
    </>
  );
}
