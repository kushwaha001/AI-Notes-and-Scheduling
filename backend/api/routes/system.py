"""
FR-41 — System Administration status.

A single endpoint the frontend status page polls to answer "is the box healthy":
  • is the AI model loaded (Ollama running models)
  • GPU utilisation / memory   (via `nvidia-smi`, if a GPU is present)
  • disk usage of the data drive (stdlib `shutil`, always available)
  • how many documents are queued for processing
  • when the last backup ran

Deliberately uses only the stdlib + httpx (already a dependency) so it needs no
extra wheels in the offline bundle, and never raises if hardware tooling is
missing — every probe degrades to a safe "n/a".
"""

import shutil
import subprocess
import logging

import httpx
from fastapi import APIRouter, Depends

from api.config import BASE_DIR, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
from api.db import get_db
from api.auth import require_admin, CurrentUser

router = APIRouter(tags=["System"])
log = logging.getLogger(__name__)


def _gpu_stats():
    """Parse `nvidia-smi` for utilisation + memory. Returns None if no GPU /
    the tool isn't installed (e.g. the App PC where Ollama runs on the server)."""
    try:
        out = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=name,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=4,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None
        gpus = []
        for line in out.stdout.strip().splitlines():
            name, util, used, total = [p.strip() for p in line.split(",")]
            used_f, total_f = float(used), float(total)
            gpus.append({
                "name"        : name,
                "util_pct"    : float(util),
                "mem_used_mb" : used_f,
                "mem_total_mb": total_f,
                "mem_pct"     : round(used_f / total_f * 100, 1) if total_f else 0.0,
            })
        return gpus
    except Exception:
        return None


def _disk_stats():
    try:
        total, used, free = shutil.disk_usage(BASE_DIR)
        gb = 1024 ** 3
        return {
            "total_gb": round(total / gb, 1),
            "used_gb" : round(used / gb, 1),
            "free_gb" : round(free / gb, 1),
            "used_pct": round(used / total * 100, 1) if total else 0.0,
        }
    except Exception:
        return None


def _model_status():
    """Ask the LLM server which models it serves (FR-41 'is the model loaded').
    Works with any OpenAI-compatible server (vLLM, Ollama /v1)."""
    info = {"loaded": False, "model": LLM_MODEL or "(auto)", "resident": [], "reachable": False}
    hdr = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    try:
        with httpx.Client(timeout=3) as c:
            r = c.get(f"{LLM_BASE_URL}/models", headers=hdr)
            if r.status_code == 200:
                info["reachable"] = True
                ids = [m.get("id", "") for m in (r.json().get("data") or [])]
                info["resident"] = ids
                if LLM_MODEL:
                    base = LLM_MODEL.split(":")[0]
                    info["loaded"] = any(i == LLM_MODEL or i.split(":")[0] == base for i in ids)
                else:
                    info["loaded"] = len(ids) > 0
    except Exception:
        pass
    return info


@router.get("/system/status")
def system_status(admin: CurrentUser = Depends(require_admin)):
    """FR-41 — consolidated admin snapshot for the status page."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'waiting')          AS waiting,
                COUNT(*) FILTER (WHERE status = 'processing')       AS processing,
                COUNT(*) FILTER (WHERE status = 'awaiting_confirm') AS awaiting_confirm,
                COUNT(*) FILTER (WHERE status = 'failed')           AS failed
            FROM processing_queue
        """)
        q = cur.fetchone()
        queue_depth = (q["waiting"] or 0) + (q["processing"] or 0)

        cur.execute("SELECT created_at, item_count FROM backups ORDER BY created_at DESC LIMIT 1")
        last_backup = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    return {
        "model"      : _model_status(),
        "gpu"        : _gpu_stats(),          # None when no GPU is local to this box
        "disk"       : _disk_stats(),
        "queue"      : {
            "depth"           : queue_depth,
            "waiting"         : q["waiting"],
            "processing"      : q["processing"],
            "awaiting_confirm": q["awaiting_confirm"],
            "failed"          : q["failed"],
        },
        "last_backup": {
            "at"   : str(last_backup["created_at"]) if last_backup else None,
            "items": last_backup["item_count"] if last_backup else None,
        },
    }
