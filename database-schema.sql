-- =====================================================================
-- AI Notes & Scheduling — Database Schema v3
-- =====================================================================

-- USERS 
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,      
    created_at    TIMESTAMP DEFAULT NOW()
);


-- DOCUMENTS  (FR-1–4, FR-9, FR-27)
CREATE TABLE documents (
    id              SERIAL PRIMARY KEY,
    users_id        INT NOT NULL REFERENCES users(id),
    filename        TEXT NOT NULL,
    file_hash       TEXT UNIQUE NOT NULL,                  
    file_path       TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('pdf','jpg','png','tiff')),
    page_count      INT,                             
    full_text       TEXT,                                  
    classification  TEXT,                                 
    status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','processing','ready_to_confirm',
                                          'done','failed','trashed')),
    deleted_at      TIMESTAMP,                              
    uploaded_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_owner  ON documents(users_id);
CREATE INDEX idx_documents_status ON documents(status);


-- AUDIO RECORDINGS  (FR-6)
CREATE TABLE audio (
    id              SERIAL PRIMARY KEY,
    users_id        INT NOT NULL REFERENCES users(id),
    file_path       TEXT NOT NULL,                        
    duration        INT,                                    
    transcript      TEXT,                                    
    status          TEXT NOT NULL DEFAULT 'recorded'
                        CHECK (status IN ('recorded','transcribing','ready','trashed')),
    deleted_at      TIMESTAMP,                                
    recorded_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audio_owner  ON audio(users_id);
CREATE INDEX idx_audio_status ON audio(status);


-- EXTRACTIONS  (FR-8, FR-10, FR-11, FR-12, FR-14)
CREATE TABLE extractions (
    id                SERIAL PRIMARY KEY,
    source_type       TEXT NOT NULL CHECK (source_type IN ('document', 'audio')),
    source_id         INT NOT NULL,                          -- polymorphic FK -> documents.id or audio_recordings.id
    item_type         TEXT NOT NULL DEFAULT 'event'
                          CHECK (item_type IN ('event', 'task')),  -- what the item will become on confirm
    subject           TEXT,
    event_date        DATE,
    event_time        TIME,
    venue             TEXT,
    attendees         TEXT,
    ref_number        TEXT,
    deadline          DATE,
    reply_by          DATE,
    reply_by_overdue  BOOLEAN DEFAULT FALSE,                 -- FR-11: past reply_by is valid, flagged overdue
    meeting_date_flag BOOLEAN DEFAULT FALSE,                 -- FR-11: past meeting date is implausible, flagged
    field_confidence  JSONB,                                 -- FR-10: per-field confidence scores
    model_name        TEXT,                                  -- which model produced this (NFR-7 swap tracking)
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'dismissed')),  -- FR-14 / FR-14a
    extracted_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_extractions_source ON extractions(source_type, source_id);
CREATE INDEX idx_extractions_status ON extractions(status);



-- EVENT RECURRENCE  (FR-20)
CREATE TABLE event_recurrence (
    id            SERIAL PRIMARY KEY,
    frequency     TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
    interval      INT NOT NULL DEFAULT 1,
    end_date      DATE,                                     
    end_count     INT,
    created_at    TIMESTAMP DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_count IS NULL)
);



