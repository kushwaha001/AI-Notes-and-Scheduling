"""
FR-6 — Local voice transcription with faster-whisper.

Model size and device are configurable (NFR-7). Falls back to CPU/int8 if the
GPU can't load the model (small GPUs). Model downloads on first use.
"""

import logging

from api.config import WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE

log = logging.getLogger(__name__)

_model = None
_device = None


def _load(device, compute):
    from faster_whisper import WhisperModel
    m = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute)
    log.info("Whisper '%s' loaded on %s/%s", WHISPER_MODEL, device, compute)
    return m


def _run(model, file_path):
    segments, info = model.transcribe(file_path, beam_size=1)
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, int(getattr(info, "duration", 0) or 0)


def transcribe(file_path: str):
    """Return (transcript_text, duration_seconds). Falls back to CPU if the GPU
    backend can't load or run (e.g. missing cuBLAS/cuDNN on a dev box)."""
    global _model, _device
    if _model is None:
        try:
            _model, _device = _load(WHISPER_DEVICE, WHISPER_COMPUTE_TYPE), WHISPER_DEVICE
        except Exception as e:
            log.warning("Whisper load on %s failed (%s); using CPU/int8.", WHISPER_DEVICE, e)
            _model, _device = _load("cpu", "int8"), "cpu"

    try:
        return _run(_model, file_path)
    except Exception as e:
        if _device != "cpu":
            log.warning("Whisper inference on GPU failed (%s); reloading on CPU.", e)
            _model, _device = _load("cpu", "int8"), "cpu"
            return _run(_model, file_path)
        raise


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False
