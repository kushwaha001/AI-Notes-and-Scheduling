"""
FR-6 — Local voice transcription with faster-whisper.

Model size and device are configurable (NFR-7). Defaults to distil-large-v3 on
the GPU (cuda/float16) — English-only, near large-v3 accuracy, and ~10x faster
than realtime once the model is warm. Falls back to CPU/int8 if the GPU or its
CUDA runtime libraries aren't available, so it always works.
"""

import os
import sysconfig
import logging

from api.config import (
    WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE, WHISPER_LANGUAGE,
    WHISPER_BEAM_SIZE,
)

log = logging.getLogger(__name__)

_model = None
_device = None


def _register_cuda_dlls():
    """Windows: ctranslate2 (the engine behind faster-whisper) needs the CUDA
    cuBLAS/cuDNN runtime DLLs to load the GPU backend. The pip `nvidia-*-cu12`
    wheels drop them under site-packages/nvidia/<lib>/bin, which the Windows
    loader doesn't search by default — put them on PATH + the DLL search path
    before the native library loads. No-op on Linux / when the wheels aren't
    installed (CPU-only deployments)."""
    try:
        nv = os.path.join(sysconfig.get_paths()["purelib"], "nvidia")
        bins = [os.path.join(nv, s, "bin")
                for s in ("cuda_runtime", "cublas", "cudnn", "cuda_nvrtc")]
        bins = [b for b in bins if os.path.isdir(b)]
        if not bins:
            return
        os.environ["PATH"] = os.pathsep.join(bins) + os.pathsep + os.environ.get("PATH", "")
        for b in bins:
            try:
                os.add_dll_directory(b)
            except (OSError, AttributeError):
                pass
        log.info("Registered CUDA runtime DLLs for faster-whisper (%d dirs).", len(bins))
    except Exception as e:
        log.debug("CUDA DLL registration skipped: %s", e)


# Must run before the ctranslate2 native lib is loaded by WhisperModel.
_register_cuda_dlls()


def _load(device, compute):
    from faster_whisper import WhisperModel
    m = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute)
    log.info("Whisper '%s' loaded on %s/%s", WHISPER_MODEL, device, compute)
    return m


def _run(model, file_path):
    # vad_filter trims silence (faster + cleaner); language hint skips detection.
    # vad_filter is OFF: on some browser webm/opus recordings the Silero VAD
    # wrongly classified the whole clip as silence and removed ALL audio, yielding
    # an empty transcript ("whisper looks down"). Transcribing the full clip is far
    # more reliable; Whisper handles the leading/trailing silence fine.
    segments, info = model.transcribe(
        file_path,
        beam_size=WHISPER_BEAM_SIZE,
        language=WHISPER_LANGUAGE or None,
        vad_filter=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, int(getattr(info, "duration", 0) or 0)


def _ensure_model():
    """Load the model once (kept warm). GPU first, CPU/int8 as a safety net."""
    global _model, _device
    if _model is not None:
        return
    try:
        _model, _device = _load(WHISPER_DEVICE, WHISPER_COMPUTE_TYPE), WHISPER_DEVICE
    except Exception as e:
        log.warning("Whisper load on %s failed (%s); using CPU/int8.", WHISPER_DEVICE, e)
        _model, _device = _load("cpu", "int8"), "cpu"


def transcribe(file_path: str):
    """Return (transcript_text, duration_seconds). Falls back to CPU if the GPU
    backend can't load or run (e.g. missing cuBLAS/cuDNN on a CPU-only box)."""
    global _model, _device
    _ensure_model()

    try:
        return _run(_model, file_path)
    except Exception as e:
        if _device != "cpu":
            log.warning("Whisper inference on GPU failed (%s); reloading on CPU.", e)
            _model, _device = _load("cpu", "int8"), "cpu"
            return _run(_model, file_path)
        raise


def warmup():
    """Optionally pre-load the model at startup so the first real voice note
    doesn't pay the load + CUDA autotune cost. Safe to call; never raises."""
    try:
        _ensure_model()
    except Exception as e:
        log.warning("Whisper warmup skipped: %s", e)


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False
