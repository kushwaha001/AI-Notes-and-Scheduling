"""
FR-8/FR-9 — Document parsing with Docling (in-process) or a remote docling-serve.

Converts a PDF / image (JPG, PNG, TIFF) into Markdown text (all pages). The text
is used both for LLM field extraction and stored as full_text for keyword search.

Two improvements over the original:
  * Set DOCLING_URL to offload parsing to a running docling-serve instance;
    leave it empty to run Docling in-process (bundled).
  * OCR is gated (OCR_MODE): a digital PDF with a real text layer skips OCR
    entirely, so a plain PDF is parsed in a fraction of the time. OCR only kicks
    in for scans/images.
"""

import os
import logging

import httpx

from api.config import (
    DOCLING_URL, DOCLING_API_KEY, DOCLING_CONVERT_PATH, OCR_MODE, DOCLING_DEVICE,
)

log = logging.getLogger(__name__)

_converters = {}   # keyed by (do_ocr, device) — built lazily, reused


# ── OCR policy gate ───────────────────────────────────────────
def _needs_ocr(file_path: str) -> bool:
    """auto = OCR only when a PDF has no extractable text layer (a scan), and
    always for images. force/off override."""
    if OCR_MODE == "force":
        return True
    if OCR_MODE == "off":
        return False
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".pdf":
        return True   # images are always scans → OCR
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        chars = 0
        for page in reader.pages[:10]:        # sampling the first pages is enough
            chars += len((page.extract_text() or "").strip())
            if chars >= 200:
                return False                  # has a real text layer → no OCR
        return True                           # little/no text → it's a scan → OCR
    except Exception as e:
        log.warning("OCR gate could not read %s (%s); defaulting to OCR.", file_path, e)
        return True


# ── In-process Docling ────────────────────────────────────────
def _apply_ssl_fix():
    """Some Windows/Anaconda installs have a malformed cert in the Windows store
    that breaks Python's default HTTPS (ASN1 NOT_ENOUGH_DATA). Docling/EasyOCR
    download models over HTTPS on first use, so point the default HTTPS context
    at the certifi bundle (which skips the Windows store)."""
    try:
        import ssl
        import certifi
        ssl._create_default_https_context = (
            lambda *a, **k: ssl.create_default_context(cafile=certifi.where())
        )
    except Exception as e:
        log.warning("Could not apply SSL fix: %s", e)


def _resolve_device(force_cpu: bool):
    """Pick the Docling accelerator device. Honours DOCLING_DEVICE; force_cpu wins
    (used by the automatic CPU retry after a GPU failure)."""
    from docling.datamodel.accelerator_options import AcceleratorDevice
    if force_cpu or DOCLING_DEVICE == "cpu":
        return AcceleratorDevice.CPU
    if DOCLING_DEVICE == "cuda":
        return AcceleratorDevice.CUDA
    # auto: CUDA when a working CUDA torch build is present, else CPU
    try:
        import torch
        if torch.cuda.is_available():
            return AcceleratorDevice.CUDA
    except Exception:
        pass
    return AcceleratorDevice.CPU


def _get_converter(do_ocr: bool, force_cpu: bool = False):
    """One converter per (OCR setting, device), cached and reused."""
    _apply_ssl_fix()   # before any model download
    # Imported lazily so the app still starts if docling isn't installed (NFR-9).
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

    device = _resolve_device(force_cpu)
    key = (do_ocr, device)
    if key in _converters:
        return _converters[key]

    log.info("Initialising Docling converter (do_ocr=%s, device=%s)…", do_ocr, device.value)

    opts = PdfPipelineOptions()
    opts.do_ocr = do_ocr
    opts.accelerator_options = AcceleratorOptions(device=device)
    if do_ocr:
        # Use EasyOCR — the auto-installed rapidocr ships a broken model config.
        opts.ocr_options = EasyOcrOptions()   # honours accelerator_options.device

    fmt = {
        InputFormat.PDF:   PdfFormatOption(pipeline_options=opts),
        InputFormat.IMAGE: PdfFormatOption(pipeline_options=opts),
    }
    conv = DocumentConverter(format_options=fmt)
    _converters[key] = conv
    return conv


def _is_gpu_error(exc: Exception) -> bool:
    """Recognise CUDA/GPU out-of-memory or execution failures so we can retry on
    CPU. Docling wraps these, so we match on the message text."""
    msg = f"{type(exc).__name__}: {exc}".lower()
    needles = ("cuda", "cublas", "cudnn", "out of memory", "memory allocation",
               "gpu", "device-side assert")
    return any(n in msg for n in needles)