-- EVENTS  (FR-16–21, FR-26, FR-33–36)
CREATE TABLE events (
    id              SERIAL PRIMARY KEY,
    users_id        INT NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_time      TIME,
    venue           TEXT,
    attendees       TEXT,                                   
    classification  TEXT,                                   
    source          TEXT NOT NULL DEFAULT 'ai'
                        CHECK (source IN ('ai','manual','voice')), 
    recurrence_id   INT REFERENCES event_recurrence(id),      
    parent_event_id INT REFERENCES events(id),                -- FR-20: set when one occurrence is edited
    status          TEXT NOT NULL DEFAULT 'upcoming'
                        CHECK (status IN ('upcoming','past','trashed')),
    deleted_at      TIMESTAMP,                            
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_owner_date ON events(users_id, event_date);
CREATE INDEX idx_events_status     ON events(status);
CREATE INDEX idx_events_recurrence ON events(recurrence_id);



-- TASKS  (FR-12, FR-13, FR-22, FR-23, voice path FR-6)
CREATE TABLE tasks (
    id              SERIAL PRIMARY KEY,
    users_id        INT NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    due_date        DATE,
    is_reply_task   BOOLEAN NOT NULL DEFAULT FALSE,           
    classification  TEXT,                                     
    source          TEXT NOT NULL DEFAULT 'ai'
                        CHECK (source IN ('ai','manual','voice')),
    status          TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','done','trashed')),
    deleted_at      TIMESTAMP,                                -- FR-19
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tasks_owner_due   ON tasks(users_id, due_date);
CREATE INDEX idx_tasks_status      ON tasks(status);
CREATE INDEX idx_tasks_reply_due   ON tasks(is_reply_task, due_date) WHERE is_reply_task = TRUE;


-- NOTES  (FR-5, FR-38, FR-39)
CREATE TABLE notes (
    id                  SERIAL PRIMARY KEY,
    users_id            INT NOT NULL REFERENCES users(id),
    title               TEXT,
    classification      TEXT,                                 
    current_version_id  INT,                                 
    status              TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','trashed')),
    deleted_at          TIMESTAMP,                             -- FR-19
    created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE note_versions (
    id            SERIAL PRIMARY KEY,
    note_id       INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    edited_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (note_id, version_number)
);

ALTER TABLE notes
    ADD CONSTRAINT fk_notes_current_version
    FOREIGN KEY (current_version_id) REFERENCES note_versions(id);

CREATE INDEX idx_note_versions_note ON note_versions(note_id);


-- LINKED SOURCES  (FR-6, FR-24, FR-25, FR-26, FR-27)
CREATE TABLE linked_sources (
    id           SERIAL PRIMARY KEY,
    source_type  TEXT NOT NULL CHECK (source_type IN ('document', 'audio')),
    source_id    INT NOT NULL,                                  -- polymorphic FK -> documents.id or audio_recordings.id
    entity_type  TEXT NOT NULL CHECK (entity_type IN ('event','task','note')),
    entity_id    INT NOT NULL,                                  -- polymorphic FK, validated in application layer
    link_type    TEXT NOT NULL DEFAULT 'source'
                     CHECK (link_type IN ('source','hard_auto','soft_suggested')),
    confirmed    BOOLEAN NOT NULL DEFAULT TRUE,                 
    linked_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (source_type, source_id, entity_type, entity_id, link_type)
);

CREATE INDEX idx_linked_sources_entity ON linked_sources(entity_type, entity_id);
CREATE INDEX idx_linked_sources_source ON linked_sources(source_type, source_id);


-- REMINDERS  (FR-17, FR-37)
CREATE TABLE reminders (
    id            SERIAL PRIMARY KEY,
    event_id      INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    remind_before TEXT NOT NULL,                                 
    delivered     BOOLEAN NOT NULL DEFAULT FALSE,                
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reminders_event ON reminders(event_id);



-- PROCESSING QUEUE  (FR-2, NFR-6, NFR-9)
CREATE TABLE processing_queue (
    id            SERIAL PRIMARY KEY,
    document_id   INT REFERENCES documents(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','processing','awaiting_confirm',
                                        'dismissed','done','failed','cancelled')),
    retry_count   INT NOT NULL DEFAULT 0,
    queued_at     TIMESTAMP DEFAULT NOW(),
    processed_at  TIMESTAMP
);

CREATE INDEX idx_queue_status ON processing_queue(status);


-- AUDIT LOG  (FR-18, FR-28)
CREATE TABLE audit_log (
    id            SERIAL PRIMARY KEY,
    action        TEXT NOT NULL
                      CHECK (action IN ('uploaded','extracted','confirmed','dismissed',
                                        'edited','rescheduled','trashed','restored',
                                        'purged','manual_entry','status_changed')),
    entity_type   TEXT NOT NULL CHECK (entity_type IN ('document','audio','event','task','note')),
    entity_id     INT NOT NULL,
    detail        TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);



-- SYSTEM STATUS  (FR-41)
CREATE TABLE system_status (
    id                  SERIAL PRIMARY KEY,
    model_loaded        BOOLEAN NOT NULL,
    gpu_usage_pct       NUMERIC(5,2),
    disk_usage_pct      NUMERIC(5,2),
    queue_length        INT NOT NULL DEFAULT 0,
    last_backup_at      TIMESTAMP,
);

