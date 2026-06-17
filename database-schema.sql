-- =============================================
-- AI Notes Scheduler — Database Schema v2
-- =============================================

-- Documents table
CREATE TABLE documents (
    id            SERIAL PRIMARY KEY,
    filename      TEXT NOT NULL,
    file_hash     TEXT UNIQUE NOT NULL,
    file_path     TEXT NOT NULL,
    file_type     TEXT CHECK (file_type IN ('pdf', 'jpg', 'png', 'tiff')),
    status        TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed', 'deleted')),
    uploaded_at   TIMESTAMP DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL,
    event_date    DATE,
    event_time    TIME,
    venue         TEXT,
    attendees     TEXT,
    ref_number    TEXT,
    deadline      DATE,
    reply_by      DATE,
    priority      TEXT DEFAULT 'Medium'  CHECK (priority  IN ('Low', 'Medium', 'High', 'Critical')),
    category      TEXT DEFAULT 'General' CHECK (category  IN ('Meeting', 'Reply', 'Review', 'Personal', 'General')),
    source        TEXT DEFAULT 'ai'      CHECK (source    IN ('ai', 'manual', 'voice')),
    status        TEXT DEFAULT 'upcoming' CHECK (status   IN ('upcoming', 'confirmed', 'deleted')),
    source_doc_id INT REFERENCES documents(id),
    confirmed_at  TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Event-Documents join table (one event can be linked to multiple source docs)
CREATE TABLE event_documents (
    event_id    INT REFERENCES events(id)    ON DELETE CASCADE,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    linked_at   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (event_id, document_id)
);

-- Tasks table
CREATE TABLE tasks (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL,
    due_date      DATE,
    priority      TEXT DEFAULT 'Medium'  CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    category      TEXT DEFAULT 'General' CHECK (category IN ('Meeting', 'Reply', 'Review', 'Personal', 'General')),
    source        TEXT DEFAULT 'ai'      CHECK (source   IN ('ai', 'manual', 'voice')),
    status        TEXT DEFAULT 'open'    CHECK (status   IN ('open', 'done', 'cancelled')),
    source_doc_id INT REFERENCES documents(id),
    audio_file    TEXT,
    transcript    TEXT,
    confirmed_at  TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Processing queue table
CREATE TABLE processing_queue (
    id            SERIAL PRIMARY KEY,
    job_id        TEXT UNIQUE NOT NULL,
    document_id   INT REFERENCES documents(id) ON DELETE CASCADE,
    status        TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'processing', 'awaiting_confirm', 'dismissed', 'done', 'failed', 'cancelled')),
    retry_count   INT DEFAULT 0,
    queued_at     TIMESTAMP DEFAULT NOW(),
    processed_at  TIMESTAMP
);

-- Audit log table
CREATE TABLE audit_log (
    id            SERIAL PRIMARY KEY,
    action        TEXT NOT NULL CHECK (action IN ('uploaded', 'extracted', 'confirmed', 'dismissed', 'edited', 'deleted', 'manual_entry')),
    entity_type   TEXT CHECK (entity_type IN ('document', 'event', 'task')),
    entity_id     INT,
    detail        TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);
