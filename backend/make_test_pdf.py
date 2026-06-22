"""Creates a minimal valid PDF for smoke-testing the upload endpoint."""
import struct, zlib, os

def make_pdf(path: str, text: str = "Test Document") -> None:
    # Minimal single-page PDF with one text string
    content = (
        f"BT\n/F1 14 Tf\n72 720 Td\n({text}) Tj\n"
        f"0 -20 Td\n(Event: Team Meeting) Tj\n"
        f"0 -20 Td\n(Date: 25 Jun 2026) Tj\n"
        f"0 -20 Td\n(Time: 10:00 AM) Tj\n"
        f"0 -20 Td\n(Venue: Conference Room A) Tj\n"
        f"0 -20 Td\n(Please confirm attendance by 22 Jun 2026.) Tj\n"
        "ET\n"
    )
    content_bytes = content.encode()
    stream_len = len(content_bytes)

    body = (
        "%PDF-1.4\n"
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        f"   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        f"4 0 obj\n<< /Length {stream_len} >>\nstream\n"
    )
    after_stream = f"\nendstream\nendobj\n"
    font_and_xref = (
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    pdf = body + content + after_stream + font_and_xref

    # Cross-reference table
    offsets = []
    pos = 0
    lines = pdf.split("\n")
    # Rebuild to get byte offsets of each object
    raw = (body + content + after_stream + font_and_xref).encode()
    xref_pos = len(raw)

    xref = f"xref\n0 6\n0000000000 65535 f \n"
    cursor = 0
    for obj_num in range(1, 6):
        marker = f"{obj_num} 0 obj\n".encode()
        idx = raw.find(marker)
        xref += f"{idx:010d} 00000 n \n"

    trailer = (
        f"trailer\n<< /Size 6 /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    )

    with open(path, "wb") as f:
        f.write(raw)
        f.write(xref.encode())
        f.write(trailer.encode())

    print(f"Created: {path}  ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    make_pdf("test.pdf", "AI Notes Scheduler — Smoke Test")