def _run_converter(do_ocr: bool, file_path: str, force_cpu: bool):
    converter = _get_converter(do_ocr, force_cpu=force_cpu)
    result = converter.convert(file_path)
    doc = result.document
    markdown = doc.export_to_markdown()
    page_count = None
    try:
        pages = getattr(doc, "pages", None)
        if pages is not None:
            page_count = len(pages)
    except Exception:
        page_count = None
    return markdown, page_count


def _parse_local(file_path: str, do_ocr: bool):
    """Parse with Docling. If a GPU run fails (CUDA OOM/cuBLAS on a shared GPU),
    automatically rebuild the converter on CPU and retry once, so a busy GPU never
    hard-fails an extraction."""
    try:
        return _run_converter(do_ocr, file_path, force_cpu=False)
    except Exception as e:
        if DOCLING_DEVICE != "cuda" and _is_gpu_error(e):
            log.warning("Docling GPU parse failed (%s); retrying on CPU.", e)
            return _run_converter(do_ocr, file_path, force_cpu=True)
        raise


# ── Remote docling-serve ──────────────────────────────────────
def _parse_remote(file_path: str, do_ocr: bool):
    """Send the file to a running docling-serve instance and return its markdown.
    Defensive about the response shape so it tolerates minor API differences."""
    url = DOCLING_URL + DOCLING_CONVERT_PATH
    headers = {}
    if DOCLING_API_KEY:
        headers["Authorization"] = f"Bearer {DOCLING_API_KEY}"
    with open(file_path, "rb") as fh:
        files = {"files": (os.path.basename(file_path), fh, "application/octet-stream")}
        data = {"to_formats": "md", "do_ocr": str(do_ocr).lower()}
        r = httpx.post(url, files=files, data=data, headers=headers, timeout=600)
    r.raise_for_status()
    payload = r.json()
    return _extract_markdown(payload), _extract_pages(payload)


def _extract_markdown(payload) -> str:
    if isinstance(payload, dict):
        doc = payload.get("document")
        if isinstance(doc, dict):
            for k in ("md_content", "markdown", "text_content", "text"):
                if doc.get(k):
                    return doc[k]
        for k in ("md_content", "markdown", "text"):
            if isinstance(payload.get(k), str) and payload[k]:
                return payload[k]
    if isinstance(payload, str):
        return payload
    raise RuntimeError("Docling service response had no markdown content")


def _extract_pages(payload):
    try:
        doc = payload.get("document", {}) if isinstance(payload, dict) else {}
        return doc.get("page_count") or payload.get("page_count")
    except Exception:
        return None


# ── pypdf plain-text fallback ─────────────────────────────────
def _pypdf_text(file_path: str):
    """Extract the embedded text layer of a digital PDF with pypdf. Returns
    (text, page_count) or (None, None) if there's no usable text. No GPU, no OCR —
    a last-resort so a text PDF still extracts if Docling can't run at all."""
    if os.path.splitext(file_path)[1].lower() != ".pdf":
        return None, None
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        parts = [(p.extract_text() or "") for p in reader.pages]
        text = "\n\n".join(parts).strip()
        return (text, len(reader.pages)) if text else (None, None)
    except Exception as e:
        log.warning("pypdf text fallback failed for %s: %s", file_path, e)
        return None, None


# ── Public API ────────────────────────────────────────────────
def parse_document(file_path: str):
    """Parse a document to (markdown_text, page_count).

    Uses the remote docling service when DOCLING_URL is set, else in-process
    Docling. If in-process Docling fails outright (e.g. not installed, or an
    unrecoverable GPU error), fall back to pypdf's embedded text for digital PDFs
    so a readable PDF still extracts. Only raises when nothing can read it, so the
    caller can mark the job failed and keep it for retry (NFR-2).
    """
    do_ocr = _needs_ocr(file_path)
    if DOCLING_URL:
        return _parse_remote(file_path, do_ocr)
    try:
        return _parse_local(file_path, do_ocr)
    except Exception as e:
        text, pages = _pypdf_text(file_path)
        if text:
            log.warning("Docling parse failed (%s); used pypdf text fallback (%s chars).",
                        e, len(text))
            return text, pages
        raise


def docling_available() -> bool:
    """Health gate (NFR-9). Remote: ping the service; local: check the import."""
    if DOCLING_URL:
        try:
            r = httpx.get(f"{DOCLING_URL}/health", timeout=3)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        try:
            r = httpx.get(DOCLING_URL, timeout=3)
            return r.status_code < 500
        except Exception:
            return False
    try:
        import docling  # noqa: F401
        return True
    except Exception:
        return False
