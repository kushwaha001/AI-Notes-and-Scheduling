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
    DOCLING_URL, DOCLING_API_KEY, DOCLING_CONVERT_PATH, OCR_MODE,
)

log = logging.getLogger(__name__)

_converters = {}   # keyed by do_ocr (bool) — built lazily, reused


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


def _get_converter(do_ocr: bool):
    """One converter per OCR setting, cached. AUTO picks the GPU when a CUDA torch
    build is present (OCR + layout on GPU) and falls back to CPU otherwise."""
    if do_ocr in _converters:
        return _converters[do_ocr]

    _apply_ssl_fix()   # before any model download
    # Imported lazily so the app still starts if docling isn't installed (NFR-9).
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

    device = AcceleratorDevice.AUTO
    try:
        import torch
        if torch.cuda.is_available():
            device = AcceleratorDevice.CUDA
    except Exception:
        pass

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
    _converters[do_ocr] = conv
    return conv


def _parse_local(file_path: str, do_ocr: bool):
    converter = _get_converter(do_ocr)
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


# ── Public API ────────────────────────────────────────────────
def parse_document(file_path: str):
    """Parse a document to (markdown_text, page_count).

    Uses the remote docling service when DOCLING_URL is set, else in-process
    Docling. Raises on failure so the caller can mark the job failed and keep it
    for retry (NFR-2).
    """
    do_ocr = _needs_ocr(file_path)
    if DOCLING_URL:
        return _parse_remote(file_path, do_ocr)
    return _parse_local(file_path, do_ocr)


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
