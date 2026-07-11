"""
Render document pages to images for the vision-extraction path (api.ai.extractor).

Images (JPG/PNG/TIFF) are opened and downscaled directly with Pillow — no extra
dependency. PDFs are rasterised with PyMuPDF (fitz) when it is installed; if it
isn't, PDF rendering is skipped and the caller falls back to the OCR-text path.
PyMuPDF is a single self-contained wheel (no system libraries), so it works in an
air-gapped deployment once the wheel is pre-staged.

Every page is downscaled so its longest edge <= VISION_IMAGE_MAX_PX and only the
first VISION_MAX_PAGES pages are sent — both are token/latency guards for the VLM.
"""

import io
import os
import base64
import logging

from api.config import VISION_MAX_PAGES, VISION_IMAGE_MAX_PX

log = logging.getLogger(__name__)

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


def is_renderable(file_path: str) -> bool:
    """An image always renders; a PDF renders only if PyMuPDF is importable."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in _IMAGE_EXTS:
        return True
    if ext == ".pdf":
        try:
            import fitz  # noqa: F401  (PyMuPDF)
            return True
        except Exception:
            return False
    return False


def _encode_png(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def _to_png_bytes(image) -> bytes:
    """Downscale a PIL image so its longest edge <= VISION_IMAGE_MAX_PX; PNG bytes."""
    w, h = image.size
    longest = max(w, h)
    if longest > VISION_IMAGE_MAX_PX:
        scale = VISION_IMAGE_MAX_PX / float(longest)
        image = image.resize((max(1, int(w * scale)), max(1, int(h * scale))))
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _render_image_file(file_path: str) -> list:
    from PIL import Image
    out = []
    with Image.open(file_path) as im:
        frames = getattr(im, "n_frames", 1)   # TIFF can be multi-page
        for i in range(min(frames, VISION_MAX_PAGES)):
            im.seek(i)
            out.append(_encode_png(_to_png_bytes(im.copy())))
    return out


def _render_pdf(file_path: str) -> list:
    try:
        import fitz  # PyMuPDF
    except Exception as e:
        log.info("PyMuPDF not installed (%s); vision path skips PDF %s.", e, file_path)
        return []
    from PIL import Image
    out = []
    doc = fitz.open(file_path)
    try:
        for page in doc[:VISION_MAX_PAGES]:
            pix = page.get_pixmap(dpi=150)          # rasterise at ~150 DPI
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            out.append(_encode_png(_to_png_bytes(img)))
    finally:
        doc.close()
    return out


def render_pages(file_path: str) -> list:
    """Return up to VISION_MAX_PAGES base64 PNG data-URIs, or [] when the file
    can't be rendered (the caller then uses the OCR-text path)."""
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == ".pdf":
            return _render_pdf(file_path)
        if ext in _IMAGE_EXTS:
            return _render_image_file(file_path)
        return []
    except Exception as e:
        log.warning("Could not render %s to images: %s", file_path, e)
        return []
