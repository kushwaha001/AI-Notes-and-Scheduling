"""
Build-time model warmup: caches ALL local models into the coder user's caches so
semantic search, voice transcription and OCR work on first run and fully offline.

Run AS the 'coder' user during the image build (see the Dockerfile), so every
cache path (~/.cache/fastembed, ~/.cache/huggingface, ~/.cache/docling,
~/.EasyOCR) lands under /home/coder with the right ownership.
"""

# 1) Embeddings (fastembed / ONNX — semantic search & Ask)
from fastembed import TextEmbedding
TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
print("[warmup] embeddings model cached")

# 2) Voice (faster-whisper large-v3, CPU/int8)
from faster_whisper import WhisperModel
WhisperModel("large-v3", device="cpu", compute_type="int8")
print("[warmup] whisper large-v3 cached")

# 3) OCR (docling layout + easyocr) — run one real conversion on a synthetic
#    "scan" (no text layer) to force and validate the full OCR path.
from PIL import Image, ImageDraw
img = Image.new("RGB", (720, 160), "white")
ImageDraw.Draw(img).text((20, 70), "Budget meeting on 15 Jul 2026 in Room B", fill="black")
img.save("/tmp/ocr_warm.png")

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

opts = PdfPipelineOptions()
opts.do_ocr = True
opts.accelerator_options = AcceleratorOptions(device=AcceleratorDevice.CPU)
opts.ocr_options = EasyOcrOptions()   # default storage = ~/.EasyOCR (coder home)

conv = DocumentConverter(format_options={
    InputFormat.IMAGE: PdfFormatOption(pipeline_options=opts),
    InputFormat.PDF:   PdfFormatOption(pipeline_options=opts),
})
md = conv.convert("/tmp/ocr_warm.png").document.export_to_markdown()
print("[warmup] OCR output:", (md or "").strip()[:100])
print("[warmup] docling + easyocr models cached")
