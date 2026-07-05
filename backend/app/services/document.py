import os
import csv
import io
from pypdf import PdfReader
from docx import Document as DocxDocument
from ..config import STORAGE_PATH

SUPPORTED_FORMATS = {'.pdf', '.txt', '.csv', '.md', '.docx'}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

def extract_text_from_file(file_path: str) -> list[dict]:
    """Extract text from file. Returns list of {text, page_number} dicts."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.pdf':
        return extract_pdf(file_path)
    elif ext == '.docx':
        return extract_docx(file_path)
    elif ext == '.csv':
        return extract_csv(file_path)
    elif ext in ('.txt', '.md'):
        return extract_text(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

def extract_pdf(file_path: str) -> list[dict]:
    reader = PdfReader(file_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text and text.strip():
            pages.append({"text": text.strip(), "page_number": i + 1})
    return pages

def extract_docx(file_path: str) -> list[dict]:
    doc = DocxDocument(file_path)
    paragraphs = []
    current_section = []
    page_num = 1

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        current_section.append(text)
        # Rough page break every ~3000 chars
        if len("\n".join(current_section)) > 3000:
            paragraphs.append({"text": "\n".join(current_section), "page_number": page_num})
            current_section = []
            page_num += 1

    if current_section:
        paragraphs.append({"text": "\n".join(current_section), "page_number": page_num})

    return paragraphs if paragraphs else [{"text": "Empty document", "page_number": 1}]

def extract_csv(file_path: str) -> list[dict]:
    text_parts = []
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        if rows:
            headers = rows[0]
            text_parts.append(f"CSV Headers: {', '.join(headers)}")
            for i, row in enumerate(rows[1:100], 1):  # Limit to 100 rows
                row_text = ", ".join([f"{h}: {v}" for h, v in zip(headers, row) if v.strip()])
                if row_text:
                    text_parts.append(f"Row {i}: {row_text}")

    full_text = "\n".join(text_parts)
    return [{"text": full_text, "page_number": 1}] if full_text else [{"text": "Empty CSV", "page_number": 1}]

def extract_text(file_path: str) -> list[dict]:
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read().strip()
    if not text:
        return [{"text": "Empty file", "page_number": 1}]

    # Split into chunks by double newline (rough page boundaries)
    pages = []
    chunks = text.split("\n\n")
    page_num = 1
    current = []
    for chunk in chunks:
        current.append(chunk)
        if len("\n\n".join(current)) > 3000:
            pages.append({"text": "\n\n".join(current), "page_number": page_num})
            current = []
            page_num += 1
    if current:
        pages.append({"text": "\n\n".join(current), "page_number": page_num})

    return pages

def chunk_text(pages: list[dict], chunk_size: int = 1000) -> list[dict]:
    """Split pages into smaller chunks. Returns list of {text, page_number, chunk_index}."""
    chunks = []
    idx = 0
    for page in pages:
        text = page["text"]
        page_num = page["page_number"]
        for i in range(0, len(text), chunk_size):
            chunk = text[i:i+chunk_size]
            if chunk.strip():
                chunks.append({
                    "chunk_text": chunk.strip(),
                    "page_number": page_num,
                    "chunk_index": idx
                })
                idx += 1
    return chunks
