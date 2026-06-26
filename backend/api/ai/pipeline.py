"""
Processing pipeline (NFR-6 single resident pipeline).

Takes a queued document → Docling parse → LLM extraction → stores full_text and
an extraction row → marks it awaiting_confirm. Fully isolated so a failure marks
the job 'failed' (kept for retry, NFR-2) and never crashes the API (NFR-9).
"""

import json
import logging

from api.db import get_db
from api.config import AI_ENABLED

log = logging.getLogger(__name__)


def ai_ready() -> bool:
    """True only if AI is enabled and both Docling + Ollama are available."""
    if not AI_ENABLED:
        return False
    try:
        from api.ai.parser import docling_available
        from api.ai.extractor import model_available
        return docling_available() and model_available()
    except Exception:
        return False


def process_document(doc_id: int) -> dict:
    """Parse + extract one document. Safe to call from a background task."""
    from api.ai.parser import parse_document
    from api.ai.extractor import extract_fields

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, file_path, file_type FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            return {"status": "skipped", "reason": "document not found"}

        cur.execute("UPDATE documents SET status = 'processing' WHERE id = %s", (doc_id,))
        cur.execute("UPDATE processing_queue SET status = 'processing' WHERE document_id = %s", (doc_id,))
        conn.commit()
    except Exception:
        conn.rollback(); cur.close(); conn.close()
        raise

    # Heavy work OUTSIDE the transaction so we don't hold a connection open for
    # tens of seconds.
    try:
        markdown, page_count = parse_document(doc["file_path"])

        # FR-4 — scan-quality gate: reject unreadable scans before extraction,
        # rather than feeding the model garbage and inventing fields.
        from api.config import MIN_READABLE_CHARS
        if len(markdown.strip()) < MIN_READABLE_CHARS:
            cur.execute("UPDATE documents SET status = 'failed', full_text = %s WHERE id = %s",
                        (markdown, doc_id))
            cur.execute("UPDATE processing_queue SET status = 'failed' WHERE document_id = %s", (doc_id,))
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('extracted', 'document', %s, 'Rejected: scan unreadable (too little text). Re-upload a clearer copy.')
            """, (doc_id,))
            conn.commit()
            cur.close(); conn.close()
            return {"status": "unreadable", "doc_id": doc_id,
                    "message": "Scan is unreadable — please re-upload a clearer copy."}

        fields = extract_fields(markdown)
    except Exception as e:
        log.error("Processing failed for doc %s: %s", doc_id, e)
        try:
            cur.execute("UPDATE documents SET status = 'failed' WHERE id = %s", (doc_id,))
            cur.execute(
                "UPDATE processing_queue SET status = 'failed', retry_count = retry_count + 1 "
                "WHERE document_id = %s", (doc_id,))
            conn.commit()
        finally:
            cur.close(); conn.close()
        return {"status": "failed", "doc_id": doc_id, "error": str(e)}

    # Persist results
    try:
        cur.execute("""
            UPDATE documents
            SET full_text = %s, page_count = %s, classification = %s,
                ref_number = %s, status = 'ready_to_confirm'
            WHERE id = %s
        """, (markdown, page_count, fields["item_type"], fields.get("ref_number"), doc_id))

        cur.execute("""
            INSERT INTO extractions
                (source_type, source_id, item_type, subject, event_date, event_time,
                 venue, attendees, ref_number, deadline, reply_by, reply_by_overdue,
                 meeting_date_flag, field_confidence, model_name, status)
            VALUES ('document', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s::jsonb, %s, 'pending')
        """, (
            doc_id, fields["item_type"], fields["subject"], fields["event_date"],
            fields["event_time"], fields["venue"], fields["attendees"],
            fields["ref_number"], fields["deadline"], fields["reply_by"],
            fields["reply_by_overdue"], fields["meeting_date_flag"],
            json.dumps(fields["field_confidence"]), fields["model_name"],
        ))

        cur.execute(
            "UPDATE processing_queue SET status = 'awaiting_confirm', processed_at = NOW() "
            "WHERE document_id = %s", (doc_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('extracted', 'document', %s, %s)
        """, (doc_id, fields.get("subject") or "AI extraction complete"))

        conn.commit()

        # FR-31 — add the full text to the semantic index (best-effort)
        try:
            from api.ai.embeddings import embed_available
            from api.ai.vectorstore import index_text
            if embed_available():
                cur2 = conn.cursor()
                cur2.execute("SELECT filename FROM documents WHERE id = %s", (doc_id,))
                fname = cur2.fetchone()["filename"]
                cur2.close()
                index_text("document", doc_id, fname, markdown)
        except Exception as e:
            log.warning("Semantic indexing skipped for doc %s: %s", doc_id, e)

        return {"status": "done", "doc_id": doc_id}
    except Exception as e:
        conn.rollback()
        log.error("Persisting extraction failed for doc %s: %s", doc_id, e)
        return {"status": "failed", "doc_id": doc_id, "error": str(e)}
    finally:
        cur.close()
        conn.close()


def process_waiting(limit: int = 5) -> list:
    """Process up to `limit` queued documents sequentially (NFR-6)."""
    if not ai_ready():
        return []
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT document_id FROM processing_queue
            WHERE status = 'waiting'
            ORDER BY queued_at
            LIMIT %s
        """, (limit,))
        ids = [r["document_id"] for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()

    return [process_document(doc_id) for doc_id in ids]
