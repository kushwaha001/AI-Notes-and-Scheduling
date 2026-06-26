"""
Auto-initialize PostgreSQL on startup.
Creates the database if missing, then applies the full schema
using IF NOT EXISTS — safe to run on every startup.
"""

import logging
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from api.config import DB_CONFIG

log = logging.getLogger(__name__)

# ── Idempotent schema ────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (id, username) VALUES (1, 'default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS documents (
    id             SERIAL PRIMARY KEY,
    users_id       INT NOT NULL REFERENCES users(id),
    filename       TEXT NOT NULL,
    file_hash      TEXT UNIQUE NOT NULL,
    file_path      TEXT NOT NULL,
    file_type      TEXT NOT NULL CHECK (file_type IN ('pdf','jpg','png','tiff')),
    page_count     INT,
    full_text      TEXT,
    classification TEXT,
    status         TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','processing','ready_to_confirm',
                                         'done','failed','trashed')),
    deleted_at     TIMESTAMP,
    uploaded_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_owner  ON documents(users_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS audio (
    id          SERIAL PRIMARY KEY,
    users_id    INT NOT NULL REFERENCES users(id),
    file_path   TEXT NOT NULL,
    duration    INT,
    transcript  TEXT,
    status      TEXT NOT NULL DEFAULT 'recorded'
                    CHECK (status IN ('recorded','transcribing','ready','trashed')),
    deleted_at  TIMESTAMP,
    recorded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audio_owner  ON audio(users_id);
CREATE INDEX IF NOT EXISTS idx_audio_status ON audio(status);

CREATE TABLE IF NOT EXISTS extractions (
    id                SERIAL PRIMARY KEY,
    source_type       TEXT NOT NULL CHECK (source_type IN ('document','audio')),
    source_id         INT  NOT NULL,
    item_type         TEXT NOT NULL DEFAULT 'event'
                          CHECK (item_type IN ('event','task')),
    subject           TEXT,
    event_date        DATE,
    event_time        TIME,
    venue             TEXT,
    attendees         TEXT,
    ref_number        TEXT,
    deadline          DATE,
    reply_by          DATE,
    reply_by_overdue  BOOLEAN DEFAULT FALSE,
    meeting_date_flag BOOLEAN DEFAULT FALSE,
    field_confidence  JSONB,
    model_name        TEXT,
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','confirmed','dismissed')),
    extracted_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extractions_source ON extractions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);

CREATE TABLE IF NOT EXISTS event_recurrence (
    id        SERIAL PRIMARY KEY,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
    interval  INT  NOT NULL DEFAULT 1,
    end_date  DATE,
    end_count INT,
    created_at TIMESTAMP DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_count IS NULL)
);

CREATE TABLE IF NOT EXISTS events (
    id              SERIAL PRIMARY KEY,
    users_id        INT  NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_time      TIME,
    venue           TEXT,
    attendees       TEXT,
    classification  TEXT,
    source          TEXT NOT NULL DEFAULT 'ai'
                        CHECK (source IN ('ai','manual','voice')),
    recurrence_id   INT  REFERENCES event_recurrence(id),
    parent_event_id INT  REFERENCES events(id),
    status          TEXT NOT NULL DEFAULT 'upcoming'
                        CHECK (status IN ('upcoming','past','trashed')),
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_owner_date ON events(users_id, event_date);
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_recurrence ON events(recurrence_id);

CREATE TABLE IF NOT EXISTS tasks (
    id             SERIAL PRIMARY KEY,
    users_id       INT  NOT NULL REFERENCES users(id),
    title          TEXT NOT NULL,
    due_date       DATE,
    is_reply_task  BOOLEAN NOT NULL DEFAULT FALSE,
    classification TEXT,
    source         TEXT NOT NULL DEFAULT 'ai'
                       CHECK (source IN ('ai','manual','voice')),
    status         TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','done','trashed')),
    deleted_at     TIMESTAMP,
    created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_due ON tasks(users_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_reply_due ON tasks(is_reply_task, due_date) WHERE is_reply_task = TRUE;

CREATE TABLE IF NOT EXISTS notes (
    id                 SERIAL PRIMARY KEY,
    users_id           INT  NOT NULL REFERENCES users(id),
    title              TEXT,
    classification     TEXT,
    current_version_id INT,
    status             TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','trashed')),
    deleted_at         TIMESTAMP,
    created_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS note_versions (
    id             SERIAL PRIMARY KEY,
    note_id        INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    edited_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (note_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_notes_current_version'
          AND table_name = 'notes'
    ) THEN
        ALTER TABLE notes
            ADD CONSTRAINT fk_notes_current_version
            FOREIGN KEY (current_version_id) REFERENCES note_versions(id);
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS linked_documents (
    id          SERIAL PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('document','audio')),
    source_id   INT  NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('event','task','note')),
    entity_id   INT  NOT NULL,
    link_type   TEXT NOT NULL DEFAULT 'source'
                    CHECK (link_type IN ('source','hard_auto','soft_suggested')),
    confirmed   BOOLEAN NOT NULL DEFAULT TRUE,
    linked_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE (source_type, source_id, entity_type, entity_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_linked_documents_entity ON linked_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_linked_documents_source ON linked_documents(source_type, source_id);

CREATE TABLE IF NOT EXISTS reminders (
    id            SERIAL PRIMARY KEY,
    event_id      INT  NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    remind_before TEXT NOT NULL,
    delivered     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_event ON reminders(event_id);

CREATE TABLE IF NOT EXISTS processing_queue (
    id           SERIAL PRIMARY KEY,
    document_id  INT REFERENCES documents(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting','processing','awaiting_confirm',
                                       'dismissed','done','failed','cancelled')),
    retry_count  INT  NOT NULL DEFAULT 0,
    queued_at    TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON processing_queue(status);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    action      TEXT NOT NULL
                    CHECK (action IN ('uploaded','extracted','confirmed','dismissed',
                                      'edited','rescheduled','trashed','restored',
                                      'purged','manual_entry','status_changed')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('document','audio','event','task','note')),
    entity_id   INT  NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS system_status (
    id             SERIAL PRIMARY KEY,
    model_loaded   BOOLEAN NOT NULL,
    gpu_usage_pct  NUMERIC(5,2),
    disk_usage_pct NUMERIC(5,2),
    queue_length   INT NOT NULL DEFAULT 0,
    last_backup_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backups (
    id          SERIAL PRIMARY KEY,
    path        TEXT NOT NULL,
    item_count  INT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- FR-24: reference number on documents (deterministic auto-linking)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ref_number TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_ref ON documents(ref_number);
"""


def _ensure_database():
    """Connect to the postgres system DB and create udaan_db if missing."""
    cfg = {**DB_CONFIG, "database": "postgres"}
    conn = psycopg2.connect(**cfg)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_CONFIG["database"],))
        if not cur.fetchone():
            cur.execute(f'CREATE DATABASE "{DB_CONFIG["database"]}"')
            log.info("Database '%s' created.", DB_CONFIG["database"])
        else:
            log.info("Database '%s' already exists.", DB_CONFIG["database"])
    finally:
        cur.close()
        conn.close()


def _apply_schema():
    """Apply the idempotent schema to the app database."""
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(SCHEMA_SQL)
        conn.commit()
        log.info("Schema applied successfully.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def _migrate_file_notes():
    """One-time: import legacy uuid-named note files into the notes table,
    renaming them to {id}.md so they become DB-backed (FR-38)."""
    import os
    from api.config import NOTES_DIR

    if not os.path.isdir(NOTES_DIR):
        return

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    try:
        for fname in os.listdir(NOTES_DIR):
            if not fname.endswith(".md"):
                continue
            base = fname[:-3]
            if base.isdigit():
                continue  # already DB-keyed
            path = os.path.join(NOTES_DIR, fname)
            if not os.path.isfile(path):
                continue
            with open(path, "r", encoding="utf-8") as f:
                first = f.readline().strip()
            title = first.lstrip("#").strip() if first.startswith("#") else base
            cur.execute(
                "INSERT INTO notes (users_id, title, classification, status) "
                "VALUES (1, %s, 'General', 'active') RETURNING id",
                (title,),
            )
            nid = cur.fetchone()[0]
            cur.execute("INSERT INTO note_versions (note_id, version_number) VALUES (%s, 1)", (nid,))
            os.rename(path, os.path.join(NOTES_DIR, f"{nid}.md"))
            log.info("Migrated legacy note '%s' -> id %s", fname, nid)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        log.warning("Note migration skipped: %s", exc)
    finally:
        cur.close()
        conn.close()


def init_db():
    """Public entry point called from FastAPI lifespan."""
    try:
        _ensure_database()
        _apply_schema()
        _migrate_file_notes()
        log.info("Database ready.")
    except Exception as exc:
        log.error("DB init failed: %s", exc)
        raise
