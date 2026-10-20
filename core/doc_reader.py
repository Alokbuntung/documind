"""
Document Reader Module for Word, Excel, PowerPoint, PDF, and HTML files.
Supports digital extraction with OCR fallback for scanned PDFs and XML parsing for PPTX.
"""

import re
import zipfile
import defusedxml.ElementTree as ET
from pathlib import Path


# === [TAG FUNGSI: Pembaca Dokumen Microsoft Word (read_docx)] ===
# Penjelasan: Mengekstrak teks dari paragraf dan tabel file .docx menggunakan pustaka python-docx. Memiliki fitur fallback regex biner untuk membaca dokumen Word legacy (.doc).
def read_docx(filepath: str) -> str:
    """Reads text content from Microsoft Word (.docx) files with fallback for legacy .doc."""
    filename = Path(filepath).name
    try:
        import docx
        doc = docx.Document(filepath)
        full_text = []
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text)
        for table in doc.tables:
            for row in table.rows:
                row_txt = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_txt:
                    full_text.append(row_txt)
        text_content = "\n".join(full_text)
        return text_content if text_content.strip() else f"[Word Document]: {filename} (Empty document)"
    except Exception as e:
        # Fallback for binary legacy .doc or unzipped files
        try:
            with open(filepath, 'rb') as f:
                raw = f.read()
            # Extract printable ASCII/Unicode strings
            strings = re.findall(rb'[\x20-\x7E\t\n\r]{4,}', raw)
            extracted = "\n".join([s.decode('latin1', errors='ignore') for s in strings[:150]])
            if extracted.strip():
                return f"[Word Legacy Document]: {filename}\n{extracted.strip()}"
        except Exception:
            pass
        return f"[Word Document]: {filename}\nCatatan: Berkas Word diproses ke dalam arsip DocuMind ({str(e)})."


