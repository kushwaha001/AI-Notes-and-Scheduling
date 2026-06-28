"""
FR-8/FR-9 — Document parsing with Docling.

Converts a PDF / image (JPG, PNG, TIFF) into Markdown text (all pages). The text
is used both for LLM field extraction and stored as full_text for keyword search.

Docling is heavy to import and loads models on first use, so the converter is
created lazily and reused.
"""

import logging

log = logging.getLogger(__name__)

_converter = None


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


def _get_converter():
    global _converter
    if _converter is None:
        _apply_ssl_fix()   # before any model download
        # Imported lazily so the app still starts if docling isn't installed (NFR-9)
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

        # AUTO picks the GPU when a CUDA torch build is installed (OCR + layout
        # models run on the GPU → much faster extraction), and falls back to CPU
        # otherwise — so a CPU-only box still works (NFR-9).
        device = AcceleratorDevice.AUTO
        try:
            import torch
            if torch.cuda.is_available():
                device = AcceleratorDevice.CUDA
        except Exception:
            pass

        log.info("Initialising Docling DocumentConverter (EasyOCR, device=%s)…", device.value)

        # Use EasyOCR — the auto-installed rapidocr ships a broken model config.
        opts = PdfPipelineOptions()
        opts.do_ocr = True
        opts.accelerator_options = AcceleratorOptions(device=device)
        opts.ocr_options = EasyOcrOptions()   # honours accelerator_options.device

        fmt = {
            InputFormat.PDF:   PdfFormatOption(pipeline_options=opts),
            InputFormat.IMAGE: PdfFormatOption(pipeline_options=opts),
        }
        _converter = DocumentConverter(format_options=fmt)
    return _converter


def parse_document(file_path: str):
    """Parse a document to Markdown.

    Returns (markdown_text, page_count). Raises on failure so the caller can
    mark the job failed and keep it for retry (NFR-2).
    """
    converter = _get_converter()
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


def docling_available() -> bool:
    """Cheap check used by the status page / health gating (NFR-9)."""
    try:
        import docling  # noqa: F401
        return True
    except Exception:
        return False
