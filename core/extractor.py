"""
Extractor Router Module for DocuMind.
Determines appropriate reader / OCR module based on file type.
"""

from pathlib import Path
from core.doc_reader import read_docx, read_excel, read_pptx, read_pdf, read_html
from core.ocr_engine import process_image_ocr

# === [TAG DAFTAR: Kumpulan Ekstensi File Kode & Teks] ===
# Penjelasan: Himpunan format teks pemrograman (Python, JS, C++, HTML, SQL, JSON, dll) yang didukung oleh sistem
CODE_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
    '.cs', '.java', '.go', '.rs', '.swift', '.kt', '.kts', '.rb', '.php', '.r',
    '.scala', '.dart', '.lua', '.pl', '.perl', '.sh', '.bash', '.zsh', '.bat',
    '.ps1', '.vbs', '.sql', '.css', '.scss', '.sass', '.less', '.xml', '.json',
    '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.md', '.txt',
    '.csv', '.log', '.dockerfile', '.makefile', '.graphql', '.proto', '.vue',
    '.svelte', '.asm', '.s', '.f', '.f90', '.clj', '.elm', '.erl', '.hs', '.ex', '.exs'
}


# === [TAG FUNGSI: Normalisasi Tipe Berkas (get_normalized_file_type)] ===
# Penjelasan: Mengelompokkan ekstensi file menjadi grup sederhana: 'web', 'pdf', 'office', 'text', atau 'image'
def get_normalized_file_type(filename: str) -> str:
    """Returns normalized file type: 'web', 'pdf', 'office', 'text', 'image', or 'other'."""
    clean_name = filename.replace('\\', '/').strip()
    base_name = clean_name.split('/')[-1].strip()
    ext = Path(base_name).suffix.lower()
    if ext in ['.html', '.htm', '.xhtml']:
        return 'web'
    elif ext in ['.pdf']:
        return 'pdf'
    elif ext in ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.rtf', '.odt', '.ods', '.odp']:
        return 'office'
    elif ext in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp', '.gif', '.svg', '.ico']:
        return 'image'
    elif ext in CODE_EXTENSIONS or ext.startswith('.') or base_name.lower() in ['dockerfile', 'makefile', 'procfile', 'license', 'readme']:
        return 'text'
    return 'text'


# === [TAG FUNGSI: Klasifikasi Kategori Dokumen (classify_document_category)] ===
# Penjelasan: Memberikan label kategori dokumen ('PDF Documents', 'Office & Sheets', 'Image OCR', dll) untuk filter antarmuka dashboard
def classify_document_category(filename: str, content: str = '') -> str:
    """Classifies document category into clean format-based categories."""
    file_type = get_normalized_file_type(filename)
    if file_type == 'pdf':
        return 'PDF Documents'
    elif file_type == 'office':
        return 'Office & Sheets'
    elif file_type == 'web':
        return 'Web Pages'
    elif file_type == 'text':
        return 'Text & Code'
    elif file_type == 'image':
        return 'Image OCR'
    return 'General'


# === [TAG FUNGSI UTAMA: Router Ekstraksi Dokumen (extract_document_data)] ===
# Penjelasan: Fungsi sentral yang memetakan file ke parser yang tepat (PDF, Word, Excel, PPTX, atau OCR Image) dan mengembalikan tuple: (teks_ekstraksi, skor_confidence)
def extract_document_data(filepath: str, lang: str = 'ind+eng') -> tuple[str, float]:
    """
    Extracts text and real OCR confidence score from any document format.
    Returns:
        (extracted_content: str, ocr_confidence: float)
    """
    path = Path(filepath)
    ext = path.suffix.lower()

    if ext in ['.pdf']:
        text = read_pdf(filepath, lang=lang)
        return text, 0.98
    elif ext in ['.docx', '.doc']:
        text = read_docx(filepath)
        return text, 0.99
    elif ext in ['.pptx', '.ppt']:
        text = read_pptx(filepath)
        return text, 0.99
    elif ext in ['.xlsx', '.xls']:
        text = read_excel(filepath)
        return text, 0.99
    elif ext in ['.html', '.htm', '.xhtml']:
        text = read_html(filepath)
        return text, 0.99
    elif ext in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp', '.gif', '.svg', '.ico']:
        return process_image_ocr(filepath, lang=lang)
    else:
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                return (content if content.strip() else f"[File Code/Text]: {path.name}"), 0.99
        except Exception:
            return f"[File Unstructured]: {path.name}", 0.90


# === [TAG FUNGSI PEMBANTU: Ekstraksi Teks Tunggal (extract_text_from_file)] ===
# Penjelasan: Fungsi pembantu ringkas untuk mengambil string teks dokumen saja tanpa nilai confidence
def extract_text_from_file(filepath: str) -> str:
    """Legacy helper returning extracted text only."""
    text, _ = extract_document_data(filepath)
    return text