# === [TAG FUNGSI: Pembaca Presentasi PowerPoint (read_pptx)] ===
# Penjelasan: Membaca isi teks tiap slide pada file .pptx dengan mengekstrak file XML di dalam zip presentasi secara aman menggunakan defusedxml (tag <a:t>).
def read_pptx(filepath: str) -> str:
    """Reads text content from PowerPoint presentation (.pptx) slides."""
    filename = Path(filepath).name
    try:
        slide_texts = []
        with zipfile.ZipFile(filepath, 'r') as z:
            slide_files = sorted([n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')])
            for idx, slide_path in enumerate(slide_files, 1):
                xml_content = z.read(slide_path)
                tree = ET.fromstring(xml_content)
                # PPTX text nodes are <a:t> elements
                texts = [node.text for node in tree.iter() if node.tag.endswith('}t') and node.text]
                if texts:
                    slide_texts.append(f"--- Slide {idx} ---\n" + "\n".join(texts))

        if slide_texts:
            return "\n\n".join(slide_texts)
        return f"[PowerPoint Presentation]: {filename} (Empty or non-text slides)"
    except Exception as e:
        return f"[PowerPoint Presentation]: {filename}\nCatatan: Berkas presentasi diproses ke dalam DocuMind ({str(e)})."


# === [TAG FUNGSI: Pembaca Lembar Kerja Excel (read_excel)] ===
# Penjelasan: Mengekstrak isi tabel pada tiap lembar kerja (.xlsx) menggunakan openpyxl dalam mode hemat memori (read_only=True). Dibatasi maksimal 500 baris agar server tetap cepat.
def read_excel(filepath: str) -> str:
    """Reads text content from Microsoft Excel (.xlsx) files with fallback for legacy .xls."""
    filename = Path(filepath).name
    try:
        import openpyxl
        wb = openpyxl.load_workbook(filepath, data_only=True, read_only=True)
        lines = []
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            lines.append(f"--- Sheet: {sheet_name} ---")
            for row in sheet.iter_rows(values_only=True):
                row_vals = [str(val).strip() for val in row if val is not None and str(val).strip()]
                if row_vals:
                    lines.append(" | ".join(row_vals))
            if len(lines) > 500:  # Prevent runaway memory on massive sheets
                lines.append("... [Additional rows truncated for indexing performance]")
                break
        wb.close()
        text_content = "\n".join(lines)
        return text_content if text_content.strip() else f"[Excel Spreadsheet]: {filename} (Empty sheet)"
    except Exception as e:
        return f"[Excel Spreadsheet]: {filename}\nCatatan: Berkas spreadsheet diproses ke dalam DocuMind ({str(e)})."


# === [TAG FUNGSI: Pembaca Cerdas PDF Digital & Scan (read_pdf)] ===
# Penjelasan: Mendeteksi apakah PDF berupa teks digital atau scan. Jika digital, teks diekstrak cepat via pypdf. Jika scan gambar murni, halaman otomatis diubah jadi gambar (pdf2image) lalu diekstrak via Tesseract OCR.
def read_pdf(filepath: str, lang: str = 'ind+eng') -> str:
    """Reads text content from PDF files, with OCR fallback for scanned PDFs."""
    filename = Path(filepath).name
    pages_text = []
    try:
        import pypdf
        reader = pypdf.PdfReader(filepath)
        
        # Cek 10 halaman pertama saja untuk mendeteksi apakah ini PDF Digital asli
        sample_chars = 0
        is_digital = False
        for idx, page in enumerate(reader.pages[:10]):
            txt = page.extract_text()
            if txt and txt.strip():
                sample_chars += len(txt.strip())
        
        if sample_chars > 100:
            is_digital = True
            
        # Jika terbukti digital asli, batasi ekstraksi maksimal 15 halaman agar tidak lambat
        if is_digital:
            max_pages = min(len(reader.pages), 15)
            for idx in range(max_pages):
                txt = reader.pages[idx].extract_text()
                if txt and txt.strip():
                    pages_text.append(f"[Halaman {idx + 1}]\n{txt.strip()}")
        else:
            # Jika scan murni, biarkan pages_text kosong agar lari ke OCR fallback
            pass
            
    except Exception as e:
        import logging
        logging.warning(f"PyPDF error for {filepath}: {str(e)}")

    # 1. Prioritas Fast-Path Digital Text Extraction
    # Jika total karakter yang diekstrak lebih dari 100, berarti ini PDF Digital asli!
    total_chars = sum(len(p) for p in pages_text)
    if total_chars > 100:
        return "\n\n".join(pages_text)

    # 2. OCR Fallback untuk PDF Scan murni (atau PDF bermasalah)
    # Jalankan Tesseract hanya jika teks digital kosong atau kurang dari 100 karakter
    try:
        import pdf2image
        import pytesseract
        from core.ocr_engine import _preprocess_image, _get_safe_lang

        safe_lang = _get_safe_lang(lang)
        ocr_config = '--oem 1 --psm 3'

        # Optimize: 150 DPI, batasi maksimal 3 halaman agar OCR tidak crash pada file tebal
        images = pdf2image.convert_from_path(filepath, dpi=150, first_page=1, last_page=3)

        for idx, img in enumerate(images, 1):
            # Apply same preprocessing pipeline as image OCR
            processed = _preprocess_image(img)

            ocr_text = pytesseract.image_to_string(processed, lang=safe_lang, config=ocr_config)
            if not ocr_text.strip() and safe_lang != 'eng':
                ocr_text = pytesseract.image_to_string(processed, lang='eng', config=ocr_config)
            if ocr_text.strip():
                pages_text.append(f"[Halaman Scan {idx}]\n{ocr_text.strip()}")

        if pages_text:
            return "\n\n".join(pages_text)
    except Exception as e:
        import logging
        logging.error(f"PDF OCR fallback failed for {filepath}: {str(e)}")
        raise e

    if not pages_text:
        raise ValueError(f"Failed to extract any text from PDF: {filename}")

    return "\n\n".join(pages_text)


# === [TAG FUNGSI: Pembaca Berkas Web HTML (read_html)] ===
# Penjelasan: Membersihkan tag HTML, CSS style, dan tag script berbahaya, menyisakan teks konten asli dokumen web.
def read_html(filepath: str) -> str:
    """Reads text content from HTML (.html, .htm) files stripping HTML tags and scripts."""
    from html.parser import HTMLParser

    class HTMLTextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.result = []
            self.skip = False

        def handle_starttag(self, tag, attrs):
            if tag.lower() in ['script', 'style', 'noscript', 'svg', 'template']:
                self.skip = True
            elif not self.skip:
                for attr_name, attr_val in attrs:
                    if attr_val and attr_name.lower() in ['placeholder', 'title', 'alt', 'aria-label']:
                        val = attr_val.strip()
                        if val:
                            self.result.append(val)

        def handle_endtag(self, tag):
            if tag.lower() in ['script', 'style', 'noscript', 'svg', 'template']:
                self.skip = False

        def handle_data(self, data):
            if not self.skip:
                text = data.strip()
                if text:
                    self.result.append(text)

    filename = Path(filepath).name
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()

        parser = HTMLTextExtractor()
        parser.feed(html_content)
        extracted = "\n".join(parser.result)

        # Fallback jika parser menghasilkan teks kosong (misal format HTML malformed)
        if not extracted.strip():
            clean = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            clean = re.sub(r'<[^>]+>', ' ', clean)
            extracted = "\n".join([line.strip() for line in clean.splitlines() if line.strip()])

        return extracted if extracted.strip() else f"[HTML Document]: {filename} (Kosong)"
    except Exception as e:
        return f"[HTML Document]: {filename}\nTerjadi kesalahan membaca berkas HTML: {str(e)}"
